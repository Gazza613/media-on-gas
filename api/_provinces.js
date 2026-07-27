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
