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
    // Step 1: pull a handful of ads to get real video_ids
    var adFields = encodeURIComponent(JSON.stringify(["ad_id", "ad_name", "video_id"]));
    var adsUrl = "https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=" + advId + "&page_size=10&fields=" + adFields;
    var adsRes = await fetch(adsUrl, { headers: { "Access-Token": token } });
    var adsData = await adsRes.json();
    out.steps.push({ step: "ad/get", status: adsRes.status, code: adsData.code, message: adsData.message, list_len: (adsData.data && adsData.data.list) ? adsData.data.list.length : 0 });

    var videoIds = [];
    if (adsData.data && adsData.data.list) {
      adsData.data.list.forEach(function(a) {
        if (a.video_id && videoIds.indexOf(a.video_id) < 0) videoIds.push(a.video_id);
      });
    }
    out.video_ids_found = videoIds.length;
    if (videoIds.length === 0) {
      out.verdict = "NO_VIDEO_IDS — no ads with video_id returned, cannot probe video info";
      res.status(200).json(out);
      return;
    }

    // Step 2: probe /file/video/ad/info/ with the video_ids we just collected
    var sample = videoIds.slice(0, 5);
    var vidUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + advId + "&video_ids=" + encodeURIComponent(JSON.stringify(sample));
    var vRes = await fetch(vidUrl, { headers: { "Access-Token": token } });
    var vData = await vRes.json();
    out.steps.push({ step: "file/video/ad/info", status: vRes.status, code: vData.code, message: vData.message, list_len: (vData.data && vData.data.list) ? vData.data.list.length : 0 });

    out.sample_video_ids = sample;
    out.sample_response = vData;
    if (vData.data && vData.data.list && vData.data.list.length > 0) {
      var first = vData.data.list[0];
      out.verdict = "SCOPE_ACTIVE — video info returned. video_cover_url=" + (first.video_cover_url ? "present" : "missing") + ", poster_url=" + (first.poster_url ? "present" : "missing");
    } else if (vData.code && vData.code !== 0) {
      out.verdict = "SCOPE_BLOCKED — API returned code " + vData.code + ": " + (vData.message || "no message");
    } else {
      out.verdict = "EMPTY_RESPONSE — call succeeded but no list returned";
    }

    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
