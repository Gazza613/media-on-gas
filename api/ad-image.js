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
  // Order mirrors the proven-sharp priority in api/ads.js:
  //   1. video thumbnail (largest / preferred frame)
  //   2. image_hash → /adaccount/adimages?fields=url,permalink_url (original upload)
  //   3. asset_feed_spec.images[].url (DCO full-size assets)
  //   4. post attachments.media.image.src (Meta's highest-res cached copy)
  //   5. post picture_attachment.image.src
  //   6. post full_picture
  //   7. creative.image_url
  //   8. object_story_spec.link_data.picture
  //   9. creative.thumbnail_url (last resort, ~64-192px, blurry)
  var fields = "id,thumbnail_url,image_url,effective_object_story_id,video_id,image_hash,asset_feed_spec,object_story_spec,account_id";
  var url = "https://graph.facebook.com/v25.0/" + encodeURIComponent(adId) + "?fields=account_id,creative{" + fields + "}&access_token=" + token;
  var r = await fetch(url);
  if (!r.ok) return null;
  var d = await r.json();
  var c = d.creative || {};
  var accountId = d.account_id ? "act_" + d.account_id : null;

  if (c.video_id) {
    try {
      var vr = await fetch("https://graph.facebook.com/v25.0/" + encodeURIComponent(c.video_id) + "?fields=picture,thumbnails{uri,is_preferred,width,height}&access_token=" + token);
      if (vr.ok) {
        var vd = await vr.json();
        if (vd.thumbnails && vd.thumbnails.data && vd.thumbnails.data.length > 0) {
          // ALWAYS pick the largest-area thumbnail. Meta's `is_preferred` flag
          // is often set on a tiny 192x192 auto-chosen frame — preferring it
          // returned blurry 192-px posters into the preview modal even though
          // 1080x1080 variants were sitting right next to it. If there's a
          // tie on area, use is_preferred as the tiebreaker only.
          var best = null;
          var bestArea = 0;
          var bestIsPreferred = false;
          for (var ti = 0; ti < vd.thumbnails.data.length; ti++) {
            var t = vd.thumbnails.data[ti];
            if (!t.uri) continue;
            var area = parseInt(t.width || 0) * parseInt(t.height || 0);
            var isPref = !!t.is_preferred;
            if (area > bestArea || (area === bestArea && isPref && !bestIsPreferred)) {
              best = t.uri;
              bestArea = area;
              bestIsPreferred = isPref;
            }
          }
          if (best) return best;
          if (vd.thumbnails.data[0].uri) return vd.thumbnails.data[0].uri;
        }
        if (vd.picture) return vd.picture;
      }
    } catch (_) {}
  }

  // image_hash → adaccount/adimages returns the original upload URL.
  // Collect hashes from BOTH creative.image_hash AND asset_feed_spec.images
  // (DCO / Advantage+ creatives put the hash inside asset_feed_spec, not
  // at the top level). Any hit returns the source upload at full fidelity.
  var afs = c.asset_feed_spec || {};
  var candidateHashes = [];
  if (c.image_hash) candidateHashes.push(c.image_hash);
  if (afs.images && afs.images.length > 0) {
    for (var ah = 0; ah < afs.images.length; ah++) {
      if (afs.images[ah].hash) candidateHashes.push(afs.images[ah].hash);
    }
  }
  if (candidateHashes.length > 0 && accountId) {
    try {
      var hashes = encodeURIComponent(JSON.stringify(candidateHashes));
      var ir = await fetch("https://graph.facebook.com/v25.0/" + accountId + "/adimages?hashes=" + hashes + "&fields=hash,url,permalink_url,width,height&access_token=" + token);
      if (ir.ok) {
        var id = await ir.json();
        if (id.data && id.data.length > 0) {
          // Pick the largest result (measured by width × height) that has a URL.
          var bestUrl = "";
          var bestArea2 = 0;
          for (var iri = 0; iri < id.data.length; iri++) {
            var row = id.data[iri];
            var area2 = parseInt(row.width || 0) * parseInt(row.height || 0);
            var u = row.url || row.permalink_url;
            if (u && area2 >= bestArea2) { bestUrl = u; bestArea2 = area2; }
          }
          if (bestUrl) return bestUrl;
        }
      }
    } catch (_) {}
  }

  // asset_feed_spec.images[].url — pre-resolved DCO asset URLs (full size).
  if (afs.images && afs.images.length > 0) {
    for (var i = 0; i < afs.images.length; i++) {
      if (afs.images[i].url) return afs.images[i].url;
    }
  }

  // Post-based sources. attachments.media.image.src is Meta's largest cached
  // copy. picture_attachment.image.src is the next best; full_picture and
  // picture are lower-res fallbacks.
  if (c.effective_object_story_id) {
    try {
      var pr = await fetch("https://graph.facebook.com/v25.0/" + encodeURIComponent(c.effective_object_story_id) + "?fields=attachments{media{image},subattachments{media{image}}},picture_attachment{image},full_picture,picture&access_token=" + token);
      if (pr.ok) {
        var pd = await pr.json();
        var att = pd.attachments && pd.attachments.data && pd.attachments.data[0];
        if (att) {
          if (att.media && att.media.image && att.media.image.src) return att.media.image.src;
          var sub = att.subattachments && att.subattachments.data && att.subattachments.data[0];
          if (sub && sub.media && sub.media.image && sub.media.image.src) return sub.media.image.src;
        }
        if (pd.picture_attachment && pd.picture_attachment.image && pd.picture_attachment.image.src) return pd.picture_attachment.image.src;
        if (pd.full_picture) return pd.full_picture;
        if (pd.picture) return pd.picture;
      }
    } catch (_) {}
  }

  if (c.image_url) return c.image_url;

  var oss = c.object_story_spec || {};
  if (oss.link_data && oss.link_data.picture) return oss.link_data.picture;

  if (c.thumbnail_url) return c.thumbnail_url;
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
