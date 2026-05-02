// IG business accounts connected to the ad account.
// Meta exposes these via the page-level field instagram_business_account, so
// we have to walk the page list. Caller passes accountId; the endpoint looks
// up promote_pages for that account, then asks each page about its IG link.

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
    // For ad creatives we want the IG identity that Meta accepts as
    // instagram_user_id / instagram_actor_id in object_story_spec. Pages
    // expose two adjacent fields that look interchangeable but aren't:
    //   - connected_instagram_account: the legacy ads-eligible link, this is
    //     the one ad creatives actually want.
    //   - instagram_business_account: the modern Graph IG identity used by
    //     content APIs. Sometimes set, sometimes not, sometimes the same id
    //     as connected, sometimes different.
    // We fetch both and prefer connected_instagram_account when present;
    // otherwise we fall back to instagram_business_account (better than
    // showing an empty dropdown — if that id is wrong Meta will reject it
    // at create time and the wizard surfaces the error).
    var out = [];
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      var iUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" + encodeURIComponent(p.id) +
                 "?fields=connected_instagram_account{id,username,profile_picture_url},instagram_business_account{id,username,profile_picture_url}&access_token=" +
                 encodeURIComponent(token);
      try {
        var ir = await fetch(iUrl);
        var id = await ir.json();
        var preferred = (id && id.connected_instagram_account) || (id && id.instagram_business_account) || null;
        var source = id && id.connected_instagram_account ? "connected" : (id && id.instagram_business_account ? "business" : null);
        if (preferred) {
          out.push({
            instagramId: preferred.id,
            username: preferred.username || "",
            picture: preferred.profile_picture_url || null,
            pageId: p.id,
            pageName: p.name,
            source: source
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
