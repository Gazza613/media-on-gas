// Pages this ad account is allowed to promote.
// Uses /promote_pages which is the Meta-blessed endpoint for "what Page can
// this ad account run ads on behalf of"; falls back to /me/accounts if the
// account has no promote_pages set so the wizard still has options.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!rateLimit(req, res, { maxPerMin: 30 })) return;

  var accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "Missing accountId" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var token = process.env.META_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: "META_ACCESS_TOKEN not set" }); return; }

  try {
    var url = "https://graph.facebook.com/" + META_API_VERSION + "/" +
              encodeURIComponent(accountId) +
              "/promote_pages?fields=id,name,access_token,picture&limit=100&access_token=" +
              encodeURIComponent(token);
    var r = await fetch(url);
    var data = await r.json();
    var pages = (data && data.data) || [];
    if (pages.length === 0) {
      var altUrl = "https://graph.facebook.com/" + META_API_VERSION +
                   "/me/accounts?fields=id,name,access_token,picture&limit=100&access_token=" +
                   encodeURIComponent(token);
      var ar = await fetch(altUrl);
      var ad = await ar.json();
      pages = (ad && ad.data) || [];
    }
    var out = pages.map(function(p){
      return {
        pageId: p.id,
        name: p.name,
        picture: (p.picture && p.picture.data && p.picture.data.url) || null
      };
    });
    res.status(200).json({ pages: out });
  } catch (e) {
    console.error("[create/pages] error:", e && e.message);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
}
