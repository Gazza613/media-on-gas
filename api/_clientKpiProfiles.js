// Per-client KPI profiles. A profile redefines, for ONE client only,
// which KPIs the dashboard leads with and whether an ecommerce
// (GA4) view is enabled. Clients with no profile keep the default
// objective layout untouched, so this never leaks to other clients.
//
// Keyed by canonical client slug (canonicalClientSlug from
// _clientIdentity.js), so "Psycho Bunny", "PsychoBunny",
// "Psycho-Bunny May 2026" all resolve to the same profile.
//
// Storage: Redis hash "client:kpiprofile", { slug -> JSON string }.
// Mirrors the _objectiveOverrides.js pattern exactly (same Redis
// client, same 30s instance cache, same bust-on-write).
//
// Profile shape:
//   {
//     primaryKpis:   ["unique_reach","frequency","cpm"],
//     secondaryKpis: ["newsletter_signups"],
//     tertiaryKpis:  ["revenue","roas","top_products"],
//     benchmarkBand: "awareness" | "direct_response" | "default",
//     ecommerce: {
//       enabled: true,
//       source: "ga4",
//       ga4PropertyId: "481822031",
//       newsletterEvent: "newsletter_signup"   // GA4 event name
//     }
//   }

import { canonicalClientSlug } from "./_clientIdentity.js";

var REDIS_KEY = "client:kpiprofile";

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
    console.error("Client KPI profile redis error", err);
    return null;
  }
}

var _cache = null;
var _cacheTime = 0;
var TTL_MS = 30 * 1000;

// Returns { slug -> profileObject }. 30s instance cache.
export async function getAllKpiProfiles() {
  var now = Date.now();
  if (_cache && (now - _cacheTime) < TTL_MS) return _cache;
  var map = {};
  try {
    var r = await redisCmd(["HGETALL", REDIS_KEY]);
    if (r && r.result && Array.isArray(r.result)) {
      for (var i = 0; i + 1 < r.result.length; i += 2) {
        var k = r.result[i], v = r.result[i + 1];
        if (k == null || v == null) continue;
        try { map[String(k)] = JSON.parse(String(v)); } catch (_) {}
      }
    }
  } catch (_) {}
  _cache = map;
  _cacheTime = now;
  return map;
}

// Resolve the profile for a given raw client name / slug. Tolerant on
// purpose: the dashboard derives client names from ad-account names
// ("Psycho Bunny ZA") while the superadmin types the profile name
// ("Psycho Bunny"), so an exact canonical match would miss. Order:
//   1. exact canonical slug match
//   2. one canonical slug contains the other (length-guarded >= 5 so
//      short tokens can't false-match across clients)
// Returns the profile or null (client has no profile = default).
export async function getKpiProfile(rawClient) {
  var slug = canonicalClientSlug(rawClient);
  if (!slug) return null;
  var all = await getAllKpiProfiles();
  if (all[slug]) return all[slug];
  var keys = Object.keys(all);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (!k || k.length < 5 || slug.length < 5) continue;
    if (slug.indexOf(k) >= 0 || k.indexOf(slug) >= 0) return all[k];
  }
  return null;
}

// Upsert a profile. `rawClient` is canonicalised to the storage key.
// Passing a null/empty profile deletes it (client reverts to default).
export async function setKpiProfile(rawClient, profile) {
  var slug = canonicalClientSlug(rawClient);
  if (!slug) return false;
  try {
    if (!profile) {
      await redisCmd(["HDEL", REDIS_KEY, slug]);
    } else {
      await redisCmd(["HSET", REDIS_KEY, slug, JSON.stringify(profile)]);
    }
  } catch (_) { return false; }
  _cache = null; // bust local cache so the next read in this instance is fresh
  return true;
}

// Convenience: is an ecommerce view enabled for this client?
export async function ecommerceEnabledFor(rawClient) {
  var p = await getKpiProfile(rawClient);
  return !!(p && p.ecommerce && p.ecommerce.enabled);
}
