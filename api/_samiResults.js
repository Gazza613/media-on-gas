// Sami Hub RESULT_CARD log.
//
// Every successful run_write_operation gets an emitted RESULT_CARD
// from Sami, and this file writes each one to a per-user, per-day
// Redis list so the Live Campaign State header can show the AM
// what actually got created without them scrolling the chat back.
//
// Keys:
//   sami:results:<samiSlug>:<YYYY-MM-DD>  Redis LIST of JSON payloads
//                                          RPUSH on emit, LRANGE 0 -1 on read
//   sami:activeclient:<samiSlug>          STRING with the most-recent
//                                          client slug the AM built for
//
// TTL: 60 days per-day list; active-client key: 24h rolling.

var RESULTS_TTL_SECONDS = 60 * 24 * 60 * 60;
var ACTIVECLIENT_TTL_SECONDS = 24 * 60 * 60;

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) {
    console.error("[sami-results] redis error", err);
    return null;
  }
}
async function redisPipeline(cmds) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url + "/pipeline", {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(cmds)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) { console.error("[sami-results] pipeline error", err); return null; }
}

function todayKey(date) {
  var d = date instanceof Date ? date : new Date();
  return d.toISOString().slice(0, 10);
}
function normSlug(raw) {
  return String(raw || "").toLowerCase().trim().replace(/[^a-z0-9-]/g, "").slice(0, 60);
}
function clientSlug(raw) {
  return String(raw || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

// Called by sami-hub after extracting RESULT_CARD blocks from Sami's
// reply. Non-blocking: a Redis blip cannot break the chat.
export async function logResults(user, results) {
  if (!Array.isArray(results) || results.length === 0) return;
  var slug = normSlug(user);
  if (!slug) return;
  var day = todayKey();
  var key = "sami:results:" + slug + ":" + day;
  try {
    var cmds = [];
    var latestClient = "";
    results.forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var record = {
        id: String(r.id || "").slice(0, 80),
        platform: String(r.platform || "").toLowerCase().slice(0, 20),
        kind: String(r.kind || "").toLowerCase().slice(0, 20),
        operation_id: String(r.operation_id || "").slice(0, 120),
        resource_id: String(r.resource_id || "").slice(0, 120),
        resource_name: String(r.resource_name || "").slice(0, 200),
        status: String(r.status || "").toUpperCase().slice(0, 20),
        budget: r.budget && typeof r.budget === "object" ? {
          amount: parseInt(r.budget.amount, 10) || 0,
          type: String(r.budget.type || "").slice(0, 20),
          currency: String(r.budget.currency || "").slice(0, 5)
        } : null,
        client: String(r.client || "").slice(0, 80),
        clientSlug: clientSlug(r.client),
        parent_id: String(r.parent_id || "").slice(0, 120),
        open_url: /^https?:\/\//i.test(String(r.open_url || "")) ? String(r.open_url).slice(0, 500) : "",
        created_at: new Date().toISOString(),
        by_user: slug
      };
      cmds.push(["RPUSH", key, JSON.stringify(record)]);
      if (record.clientSlug) latestClient = record.clientSlug;
    });
    if (cmds.length === 0) return;
    cmds.push(["EXPIRE", key, String(RESULTS_TTL_SECONDS)]);
    if (latestClient) {
      cmds.push(["SET", "sami:activeclient:" + slug, latestClient, "EX", String(ACTIVECLIENT_TTL_SECONDS)]);
    }
    await redisPipeline(cmds);
  } catch (err) {
    console.error("[sami-results] logResults failed", err);
  }
}

// Read all result cards for the given user across the last `daysBack`
// days (default 7). Returns an array of records ordered oldest-first.
export async function readUserResults(user, daysBack) {
  var slug = normSlug(user);
  if (!slug) return [];
  var n = Math.max(1, Math.min(30, parseInt(daysBack, 10) || 7));
  var today = new Date();
  var cmds = [];
  var dates = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    var date = d.toISOString().slice(0, 10);
    dates.push(date);
    cmds.push(["LRANGE", "sami:results:" + slug + ":" + date, "0", "-1"]);
  }
  var res = await redisPipeline(cmds) || [];
  var out = [];
  res.forEach(function (r, idx) {
    if (!r || !Array.isArray(r.result)) return;
    r.result.forEach(function (raw) {
      try {
        var rec = JSON.parse(raw);
        if (rec) { rec._date = dates[idx]; out.push(rec); }
      } catch (_) { /* skip corrupt */ }
    });
  });
  return out;
}

export async function readActiveClient(user) {
  var slug = normSlug(user);
  if (!slug) return "";
  var r = await redisCmd(["GET", "sami:activeclient:" + slug]);
  return r && r.result ? String(r.result) : "";
}

// Roll a results array into the counts + budget totals the Live
// Campaign State header renders.
export function summariseResults(results, dayFilter) {
  var target = dayFilter || todayKey();
  var out = { counts: {}, totalWrites: 0, totalDailyBudgetCents: 0, totalLifetimeBudgetCents: 0, byClient: {}, mostRecentClient: "" };
  results.forEach(function (r) {
    if (!r) return;
    if (dayFilter && r._date !== target) return;
    out.totalWrites++;
    var k = r.kind || "other";
    out.counts[k] = (out.counts[k] || 0) + 1;
    if (r.clientSlug) {
      out.byClient[r.clientSlug] = (out.byClient[r.clientSlug] || 0) + 1;
      out.mostRecentClient = r.clientSlug;
    }
    if (r.budget && r.budget.amount) {
      if (r.budget.type === "daily") out.totalDailyBudgetCents += r.budget.amount;
      else if (r.budget.type === "lifetime") out.totalLifetimeBudgetCents += r.budget.amount;
    }
  });
  return out;
}
