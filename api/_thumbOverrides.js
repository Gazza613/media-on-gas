// Manual thumbnail overrides keyed by adId. Admin can paste a
// direct image URL (any HTTPS URL that resolves to an image) for
// any ad whose Meta / TikTok / Google thumbnail resolves to a
// black frame, a 404, or a stale asset. The override wins over
// every platform resolution path everywhere on the dashboard,
// email reports, and PDF.
//
// Resolution order in api/ads.js (bake path) and api/ad-image.js
// (on-demand proxy):
//   1. Manual override (this module's hash)
//   2. Platform-native resolution chain
//
// Storage: Redis hash "thumb:overrides", { adId → url }
//
// Same Upstash REST client + 30s in-memory cache pattern as
// _objectiveOverrides.js.

var REDIS_KEY = "thumb:overrides";

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
    console.error("Thumb overrides redis error", err);
    return null;
  }
}

var _cache = null;
var _cacheTime = 0;
var TTL_MS = 30 * 1000;

export async function getThumbOverrides() {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < TTL_MS) return _cache;
  var map = {};
  try {
    var r = await redisCmd(["HGETALL", REDIS_KEY]);
    if (r && r.result && Array.isArray(r.result)) {
      for (var i = 0; i + 1 < r.result.length; i += 2) {
        if (r.result[i] != null && r.result[i + 1] != null) {
          map[String(r.result[i])] = String(r.result[i + 1]);
        }
      }
    }
  } catch (_) {}
  _cache = map;
  _cacheTime = now;
  return map;
}

export async function getThumbOverride(adId) {
  if (!adId) return null;
  var map = await getThumbOverrides();
  var v = map[String(adId)];
  return v ? String(v) : null;
}

export async function setThumbOverride(adId, url) {
  if (!adId) return false;
  var key = String(adId);
  try {
    if (!url) {
      await redisCmd(["HDEL", REDIS_KEY, key]);
    } else {
      await redisCmd(["HSET", REDIS_KEY, key, String(url)]);
    }
  } catch (_) { return false; }
  _cache = null;
  return true;
}
