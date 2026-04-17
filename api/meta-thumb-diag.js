import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Diagnostic for Meta (FB/IG) ad thumbnail resolution. Pulls a few ads, inspects every
// possible thumbnail source (video, image_hash, post attachments, full_picture, creative
// image/thumbnail), and reports which URL each ad ends up with and whether it's signed.

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var metaToken = process.env.META_ACCESS_TOKEN;
  var accountId = req.query.account_id || "";
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";

  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not set" }); return; }
  if (!accountId) { res.status(400).json({ error: "account_id query param required (e.g. act_123456)" }); return; }

  var out = { account_id: accountId, steps: [], ads: [] };
  try {
    // Get a handful of ad IDs that served in the window
    var insUrl = "https://graph.facebook.com/v25.0/" + accountId + "/insights?fields=ad_id,ad_name,impressions,spend&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) + "&level=ad&limit=10&access_token=" + metaToken;
    var insRes = await fetch(insUrl);
    var insData = await insRes.json();
    out.steps.push({ step: "insights", status: insRes.status, count: (insData.data || []).length });
    if (insData.error) { out.insights_error = insData.error; res.status(500).json(out); return; }

    var adIds = (insData.data || []).map(function(d) { return d.ad_id; }).filter(Boolean);
    if (adIds.length === 0) { out.verdict = "NO_ADS_WITH_INSIGHTS"; res.status(200).json(out); return; }

    // Fetch full creative for each
    var adFields = "id,name,creative{id,thumbnail_url,image_url,effective_object_story_id,object_type,video_id,instagram_permalink_url,image_hash,asset_feed_spec,object_story_spec}";
    var batchUrl = "https://graph.facebook.com/v25.0/?ids=" + adIds.join(",") + "&fields=" + encodeURIComponent(adFields) + "&access_token=" + metaToken;
    var bRes = await fetch(batchUrl);
    var bData = await bRes.json();
    out.steps.push({ step: "batch_ads", status: bRes.status });

    for (var i = 0; i < adIds.length; i++) {
      var adId = adIds[i];
      var adRec = bData[adId] || {};
      var cr = adRec.creative || {};
      var sample = {
        ad_id: adId,
        ad_name: adRec.name,
        has_image_hash: !!cr.image_hash,
        has_video_id: !!cr.video_id,
        object_type: cr.object_type,
        has_story_id: !!cr.effective_object_story_id,
        has_ig_permalink: !!cr.instagram_permalink_url,
        asset_feed_videos: (cr.asset_feed_spec && cr.asset_feed_spec.videos && cr.asset_feed_spec.videos.length) || 0,
        asset_feed_images: (cr.asset_feed_spec && cr.asset_feed_spec.images && cr.asset_feed_spec.images.length) || 0,
        sources: {}
      };

      if (cr.thumbnail_url) sample.sources.thumbnail_url = cr.thumbnail_url;
      if (cr.image_url) sample.sources.image_url = cr.image_url;

      // image_hash → /adimages
      if (cr.image_hash) {
        try {
          var imgUrl = "https://graph.facebook.com/v25.0/" + accountId + "/adimages?hashes=" + encodeURIComponent(JSON.stringify([cr.image_hash])) + "&fields=hash,url,permalink_url,url_128,width,height&access_token=" + metaToken;
          var imgRes = await fetch(imgUrl);
          var imgData = await imgRes.json();
          if (imgData.data && imgData.data[0]) {
            sample.sources.adimages_url = imgData.data[0].url;
            sample.sources.adimages_permalink = imgData.data[0].permalink_url;
            sample.adimages_dims = { w: imgData.data[0].width, h: imgData.data[0].height };
          }
        } catch (e) { sample.adimages_error = String(e); }
      }

      // Post full_picture + picture_attachment
      if (cr.effective_object_story_id) {
        try {
          var pUrl = "https://graph.facebook.com/v25.0/" + cr.effective_object_story_id + "?fields=full_picture,picture,picture_attachment{image},attachments{media{image{src,width,height}},subattachments{media{image{src,width,height}}},type}&access_token=" + metaToken;
          var pRes = await fetch(pUrl);
          var pData = await pRes.json();
          sample.sources.full_picture = pData.full_picture;
          sample.sources.picture = pData.picture;
          if (pData.picture_attachment && pData.picture_attachment.image) {
            sample.sources.picture_attachment_image_src = pData.picture_attachment.image.src;
            sample.picture_attachment_dims = { w: pData.picture_attachment.image.width, h: pData.picture_attachment.image.height };
          }
          if (pData.attachments && pData.attachments.data && pData.attachments.data[0]) {
            var att = pData.attachments.data[0];
            if (att.media && att.media.image) {
              sample.sources.attachment_media_image_src = att.media.image.src;
              sample.attachment_dims = { w: att.media.image.width, h: att.media.image.height };
            }
          }
        } catch (e) { sample.post_error = String(e); }
      }

      // Video thumbnails
      if (cr.video_id) {
        try {
          var vUrl = "https://graph.facebook.com/v25.0/" + cr.video_id + "?fields=picture,thumbnails{uri,width,height}&access_token=" + metaToken;
          var vRes = await fetch(vUrl);
          var vData = await vRes.json();
          sample.sources.video_picture = vData.picture;
          if (vData.thumbnails && vData.thumbnails.data) {
            var sorted = vData.thumbnails.data.slice().sort(function(a, b) { return (b.width || 0) - (a.width || 0); });
            sample.video_thumbnails = sorted.map(function(t) { return { w: t.width, h: t.height, uri: t.uri }; });
          }
        } catch (e) { sample.video_error = String(e); }
      }

      out.ads.push(sample);
    }

    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
