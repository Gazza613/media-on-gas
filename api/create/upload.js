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
import { checkCreateAuth, isAccountAllowed, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: "5mb" } } };

var MAX_BYTES = 4 * 1024 * 1024;

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!rateLimit(req, res, { maxPerMin: 20 })) return;

  var token = process.env.META_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: "META_ACCESS_TOKEN not set" }); return; }

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
        res.status(502).json({ error: "Meta image upload failed", detail: idata && idata.error || idata });
        return;
      }
      // Meta keys the response by filename. Pull the first hash.
      var keys = Object.keys(idata.images || {});
      if (keys.length === 0) { res.status(502).json({ error: "Meta returned no image hash" }); return; }
      var hash = idata.images[keys[0]].hash;
      res.status(200).json({ kind: "image", imageHash: hash, filename: keys[0] });
      return;
    }

    fd.append("source", blob, filename);
    fd.append("name", filename);
    var vidUrl = "https://graph.facebook.com/" + META_API_VERSION + "/" +
                 encodeURIComponent(accountId) + "/advideos";
    var vr = await fetch(vidUrl, { method: "POST", body: fd });
    var vdata = await vr.json();
    if (!vr.ok || !vdata || !vdata.id) {
      res.status(502).json({ error: "Meta video upload failed", detail: vdata && vdata.error || vdata });
      return;
    }
    res.status(200).json({ kind: "video", videoId: vdata.id });
  } catch (e) {
    console.error("[create/upload] error:", e && e.message);
    res.status(500).json({ error: "Upload failed" });
  }
}
