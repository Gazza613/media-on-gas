import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isCampaignAllowed } from "./_auth.js";

// Resolve a Meta or TikTok ad video to its public CDN URL, then 302-redirect
// the client's <video> element there. Uses admin platform tokens server-side
// so client share-link users never need to hit Meta/TikTok auth walls.
//
// Client-scoped security: when called under a client JWT token, the caller
// must pass the campaignId the video belongs to, and it must be inside their
// allowlist. Without that check a client could enumerate video IDs to peek
// at ads from other accounts.

var resolveCache = {};
var RESOLVE_TTL_MS = 10 * 60 * 1000; // Meta CDN signed URLs typically valid ~hour; 10 min keeps us well inside that

async function resolveMetaVideo(videoId, token) {
  var url = "https://graph.facebook.com/v25.0/" + encodeURIComponent(videoId) + "?fields=source,permalink_url&access_token=" + token;
  var r = await fetch(url);
  if (!r.ok) return null;
  var d = await r.json();
  return d.source || null;
}

async function resolveTikTokVideo(videoId, advId, token) {
  var vids = encodeURIComponent(JSON.stringify([videoId]));
  var url = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + advId + "&video_ids=" + vids;
  var r = await fetch(url, { headers: { "Access-Token": token } });
  if (!r.ok) return null;
  var d = await r.json();
  if (!d.data || !d.data.list || d.data.list.length === 0) return null;
  var item = d.data.list[0];
  return item.video_url || item.preview_url || null;
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 120, maxPerHour: 1000 })) return;
  if (!checkAuth(req, res)) return;

  var platform = String(req.query.platform || "").toLowerCase();
  var videoId = String(req.query.id || "").trim();
  var campaignId = String(req.query.campaignId || "").trim();

  if (!videoId) { res.status(400).json({ error: "id required" }); return; }
  if (platform !== "meta" && platform !== "tiktok") { res.status(400).json({ error: "platform must be meta or tiktok" }); return; }

  // Client-scope guard: client tokens must prove this video's campaign is in their allowlist.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    if (!campaignId) { res.status(400).json({ error: "campaignId required for client requests" }); return; }
    if (!isCampaignAllowed(principal, campaignId, "")) {
      res.status(403).json({ error: "Not allowed for this campaign" });
      return;
    }
  }

  var cacheKey = platform + "|" + videoId;
  var cached = resolveCache[cacheKey];
  if (cached && Date.now() - cached.ts < RESOLVE_TTL_MS) {
    res.redirect(302, cached.url);
    return;
  }

  var cdnUrl = null;
  try {
    if (platform === "meta") {
      var metaToken = process.env.META_ACCESS_TOKEN;
      if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not configured" }); return; }
      cdnUrl = await resolveMetaVideo(videoId, metaToken);
    } else if (platform === "tiktok") {
      var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
      var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
      if (!ttToken || !ttAdvId) { res.status(500).json({ error: "TikTok credentials not configured" }); return; }
      cdnUrl = await resolveTikTokVideo(videoId, ttAdvId, ttToken);
    }
  } catch (err) {
    console.error("ad-video resolve error", err);
    res.status(500).json({ error: "Resolve failed" });
    return;
  }

  if (!cdnUrl) { res.status(404).json({ error: "Video URL not available" }); return; }

  resolveCache[cacheKey] = { url: cdnUrl, ts: Date.now() };
  // resolveOnly=1 returns the CDN URL as JSON so the client can set it
  // directly on a <video> src. 302 redirects on video sources break on
  // Safari + some Chrome builds because byte-range requests don't follow
  // the redirect reliably, leaving controls visible but playback dead.
  if (req.query.resolveOnly === "1") {
    res.status(200).json({ url: cdnUrl });
    return;
  }
  res.redirect(302, cdnUrl);
}
