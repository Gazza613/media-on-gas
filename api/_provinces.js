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
