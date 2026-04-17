import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Focused diagnostic on Dynamic Creative ads that still render blurry.
// Dumps the raw asset_feed_spec plus probes /adimages for every hash found,
// so we can see which hashes resolve and which don't.

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var metaToken = process.env.META_ACCESS_TOKEN;
  var accountId = req.query.account_id || "";
  var adIds = (req.query.ad_ids || "").split(",").filter(Boolean);
  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not set" }); return; }

  var out = { ads: [], accounts_scanned: [] };
  try {
    var from = req.query.from || "2026-03-01";
    var to = req.query.to || "2026-04-30";

    // If no ad_ids specified, sweep across every ad account the token has access to
    var accountsToScan = [];
    if (accountId) {
      accountsToScan.push(accountId);
    } else if (adIds.length === 0) {
      var acctsUrl = "https://graph.facebook.com/v25.0/me/adaccounts?fields=id,name&limit=50&access_token=" + metaToken;
      var acctsRes = await fetch(acctsUrl);
      var acctsData = await acctsRes.json();
      (acctsData.data || []).forEach(function(a) { accountsToScan.push(a.id); });
    }

    if (adIds.length === 0) {
      for (var ai = 0; ai < accountsToScan.length; ai++) {
        var acct = accountsToScan[ai];
        try {
          var insUrl = "https://graph.facebook.com/v25.0/" + acct + "/insights?fields=ad_id,ad_name&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) + "&level=ad&limit=10&access_token=" + metaToken;
          var insRes = await fetch(insUrl);
          var insData = await insRes.json();
          var count = (insData.data || []).length;
          out.accounts_scanned.push({ account_id: acct, ads_found: count, error: insData.error && insData.error.message });
          (insData.data || []).forEach(function(d) {
            if (adIds.length < 20 && adIds.indexOf(d.ad_id) < 0) adIds.push(d.ad_id);
          });
        } catch (e) {
          out.accounts_scanned.push({ account_id: acct, error: String(e) });
        }
      }
    }
    if (adIds.length === 0) { out.error = "no ads across scanned accounts"; res.status(200).json(out); return; }

    var adFields = "id,name,creative{id,thumbnail_url,image_url,effective_object_story_id,object_type,video_id,instagram_permalink_url,image_hash,asset_feed_spec}";
    var batchUrl = "https://graph.facebook.com/v25.0/?ids=" + adIds.join(",") + "&fields=" + encodeURIComponent(adFields) + "&access_token=" + metaToken;
    var bRes = await fetch(batchUrl);
    var bData = await bRes.json();

    for (var i = 0; i < adIds.length; i++) {
      var adId = adIds[i];
      var adRec = bData[adId] || {};
      var cr = adRec.creative || {};
      var afs = cr.asset_feed_spec || {};
      var sample = {
        ad_id: adId,
        ad_name: adRec.name,
        thumbnail_url_preview: (cr.thumbnail_url || "").substring(0, 140),
        has_image_url: !!cr.image_url,
        top_level_image_hash: cr.image_hash || null,
        top_level_video_id: cr.video_id || null,
        afs_images: (afs.images || []).map(function(im) { return { hash: im.hash || null, url: im.url || null, has_adlabels: !!im.adlabels }; }),
        afs_videos: (afs.videos || []).map(function(v) { return { video_id: v.video_id || null, thumbnail_hash: v.thumbnail_hash || null, thumbnail_url: v.thumbnail_url || null }; }),
        adimages_resolved: {},
        video_thumbs_resolved: {}
      };

      // Probe every hash
      var allHashes = [];
      if (cr.image_hash) allHashes.push(cr.image_hash);
      (afs.images || []).forEach(function(im) { if (im.hash && allHashes.indexOf(im.hash) < 0) allHashes.push(im.hash); });
      (afs.videos || []).forEach(function(v) { if (v.thumbnail_hash && allHashes.indexOf(v.thumbnail_hash) < 0) allHashes.push(v.thumbnail_hash); });
      if (allHashes.length > 0) {
        try {
          var hUrl = "https://graph.facebook.com/v25.0/" + accountId + "/adimages?hashes=" + encodeURIComponent(JSON.stringify(allHashes)) + "&fields=hash,url,permalink_url,width,height&access_token=" + metaToken;
          var hRes = await fetch(hUrl);
          var hData = await hRes.json();
          (hData.data || []).forEach(function(img) {
            sample.adimages_resolved[img.hash] = { url: img.url, w: img.width, h: img.height };
          });
          sample.adimages_error = hData.error || null;
        } catch (e) { sample.adimages_error = String(e); }
      }

      // Probe every video
      var allVids = [];
      if (cr.video_id) allVids.push(cr.video_id);
      (afs.videos || []).forEach(function(v) { if (v.video_id && allVids.indexOf(v.video_id) < 0) allVids.push(v.video_id); });
      if (allVids.length > 0) {
        try {
          var vUrl = "https://graph.facebook.com/v25.0/?ids=" + allVids.join(",") + "&fields=picture,thumbnails{uri,width,height}&access_token=" + metaToken;
          var vRes = await fetch(vUrl);
          var vData = await vRes.json();
          Object.keys(vData).forEach(function(vid) {
            var v = vData[vid];
            if (!v) return;
            var largest = null;
            if (v.thumbnails && v.thumbnails.data && v.thumbnails.data.length > 0) {
              largest = v.thumbnails.data.slice().sort(function(a, b) { return (b.width || 0) - (a.width || 0); })[0];
            }
            sample.video_thumbs_resolved[vid] = { picture: v.picture, thumb_w: largest && largest.width, thumb_h: largest && largest.height, thumb_uri: largest && largest.uri };
          });
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
