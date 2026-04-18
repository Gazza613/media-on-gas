// Lightweight audit log backed by Upstash Redis REST API.
// No package dependency, pure fetch. Graceful if env vars missing, calls become no-ops
// so the rest of the app keeps working during setup.
// Install: Vercel, project, Storage, Marketplace, Upstash for Redis, link, redeploy.
// Env vars auto-set: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
// Legacy Vercel KV also supported via KV_REST_API_URL + KV_REST_API_TOKEN.

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
  } catch (err) {
    console.error("Audit redis error", err);
    return null;
  }
}

export function isAuditEnabled() {
  return getCreds() !== null;
}

var LOG_KEY = "audit:email-sends";
var MAX_ENTRIES = 1000;

export async function logEmailSend(entry) {
  if (!getCreds()) return false;
  var record = Object.assign({
    id: String(Date.now()) + "_" + Math.random().toString(36).slice(2, 8),
    sentAt: new Date().toISOString()
  }, entry || {});
  try {
    await redisCmd(["LPUSH", LOG_KEY, JSON.stringify(record)]);
    await redisCmd(["LTRIM", LOG_KEY, "0", String(MAX_ENTRIES - 1)]);
    return true;
  } catch (err) {
    console.error("Audit log write failed", err);
    return false;
  }
}

export async function readEmailLog(limit) {
  if (!getCreds()) return [];
  var cap = Math.min(MAX_ENTRIES, parseInt(limit, 10) || MAX_ENTRIES);
  var result = await redisCmd(["LRANGE", LOG_KEY, "0", String(cap - 1)]);
  if (!result || !Array.isArray(result.result)) return [];
  var out = [];
  result.result.forEach(function(s) {
    try { out.push(JSON.parse(s)); } catch (_) { /* skip malformed */ }
  });
  return out;
}
