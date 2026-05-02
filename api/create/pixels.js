// Pixels available on the ad account. Used by the Tracking step so the
// wizard can attach a pixel id to the adset for OUTCOME_SALES (and any other
// flow that wants to measure conversions).

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!rateLimit(req, res, { maxPerMin: 30 })) return;

  var accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "Missing accountId" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  try {
    var url = "https://graph.facebook.com/" + META_API_VERSION + "/" +
              encodeURIComponent(accountId) +
              "/adspixels?fields=id,name,last_fired_time&limit=100&access_token=" +
              encodeURIComponent(token);
    var r = await fetch(url);
    var data = await r.json();
    var pixels = ((data && data.data) || []).map(function(p){
      return { pixelId: p.id, name: p.name, lastFiredTime: p.last_fired_time || null };
    });
    res.status(200).json({ pixels: pixels });
  } catch (e) {
    console.error("[create/pixels] error:", e && e.message);
    res.status(500).json({ error: "Failed to fetch pixels" });
  }
}
