import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";

var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

function detectObjective(campaignName) {
  var n = (campaignName || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) return "appinstall";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "traffic";
  return "traffic";
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;

  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-14";
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var allAds = [];

  /* ═══ META (Facebook + Instagram) ═══ */
  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    try {
      var timeRange = JSON.stringify({ since: from, until: to });
      var insUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,ad_name,campaign_name,campaign_id,adset_name,adset_id,impressions,clicks,spend,cpc,cpm,ctr,reach,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform,platform_position&limit=500&access_token=" + metaToken;
      var insRes = await fetch(insUrl);
      var insData = await insRes.json();
      // Aggregate placement-level rows back to one record per ad+publisher
      var insMap = {};
      var normalizePlace = function(pos) {
        var p = (pos || "").toLowerCase();
        if (!p) return "Other";
        if (p === "feed" || p === "facebook_feed" || p === "instagram_feed") return "Feed";
        if (p.indexOf("reels") >= 0) return "Reels";
        if (p.indexOf("stories") >= 0 || p.indexOf("story") >= 0) return "Stories";
        if (p.indexOf("explore") >= 0 || p === "instagram_search" || p === "search") return "Explore/Search";
        if (p === "marketplace") return "Marketplace";
        if (p.indexOf("messenger") >= 0) return "Messenger";
        if (p === "instream_video" || p === "video_feeds" || p.indexOf("video") >= 0) return "In-Stream Video";
        if (p === "right_hand_column") return "Right Column";
        if (p.indexOf("shop") >= 0) return "Shop";
        if (p === "biz_disco_feed") return "Business Feed";
        return p.replace(/_/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      };
      if (insData.data) {
        insData.data.forEach(function(ins) {
          var pub = ins.publisher_platform || "facebook";
          if (pub !== "facebook" && pub !== "instagram") return;
          var spend = parseFloat(ins.spend || 0);
          var imps = parseInt(ins.impressions || 0);
          if (!(imps > 0 || spend > 0)) return;
          var place = normalizePlace(ins.platform_position);
          var key = ins.ad_id + "_" + pub;
          if (!insMap[key]) {
            insMap[key] = {
              ad_id: ins.ad_id,
              ad_name: ins.ad_name,
              campaign_id: ins.campaign_id,
              campaign_name: ins.campaign_name,
              adset_id: ins.adset_id,
              adset_name: ins.adset_name,
              _pub: pub,
              spend: 0, impressions: 0, clicks: 0, reach: 0,
              actionsAgg: {},
              placements: {}
            };
          }
          var cur = insMap[key];
          var clk = parseInt(ins.clicks || 0);
          cur.spend += spend;
          cur.impressions += imps;
          cur.clicks += clk;
          cur.reach += parseInt(ins.reach || 0);
          if (ins.actions) {
            ins.actions.forEach(function(a) {
              if (!cur.actionsAgg[a.action_type]) cur.actionsAgg[a.action_type] = 0;
              cur.actionsAgg[a.action_type] += parseInt(a.value || 0);
            });
          }
          if (!cur.placements[place]) cur.placements[place] = { spend: 0, impressions: 0, clicks: 0 };
          cur.placements[place].spend += spend;
          cur.placements[place].impressions += imps;
          cur.placements[place].clicks += clk;
        });
      }
      var insights = Object.keys(insMap).map(function(k) { return insMap[k]; });

      // Unique ad IDs to fetch creative for
      var uniqAdIds = [];
      insights.forEach(function(x) { if (uniqAdIds.indexOf(x.ad_id) < 0) uniqAdIds.push(x.ad_id); });

      // Batch fetch creatives (up to 50 ids per request)
      var creativesByAdId = {};
      for (var b = 0; b < uniqAdIds.length; b += 50) {
        var batch = uniqAdIds.slice(b, b + 50);
        var adFields = "id,name,creative{id,thumbnail_url,image_url,effective_object_story_id,object_type,video_id,instagram_permalink_url,image_hash}";
        var batchUrl = "https://graph.facebook.com/v25.0/?ids=" + batch.join(",") + "&fields=" + encodeURIComponent(adFields) + "&access_token=" + metaToken;
        try {
          var batchRes = await fetch(batchUrl);
          var batchData = await batchRes.json();
          Object.keys(batchData).forEach(function(adId) {
            if (batchData[adId] && batchData[adId].creative) {
              creativesByAdId[adId] = batchData[adId].creative;
            }
          });
        } catch (bErr) { console.error("Meta batch creative error", account.name, bErr); }
      }

      // Collect unique video IDs for high-res thumbnail fetch
      var videoIds = [];
      Object.keys(creativesByAdId).forEach(function(adId) {
        var vid = creativesByAdId[adId].video_id;
        if (vid && videoIds.indexOf(vid) < 0) videoIds.push(vid);
      });
      var videoThumbs = {};
      for (var vb = 0; vb < videoIds.length; vb += 50) {
        var vBatch = videoIds.slice(vb, vb + 50);
        var vUrl = "https://graph.facebook.com/v25.0/?ids=" + vBatch.join(",") + "&fields=picture,thumbnails{uri,height,width}&access_token=" + metaToken;
        try {
          var vRes = await fetch(vUrl);
          var vData = await vRes.json();
          Object.keys(vData).forEach(function(vid) {
            var v = vData[vid];
            if (!v) return;
            var best = "";
            if (v.thumbnails && v.thumbnails.data && v.thumbnails.data.length > 0) {
              var largest = v.thumbnails.data.slice().sort(function(a, b) { return (b.width || 0) - (a.width || 0); })[0];
              best = largest.uri || "";
            }
            videoThumbs[vid] = best || v.picture || "";
          });
        } catch (vbErr) { console.error("Meta video thumb error", account.name, vbErr); }
      }

      // Resolve image_hash to full-resolution uploaded asset URL via /adimages
      var imageHashes = [];
      Object.keys(creativesByAdId).forEach(function(adId) {
        var hash = creativesByAdId[adId].image_hash;
        if (hash && imageHashes.indexOf(hash) < 0) imageHashes.push(hash);
      });
      var hashToUrl = {};
      for (var ih = 0; ih < imageHashes.length; ih += 50) {
        var hBatch = imageHashes.slice(ih, ih + 50);
        var hashStr = encodeURIComponent(JSON.stringify(hBatch));
        var aiUrl = "https://graph.facebook.com/v25.0/" + account.id + "/adimages?hashes=" + hashStr + "&fields=hash,url,permalink_url,width,height&access_token=" + metaToken;
        try {
          var aiRes = await fetch(aiUrl);
          var aiData = await aiRes.json();
          if (aiData.data) {
            aiData.data.forEach(function(img) {
              hashToUrl[img.hash] = img.url || img.permalink_url || "";
            });
          }
        } catch (aiErr) { console.error("Meta adimages error", account.name, aiErr); }
      }

      // Resolve effective_object_story_id to post.full_picture for higher-res post images
      var storyIds = [];
      Object.keys(creativesByAdId).forEach(function(adId) {
        var sid = creativesByAdId[adId].effective_object_story_id;
        if (sid && storyIds.indexOf(sid) < 0) storyIds.push(sid);
      });
      var storyToPic = {};
      for (var si = 0; si < storyIds.length; si += 50) {
        var sBatch = storyIds.slice(si, si + 50);
        var spUrl = "https://graph.facebook.com/v25.0/?ids=" + sBatch.join(",") + "&fields=full_picture,picture&access_token=" + metaToken;
        try {
          var spRes = await fetch(spUrl);
          var spData = await spRes.json();
          Object.keys(spData).forEach(function(sid) {
            var s = spData[sid];
            if (!s) return;
            storyToPic[sid] = s.full_picture || s.picture || "";
          });
        } catch (spErr) { console.error("Meta post picture error", account.name, spErr); }
      }
      // Optional secondary attempt: get hi-res from attachments edge separately so a failure here does not lose full_picture
      var storyToPicHi = {};
      for (var si2 = 0; si2 < storyIds.length; si2 += 25) {
        var sBatch2 = storyIds.slice(si2, si2 + 25);
        var spUrl2 = "https://graph.facebook.com/v25.0/?ids=" + sBatch2.join(",") + "&fields=attachments&access_token=" + metaToken;
        try {
          var spRes2 = await fetch(spUrl2);
          var spData2 = await spRes2.json();
          Object.keys(spData2).forEach(function(sid) {
            var s = spData2[sid];
            if (!s || !s.attachments || !s.attachments.data || s.attachments.data.length === 0) return;
            var att = s.attachments.data[0];
            var src = "";
            if (att.media && att.media.image && att.media.image.src) src = att.media.image.src;
            else if (att.subattachments && att.subattachments.data && att.subattachments.data.length > 0) {
              var sub = att.subattachments.data[0];
              if (sub.media && sub.media.image && sub.media.image.src) src = sub.media.image.src;
            }
            if (src) storyToPicHi[sid] = src;
          });
        } catch (spErr2) { /* silent fail, full_picture is the fallback */ }
      }

      var upsizeFb = function(url) {
        if (!url) return url;
        if (url.indexOf("fbcdn.net") < 0 && url.indexOf("cdninstagram.com") < 0) return url;
        // Replace small CDN size patterns in path (p64x64, s100x100, etc) with larger
        url = url.replace(/\/p\d+x\d+\//g, "/p1080x1080/");
        url = url.replace(/\/s\d+x\d+\//g, "/s1080x1080/");
        if (url.indexOf("width=") < 0) {
          var sep = url.indexOf("?") >= 0 ? "&" : "?";
          url = url + sep + "width=1080";
        }
        return url;
      };

      insights.forEach(function(ins) {
        var cr = creativesByAdId[ins.ad_id] || {};
        var pub = ins._pub;
        var platform = pub === "instagram" ? "Instagram" : "Facebook";
        var vidThumb = cr.video_id ? videoThumbs[cr.video_id] : "";
        var hashThumb = cr.image_hash ? hashToUrl[cr.image_hash] : "";
        var sid = cr.effective_object_story_id;
        var postHiThumb = sid ? storyToPicHi[sid] : "";
        var postThumb = sid ? storyToPic[sid] : "";
        // Priority: video thumbnail > /adimages permalink (full upload) > post attachments hi-res > post full_picture > image_url > thumbnail_url
        var thumb = upsizeFb(vidThumb || hashThumb || postHiThumb || postThumb || cr.image_url || cr.thumbnail_url || "");
        var preview = "";
        if (pub === "instagram" && cr.instagram_permalink_url) {
          preview = cr.instagram_permalink_url;
        } else if (cr.effective_object_story_id) {
          preview = "https://www.facebook.com/" + cr.effective_object_story_id;
        }
        var leads = 0, installs = 0, pageLikes = 0, follows = 0;
        Object.keys(ins.actionsAgg || {}).forEach(function(at) {
          var v = ins.actionsAgg[at];
          if (at === "lead" || at === "onsite_web_lead" || at === "offsite_conversion.fb_pixel_lead" || at === "onsite_conversion.lead_grouped" || at === "offsite_complete_registration_add_meta_leads") {
            leads = Math.max(leads, v);
          }
          if (at === "app_install" || at === "app_custom_event.fb_mobile_activate_app") {
            installs += v;
          }
          if (at === "like" || at === "page_like") {
            pageLikes = Math.max(pageLikes, v);
          }
          if (at === "page_engagement" || at === "follow") {
            follows += v;
          }
        });
        var ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions * 100) : 0;
        var cpc = ins.clicks > 0 ? (ins.spend / ins.clicks) : 0;
        var cpm = ins.impressions > 0 ? (ins.spend / ins.impressions * 1000) : 0;
        var objective = detectObjective(ins.campaign_name);
        var resCount, resType;
        if (objective === "leads") { resCount = leads; resType = "leads"; }
        else if (objective === "appinstall") { resCount = installs > 0 ? installs : ins.clicks; resType = installs > 0 ? "installs" : "store_clicks"; }
        else if (objective === "followers") { resCount = pageLikes + follows; resType = "follows"; }
        else { resCount = ins.clicks; resType = "clicks"; }
        allAds.push({
          platform: platform,
          accountName: account.name,
          campaignId: ins.campaign_id,
          campaignName: ins.campaign_name,
          adsetName: ins.adset_name,
          adId: ins.ad_id,
          adName: ins.ad_name,
          thumbnail: thumb,
          previewUrl: preview,
          format: (function(){
            if (cr.video_id) return "MP4";
            var ot = (cr.object_type || "").toUpperCase();
            if (ot === "MULTI_SHARE" || ot === "CAROUSEL") return "CAROUSEL";
            var url = (cr.image_url || cr.thumbnail_url || "").toLowerCase();
            if (url.indexOf(".gif") >= 0) return "GIF";
            if (ot === "PHOTO" || ot === "SHARE" || ot === "") return "STATIC";
            return ot;
          })(),
          spend: ins.spend,
          impressions: ins.impressions,
          clicks: ins.clicks,
          reach: ins.reach,
          ctr: ctr,
          cpc: cpc,
          cpm: cpm,
          objective: objective,
          results: resCount,
          resultType: resType,
          placements: ins.placements
        });
      });
    } catch (err) {
      console.error("Meta ads error for", account.name, err);
    }
  }

  /* ═══ TIKTOK ═══ */
  try {
    if (ttToken && ttAdvId) {
      var ttAdFields = encodeURIComponent(JSON.stringify(["ad_id", "ad_name", "campaign_id", "campaign_name", "adgroup_id", "adgroup_name", "video_id", "image_ids"]));
      var ttAdsUrl = "https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=" + ttAdvId + "&page_size=100&fields=" + ttAdFields;
      var ttAdsRes = await fetch(ttAdsUrl, { headers: { "Access-Token": ttToken } });
      var ttAdsData = await ttAdsRes.json();
      var ttAdsByAdId = {};
      var videoIds = [];
      if (ttAdsData.data && ttAdsData.data.list) {
        ttAdsData.data.list.forEach(function(ad) {
          ttAdsByAdId[ad.ad_id] = ad;
          if (ad.video_id && videoIds.indexOf(ad.video_id) < 0) videoIds.push(ad.video_id);
        });
      }

      // Batch fetch video info for thumbnails
      var videoInfoByVid = {};
      for (var v = 0; v < videoIds.length; v += 60) {
        var vBatch = videoIds.slice(v, v + 60);
        var vidUrl = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + ttAdvId + "&video_ids=" + encodeURIComponent(JSON.stringify(vBatch));
        try {
          var vRes = await fetch(vidUrl, { headers: { "Access-Token": ttToken } });
          var vData = await vRes.json();
          if (vData.data && vData.data.list) {
            vData.data.list.forEach(function(vi) { videoInfoByVid[vi.video_id] = vi; });
          }
        } catch (vErr) { console.error("TT video info error", vErr); }
      }

      // Ad-level insights
      var ttDims = encodeURIComponent(JSON.stringify(["ad_id"]));
      var ttMetrics = encodeURIComponent(JSON.stringify(["campaign_id", "campaign_name", "adgroup_name", "ad_name", "spend", "impressions", "clicks", "cpm", "cpc", "ctr", "reach", "follows", "likes", "video_views_p100"]));
      var ttInsUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_AD&dimensions=" + ttDims + "&metrics=" + ttMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=200";
      var ttInsRes = await fetch(ttInsUrl, { headers: { "Access-Token": ttToken } });
      var ttInsData = await ttInsRes.json();
      if (ttInsData.data && ttInsData.data.list) {
        ttInsData.data.list.forEach(function(ins) {
          var ad = ttAdsByAdId[ins.dimensions.ad_id] || {};
          var mt = ins.metrics;
          if (!(parseFloat(mt.impressions || 0) > 0 || parseFloat(mt.spend || 0) > 0)) return;
          var video = ad.video_id ? (videoInfoByVid[ad.video_id] || {}) : {};
          var follows = parseInt(mt.follows || 0);
          var likes = parseInt(mt.likes || 0);
          var ttSpend = parseFloat(mt.spend || 0);
          var ttImps = parseInt(mt.impressions || 0);
          var ttClicks = parseInt(mt.clicks || 0);
          var ttObjective = detectObjective(mt.campaign_name);
          var ttResCount, ttResType;
          if (ttObjective === "followers") { ttResCount = follows + likes; ttResType = "follows"; }
          else if (ttObjective === "appinstall") { ttResCount = ttClicks; ttResType = "store_clicks"; }
          else { ttResCount = ttClicks; ttResType = "clicks"; }
          allAds.push({
            platform: "TikTok",
            accountName: "MTN MoMo TikTok",
            campaignId: String(mt.campaign_id || ""),
            campaignName: mt.campaign_name,
            adsetName: mt.adgroup_name,
            adId: ins.dimensions.ad_id,
            adName: mt.ad_name,
            thumbnail: video.video_cover_url || video.poster_url || "",
            previewUrl: video.preview_url || ("https://ads.tiktok.com/i18n/perf/creation?aadvid=" + ttAdvId),
            format: ad.video_id ? "MP4" : (ad.image_ids && ad.image_ids.length > 1 ? "CAROUSEL" : "STATIC"),
            spend: ttSpend,
            impressions: ttImps,
            clicks: ttClicks,
            reach: parseInt(mt.reach || 0),
            ctr: parseFloat(mt.ctr || 0),
            cpc: parseFloat(mt.cpc || 0),
            cpm: parseFloat(mt.cpm || 0),
            objective: ttObjective,
            results: ttResCount,
            resultType: ttResType,
            placements: { "FYP": { spend: ttSpend, impressions: ttImps, clicks: ttClicks } }
          });
        });
      }
    }
  } catch (ttErr) {
    console.error("TikTok ads error", ttErr);
  }

  /* ═══ GOOGLE DISPLAY / YOUTUBE ═══ */
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";

    if (gClientId && gRefreshToken && gDevToken) {
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (gTokenData.access_token) {
        var gQuery = "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.preview_image_url, ad_group_ad.ad.video_ad.video.id, ad_group_ad.ad.responsive_display_ad.marketing_images, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.impressions > 0";
        var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + gTokenData.access_token,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: gQuery })
        });
        if (gRes.status === 200) {
          var gData = await gRes.json();
          (gData.results || []).forEach(function(r) {
            var ad = r.adGroupAd.ad;
            var sp = parseFloat(r.metrics.costMicros || 0) / 1000000;
            var imps = parseInt(r.metrics.impressions || 0);
            var clk = parseInt(r.metrics.clicks || 0);
            if (!(imps > 0 || sp > 0)) return;
            var thumb = "";
            var preview = "";
            var format = ad.type || "IMAGE";
            if (ad.imageAd) {
              thumb = ad.imageAd.previewImageUrl || ad.imageAd.imageUrl || "";
              preview = ad.imageAd.imageUrl || thumb;
              format = (thumb.toLowerCase().indexOf(".gif") >= 0) ? "GIF" : "STATIC";
            } else if (ad.videoAd && ad.videoAd.video && ad.videoAd.video.id) {
              thumb = "https://img.youtube.com/vi/" + ad.videoAd.video.id + "/hqdefault.jpg";
              preview = "https://www.youtube.com/watch?v=" + ad.videoAd.video.id;
              format = "MP4";
            } else if (ad.responsiveDisplayAd && ad.responsiveDisplayAd.marketingImages && ad.responsiveDisplayAd.marketingImages.length > 0) {
              thumb = ad.responsiveDisplayAd.marketingImages[0].url || "";
              preview = thumb;
              format = "RESPONSIVE";
            }
            var gPlatform = (r.campaign.name || "").toLowerCase().indexOf("youtube") >= 0 ? "YouTube" : "Google Display";
            var gPlace = gPlatform === "YouTube" ? "YouTube" : "Display";
            var gConv = Math.round(parseFloat(r.metrics.conversions || 0));
            var gObjective = detectObjective(r.campaign.name);
            var gResCount, gResType;
            if (gConv > 0) { gResCount = gConv; gResType = "conversions"; }
            else if (gObjective === "leads") { gResCount = clk; gResType = "leads"; }
            else { gResCount = clk; gResType = "clicks"; }
            allAds.push({
              platform: gPlatform,
              accountName: "MTN MoMo Google",
              campaignId: String(r.campaign.id || ""),
              campaignName: r.campaign.name,
              adsetName: r.adGroup.name,
              adId: ad.id,
              adName: ad.name || ("Ad " + ad.id),
              thumbnail: thumb,
              previewUrl: preview,
              format: format,
              spend: sp,
              impressions: imps,
              clicks: clk,
              reach: 0,
              ctr: imps > 0 ? (clk / imps * 100) : 0,
              cpc: clk > 0 ? sp / clk : 0,
              cpm: imps > 0 ? (sp / imps * 1000) : 0,
              objective: gObjective,
              results: gResCount,
              resultType: gResType,
              placements: (function(){ var p={}; p[gPlace]={spend:sp,impressions:imps,clicks:clk}; return p; })()
            });
          });
        }
      }
    }
  } catch (gErr) {
    console.error("Google ads error", gErr);
  }

  res.status(200).json({ ads: allAds, total: allAds.length });
}
