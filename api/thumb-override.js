// Thumbnail override endpoint. Admin/superadmin can set a custom
// thumbnail URL for any adId whose platform-native resolution
// produces a black frame, a stale asset, or a 404. Override wins
// over Meta / TikTok / Google resolution everywhere the ad
// renders (dashboard, share email, PDF report).
//
// Routes:
//   GET    /api/thumb-override           list every override (admin)
//   GET    /api/thumb-override?adId=X    get one override
//   POST   /api/thumb-override           set one { adId, url }
//   DELETE /api/thumb-override?adId=X    clear one

import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isAdminOrSuperadmin } from "./_auth.js";
import { getThumbOverrides, getThumbOverride, setThumbOverride } from "./_thumbOverrides.js";

function isValidHttpsUrl(u) {
  if (!u || typeof u !== "string") return false;
  if (u.length > 2000) return false;
  return /^https:\/\/[^\s]+/i.test(u);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;

  var principal = req.authPrincipal || { role: "admin" };
  var isPrivileged = isAdminOrSuperadmin(principal);

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === "GET") {
    var qAd = String(req.query.adId || "").trim();
    if (qAd) {
      var url = await getThumbOverride(qAd);
      res.status(200).json({ ok: true, adId: qAd, url: url || null });
      return;
    }
    // No adId → list all. Admin-only to avoid leaking creative URLs
    // across clients (Meta CDN URLs can encode account context).
    if (!isPrivileged) { res.status(403).json({ error: "admin_required" }); return; }
    var all = await getThumbOverrides();
    res.status(200).json({ ok: true, overrides: all });
    return;
  }

  // ── POST { adId, url } — set one override ──────────────────────
  if (req.method === "POST") {
    if (!isPrivileged) { res.status(403).json({ error: "admin_required" }); return; }
    var body = req.body || {};
    var adId = String(body.adId || "").trim();
    if (!adId) { res.status(400).json({ error: "adId required" }); return; }
    if (adId.length > 64) { res.status(400).json({ error: "adId too long" }); return; }
    var url2 = String(body.url || "").trim();
    if (!isValidHttpsUrl(url2)) { res.status(400).json({ error: "url must be an https:// image URL" }); return; }
    var ok = await setThumbOverride(adId, url2);
    if (!ok) { res.status(500).json({ error: "storage_failed" }); return; }
    res.status(200).json({ ok: true, adId: adId, url: url2 });
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!isPrivileged) { res.status(403).json({ error: "admin_required" }); return; }
    var delAd = String(req.query.adId || "").trim();
    if (!delAd) { res.status(400).json({ error: "adId required" }); return; }
    var ok2 = await setThumbOverride(delAd, "");
    if (!ok2) { res.status(500).json({ error: "storage_failed" }); return; }
    res.status(200).json({ ok: true, adId: delAd, cleared: true });
    return;
  }

  res.setHeader("Allow", "GET, POST, DELETE, OPTIONS");
  res.status(405).json({ error: "method_not_allowed" });
}
