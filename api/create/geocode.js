// Address-string → lat/lng resolver, used by the proximity-radius targeting
// in the wizard. Meta's adgeolocation search returns geo IDs but not
// coordinates; for custom_locations targeting (a pin + N km radius) we need
// the coordinates explicitly.
//
// Backend: OpenStreetMap Nominatim. Free, no API key, but the public
// endpoint requires:
//   - User-Agent header identifying the app
//   - Polite usage (1 req/sec, no bulk)
// We add the User-Agent and gate via rateLimit. For higher volume we'd swap
// to Google Geocoding (set GOOGLE_MAPS_API_KEY) which is automatically
// preferred when the env var is present.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  var q = String(req.query.q || "").trim();
  if (!q || q.length < 3) { res.status(200).json({ results: [] }); return; }
  // Optional country bias for SA-specific lookups. Defaults to ZA so a
  // search for "Sandton" doesn't grab a Sandton in Toronto.
  var country = String(req.query.country || "ZA").trim().toUpperCase();

  var googleKey = process.env.GOOGLE_MAPS_API_KEY;
  try {
    if (googleKey) {
      var gUrl = "https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(q) +
                 (country ? "&components=country:" + encodeURIComponent(country) : "") +
                 "&key=" + encodeURIComponent(googleKey);
      var gr = await fetch(gUrl);
      var gd = await gr.json();
      if (gd && gd.status === "OK") {
        var gResults = (gd.results || []).slice(0, 5).map(function(r){
          var loc = r.geometry && r.geometry.location;
          return {
            lat: loc && loc.lat,
            lng: loc && loc.lng,
            displayName: r.formatted_address,
            types: r.types || []
          };
        }).filter(function(r){ return isFinite(r.lat) && isFinite(r.lng); });
        res.status(200).json({ source: "google", results: gResults });
        return;
      }
      if (gd && gd.status === "ZERO_RESULTS") { res.status(200).json({ source: "google", results: [] }); return; }
      // fall through to Nominatim on Google error so we degrade gracefully
    }

    var nUrl = "https://nominatim.openstreetmap.org/search?q=" + encodeURIComponent(q) +
               (country ? "&countrycodes=" + encodeURIComponent(country.toLowerCase()) : "") +
               "&format=json&limit=5&addressdetails=1";
    var nr = await fetch(nUrl, {
      headers: {
        "User-Agent": "media-on-gas/create-tab (gary@gasmarketing.co.za)",
        "Accept": "application/json"
      }
    });
    if (!nr.ok) { res.status(502).json({ error: "Nominatim returned " + nr.status }); return; }
    var nd = await nr.json();
    var nResults = (nd || []).map(function(r){
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        displayName: r.display_name,
        types: [r.type, r.class].filter(Boolean)
      };
    }).filter(function(r){ return isFinite(r.lat) && isFinite(r.lng); });
    res.status(200).json({ source: "nominatim", results: nResults });
  } catch (e) {
    console.error("[create/geocode] error:", e && e.message);
    res.status(500).json({ error: "Geocode failed" });
  }
}
