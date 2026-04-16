import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Diagnostic endpoint to confirm TikTok Video Library Read scope is active.
// Fetches a few ads, extracts video_ids, and probes /file/video/ad/info/.
// Returns raw API status + sample video info so we can confirm video_cover_url is present
// before the main /api/ads flow depends on it.

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var token = process.env.TIKTOK_ACCESS_TOKEN;
  var advId = req.query.advertiser_id || "7446793748044202000";
  if (!token) { res.status(500).json({ error: "TIKTOK_ACCESS_TOKEN not set" }); return; }

  var out = { advertiser_id: advId, steps: [] };

  try {
    // Step 1: pull ads with rich creative fields so we can see how carousels are structured
    var adFields = encodeURIComponent(JSON.stringify(["ad_id", "ad_name", "ad_format", "creative_type", "image_mode", "video_id", "image_ids", "carousel_image_labels", "catalog_id", "tiktok_item_id", "dynamic_format", "is_aco"]));
    var adsUrl = "https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=" + advId + "&page_size=50&fields=" + adFields;
    var adsRes = await fetch(adsUrl, { headers: { "Access-Token": token } });
    var adsData = await adsRes.json();
    out.steps.push({ step: "ad/get", status: adsRes.status, code: adsData.code, message: adsData.message, list_len: (adsData.data && adsData.data.list) ? adsData.data.list.length : 0 });

    var videoIds = [], imageIds = [];
    var adSamples = [];
    var carouselAds = [];
    var nonVideoNoImages = [];
    if (adsData.data && adsData.data.list) {
      adsData.data.list.forEach(function(a) {
        if (a.video_id && videoIds.indexOf(a.video_id) < 0) videoIds.push(a.video_id);
        if (a.image_ids && a.image_ids.length > 0) {
          a.image_ids.forEach(function(iid) { if (imageIds.indexOf(iid) < 0) imageIds.push(iid); });
        }
        // Collect first 8 raw ad objects so we can eyeball field shape
        if (adSamples.length < 8) adSamples.push(a);
        // Carousel candidates = multi-image, no single video
        if (!a.video_id && a.image_ids && a.image_ids.length > 1) {
          if (carouselAds.length < 3) carouselAds.push(a);
        }
        // Ads with neither video nor images — maybe spark/catalog ads
        if (!a.video_id && (!a.image_ids || a.image_ids.length === 0)) {
          if (nonVideoNoImages.length < 3) nonVideoNoImages.push(a);
        }
      });
    }
    out.counts = { total_ads: (adsData.data && adsData.data.list) ? adsData.data.list.length : 0, video_ids: videoIds.length, image_ids: imageIds.length, carousel_candidates: carouselAds.length, non_video_no_images: nonVideoNoImages.length };
    out.non_video_no_images_sample = nonVideoNoImages;
    out.sample_ads = adSamples;
    out.carousel_candidates = carouselAds;

    // Step 2: probe /file/video/ad/info/
    if (videoIds.length > 0) {
      var vidSample = videoIds.slice(0, 3);
      var vidUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + advId + "&video_ids=" + encodeURIComponent(JSON.stringify(vidSample));
      var vRes = await fetch(vidUrl, { headers: { "Access-Token": token } });
      var vData = await vRes.json();
      out.steps.push({ step: "file/video/ad/info", status: vRes.status, code: vData.code, message: vData.message, list_len: (vData.data && vData.data.list) ? vData.data.list.length : 0 });
      out.video_info_sample = (vData.data && vData.data.list && vData.data.list[0]) ? vData.data.list[0] : vData;
    }

    // Step 3: probe /file/image/ad/info/
    if (imageIds.length > 0) {
      var imgSample = imageIds.slice(0, 5);
      var imgUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/?advertiser_id=" + advId + "&image_ids=" + encodeURIComponent(JSON.stringify(imgSample));
      var iRes = await fetch(imgUrl, { headers: { "Access-Token": token } });
      var iData = await iRes.json();
      out.steps.push({ step: "file/image/ad/info", status: iRes.status, code: iData.code, message: iData.message, list_len: (iData.data && iData.data.list) ? iData.data.list.length : 0 });
      out.image_info_sample = (iData.data && iData.data.list && iData.data.list[0]) ? iData.data.list[0] : iData;
    } else {
      out.image_probe = "SKIPPED — no image_ids found on any ad. TikTok may be returning carousels under a different field.";
    }

    // Verdict
    var imgStep = out.steps.filter(function(s){return s.step === "file/image/ad/info";})[0];
    if (imageIds.length === 0) out.verdict = "NO_IMAGE_IDS_ON_ADS — /ad/get is not returning image_ids. Need to find the right field for TikTok carousels on this account.";
    else if (imgStep && imgStep.code === 0 && imgStep.list_len > 0) out.verdict = "IMAGE_SCOPE_ACTIVE — image info returned successfully";
    else if (imgStep && imgStep.code !== 0) out.verdict = "IMAGE_SCOPE_BLOCKED — code " + imgStep.code + ": " + imgStep.message;
    else out.verdict = "INCONCLUSIVE — see raw steps + samples below";

    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
