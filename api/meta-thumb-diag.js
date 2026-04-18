import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Diagnostic focused on why specific ads render blurry. Takes an ad_name fragment
// and reports the full resolution chain: raw creative payload, video thumbnails edge
// response, post attachments, and the URL the main code would pick.

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var metaToken = process.env.META_ACCESS_TOKEN;
  var accountId = req.query.account_id || "act_8159212987434597";
  var nameFragment = (req.query.q || "").toLowerCase();
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";

  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not set" }); return; }
  if (!nameFragment) { res.status(400).json({ error: "pass ?q=<ad name fragment>" }); return; }

  var out = { account_id: accountId, q: nameFragment, matched: [] };
  try {
    // Find ads whose name contains the fragment
    var insUrl = "https://graph.facebook.com/v25.0/" + accountId + "/insights?fields=ad_id,ad_name&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) + "&level=ad&limit=500&access_token=" + metaToken;
    var insRes = await fetch(insUrl);
    var insData = await insRes.json();
    if (!insData.data) { out.error = "no insights"; res.status(200).json(out); return; }

    var matches = insData.data.filter(function(d) { return (d.ad_name || "").toLowerCase().indexOf(nameFragment) >= 0; }).slice(0, 5);
    if (matches.length === 0) { out.error = "no ads matched fragment"; res.status(200).json(out); return; }

    var adFields = "id,name,creative{id,thumbnail_url,image_url,effective_object_story_id,object_type,video_id,image_hash,asset_feed_spec,object_story_spec}";
    var ids = matches.map(function(m) { return m.ad_id; }).join(",");
    var batchUrl = "https://graph.facebook.com/v25.0/?ids=" + ids + "&fields=" + encodeURIComponent(adFields) + "&access_token=" + metaToken;
    var bRes = await fetch(batchUrl);
    var bData = await bRes.json();

    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      var adRec = bData[m.ad_id] || {};
      var cr = adRec.creative || {};
      var afs = cr.asset_feed_spec || {};
      var result = {
        ad_id: m.ad_id,
        ad_name: m.ad_name,
        creative_object_type: cr.object_type,
        top_level_video_id: cr.video_id || null,
        top_level_image_hash: cr.image_hash || null,
        afs_videos: (afs.videos || []).map(function(v) { return v.video_id; }),
        afs_images: (afs.images || []).map(function(im) { return im.hash; }),
        story_id: cr.effective_object_story_id || null,
        sources: {
          thumbnail_url: cr.thumbnail_url || null,
          image_url: cr.image_url || null
        },
        probes: {}
      };

      // Probe: /video_id thumbnails for every video
      var allVids = [];
      if (cr.video_id) allVids.push(cr.video_id);
      (afs.videos || []).forEach(function(v) { if (v.video_id && allVids.indexOf(v.video_id) < 0) allVids.push(v.video_id); });
      for (var vi = 0; vi < allVids.length; vi++) {
        var vid = allVids[vi];
        try {
          var vRes = await fetch("https://graph.facebook.com/v25.0/" + vid + "?fields=picture,thumbnails{uri,height,width}&access_token=" + metaToken);
          var vData = await vRes.json();
          var thumbs = (vData.thumbnails && vData.thumbnails.data) || [];
          result.probes["video_" + vid] = {
            picture: vData.picture,
            picture_stripped: vData.picture ? vData.picture.replace(/([?&])stp=[^&]*/g, "$1").replace(/\?&/, "?").replace(/[?&]$/, "") : null,
            thumbnails_count: thumbs.length,
            thumbnails: thumbs.slice().sort(function(a, b) { return (b.width || 0) - (a.width || 0); }).slice(0, 5).map(function(t) { return { w: t.width, h: t.height, uri: (t.uri || "").substring(0, 150) + "..." }; }),
            error: vData.error || null
          };
        } catch (e) { result.probes["video_" + vid] = { error: String(e) }; }
      }

      // Probe: /adimages for every hash
      var allHashes = [];
      if (cr.image_hash) allHashes.push(cr.image_hash);
      (afs.images || []).forEach(function(im) { if (im.hash && allHashes.indexOf(im.hash) < 0) allHashes.push(im.hash); });
      if (allHashes.length > 0) {
        try {
          var hUrl = accountId + "/adimages?hashes=" + encodeURIComponent(JSON.stringify(allHashes)) + "&fields=hash,url,permalink_url,width,height&access_token=" + metaToken;
          var hRes = await fetch("https://graph.facebook.com/v25.0/" + hUrl);
          var hData = await hRes.json();
          result.probes.adimages = (hData.data || []).map(function(img) { return { hash: img.hash, w: img.width, h: img.height, url_preview: (img.url || "").substring(0, 150) + "..." }; });
          result.probes.adimages_error = hData.error || null;
        } catch (e) { result.probes.adimages_error = String(e); }
      }

      // Probe: post attachments
      if (cr.effective_object_story_id) {
        try {
          var pUrl = "https://graph.facebook.com/v25.0/" + cr.effective_object_story_id + "?fields=full_picture,picture,picture_attachment{image{src,width,height}},attachments{media{image{src,width,height}},type}&access_token=" + metaToken;
          var pRes = await fetch(pUrl);
          var pData = await pRes.json();
          result.probes.post = {
            full_picture_preview: (pData.full_picture || "").substring(0, 150) + "...",
            picture_preview: (pData.picture || "").substring(0, 150) + "...",
            picture_attachment_width: pData.picture_attachment && pData.picture_attachment.image ? pData.picture_attachment.image.width : null,
            picture_attachment_preview: pData.picture_attachment && pData.picture_attachment.image ? (pData.picture_attachment.image.src || "").substring(0, 150) + "..." : null,
            attachment_type: pData.attachments && pData.attachments.data && pData.attachments.data[0] ? pData.attachments.data[0].type : null,
            attachment_image_width: pData.attachments && pData.attachments.data && pData.attachments.data[0] && pData.attachments.data[0].media && pData.attachments.data[0].media.image ? pData.attachments.data[0].media.image.width : null,
            attachment_image_preview: pData.attachments && pData.attachments.data && pData.attachments.data[0] && pData.attachments.data[0].media && pData.attachments.data[0].media.image ? (pData.attachments.data[0].media.image.src || "").substring(0, 150) + "..." : null
          };
        } catch (e) { result.probes.post_error = String(e); }
      }

      out.matched.push(result);
    }

    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
