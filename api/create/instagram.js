// IG business accounts connected to the ad account.
// Meta exposes these via the page-level field instagram_business_account, so
// we have to walk the page list. Caller passes accountId; the endpoint looks
// up promote_pages for that account, then asks each page about its IG link.

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
    var pgUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" +
                encodeURIComponent(accountId) +
                "/promote_pages?fields=id,name&limit=100&access_token=" + encodeURIComponent(token);
    var pr = await fetch(pgUrl);
    var pd = await pr.json();
    var pages = (pd && pd.data) || [];
    if (pages.length === 0) {
      var altUrl = "https://graph.facebook.com/" + META_API_VERSION +
                   "/me/accounts?fields=id,name&limit=100&access_token=" + encodeURIComponent(token);
      var ar = await fetch(altUrl);
      var ad = await ar.json();
      pages = (ad && ad.data) || [];
    }
    var out = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var iUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" + encodeURIComponent(p.id) +
                 "?fields=instagram_business_account{id,username,profile_picture_url}&access_token=" +
                 encodeURIComponent(token);
      try {
        var ir = await fetch(iUrl);
        var id = await ir.json();
        if (id && id.instagram_business_account) {
          out.push({
            instagramId: id.instagram_business_account.id,
            username: id.instagram_business_account.username || "",
            picture: id.instagram_business_account.profile_picture_url || null,
            pageId: p.id,
            pageName: p.name
          });
        }
      } catch (_) {}
    }
    res.status(200).json({ instagram: out });
  } catch (e) {
    console.error("[create/instagram] error:", e && e.message);
    res.status(500).json({ error: "Failed to fetch instagram accounts" });
  }
}
