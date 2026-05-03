// Search Meta's geo taxonomy (countries / regions / cities / subcities /
// neighborhoods / zip codes) for the wizard's location step. Each match
// carries a `key` that goes back into geo_locations.{cities,regions,zips,...}
// at create time — and a human-readable name + region + country so the
// chips look right in the UI.
//
// For proximity-radius targeting (a pin + 15 km), use /api/create/geocode
// to get lat/lng — Meta's geo search doesn't return coordinates.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

// Meta accepts these `location_types` values on adgeolocation search. The
// wizard sends a comma-separated list; we validate against this allowlist.
var ALLOWED_TYPES = [
  "country", "country_group", "region", "city", "subcity",
  "neighborhood", "zip", "geo_market", "electoral_district"
];

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!rateLimit(req, res, { maxPerMin: 60 })) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "Missing accountId" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var q = String(req.query.q || "").trim();
  if (!q || q.length < 2) { res.status(200).json({ items: [] }); return; }

  // Optional comma-separated type filter. Default = all geo types.
  var typesParam = String(req.query.types || "").trim();
  var requestedTypes = typesParam
    ? typesParam.split(",").map(function(s){ return s.trim(); }).filter(function(s){ return ALLOWED_TYPES.indexOf(s) >= 0; })
    : ALLOWED_TYPES;
  if (requestedTypes.length === 0) requestedTypes = ALLOWED_TYPES;

  try {
    // Meta's adgeolocation search uses location_types as a JSON array param.
    var url = "https://graph.facebook.com/" + META_API_VERSION + "/search" +
              "?type=adgeolocation" +
              "&q=" + encodeURIComponent(q) +
              "&location_types=" + encodeURIComponent(JSON.stringify(requestedTypes)) +
              "&limit=40&access_token=" + encodeURIComponent(token);
    var r = await fetch(url);
    var data = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: "Meta geo search failed", detail: data && data.error || data });
      return;
    }
    var items = ((data && data.data) || []).map(function(d){
      return {
        key: d.key,
        type: d.type || "city",
        name: d.name,
        region: d.region || null,
        regionId: d.region_id || null,
        countryCode: d.country_code || null,
        countryName: d.country_name || null,
        supportsRegion: !!d.supports_region,
        supportsCity: !!d.supports_city
      };
    });
    res.status(200).json({ items: items });
  } catch (e) {
    console.error("[create/location-search] error:", e && e.message);
    res.status(500).json({ error: "Search failed" });
  }
}
