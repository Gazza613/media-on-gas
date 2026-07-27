// Shared South Africa province list. Endpoints that accept ?region=
// validate against this list so a typo / injection can't hit Meta's
// filtering API. Values match Meta's region breakdown strings exactly
// (case-sensitive) — verified via a /insights?breakdowns=region probe.
// Also aligns with Google Ads' geo_target_region_name and TikTok's
// province naming when Phase 2 / Phase 3 extend the filter to those
// platforms.

export var SA_PROVINCES = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape"
];

// Case-insensitive match against the canonical list. Returns the
// canonical string on success, or "" when the input doesn't match
// (call sites treat "" as "no region filter applied").
export function normalizeProvince(raw) {
  var s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  for (var i = 0; i < SA_PROVINCES.length; i++) {
    if (SA_PROVINCES[i].toLowerCase() === s) return SA_PROVINCES[i];
  }
  return "";
}

// Google Ads geo_target_constant IDs for SA provinces. Google's
// resource path is "geoTargetConstants/<id>". These IDs are stable in
// Google's canonical geo constants list — verified 2026-07 against
// https://developers.google.com/google-ads/api/reference/data/geotargets.
// Used by api/campaigns.js + api/timeseries.js when the province filter
// is active to add a WHERE segments.geo_target_region = <resource>
// clause to Google Ads GAQL. Returns "" if the province isn't in the
// map (never happens after normalizeProvince, kept defensive).
var GOOGLE_GEO_ID = {
  "Eastern Cape":   "20337",
  "Free State":     "20338",
  "Gauteng":        "20340",
  "KwaZulu-Natal":  "20341",
  "Limpopo":        "20342",
  "Mpumalanga":     "20343",
  "Northern Cape":  "20345",
  "North West":     "20346",
  "Western Cape":   "20347"
};
export function googleGeoResourceForProvince(name) {
  var id = GOOGLE_GEO_ID[String(name || "")];
  return id ? ("geoTargetConstants/" + id) : "";
}

// ─── TikTok province lookup ────────────────────────────────────────
// TikTok's report API supports a `province_id` dimension whose values
// are TikTok-internal numeric strings, not names — so we need a
// province-name → TikTok-id map to filter. The map isn't published as
// a static list (it changes rarely but TikTok reserves the right to
// remap), so we resolve it dynamically at first use, cache in Redis
// for 24h, and reuse across handler invocations.
//
// Fetch shape (TikTok's `/tool/region/` endpoint returns SA regions
// with `location_level = "PROVINCE"` and `country_code = "ZA"`):
//   { location_id: 6001234567, location_name: "Gauteng",
//     location_level: "PROVINCE", country_code: "ZA" }
//
// Cache key: `tiktok:regions:za:v1`. Bump the v1 suffix if TikTok
// changes the shape.

import { redisGetJson, redisSetJson } from "./_pulseShared.js";

var _TIKTOK_MAP_CACHE = null; // in-memory cache for one handler run
async function _fetchTikTokProvinceMap() {
  var CACHE_KEY = "tiktok:regions:za:v1";
  // In-memory first (survives across cold-called helpers within the
  // same request).
  if (_TIKTOK_MAP_CACHE) return _TIKTOK_MAP_CACHE;
  // Redis next (24h TTL).
  try {
    var cached = await redisGetJson(CACHE_KEY);
    if (cached && typeof cached === "object") {
      _TIKTOK_MAP_CACHE = cached;
      return _TIKTOK_MAP_CACHE;
    }
  } catch (_) { /* fall through to live fetch */ }

  var token = process.env.TIKTOK_ACCESS_TOKEN;
  var advId = process.env.TIKTOK_ADVERTISER_ID;
  if (!token || !advId) return null;
  // TikTok's /tool/region/ returns a paginated list of regions filtered
  // by country. Placement filter is a JSON stringified [1] meaning
  // TikTok For Business (auction) — required or the endpoint 400s.
  var url = "https://business-api.tiktok.com/open_api/v1.3/tool/region/?advertiser_id=" + advId + "&placement=" + encodeURIComponent(JSON.stringify(["PLACEMENT_TIKTOK"])) + "&region_ids=" + encodeURIComponent(JSON.stringify([])) + "&location_types=" + encodeURIComponent(JSON.stringify(["PROVINCE"]));
  try {
    var r = await fetch(url, { headers: { "Access-Token": token } });
    if (!r.ok) return null;
    var d = await r.json();
    var list = (d && d.data && d.data.regions) || (d && d.data && d.data.list) || [];
    var map = {};
    list.forEach(function(row) {
      var cc = String(row.country_code || row.parent_country_code || "").toUpperCase();
      var lvl = String(row.location_level || row.level || "").toUpperCase();
      if (cc !== "ZA") return;
      if (lvl.indexOf("PROVINCE") < 0 && lvl.indexOf("REGION") < 0) return;
      var name = String(row.location_name || row.name || "").trim();
      var id = String(row.location_id || row.id || "");
      if (!name || !id) return;
      // Match TikTok's name against our canonical SA list (case-
      // insensitive). If TikTok returns a variant like "Kwazulu Natal"
      // vs our "KwaZulu-Natal", normalise for the match but store
      // under our canonical name.
      var canonical = normalizeProvince(name);
      if (!canonical) {
        // Try loose match — strip non-alphanumerics and compare.
        var loose = name.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (var i = 0; i < SA_PROVINCES.length; i++) {
          if (SA_PROVINCES[i].toLowerCase().replace(/[^a-z0-9]/g, "") === loose) { canonical = SA_PROVINCES[i]; break; }
        }
      }
      if (canonical) map[canonical] = id;
    });
    // Only cache if we got at least one province — a zero-hit response
    // usually means TikTok's shape changed and we don't want to pin an
    // empty map for 24h.
    if (Object.keys(map).length > 0) {
      _TIKTOK_MAP_CACHE = map;
      try { await redisSetJson(CACHE_KEY, map, 24 * 60 * 60); } catch (_) {}
      return map;
    }
    return null;
  } catch (_) { return null; }
}

// Returns the TikTok location_id string for a canonical province name,
// or "" if TikTok's map couldn't be resolved (network error, credentials
// missing, unknown shape). Callers should treat "" as "TikTok skipped
// for this province" and surface a warning.
export async function tiktokProvinceIdForProvince(name) {
  var map = await _fetchTikTokProvinceMap();
  if (!map) return "";
  return map[String(name || "")] || "";
}
