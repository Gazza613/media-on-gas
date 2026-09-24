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

// Accept either https:// URLs or inline base64 data URLs. Data URLs
// are how the frontend delivers captured video frames and uploaded
// screenshots (client-side canvas → toDataURL). Size cap protects
// Redis from a runaway payload, 300KB matches the client-side cap
// after canvas downscale + JPEG re-encode.
function isValidThumbSrc(u) {
  if (!u || typeof u !== "string") return false;
  if (/^https:\/\/[^\s]+/i.test(u)) return u.length <= 2000;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u)) return u.length <= 300 * 1024;
  return false;
}

// Meta CDN URLs (fbcdn.net, cdninstagram.com) carry an expiring
// signature in the `oe=` query param — typically valid for 24-72
// hours from issue. Saving the raw URL as a thumb override worked
// on day one and then silently 404'd once the signature expired,
// leaving the operator with an ad card that looked fine yesterday
// and broken today. Materialise the image into an inline base64
// data URI at save time so the stored value stays valid for the
// lifetime of the override, decoupled from Meta's URL signing.
//
// Called from POST before isValidThumbSrc + setThumbOverride. If
// the fetch fails (network blip, non-image content-type, image
// too large), falls through to the raw URL — the existing
// isValidThumbSrc pass then still accepts the URL and the operator
// gets the pre-fix behaviour (works until the signature expires),
// which is strictly no worse than shipping the URL untouched.
async function materializeEphemeralUrl(url) {
  if (!url || !/^https:\/\//i.test(url)) return url;
  var host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch (_) { return url; }
  var isEphemeral = /(^|\.)fbcdn\.net$/.test(host)
    || /(^|\.)cdninstagram\.com$/.test(host)
    || /(^|\.)akamaihd\.net$/.test(host);
  if (!isEphemeral) return url;
  try {
    var r = await fetch(url);
    if (!r.ok) { console.warn("[thumb-override] ephemeral URL fetch failed", r.status, host); return url; }
    var ct = String(r.headers.get("Content-Type") || "").toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif)/.test(ct)) {
      console.warn("[thumb-override] non-image content-type from ephemeral URL", ct, host);
      return url;
    }
    var buf = Buffer.from(await r.arrayBuffer());
    // Cap raw bytes at 220KB so the base64 encoding (≈ 4/3 of source)
    // stays under the existing 300KB storage limit set on data URIs.
    if (buf.length > 220 * 1024) {
      console.warn("[thumb-override] ephemeral image too large to inline", buf.length, host);
      return url;
    }
    var mime = ct.split(";")[0].trim();
    var dataUri = "data:" + mime + ";base64," + buf.toString("base64");
    console.log("[thumb-override] materialised ephemeral URL", { host: host, bytes: buf.length, encoded: dataUri.length });
    return dataUri;
  } catch (err) {
    console.warn("[thumb-override] materialize error", err && err.message);
    return url;
  }
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
    // Meta CDN URLs go stale in ~48h. Inline as data URI up-front so
    // the stored override survives Meta's signature expiry.
    url2 = await materializeEphemeralUrl(url2);
    if (!isValidThumbSrc(url2)) { res.status(400).json({ error: "url must be an https:// image URL or a data:image/... base64 URL under 300KB" }); return; }
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
