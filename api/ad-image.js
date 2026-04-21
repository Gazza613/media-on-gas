import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isCampaignAllowed } from "./_auth.js";

// Resolve a Meta or TikTok ad thumbnail to a fresh CDN URL, then 302-redirect
// the client's <img> there. Mirrors the pattern in /api/ad-video: Meta and
// TikTok CDN URLs are signed and expire in about an hour, so the URL that
// came back when the dashboard first loaded breaks for a client who opens
// their share link later. Fetching a fresh signed URL server-side on every
// image load keeps previews working for the lifetime of the share token.

var resolveCache = {};
var RESOLVE_TTL_MS = 10 * 60 * 1000;

async function resolveMetaAdThumbnail(adId, token) {
  // Fetch the creative block, then walk every field that can carry a
  // thumbnail / preview image. Same fallback chain the dashboard uses
  // when first fetching ads.
  var fields = "id,thumbnail_url,image_url,effective_object_story_id,video_id,asset_feed_spec,object_story_spec";
  var url = "https://graph.facebook.com/v25.0/" + encodeURIComponent(adId) + "?fields=creative{" + fields + "}&access_token=" + token;
  var r = await fetch(url);
  if (!r.ok) return null;
  var d = await r.json();
  var c = d.creative || {};
  if (c.video_id) {
    try {
      var vr = await fetch("https://graph.facebook.com/v25.0/" + encodeURIComponent(c.video_id) + "?fields=picture,thumbnails{uri}&access_token=" + token);
      if (vr.ok) {
        var vd = await vr.json();
        if (vd.thumbnails && vd.thumbnails.data && vd.thumbnails.data.length > 0 && vd.thumbnails.data[0].uri) return vd.thumbnails.data[0].uri;
        if (vd.picture) return vd.picture;
      }
    } catch (_) {}
  }
  if (c.thumbnail_url) return c.thumbnail_url;
  if (c.image_url) return c.image_url;
  var afs = c.asset_feed_spec || {};
  if (afs.images && afs.images.length > 0) {
    for (var i = 0; i < afs.images.length; i++) {
      if (afs.images[i].url) return afs.images[i].url;
    }
  }
  var oss = c.object_story_spec || {};
  if (oss.link_data && oss.link_data.picture) return oss.link_data.picture;
  return null;
}

async function resolveTikTokAdImage(adId, advId, token) {
  try {
    var url = "https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=" + advId + "&filtering=" + encodeURIComponent(JSON.stringify({ ad_ids: [adId] })) + "&fields=" + encodeURIComponent(JSON.stringify(["ad_id","video_id","image_ids"]));
    var r = await fetch(url, { headers: { "Access-Token": token } });
    if (!r.ok) return null;
    var d = await r.json();
    if (!d.data || !d.data.list || d.data.list.length === 0) return null;
    var ad = d.data.list[0];
    if (ad.video_id) {
      var vUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + advId + "&video_ids=" + encodeURIComponent(JSON.stringify([ad.video_id]));
      var vr = await fetch(vUrl, { headers: { "Access-Token": token } });
      if (vr.ok) {
        var vd = await vr.json();
        if (vd.data && vd.data.list && vd.data.list.length > 0) {
          var v = vd.data.list[0];
          return v.video_cover_url || v.poster_url || null;
        }
      }
    }
    if (ad.image_ids && ad.image_ids.length > 0) {
      var iUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/?advertiser_id=" + advId + "&image_ids=" + encodeURIComponent(JSON.stringify(ad.image_ids));
      var ir = await fetch(iUrl, { headers: { "Access-Token": token } });
      if (ir.ok) {
        var id = await ir.json();
        if (id.data && id.data.list && id.data.list.length > 0) {
          var img = id.data.list[0];
          return img.image_url || img.url || null;
        }
      }
    }
    return null;
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 240, maxPerHour: 2000 })) return;
  if (!checkAuth(req, res)) return;

  var platform = String(req.query.platform || "").toLowerCase();
  var adId = String(req.query.adId || req.query.id || "").trim();
  var campaignId = String(req.query.campaignId || "").trim();

  if (!adId) { res.status(400).json({ error: "adId required" }); return; }
  if (platform !== "meta" && platform !== "tiktok") { res.status(400).json({ error: "platform must be meta or tiktok" }); return; }

  // Client-scope guard matches /api/ad-video.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    if (!campaignId) { res.status(400).json({ error: "campaignId required for client requests" }); return; }
    if (!isCampaignAllowed(principal, campaignId, "")) {
      res.status(403).json({ error: "Not allowed for this campaign" });
      return;
    }
  }

  var cacheKey = platform + "|" + adId;
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
      cdnUrl = await resolveMetaAdThumbnail(adId, metaToken);
    } else if (platform === "tiktok") {
      var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
      var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
      if (!ttToken || !ttAdvId) { res.status(500).json({ error: "TikTok credentials not configured" }); return; }
      cdnUrl = await resolveTikTokAdImage(adId, ttAdvId, ttToken);
    }
  } catch (err) {
    console.error("ad-image resolve error", err);
    res.status(500).json({ error: "Resolve failed" });
    return;
  }

  if (!cdnUrl) { res.status(404).json({ error: "Image not available" }); return; }

  resolveCache[cacheKey] = { url: cdnUrl, ts: Date.now() };
  res.redirect(302, cdnUrl);
}
