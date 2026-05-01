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

async function resolveMetaVideo(videoId, token, adId) {
  // Returns { url, type: "video" | "iframe" } or null.
  // Path 1: direct /video/{id} lookup — canonical for Facebook-native videos.
  var url = "https://graph.facebook.com/v25.0/" + encodeURIComponent(videoId) + "?fields=source,format,embed_html,permalink_url,status&access_token=" + token;
  var r = await fetch(url);
  if (r.ok) {
    var d = await r.json();
    if (d.source) return { url: d.source, type: "video" };
    if (d.format && Array.isArray(d.format) && d.format.length > 0) {
      var ordered = d.format.slice().sort(function(a, b) {
        return (parseInt(b.height || 0) * parseInt(b.width || 0)) - (parseInt(a.height || 0) * parseInt(a.width || 0));
      });
      for (var i = 0; i < ordered.length; i++) {
        var html = ordered[i].embed_html || "";
        var m = /src="([^"]+)"/.exec(html);
        if (m && m[1] && m[1].indexOf(".mp4") >= 0) return { url: m[1], type: "video" };
      }
    }
    if (d.embed_html) {
      var m2 = /src="([^"]+)"/.exec(d.embed_html);
      if (m2 && m2[1] && m2[1].indexOf(".mp4") >= 0) return { url: m2[1], type: "video" };
    }
  }

  // Helper that re-queries a specific video_id for its direct source URL.
  // We use this in the creative-spec path below to walk every video_id we
  // can surface from the ad's creative spec and try each until Meta gives
  // us an MP4 source, before giving up to the iframe fallback.
  async function resolveVideoIdToSource(vid) {
    if (!vid) return null;
    try {
      var u = "https://graph.facebook.com/v25.0/" + encodeURIComponent(vid) + "?fields=source,format,embed_html&access_token=" + token;
      var r = await fetch(u);
      if (!r.ok) return null;
      var d = await r.json();
      if (d.source) return d.source;
      if (d.format && Array.isArray(d.format) && d.format.length > 0) {
        var ordered = d.format.slice().sort(function(a, b) {
          return (parseInt(b.height || 0) * parseInt(b.width || 0)) - (parseInt(a.height || 0) * parseInt(a.width || 0));
        });
        for (var i = 0; i < ordered.length; i++) {
          var h = ordered[i].embed_html || "";
          var m = /src="([^"]+)"/.exec(h);
          if (m && m[1] && m[1].indexOf(".mp4") >= 0) return m[1];
        }
      }
      if (d.embed_html) {
        var m2 = /src="([^"]+)"/.exec(d.embed_html);
        if (m2 && m2[1] && m2[1].indexOf(".mp4") >= 0) return m2[1];
      }
    } catch (_) {}
    return null;
  }

  // Paths 2 / 2.5 / 3: inspect the ad's creative. We fetch everything
  // useful in one Graph call, then work through each source path in order
  // of reliability, so we only ever fall back to the iframe widget when
  // no direct MP4 can be resolved.
  if (adId) {
    try {
      // Expanded field set:
      //   effective_object_story_id  — Path 2 (Page-post attachments)
      //   object_story_spec.video_data.video_id — Path 2.5 (dark-post creative spec)
      //   asset_feed_spec.videos[].video_id — Path 2.5 (DCO video variants)
      //   video_id — Path 2.5 (simple video creatives)
      var adUrl = "https://graph.facebook.com/v25.0/" + encodeURIComponent(adId) + "?fields=creative{effective_object_story_id,instagram_permalink_url,video_id,object_story_spec{video_data{video_id}},asset_feed_spec{videos{video_id}}}&access_token=" + token;
      var adRes = await fetch(adUrl);
      if (adRes.ok) {
        var adData = await adRes.json();
        var c = adData.creative || {};

        // Path 2: Post attachments — covers IG Feed / Reels videos when the
        // token has Page access to that ad account's Pages.
        var storyId = c.effective_object_story_id;
        if (storyId) {
          try {
            var postUrl = "https://graph.facebook.com/v25.0/" + encodeURIComponent(storyId) + "?fields=attachments{media,subattachments{media}},source&access_token=" + token;
            var pRes = await fetch(postUrl);
            if (pRes.ok) {
              var pd = await pRes.json();
              if (pd.source) return { url: pd.source, type: "video" };
              var att = pd.attachments && pd.attachments.data && pd.attachments.data[0];
              if (att) {
                if (att.media && att.media.source) return { url: att.media.source, type: "video" };
                var sub = att.subattachments && att.subattachments.data && att.subattachments.data[0];
                if (sub && sub.media && sub.media.source) return { url: sub.media.source, type: "video" };
              }
            }
          } catch (postErr) { console.warn("[ad-video] Meta post-fallback error", postErr && postErr.message); }
        }

        // Path 2.5: Creative-spec video_id walk. For dark-posted Instagram
        // ads the Page-post path (2) fails because the story was never
        // published as a Page post, but the creative's object_story_spec
        // and asset_feed_spec still carry one or more video_ids that /video
        // /{id} CAN resolve a source for. Walk every candidate id and
        // return the first one that yields an MP4, skipping the original
        // videoId we already tried at the top of this function.
        var candidateIds = [];
        if (c.video_id && c.video_id !== videoId) candidateIds.push(c.video_id);
        if (c.object_story_spec && c.object_story_spec.video_data && c.object_story_spec.video_data.video_id && c.object_story_spec.video_data.video_id !== videoId) {
          candidateIds.push(c.object_story_spec.video_data.video_id);
        }
        var afsVids = c.asset_feed_spec && c.asset_feed_spec.videos;
        if (Array.isArray(afsVids)) {
          afsVids.forEach(function (v) { if (v && v.video_id && v.video_id !== videoId && candidateIds.indexOf(v.video_id) < 0) candidateIds.push(v.video_id); });
        }
        for (var ci = 0; ci < candidateIds.length; ci++) {
          var src = await resolveVideoIdToSource(candidateIds[ci]);
          if (src) return { url: src, type: "video" };
        }

        // Path 3: Meta Ad Preview API — returns a Facebook-hosted iframe
        // that plays the ad creative natively (same player clients see
        // in Ads Manager previews). Last resort, the iframe widget can
        // misbehave on unmute in embedded contexts so we only hit this
        // when every direct-MP4 path above has failed.
        var prevFormats = ["DESKTOP_FEED_STANDARD", "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD"];
        for (var pf = 0; pf < prevFormats.length; pf++) {
          try {
            var prevUrl = "https://graph.facebook.com/v25.0/" + encodeURIComponent(adId) + "/previews?ad_format=" + prevFormats[pf] + "&access_token=" + token;
            var prevRes = await fetch(prevUrl);
            if (!prevRes.ok) continue;
            var prevData = await prevRes.json();
            if (!prevData.data || !prevData.data[0] || !prevData.data[0].body) continue;
            var srcMatch = /src=["']([^"']+)["']/.exec(prevData.data[0].body);
            if (srcMatch && srcMatch[1]) {
              var iframeUrl = srcMatch[1].replace(/&amp;/g, "&");
              return { url: iframeUrl, type: "iframe" };
            }
          } catch (_) {}
        }
      }
    } catch (pathErr) { console.warn("[ad-video] Meta fallback-chain error", pathErr && pathErr.message); }
  }

  console.warn("[ad-video] Meta resolveMetaVideo returned no playable URL", { videoId: videoId, adId: adId });
  return null;
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
  if (!(await checkAuth(req, res))) return;

  var platform = String(req.query.platform || "").toLowerCase();
  var videoId = String(req.query.id || "").trim();
  var campaignId = String(req.query.campaignId || "").trim();
  var adId = String(req.query.adId || "").trim();

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
  // bust=1 skips the 10-min resolve cache. The client sends this after a
  // mid-playback error (typically the Meta signed CDN URL expired while the
  // video was paused or muted, so the byte-range refetch on unmute fails).
  // Dropping the cache forces a fresh /video/{id}?source=... lookup so the
  // retry gets a brand-new signed URL with a fresh expiry window.
  var bust = req.query.bust === "1";
  if (bust) delete resolveCache[cacheKey];
  if (!bust && cached && Date.now() - cached.ts < RESOLVE_TTL_MS) {
    if (req.query.resolveOnly === "1") {
      res.status(200).json({ url: cached.url, type: cached.type || "video" });
      return;
    }
    res.redirect(302, cached.url);
    return;
  }

  var resolved = null; // { url, type }
  try {
    if (platform === "meta") {
      var metaToken = process.env.META_ACCESS_TOKEN;
      if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not configured" }); return; }
      resolved = await resolveMetaVideo(videoId, metaToken, adId);
    } else if (platform === "tiktok") {
      var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
      var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
      if (!ttToken || !ttAdvId) { res.status(500).json({ error: "TikTok credentials not configured" }); return; }
      var ttUrl = await resolveTikTokVideo(videoId, ttAdvId, ttToken);
      if (ttUrl) resolved = { url: ttUrl, type: "video" };
    }
  } catch (err) {
    console.error("ad-video resolve error", err);
    res.status(500).json({ error: "Resolve failed" });
    return;
  }

  if (!resolved || !resolved.url) { res.status(404).json({ error: "Video URL not available" }); return; }

  resolveCache[cacheKey] = { url: resolved.url, type: resolved.type, ts: Date.now() };
  // resolveOnly=1 returns the URL + type as JSON so the client knows whether
  // to render a <video src=...> or an iframe (Instagram embed fallback).
  // 302 redirects on video sources break on Safari + some Chrome builds
  // because byte-range requests don't follow the redirect reliably.
  if (req.query.resolveOnly === "1") {
    res.status(200).json({ url: resolved.url, type: resolved.type || "video" });
    return;
  }
  res.redirect(302, resolved.url);
}
