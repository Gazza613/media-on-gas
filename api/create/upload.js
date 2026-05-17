// Creative asset upload to Meta. Two flavours: image → returns image_hash,
// video → returns video_id. Both go on the ad account.
//
// Body shape (JSON, base64):
//   { kind:"image"|"video", accountId, filename, mimeType, dataB64 }
//
// We accept base64 over a JSON body (rather than multipart) because Vercel's
// Node runtime hands us a parsed body in `req.body` and multipart parsing
// would mean pulling in another dep. The cost is a ~33% size inflation on the
// wire; Vercel's default body limit is 4.5MB so the practical asset cap is
// ~3.3MB. Plenty for compressed images, tight for video — Phase 2 should
// switch to a resumable upload (Meta's video endpoint supports start/transfer
// /finish phases).

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";
import { registerAsset } from "./_assetLibrary.js";

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: "5mb" } } };

var MAX_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 20 }))) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  var kind = String(body.kind || "").toLowerCase();
  var accountId = String(body.accountId || "").trim();
  var filename = String(body.filename || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "asset";
  var mimeType = String(body.mimeType || "");
  var dataB64 = String(body.dataB64 || "");
  // Optional, for library scoping/labelling. Never affects the upload.
  var clientCode = String(body.clientCode || "").slice(0, 40);
  var ratioLabel = String(body.ratioLabel || "").slice(0, 16);

  if (kind !== "image" && kind !== "video") { res.status(400).json({ error: "kind must be image or video" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }
  if (!dataB64) { res.status(400).json({ error: "Missing dataB64" }); return; }

  var buffer;
  try { buffer = Buffer.from(dataB64, "base64"); } catch (_) {
    res.status(400).json({ error: "dataB64 not valid base64" }); return;
  }
  if (!buffer || buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
  if (buffer.length > MAX_BYTES) {
    res.status(413).json({ error: "Asset too large", limitBytes: MAX_BYTES, gotBytes: buffer.length });
    return;
  }

  try {
    var fd = new FormData();
    var blob = new Blob([buffer], { type: mimeType || (kind === "image" ? "image/jpeg" : "video/mp4") });
    fd.append("access_token", token);
    if (kind === "image") {
      fd.append("source", blob, filename);
      var imgUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" +
                   encodeURIComponent(accountId) + "/adimages";
      var ir = await fetch(imgUrl, { method: "POST", body: fd });
      var idata = await ir.json();
      if (!ir.ok || !idata || !idata.images) {
        // Log the raw Meta error server-side for triage, but return a
        // generic message to the client. Meta error envelopes can include
        // platform internals (subcodes, fbtrace_id, internal stack
        // breadcrumbs) that don't belong in a response body the team UI
        // surfaces verbatim.
        console.error("[create/upload] Meta image rejected:", JSON.stringify(idata && idata.error || idata));
        res.status(502).json({ error: "Meta image upload failed" });
        return;
      }
      // Meta keys the response by filename. Pull the first hash.
      var keys = Object.keys(idata.images || {});
      if (keys.length === 0) { res.status(502).json({ error: "Meta returned no image hash" }); return; }
      var imgEntry = idata.images[keys[0]] || {};
      var hash = imgEntry.hash;
      // Resolve a durable preview URL for the library. The /adimages
      // POST response sometimes omits url; a hashes= GET is reliable.
      var thumbUrl = /^https?:\/\//.test(String(imgEntry.url || "")) ? imgEntry.url : "";
      if (!thumbUrl) {
        try {
          var lookUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" +
            encodeURIComponent(accountId) + "/adimages?fields=hash,url,permalink_url&hashes=" +
            encodeURIComponent(JSON.stringify([hash])) + "&access_token=" + encodeURIComponent(token);
          var lr = await fetch(lookUrl);
          var lj = await lr.json();
          var first = lj && lj.data && lj.data[0];
          if (first) thumbUrl = first.permalink_url || first.url || "";
        } catch (_) { /* best-effort, library just shows a placeholder */ }
      }
      // Best-effort: add to the shared asset library. Must never fail
      // or delay the upload response the wizard is waiting on.
      try { await registerAsset(accountId, { kind: "image", imageHash: hash, filename: keys[0], thumbnailUrl: thumbUrl, clientCode: clientCode, ratioLabel: ratioLabel }); } catch (_) {}
      res.status(200).json({ kind: "image", imageHash: hash, filename: keys[0], thumbnailUrl: thumbUrl });
      return;
    }

    fd.append("source", blob, filename);
    fd.append("name", filename);
    var vidUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" +
                 encodeURIComponent(accountId) + "/advideos";
    var vr = await fetch(vidUrl, { method: "POST", body: fd });
    var vdata = await vr.json();
    if (!vr.ok || !vdata || !vdata.id) {
      // See note above: log full Meta detail server-side, return generic.
      console.error("[create/upload] Meta video rejected:", JSON.stringify(vdata && vdata.error || vdata));
      res.status(502).json({ error: "Meta video upload failed" });
      return;
    }
    // Video thumbnails are not ready at upload time; the library shows
    // a video placeholder tile until Meta finishes processing.
    try { await registerAsset(accountId, { kind: "video", videoId: vdata.id, filename: filename, thumbnailUrl: "", clientCode: clientCode, ratioLabel: ratioLabel }); } catch (_) {}
    res.status(200).json({ kind: "video", videoId: vdata.id });
  } catch (e) {
    console.error("[create/upload] error:", e && e.message);
    res.status(500).json({ error: "Upload failed" });
  }
}
