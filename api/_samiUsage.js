// Sami Hub MCP-call usage tracking.
//
// Every tools/call that flows through the MCP proxy is counted here.
// It gives the team a live picture of Markifact-tool consumption
// against the monthly credit allowance (currently 5,000 on the PRO
// plan, resets on the 25th per Markifact billing), broken down by
// team member so we can see who is doing what.
//
// Storage (Upstash REST, same store the rest of Sami uses):
//   sami:usage:total:<YYYY-MM-DD>       INCR counter, all calls that day
//   sami:usage:writes:<YYYY-MM-DD>      INCR counter, write calls only
//   sami:usage:user:<YYYY-MM-DD>:<user> INCR counter, per-user per-day
//   sami:usage:days                     Redis SET of "YYYY-MM-DD" strings
//                                        we have counters for; scanned by
//                                        the aggregate endpoint. Bounded
//                                        naturally because entries expire
//                                        alongside the counters.
//
// TTL is 90 days so trend charts have a comfortable window without
// growing unbounded.

var USAGE_TTL_SECONDS = 90 * 24 * 60 * 60;

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
    console.error("[sami-usage] redis error", err);
    return null;
  }
}

// Pipeline several commands in one HTTP round-trip. Upstash REST
// accepts an array of arrays.
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
  } catch (err) {
    console.error("[sami-usage] pipeline error", err);
    return null;
  }
}

function todayKey(date) {
  var d = date instanceof Date ? date : new Date();
  return d.toISOString().slice(0, 10);
}

function normUser(raw) {
  var s = String(raw || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "").slice(0, 40);
  return s || "unknown";
}

// Fire-and-forget counter bump. Called by the MCP proxy after every
// forwarded tools/call. Never throws upstream so a Redis blip cannot
// break a Sami turn.
export async function recordUsage(user, opts) {
  try {
    opts = opts || {};
    var day = todayKey();
    var u = normUser(user);
    var isWrite = !!opts.isWrite;
    var cmds = [
      ["INCR", "sami:usage:total:" + day],
      ["EXPIRE", "sami:usage:total:" + day, String(USAGE_TTL_SECONDS)],
      ["INCR", "sami:usage:user:" + day + ":" + u],
      ["EXPIRE", "sami:usage:user:" + day + ":" + u, String(USAGE_TTL_SECONDS)],
      ["SADD", "sami:usage:days", day],
      ["EXPIRE", "sami:usage:days", String(USAGE_TTL_SECONDS)]
    ];
    if (isWrite) {
      cmds.push(["INCR", "sami:usage:writes:" + day]);
      cmds.push(["EXPIRE", "sami:usage:writes:" + day, String(USAGE_TTL_SECONDS)]);
    }
    await redisPipeline(cmds);
  } catch (err) {
    console.error("[sami-usage] recordUsage failed", err);
  }
}

// Read the last N calendar days of usage. Returns [{date, total,
// writes, byUser}] newest-first, one entry per day with data.
export async function readUsageDaily(daysBack) {
  var n = Math.min(Math.max(parseInt(daysBack, 10) || 30, 1), 90);
  var dates = [];
  var today = new Date();
  for (var i = 0; i < n; i++) {
    var d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  // Batch every "total" + "writes" lookup, plus per-user lookup for
  // each team member for each date. The team is small enough that
  // this pipeline stays small (~5 users * 30 days * 3 keys ~= 450).
  var TEAM = ["gary", "sam", "busi", "claire", "donovan"];
  var cmds = [];
  dates.forEach(function (day) {
    cmds.push(["GET", "sami:usage:total:" + day]);
    cmds.push(["GET", "sami:usage:writes:" + day]);
    TEAM.forEach(function (u) { cmds.push(["GET", "sami:usage:user:" + day + ":" + u]); });
  });
  var res = await redisPipeline(cmds) || [];
  var out = [];
  var stride = 2 + TEAM.length;
  for (var d2 = 0; d2 < dates.length; d2++) {
    var base = d2 * stride;
    var total = parseInt((res[base] && res[base].result) || "0", 10) || 0;
    var writes = parseInt((res[base + 1] && res[base + 1].result) || "0", 10) || 0;
    var byUser = {};
    for (var u2 = 0; u2 < TEAM.length; u2++) {
      var v = parseInt((res[base + 2 + u2] && res[base + 2 + u2].result) || "0", 10) || 0;
      if (v > 0) byUser[TEAM[u2]] = v;
    }
    out.push({ date: dates[d2], total: total, writes: writes, byUser: byUser });
  }
  return out;
}

// Convenience for the frontend strip: sum the current calendar month.
export function sumMonth(daily, now) {
  var cur = now || new Date();
  var yyyymm = cur.toISOString().slice(0, 7);
  var total = 0;
  var writes = 0;
  var byUser = {};
  daily.forEach(function (row) {
    if (String(row.date || "").indexOf(yyyymm) !== 0) return;
    total += row.total || 0;
    writes += row.writes || 0;
    Object.keys(row.byUser || {}).forEach(function (u) {
      byUser[u] = (byUser[u] || 0) + row.byUser[u];
    });
  });
  return { total: total, writes: writes, byUser: byUser };
}
