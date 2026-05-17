// Shared Create-tab creative asset library. Every successful upload is
// registered here so the team can re-pick an existing Meta asset
// instead of re-uploading it on the next campaign. Phase 2 of the
// builder roadmap: kills the re-upload tax on repeat builds.
//
// Storage: one Redis list per ad account, "create:assets:{accountId}",
// JSON record per asset, newest first, capped. Per-account keys keep
// each list small and let the picker query exactly the account the
// wizard is on. Dedup is by the Meta reference (imageHash / videoId)
// so re-uploading the identical asset does not clutter the library.

var MAX_ASSETS = 300;

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisCmd(args) {
  var creds = getCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

function keyFor(accountId) {
  var safe = String(accountId || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
  if (!safe) return null;
  return "create:assets:" + safe;
}

function str(v, max) { return String(v == null ? "" : v).slice(0, max || 200); }

export async function listAssets(accountId) {
  var key = keyFor(accountId);
  if (!key) return [];
  var res = await redisCmd(["LRANGE", key, "0", String(MAX_ASSETS - 1)]);
  if (!res || !res.result) return [];
  return res.result.map(function(s){ try { return JSON.parse(s); } catch (_) { return null; } }).filter(Boolean);
}

// Normalise + dedupe by Meta ref. Returns the stored record (or the
// pre-existing one if it was already in the library). Never throws:
// asset registration is best-effort and must not fail an upload.
export async function registerAsset(accountId, raw) {
  try {
    var key = keyFor(accountId);
    if (!key || !raw) return null;
    var kind = raw.kind === "video" ? "video" : "image";
    var imageHash = raw.imageHash ? str(raw.imageHash, 200) : "";
    var videoId = raw.videoId ? str(raw.videoId, 80) : "";
    if (!imageHash && !videoId) return null;
    var ref = imageHash || videoId;

    var existing = await listAssets(accountId);
    var dup = existing.filter(function(a){ return a && (a.imageHash === imageHash && imageHash) || (a.videoId === videoId && videoId); })[0];
    if (dup) return dup;

    var rec = {
      id: "ast_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      kind: kind,
      imageHash: imageHash || null,
      videoId: videoId || null,
      ref: ref,
      filename: str(raw.filename, 260),
      thumbnailUrl: /^https?:\/\//.test(String(raw.thumbnailUrl || "")) ? String(raw.thumbnailUrl).slice(0, 1000) : "",
      clientCode: str(raw.clientCode, 40),
      ratioLabel: str(raw.ratioLabel, 16),
      uploadedAt: new Date().toISOString()
    };
    await redisCmd(["LPUSH", key, JSON.stringify(rec)]);
    await redisCmd(["LTRIM", key, "0", String(MAX_ASSETS - 1)]);
    return rec;
  } catch (_) { return null; }
}

export async function deleteAsset(accountId, id) {
  var key = keyFor(accountId);
  if (!key) return [];
  var existing = await listAssets(accountId);
  var next = existing.filter(function(a){ return a && a.id !== id; });
  await redisCmd(["DEL", key]);
  for (var i = next.length - 1; i >= 0; i--) {
    await redisCmd(["LPUSH", key, JSON.stringify(next[i])]);
  }
  return next;
}
