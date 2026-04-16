import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Diagnostic endpoint for Google Ads creative asset resolution.
// Pulls raw ad payloads + asset view rows for Display / YouTube / PMax / Demand Gen campaigns
// so we can see which fields are populated on each ad type and why thumbnails aren't matching.

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var out = { steps: [], ads_sample: [], asset_rows_sample: [], ad_to_assets: {} };
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = req.query.customer_id || "9587382256";
    var from = req.query.from || "2026-03-01";
    var to = req.query.to || "2026-04-30";

    if (!gClientId || !gRefreshToken || !gDevToken) {
      out.verdict = "MISSING_ENV — Google Ads credentials not set";
      res.status(500).json(out);
      return;
    }

    // Token refresh
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) { out.verdict = "TOKEN_REFRESH_FAILED"; out.token_response = tokenData; res.status(500).json(out); return; }
    out.steps.push({ step: "token_refresh", ok: true });

    var commonHeaders = {
      "Authorization": "Bearer " + tokenData.access_token,
      "developer-token": gDevToken,
      "login-customer-id": gManagerId,
      "Content-Type": "application/json"
    };

    // Query 1: ad payload with the known-valid thumbnail-relevant fields in v21
    var adQuery = [
      "SELECT",
      "  ad_group_ad.ad.id,",
      "  ad_group_ad.ad.name,",
      "  ad_group_ad.ad.type,",
      "  ad_group_ad.ad.final_urls,",
      "  ad_group_ad.ad.image_ad.image_url,",
      "  ad_group_ad.ad.image_ad.pixel_width,",
      "  ad_group_ad.ad.image_ad.pixel_height,",
      "  ad_group_ad.ad.image_ad.name,",
      "  ad_group_ad.ad.responsive_display_ad.marketing_images,",
      "  ad_group_ad.ad.responsive_display_ad.square_marketing_images,",
      "  ad_group_ad.ad.responsive_display_ad.youtube_videos,",
      "  ad_group_ad.ad.responsive_display_ad.logo_images,",
      "  ad_group_ad.ad.responsive_display_ad.headlines,",
      "  ad_group_ad.ad.responsive_display_ad.long_headline,",
      "  ad_group_ad.ad.app_ad.images,",
      "  ad_group_ad.ad.app_ad.youtube_videos,",
      "  ad_group_ad.ad.video_responsive_ad.videos,",
      "  campaign.name,",
      "  campaign.advertising_channel_type,",
      "  campaign.advertising_channel_sub_type,",
      "  metrics.impressions,",
      "  metrics.clicks",
      "FROM ad_group_ad",
      "WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'",
      "  AND ad_group_ad.status != 'REMOVED'",
      "  AND metrics.impressions > 0"
    ].join(" ");

    var adRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ query: adQuery })
    });
    var adStatus = adRes.status;
    var adText = await adRes.text();
    out.steps.push({ step: "ad_query", status: adStatus });
    if (adStatus !== 200) {
      out.verdict = "AD_QUERY_FAILED";
      out.ad_query_error = adText.substring(0, 1500);
      res.status(500).json(out);
      return;
    }
    var adData = JSON.parse(adText);
    out.ad_count = (adData.results || []).length;
    // Keep up to 6 raw samples split across channel types
    var typeSamples = {};
    (adData.results || []).forEach(function(r) {
      var chType = (r.campaign && r.campaign.advertisingChannelType) || "UNKNOWN";
      if (!typeSamples[chType]) typeSamples[chType] = [];
      if (typeSamples[chType].length < 2) typeSamples[chType].push(r);
    });
    Object.keys(typeSamples).forEach(function(k) { typeSamples[k].forEach(function(r) { out.ads_sample.push(r); }); });

    // Query 2: full asset view payload (drop media_bundle_asset.data — prohibited in SELECT)
    var assetQuery = [
      "SELECT",
      "  ad_group_ad_asset_view.ad_group_ad,",
      "  ad_group_ad_asset_view.field_type,",
      "  asset.resource_name,",
      "  asset.type,",
      "  asset.name,",
      "  asset.image_asset.full_size.url,",
      "  asset.image_asset.full_size.width_pixels,",
      "  asset.image_asset.full_size.height_pixels,",
      "  asset.youtube_video_asset.youtube_video_id,",
      "  asset.youtube_video_asset.youtube_video_title,",
      "  asset.text_asset.text",
      "FROM ad_group_ad_asset_view",
      "WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'"
    ].join(" ");

    var aRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({ query: assetQuery })
    });
    var aStatus = aRes.status;
    var aText = await aRes.text();
    out.steps.push({ step: "asset_view_query", status: aStatus });
    if (aStatus !== 200) {
      out.asset_query_error = aText.substring(0, 1500);
    } else {
      var aData = JSON.parse(aText);
      out.asset_row_count = (aData.results || []).length;
      // Sample of each asset type
      var typeBuckets = {};
      (aData.results || []).forEach(function(ar) {
        var t = (ar.asset && ar.asset.type) || "UNKNOWN";
        if (!typeBuckets[t]) typeBuckets[t] = [];
        if (typeBuckets[t].length < 2) typeBuckets[t].push(ar);
      });
      out.asset_type_counts = Object.keys(typeBuckets).reduce(function(acc, k) { acc[k] = typeBuckets[k].length; return acc; }, {});
      Object.keys(typeBuckets).forEach(function(k) { typeBuckets[k].forEach(function(r) { out.asset_rows_sample.push(r); }); });

      // Build an ad→assets map like the main flow does, so we can see what's matching
      (aData.results || []).forEach(function(ar) {
        var adRes = ar.adGroupAdAssetView && ar.adGroupAdAssetView.adGroupAd;
        if (!adRes) return;
        if (!out.ad_to_assets[adRes]) out.ad_to_assets[adRes] = { images: [], youtube: [], other: [] };
        var at = (ar.asset && ar.asset.type) || "";
        if (at === "IMAGE" && ar.asset.imageAsset && ar.asset.imageAsset.fullSize && ar.asset.imageAsset.fullSize.url) {
          out.ad_to_assets[adRes].images.push(ar.asset.imageAsset.fullSize.url);
        } else if (at === "YOUTUBE_VIDEO" && ar.asset.youtubeVideoAsset && ar.asset.youtubeVideoAsset.youtubeVideoId) {
          out.ad_to_assets[adRes].youtube.push(ar.asset.youtubeVideoAsset.youtubeVideoId);
        } else {
          out.ad_to_assets[adRes].other.push(at);
        }
      });
    }

    // Query 3: direct asset lookup by resource name for marketingImages references
    var assetResourceNames = [];
    (adData.results || []).forEach(function(r) {
      var rda = r.adGroupAd.ad.responsiveDisplayAd || {};
      (rda.marketingImages || []).forEach(function(m) { if (m.asset && assetResourceNames.indexOf(m.asset) < 0) assetResourceNames.push(m.asset); });
      (rda.squareMarketingImages || []).forEach(function(m) { if (m.asset && assetResourceNames.indexOf(m.asset) < 0) assetResourceNames.push(m.asset); });
      (rda.youtubeVideos || []).forEach(function(m) { if (m.asset && assetResourceNames.indexOf(m.asset) < 0) assetResourceNames.push(m.asset); });
    });
    out.asset_refs_from_ads = assetResourceNames.length;
    if (assetResourceNames.length > 0) {
      var assetIds = assetResourceNames.map(function(rn) { return "'" + rn + "'"; }).join(",");
      var directAssetQuery = "SELECT asset.resource_name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (" + assetIds + ")";
      var dRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({ query: directAssetQuery })
      });
      var dStatus = dRes.status;
      var dText = await dRes.text();
      out.steps.push({ step: "direct_asset_lookup", status: dStatus });
      if (dStatus === 200) {
        var dData = JSON.parse(dText);
        out.direct_asset_count = (dData.results || []).length;
        out.direct_asset_sample = (dData.results || []).slice(0, 5);
        // Build name → url map
        var urlByName = {};
        (dData.results || []).forEach(function(ar) {
          if (ar.asset && ar.asset.imageAsset && ar.asset.imageAsset.fullSize && ar.asset.imageAsset.fullSize.url) {
            urlByName[ar.asset.resourceName] = ar.asset.imageAsset.fullSize.url;
          }
        });
        out.direct_url_resolved_count = Object.keys(urlByName).length;
        out.direct_first_url = Object.keys(urlByName).length > 0 ? urlByName[Object.keys(urlByName)[0]] : null;
      } else {
        out.direct_asset_error = dText.substring(0, 1500);
      }
    }

    // Per-ad summary: can we resolve a thumbnail?
    out.ad_thumb_resolution = (adData.results || []).map(function(r) {
      var ad = r.adGroupAd.ad;
      var resN = r.adGroupAd.resourceName;
      var assets = out.ad_to_assets[resN] || { images: [], youtube: [], other: [] };
      var rda = ad.responsiveDisplayAd || {};
      var appAd = ad.appAd || {};
      var vra = ad.videoResponsiveAd || {};
      return {
        ad_id: ad.id,
        type: ad.type,
        channel: r.campaign.advertisingChannelType,
        has_image_ad: !!(ad.imageAd && ad.imageAd.imageUrl),
        rda_marketing_imgs: (rda.marketingImages || []).length,
        rda_square_imgs: (rda.squareMarketingImages || []).length,
        rda_youtube: (rda.youtubeVideos || []).length,
        app_ad_images: (appAd.images || []).length,
        vra_videos: (vra.videos || []).length,
        asset_images: assets.images.length,
        asset_youtube: assets.youtube.length,
        name: ad.name
      };
    });

    out.verdict = "OK — inspect ad_thumb_resolution to see which types are missing assets";
    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
