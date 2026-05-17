// Created-campaigns log. Every campaign successfully launched through
// the builder (single or batch) is recorded here so the Create tab's
// Step 1 can show "what was created" alongside "what is in draft".
// Best-effort and non-blocking: a logging failure must NEVER fail or
// delay the campaign-create response.
//
// Storage: one Redis list "create:created", newest first, capped.

var KEY = "create:created";
var MAX = 200;

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

function str(v, max) { return String(v == null ? "" : v).slice(0, max || 200); }
function n(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; }

export async function listCreated() {
  var res = await redisCmd(["LRANGE", KEY, "0", String(MAX - 1)]);
  if (!res || !res.result) return [];
  return res.result.map(function (s) { try { return JSON.parse(s); } catch (_) { return null; } }).filter(Boolean);
}

// Record one launched campaign. Never throws.
export async function logCreated(rec) {
  try {
    if (!rec || !rec.campaignId) return null;
    var entry = {
      id: "cmp_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      campaignId: str(rec.campaignId, 80),
      campaignName: str(rec.campaignName, 240),
      accountId: str(rec.accountId, 80),
      accountName: str(rec.accountName, 200),
      objective: str(rec.objective, 60),
      platformMode: str(rec.platformMode, 20),
      funding: str(rec.funding, 10),
      budgetMode: str(rec.budgetMode, 12),
      dailyBudgetRand: n(rec.dailyBudgetRand),
      lifetimeBudgetRand: n(rec.lifetimeBudgetRand),
      adsetCount: Math.round(n(rec.adsetCount) || 1),
      adCount: Math.round(n(rec.adCount)),
      batch: !!rec.batch,
      status: "PAUSED",
      adsManagerUrl: /^https?:\/\//.test(String(rec.adsManagerUrl || "")) ? String(rec.adsManagerUrl).slice(0, 600) : "",
      createdAt: new Date().toISOString()
    };
    await redisCmd(["LPUSH", KEY, JSON.stringify(entry)]);
    await redisCmd(["LTRIM", KEY, "0", String(MAX - 1)]);
    return entry;
  } catch (_) { return null; }
}

export async function deleteCreated(id) {
  var existing = await listCreated();
  var next = existing.filter(function (e) { return e && e.id !== id; });
  await redisCmd(["DEL", KEY]);
  for (var i = next.length - 1; i >= 0; i--) {
    await redisCmd(["LPUSH", KEY, JSON.stringify(next[i])]);
  }
  return next;
}
