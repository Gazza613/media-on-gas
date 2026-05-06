// Manual objective overrides keyed by campaignId. Operator (superadmin)
// can correct a misclassified campaign in Settings → Objectives Audit
// and the override wins over name-based detection and the platform API
// objective everywhere on the dashboard.
//
// Resolution order across all five classifier files:
//   1. Manual override (this module's hash)
//   2. Name keyword detection
//   3. Platform API objective
//   4. Default fallback
//
// Storage: Redis hash "obj:overrides", { campaignId → displayString }
// where displayString is one of the canonical display labels:
//   "Clicks to App Store" | "Leads" | "Followers & Likes" |
//   "Landing Page Clicks" | "Unclassified"
//
// The display format is what the audit modal renders, so storing it
// directly avoids round-tripping through internal codes.

var REDIS_KEY = "obj:overrides";

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
    console.error("Objective overrides redis error", err);
    return null;
  }
}

// In-memory cache, 30 second TTL. Vercel Fluid Compute reuses instances
// across requests so this saves Redis hits on hot paths (every campaigns
// fetch hits this). Cache is busted whenever setOverride() runs in the
// same instance. A different instance will see the stale cache for up
// to TTL_MS, acceptable for this use case.
var _cache = null;
var _cacheTime = 0;
var TTL_MS = 30 * 1000;

export async function getOverrides() {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < TTL_MS) return _cache;
  var map = {};
  try {
    var r = await redisCmd(["HGETALL", REDIS_KEY]);
    // Upstash REST returns the hash as a flat array [k1, v1, k2, v2, ...].
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

export async function setOverride(campaignId, displayObjective) {
  if (!campaignId) return false;
  var key = String(campaignId);
  try {
    if (!displayObjective || displayObjective === "auto" || displayObjective === "Auto") {
      await redisCmd(["HDEL", REDIS_KEY, key]);
    } else {
      await redisCmd(["HSET", REDIS_KEY, key, String(displayObjective)]);
    }
  } catch (_) { return false; }
  // Bust local cache so the next read in this instance picks up the change.
  _cache = null;
  return true;
}

// Map the audit's display-string overrides to the lowercase canonical
// keys used inside api/campaigns.js, api/timeseries.js, api/ads.js, and
// api/reconcile.js classifiers. Returns null when the override is not
// recognised, the caller then falls through to the standard pipeline.
export function displayToCanonical(display) {
  if (!display) return null;
  switch (String(display)) {
    case "Clicks to App Store": return "appinstall";
    case "Leads": return "leads";
    case "Followers & Likes": return "followers";
    case "Landing Page Clicks": return "landingpage";
    case "Unclassified": return "unknown";
    default: return null;
  }
}

export function canonicalToDisplay(canon) {
  switch (String(canon)) {
    case "appinstall": return "Clicks to App Store";
    case "leads": return "Leads";
    case "followers": return "Followers & Likes";
    case "landingpage": return "Landing Page Clicks";
    case "unknown": return "Unclassified";
    default: return null;
  }
}
