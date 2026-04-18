import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";

// Module-level caches that persist across warm Vercel invocations on the same instance.
// Meta Graph API has aggressive app-level rate limits (#4) and video thumbnails + image
// hashes rarely change, so cache them for 30 minutes and skip the network call on
// subsequent /api/ads requests against the same video_id or hash.
var videoThumbCache = {};
var hashUrlCache = {};
var CACHE_TTL_MS = 30 * 60 * 1000;
var cacheGet = function(store, key) {
  var hit = store[key];
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) { delete store[key]; return null; }
  return hit.value;
};
var cacheSet = function(store, key, value) {
  store[key] = { value: value, ts: Date.now() };
};

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
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "landingpage";
  return "landingpage";
}

function mapMetaObjective(metaObj) {
  if (!metaObj) return null;
  var o = String(metaObj).toUpperCase();
  if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
  if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads";
  if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers";
  if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage";
  if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads";
  return null;
}

function mapTikTokObjective(ttObj) {
  if (!ttObj) return null;
  var o = String(ttObj).toUpperCase();
  if (o.indexOf("APP_PROMOTION") >= 0 || o.indexOf("APP_INSTALL") >= 0) return "appinstall";
  if (o === "LEAD_GENERATION" || o === "WEB_CONVERSIONS" || o === "CONVERSIONS") return "leads";
  if (o === "COMMUNITY_INTERACTION" || o === "ENGAGEMENT" || o === "PAGE_VISITS") return "followers";
  if (o === "TRAFFIC" || o === "REACH" || o === "VIDEO_VIEW" || o === "VIDEO_VIEWS") return "landingpage";
  return null;
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
      // Fetch real campaign objectives for this account
      var campObjMap = {};
      try {
        var campUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,objective,name&limit=300&access_token=" + metaToken;
        var campRes = await fetch(campUrl);
        var campData = await campRes.json();
        if (campData.data) {
          campData.data.forEach(function(c) { campObjMap[c.id] = c.objective || ""; });
        }
      } catch (cErr) { console.error("Meta campaign objective fetch error", account.name, cErr); }

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

      // Second insights pull WITHOUT platform_position breakdown. Meta doesn't attribute
      // lead/install conversion actions cleanly across position rows (they get duplicated
      // or dropped), so the actionsAgg we built above from the position-broken query is
      // unreliable for conversion counts. Rebuild actionsAgg from a publisher-only pull.
      try {
        var actUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
        var actRes = await fetch(actUrl);
        var actData = await actRes.json();
        if (actData.data) {
          actData.data.forEach(function(row) {
            var pub = row.publisher_platform || "facebook";
            if (pub !== "facebook" && pub !== "instagram") return;
            var key = row.ad_id + "_" + pub;
            if (!insMap[key]) return;
            insMap[key].actionsAgg = {};
            (row.actions || []).forEach(function(a) {
              insMap[key].actionsAgg[a.action_type] = parseInt(a.value || 0);
            });
          });
        }
      } catch (actErr) { console.error("Meta actions override fetch error", account.name, actErr); }

      var insights = Object.keys(insMap).map(function(k) { return insMap[k]; });

      // Unique ad IDs to fetch creative for
      var uniqAdIds = [];
      insights.forEach(function(x) { if (uniqAdIds.indexOf(x.ad_id) < 0) uniqAdIds.push(x.ad_id); });

      // Batch fetch creatives (up to 50 ids per request)
      var creativesByAdId = {};
      for (var b = 0; b < uniqAdIds.length; b += 50) {
        var batch = uniqAdIds.slice(b, b + 50);
        var adFields = "id,name,creative{id,thumbnail_url,image_url,effective_object_story_id,object_type,video_id,instagram_permalink_url,image_hash,asset_feed_spec,object_story_spec}";
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

      // Track primary video_id per ad (falls back to first DCO variant if the creative is
      // Dynamic/Advantage+ and doesn't have a top-level video_id).
      var adPrimaryVideoId = {};
      var adPrimaryImageHash = {};
      // Collect unique video IDs for high-res thumbnail fetch
      var videoIds = [];
      Object.keys(creativesByAdId).forEach(function(adId) {
        var cr = creativesByAdId[adId];
        var vid = cr.video_id;
        var afs = cr.asset_feed_spec || {};
        if (!vid && afs.videos && afs.videos.length > 0) vid = afs.videos[0].video_id;
        if (vid) {
          adPrimaryVideoId[adId] = vid;
          if (videoIds.indexOf(vid) < 0) videoIds.push(vid);
        }
        // Also any DCO video variant thumbnails (thumbnail_hash is an image hash)
        if (afs.videos) {
          afs.videos.forEach(function(v) {
            if (v.video_id && videoIds.indexOf(v.video_id) < 0) videoIds.push(v.video_id);
          });
        }
      });
      var videoThumbs = {};
      // Seed from module-level cache first: anything we've resolved recently skips the API call.
      var videoIdsToFetch = [];
      videoIds.forEach(function(vid) {
        var cached = cacheGet(videoThumbCache, vid);
        if (cached) videoThumbs[vid] = cached;
        else videoIdsToFetch.push(vid);
      });
      // Extract a thumbnail URL from a single video payload (shared between batch and fallback)
      var pickThumbFromVideo = function(v) {
        if (!v || v.error) return "";
        var best = "";
        if (v.thumbnails && v.thumbnails.data && v.thumbnails.data.length > 0) {
          var largest = v.thumbnails.data.slice().sort(function(a, b) { return (b.width || 0) - (a.width || 0); })[0];
          best = largest.uri || "";
        }
        return best || v.picture || "";
      };
      // Batch via ?ids= counts as 1 API call per batch, staying well under Meta's app rate limit.
      // If the batch itself returns an error (e.g. one bad id poisons the response), fall back
      // to individual fetches for just the ids in that batch.
      var fetchOneVideoThumb = async function(vid) {
        try {
          var r = await fetch("https://graph.facebook.com/v25.0/" + vid + "?fields=picture,thumbnails{uri,height,width}&access_token=" + metaToken);
          var v = await r.json();
          var url = pickThumbFromVideo(v);
          if (url) { videoThumbs[vid] = url; cacheSet(videoThumbCache, vid, url); }
        } catch (_) {}
      };
      for (var vb = 0; vb < videoIdsToFetch.length; vb += 50) {
        var vBatch = videoIdsToFetch.slice(vb, vb + 50);
        try {
          var batchUrl = "https://graph.facebook.com/v25.0/?ids=" + vBatch.join(",") + "&fields=picture,thumbnails{uri,height,width}&access_token=" + metaToken;
          var bRes = await fetch(batchUrl);
          var bData = await bRes.json();
          if (bData && !bData.error) {
            vBatch.forEach(function(vid) {
              var v = bData[vid];
              if (v) {
                var url = pickThumbFromVideo(v);
                if (url) { videoThumbs[vid] = url; cacheSet(videoThumbCache, vid, url); }
              }
            });
          } else {
            for (var ib = 0; ib < vBatch.length; ib += 10) {
              await Promise.all(vBatch.slice(ib, ib + 10).map(fetchOneVideoThumb));
            }
          }
        } catch (_) {
          for (var ib2 = 0; ib2 < vBatch.length; ib2 += 10) {
            await Promise.all(vBatch.slice(ib2, ib2 + 10).map(fetchOneVideoThumb));
          }
        }
      }

      // Resolve image_hash to full-resolution uploaded asset URL via /adimages
      // Also collect hashes from asset_feed_spec (Dynamic / Advantage+ ads)
      var imageHashes = [];
      Object.keys(creativesByAdId).forEach(function(adId) {
        var cr = creativesByAdId[adId];
        var hash = cr.image_hash;
        var afs = cr.asset_feed_spec || {};
        if (!hash && afs.images && afs.images.length > 0) hash = afs.images[0].hash;
        if (hash) {
          adPrimaryImageHash[adId] = hash;
          if (imageHashes.indexOf(hash) < 0) imageHashes.push(hash);
        }
        if (afs.images) {
          afs.images.forEach(function(im) {
            if (im.hash && imageHashes.indexOf(im.hash) < 0) imageHashes.push(im.hash);
          });
        }
      });
      var hashToUrl = {};
      // Seed from module-level cache first
      var hashesToFetch = [];
      imageHashes.forEach(function(h) {
        var cached = cacheGet(hashUrlCache, account.id + ":" + h);
        if (cached) hashToUrl[h] = cached;
        else hashesToFetch.push(h);
      });
      for (var ih = 0; ih < hashesToFetch.length; ih += 50) {
        var hBatch = hashesToFetch.slice(ih, ih + 50);
        var hashStr = encodeURIComponent(JSON.stringify(hBatch));
        var aiUrl = "https://graph.facebook.com/v25.0/" + account.id + "/adimages?hashes=" + hashStr + "&fields=hash,url,permalink_url,width,height&access_token=" + metaToken;
        try {
          var aiRes = await fetch(aiUrl);
          var aiData = await aiRes.json();
          if (aiData.data) {
            aiData.data.forEach(function(img) {
              var url = img.url || img.permalink_url || "";
              if (url) { hashToUrl[img.hash] = url; cacheSet(hashUrlCache, account.id + ":" + img.hash, url); }
            });
          }
        } catch (aiErr) { console.error("Meta adimages error", account.name, aiErr); }
      }
      var unresolvedHashes = hashesToFetch.filter(function(h) { return !hashToUrl[h]; });
      if (unresolvedHashes.length > 0) {
        await Promise.all(unresolvedHashes.slice(0, 100).map(async function(h) {
          try {
            var r = await fetch("https://graph.facebook.com/v25.0/" + account.id + "/adimages?hashes=" + encodeURIComponent(JSON.stringify([h])) + "&fields=hash,url,permalink_url&access_token=" + metaToken);
            var d = await r.json();
            if (d.data && d.data[0]) {
              var url = d.data[0].url || d.data[0].permalink_url || "";
              if (url) { hashToUrl[h] = url; cacheSet(hashUrlCache, account.id + ":" + h, url); }
            }
          } catch (_) {}
        }));
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
        var spUrl = "https://graph.facebook.com/v25.0/?ids=" + sBatch.join(",") + "&fields=full_picture,picture,picture_attachment{image}&access_token=" + metaToken;
        try {
          var spRes = await fetch(spUrl);
          var spData = await spRes.json();
          Object.keys(spData).forEach(function(sid) {
            var s = spData[sid];
            if (!s) return;
            // picture_attachment.image.src is Meta's highest-resolution cached copy
            var pa = s.picture_attachment && s.picture_attachment.image && s.picture_attachment.image.src;
            storyToPic[sid] = pa || s.full_picture || s.picture || "";
          });
        } catch (spErr) { console.error("Meta post picture error", account.name, spErr); }
      }
      // Optional secondary attempt: get hi-res from attachments edge separately so a failure here does not lose full_picture
      var storyToPicHi = {};
      var storyToType = {};
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
            // Infer post format from attachment shape
            var atype = (att.type || "").toLowerCase();
            var hasSubs = att.subattachments && att.subattachments.data && att.subattachments.data.length > 0;
            var hasVideoSrc = att.media && att.media.source;
            if (hasSubs || atype === "album" || atype === "carousel" || atype === "new_album") storyToType[sid] = "CAROUSEL";
            else if (atype.indexOf("video") >= 0 || hasVideoSrc) storyToType[sid] = "MP4";
            else if (atype === "photo" || atype === "profile_media") storyToType[sid] = "STATIC";
          });
        } catch (spErr2) { /* silent fail, full_picture is the fallback */ }
      }

      // Meta FB/IG CDN URLs are signed via query params (oh=, oe=, _nc_sig=).
      // Altering the /pNxN/ path segment invalidates the signature and the CDN
      // falls back to serving a low-res placeholder. Leave the URL as Meta
      // returned it, higher resolution comes from picking the right upstream
      // field (full_picture, /adimages, attachments{media}) rather than URL
      // rewriting.
      var upsizeFb = function(url) { return url || ""; };

      insights.forEach(function(ins) {
        var cr = creativesByAdId[ins.ad_id] || {};
        var pub = ins._pub;
        var platform = pub === "instagram" ? "Instagram" : "Facebook";
        // Walk every variant (DCO ads often have multiple) until we find one that resolves.
        // This covers cases where the first variant's hash isn't in this account's /adimages.
        var afs = cr.asset_feed_spec || {};
        // Walk every variant video id until one resolves, same as the proven-good version.
        var vidThumb = "";
        var candidateVids = [];
        if (cr.video_id) candidateVids.push(cr.video_id);
        if (afs.videos) afs.videos.forEach(function(v) { if (v.video_id) candidateVids.push(v.video_id); });
        for (var cvi = 0; cvi < candidateVids.length && !vidThumb; cvi++) {
          vidThumb = videoThumbs[candidateVids[cvi]] || "";
        }
        var hashThumb = "";
        var candidateHashes = [];
        if (cr.image_hash) candidateHashes.push(cr.image_hash);
        if (afs.images) afs.images.forEach(function(im) { if (im.hash) candidateHashes.push(im.hash); });
        for (var chi = 0; chi < candidateHashes.length && !hashThumb; chi++) {
          hashThumb = hashToUrl[candidateHashes[chi]] || "";
        }
        // Direct url fields on asset_feed_spec images (some DCO ads carry them instead of hashes)
        var afsDirectUrl = "";
        if (afs.images) {
          for (var adi = 0; adi < afs.images.length && !afsDirectUrl; adi++) {
            if (afs.images[adi].url) afsDirectUrl = afs.images[adi].url;
          }
        }
        var sid = cr.effective_object_story_id;
        var postHiThumb = sid ? storyToPicHi[sid] : "";
        var postThumb = sid ? storyToPic[sid] : "";
        // Priority: video thumbnail > /adimages permalink (full upload) > post attachments hi-res > post full_picture > image_url > thumbnail_url
        // Priority: video cover -> uploaded original -> direct asset_feed url -> post hi-res -> post pic -> image_url
        // thumbnail_url is the absolute last resort because Meta bakes a 64x64 stp= modifier into it
        // Proven priority from commit a1a260b where thumbnails were confirmed sharp:
        // video cover, uploaded-asset hash, direct asset_feed url, post hi-res,
        // post full_picture, creative image_url, creative thumbnail_url as last resort.
        var thumb = upsizeFb(vidThumb || hashThumb || afsDirectUrl || postHiThumb || postThumb || cr.image_url || cr.thumbnail_url || "");
        var preview = "";
        if (pub === "instagram" && cr.instagram_permalink_url) {
          preview = cr.instagram_permalink_url;
        } else if (cr.effective_object_story_id) {
          preview = "https://www.facebook.com/" + cr.effective_object_story_id;
        }
        var leads = 0, installs = 0, pageLikes = 0, follows = 0;
        Object.keys(ins.actionsAgg || {}).forEach(function(at) {
          var v = ins.actionsAgg[at];
          var atLow = at.toLowerCase();
          // Lead detection: catch all lead-like actions, exclude installs and irrelevant
          var isLead = (atLow === "lead" ||
                        atLow === "onsite_web_lead" ||
                        atLow === "offsite_conversion.fb_pixel_lead" ||
                        atLow === "onsite_conversion.lead_grouped" ||
                        atLow === "onsite_conversion.flow_complete" ||
                        atLow === "offsite_complete_registration_add_meta_leads" ||
                        atLow === "offsite_conversion.fb_pixel_complete_registration" ||
                        atLow === "complete_registration" ||
                        (atLow.indexOf("lead") >= 0 && atLow.indexOf("install") < 0 && atLow.indexOf("video") < 0 && atLow.indexOf("post") < 0));
          if (isLead) {
            leads = Math.max(leads, v);
          }
          // App install: catch FB + IG + omni variants
          var isInstall = (at === "app_install" ||
                           at === "mobile_app_install" ||
                           at === "omni_app_install" ||
                           at === "app_custom_event.fb_mobile_activate_app" ||
                           at === "onsite_conversion.app_install" ||
                           atLow.indexOf("app_install") >= 0 ||
                           atLow.indexOf("mobile_app_install") >= 0);
          if (isInstall) installs = Math.max(installs, v);
          // FB page likes
          if (at === "like" || at === "page_like") {
            pageLikes = Math.max(pageLikes, v);
          }
          // Follows, FB page follows AND Instagram follows (distinct action types on Meta)
          var isFollow = (at === "follow" ||
                          at === "onsite_conversion.follow" ||
                          at === "ig_follow" ||
                          at === "onsite_conversion.ig_follow" ||
                          at === "onsite_conversion.total_ig_follow" ||
                          atLow.indexOf("ig_follow") >= 0 ||
                          atLow.indexOf("instagram_follow") >= 0 ||
                          (atLow.indexOf("follow") >= 0 && atLow.indexOf("post") < 0 && atLow.indexOf("video") < 0));
          if (isFollow) follows = Math.max(follows, v);
          if (at === "page_engagement" || at === "onsite_conversion.post_save") {
            // Generic engagement is not a follow, only carry as a soft fallback when nothing else fires
            if (pageLikes === 0 && follows === 0) follows = Math.max(follows, v);
          }
        });
        var ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions * 100) : 0;
        var cpc = ins.clicks > 0 ? (ins.spend / ins.clicks) : 0;
        var cpm = ins.impressions > 0 ? (ins.spend / ins.impressions * 1000) : 0;
        // Use actual API objective if available, fall back to name detection
        var apiObj = mapMetaObjective(campObjMap[ins.campaign_id]);
        var objective = apiObj || detectObjective(ins.campaign_name);
        var resCount, resType;
        // For Lead Gen: ALWAYS show leads count (even 0). Never fall back to clicks.
        if (objective === "leads") { resCount = leads; resType = "leads"; }
        // For App Install: prefer installs, fall back to store_clicks (relabel CPC) since both are valid app KPIs
        else if (objective === "appinstall") { resCount = installs > 0 ? installs : ins.clicks; resType = installs > 0 ? "installs" : "store_clicks"; }
        // For Followers: ALWAYS show follows count (even 0). Never fall back.
        else if (objective === "followers") { resCount = pageLikes + follows; resType = "follows"; }
        // Landing Page: clicks to landing page
        else { resCount = ins.clicks; resType = "lp_clicks"; }
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
            if (ot === "VIDEO") return "MP4";
            // object_story_spec: explicit video/carousel signals from the post itself
            var oss = cr.object_story_spec || {};
            if (oss.video_data) return "MP4";
            if (oss.link_data) {
              if (oss.link_data.child_attachments && oss.link_data.child_attachments.length > 1) return "CAROUSEL";
              if (oss.link_data.video_id) return "MP4";
            }
            // Infer from post attachment shape (SHARE / empty object_type)
            var postType = sid ? storyToType[sid] : "";
            if (postType) return postType;
            // Dynamic Creative / Flexible ads: asset_feed_spec holds *variants*. Having videos AND images
            // means Meta picks per impression, treat as ambiguous (fall through to STATIC). Videos-only → MP4.
            var afs = cr.asset_feed_spec || {};
            var afsVideos = (afs.videos && afs.videos.length) || 0;
            var afsImages = (afs.images && afs.images.length) || 0;
            if (afsVideos > 0 && afsImages === 0) return "MP4";
            var url = (cr.image_url || cr.thumbnail_url || "").toLowerCase();
            if (url.indexOf(".gif") >= 0) return "GIF";
            if (afsImages >= 1) return "STATIC";
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
      // Fetch campaigns with their objective_type
      var ttCampObjMap = {};
      try {
        var ttCampFields = encodeURIComponent(JSON.stringify(["campaign_id", "campaign_name", "objective_type"]));
        var ttCampUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=200&fields=" + ttCampFields;
        var ttCampRes = await fetch(ttCampUrl, { headers: { "Access-Token": ttToken } });
        var ttCampData = await ttCampRes.json();
        if (ttCampData.data && ttCampData.data.list) {
          ttCampData.data.list.forEach(function(c) { ttCampObjMap[String(c.campaign_id)] = c.objective_type || ""; });
        }
      } catch (ttcErr) { console.error("TikTok campaign objective fetch error", ttcErr); }

      var ttAdFields = encodeURIComponent(JSON.stringify(["ad_id", "ad_name", "campaign_id", "campaign_name", "adgroup_id", "adgroup_name", "video_id", "image_ids"]));
      var ttAdsUrl = "https://business-api.tiktok.com/open_api/v1.3/ad/get/?advertiser_id=" + ttAdvId + "&page_size=100&fields=" + ttAdFields;
      var ttAdsRes = await fetch(ttAdsUrl, { headers: { "Access-Token": ttToken } });
      var ttAdsData = await ttAdsRes.json();
      var ttAdsByAdId = {};
      var videoIds = [];
      var imageIds = [];
      if (ttAdsData.data && ttAdsData.data.list) {
        ttAdsData.data.list.forEach(function(ad) {
          ttAdsByAdId[ad.ad_id] = ad;
          if (ad.video_id && videoIds.indexOf(ad.video_id) < 0) videoIds.push(ad.video_id);
          // Only collect image_ids from ads without a video_id, video ads' image_ids point to
          // video cover assets that the image-info endpoint refuses (40001), which poisons the batch.
          if (!ad.video_id && ad.image_ids && ad.image_ids.length > 0) {
            ad.image_ids.forEach(function(iid) { if (imageIds.indexOf(iid) < 0) imageIds.push(iid); });
          }
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

      // Batch fetch image info for carousel / static image ads
      var imageInfoByImgId = {};
      for (var ii = 0; ii < imageIds.length; ii += 60) {
        var iBatch = imageIds.slice(ii, ii + 60);
        var imgUrl = "https://business-api.tiktok.com/open_api/v1.3/file/image/ad/info/?advertiser_id=" + ttAdvId + "&image_ids=" + encodeURIComponent(JSON.stringify(iBatch));
        try {
          var iRes = await fetch(imgUrl, { headers: { "Access-Token": ttToken } });
          var iData = await iRes.json();
          if (iData.data && iData.data.list) {
            iData.data.list.forEach(function(img) { imageInfoByImgId[img.image_id] = img; });
          }
        } catch (iErr) { console.error("TT image info error", iErr); }
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
          var firstImgInfo = {};
          if (!ad.video_id && ad.image_ids && ad.image_ids.length > 0) {
            for (var xi = 0; xi < ad.image_ids.length; xi++) {
              var ifo = imageInfoByImgId[ad.image_ids[xi]];
              if (ifo && (ifo.image_url || ifo.url)) { firstImgInfo = ifo; break; }
            }
          }
          var follows = parseInt(mt.follows || 0);
          var likes = parseInt(mt.likes || 0);
          var ttSpend = parseFloat(mt.spend || 0);
          var ttImps = parseInt(mt.impressions || 0);
          var ttClicks = parseInt(mt.clicks || 0);
          var ttApiObj = mapTikTokObjective(ttCampObjMap[String(mt.campaign_id || "")]);
          var ttObjective = ttApiObj || detectObjective(mt.campaign_name);
          var ttResCount, ttResType;
          if (ttObjective === "followers") { ttResCount = follows + likes; ttResType = "follows"; }
          else if (ttObjective === "appinstall") { ttResCount = ttClicks; ttResType = "store_clicks"; }
          else if (ttObjective === "leads") { ttResCount = ttClicks; ttResType = "clicks"; }
          else { ttResCount = ttClicks; ttResType = "lp_clicks"; }
          allAds.push({
            platform: "TikTok",
            accountName: "MTN MoMo TikTok",
            campaignId: String(mt.campaign_id || ""),
            campaignName: mt.campaign_name,
            adsetName: mt.adgroup_name,
            adId: ins.dimensions.ad_id,
            adName: mt.ad_name,
            thumbnail: video.video_cover_url || video.poster_url || firstImgInfo.image_url || firstImgInfo.url || "",
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
  var googleDebug = { attempted: false, tokenOk: false, queryStatus: null, errorBody: "", resultCount: 0, hadError: null };
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    googleDebug.envPresent = !!(gClientId && gRefreshToken && gDevToken && gDevToken && gManagerId);

    if (gClientId && gRefreshToken && gDevToken) {
      googleDebug.attempted = true;
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      googleDebug.tokenOk = !!gTokenData.access_token;
      if (gTokenData.access_token) {
        var gQuery = "SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.name, ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.responsive_display_ad.square_marketing_images, ad_group_ad.ad.responsive_display_ad.youtube_videos, ad_group_ad.ad.responsive_display_ad.long_headline, ad_group_ad.ad.responsive_display_ad.headlines, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.app_ad.images, ad_group_ad.ad.app_ad.youtube_videos, ad_group_ad.ad.app_ad.headlines, ad_group_ad.ad.video_responsive_ad.videos, ad_group_ad.ad.video_responsive_ad.headlines, campaign.id, campaign.name, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND ad_group_ad.status != 'REMOVED'";
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
        googleDebug.queryStatus = gRes.status;
        if (gRes.status !== 200) {
          var gErrText = "";
          try { gErrText = await gRes.text(); } catch (e) { gErrText = "could not read body"; }
          googleDebug.errorBody = gErrText.substring(0, 800);
          console.error("Google Ads API error", gRes.status, gErrText.substring(0, 500));
        } else {
          var gData = await gRes.json();
          googleDebug.resultCount = (gData.results || []).length;
          googleDebug.sampleAd = (gData.results && gData.results[0] && gData.results[0].adGroupAd) ? gData.results[0].adGroupAd.ad : null;
          // Secondary query: ad_group_ad_asset_view joins ads to their assets (images, YouTube videos)
          var adToAssets = {};
          googleDebug.firstAdResource = (gData.results && gData.results[0] && gData.results[0].adGroupAd) ? gData.results[0].adGroupAd.resourceName : null;
          try {
            var assetQuery = "SELECT ad_group_ad_asset_view.ad_group_ad, ad_group_ad_asset_view.field_type, asset.resource_name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM ad_group_ad_asset_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND asset.type IN ('IMAGE','YOUTUBE_VIDEO')";
            var aRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
              method: "POST",
              headers: { "Authorization": "Bearer " + gTokenData.access_token, "developer-token": gDevToken, "login-customer-id": gManagerId, "Content-Type": "application/json" },
              body: JSON.stringify({ query: assetQuery })
            });
            googleDebug.assetStatus = aRes.status;
            if (aRes.status === 200) {
              var aData = await aRes.json();
              googleDebug.assetCount = (aData.results || []).length;
              googleDebug.firstAssetRow = aData.results && aData.results[0] ? aData.results[0] : null;
              (aData.results || []).forEach(function(ar) {
                var adRes = ar.adGroupAdAssetView && ar.adGroupAdAssetView.adGroupAd;
                if (!adRes) return;
                if (!adToAssets[adRes]) adToAssets[adRes] = { image: "", youtubeId: "" };
                if (ar.asset && ar.asset.imageAsset && ar.asset.imageAsset.fullSize && ar.asset.imageAsset.fullSize.url && !adToAssets[adRes].image) {
                  adToAssets[adRes].image = ar.asset.imageAsset.fullSize.url;
                }
                if (ar.asset && ar.asset.youtubeVideoAsset && ar.asset.youtubeVideoAsset.youtubeVideoId && !adToAssets[adRes].youtubeId) {
                  adToAssets[adRes].youtubeId = ar.asset.youtubeVideoAsset.youtubeVideoId;
                }
              });
            } else {
              try { googleDebug.assetError = (await aRes.text()).substring(0, 500); } catch(e) {}
            }
          } catch (aErr) { googleDebug.assetCatch = String(aErr); }

          // Direct asset lookup: responsive_display_ad.marketing_images etc return asset resource
          // references, not URLs. Collect them and resolve in one GAQL call.
          var directAssetRefs = [];
          (gData.results || []).forEach(function(r) {
            var rda = r.adGroupAd.ad.responsiveDisplayAd || {};
            var appAd = r.adGroupAd.ad.appAd || {};
            var vra = r.adGroupAd.ad.videoResponsiveAd || {};
            var collect = function(arr) { (arr || []).forEach(function(m) { if (m && m.asset && directAssetRefs.indexOf(m.asset) < 0) directAssetRefs.push(m.asset); }); };
            collect(rda.marketingImages);
            collect(rda.squareMarketingImages);
            collect(rda.youtubeVideos);
            collect(appAd.images);
            collect(appAd.youtubeVideos);
            collect(vra.videos);
          });
          var assetUrlByRef = {};
          var assetYoutubeIdByRef = {};
          if (directAssetRefs.length > 0) {
            try {
              var refList = directAssetRefs.map(function(rn) { return "'" + rn + "'"; }).join(",");
              var directQ = "SELECT asset.resource_name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (" + refList + ")";
              var dRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
                method: "POST",
                headers: { "Authorization": "Bearer " + gTokenData.access_token, "developer-token": gDevToken, "login-customer-id": gManagerId, "Content-Type": "application/json" },
                body: JSON.stringify({ query: directQ })
              });
              if (dRes.status === 200) {
                var dData = await dRes.json();
                (dData.results || []).forEach(function(ar) {
                  if (ar.asset && ar.asset.resourceName) {
                    if (ar.asset.imageAsset && ar.asset.imageAsset.fullSize && ar.asset.imageAsset.fullSize.url) {
                      assetUrlByRef[ar.asset.resourceName] = ar.asset.imageAsset.fullSize.url;
                    }
                    if (ar.asset.youtubeVideoAsset && ar.asset.youtubeVideoAsset.youtubeVideoId) {
                      assetYoutubeIdByRef[ar.asset.resourceName] = ar.asset.youtubeVideoAsset.youtubeVideoId;
                    }
                  }
                });
              }
            } catch (dErr) { console.error("Google direct asset lookup error", dErr); }
          }

          (gData.results || []).forEach(function(r) {
            var ad = r.adGroupAd.ad;
            var adAssets = adToAssets[r.adGroupAd.resourceName] || {};
            var sp = parseFloat(r.metrics.costMicros || 0) / 1000000;
            var imps = parseInt(r.metrics.impressions || 0);
            var clk = parseInt(r.metrics.clicks || 0);
            if (!(imps > 0 || sp > 0)) return;
            var thumb = "";
            var preview = "";
            var adType = (ad.type || "").toUpperCase();
            var format = "STATIC";
            var isVideo = adType === "VIDEO_AD" || adType === "VIDEO_RESPONSIVE_AD" || adType === "VIDEO_BUMPER_AD" || adType === "VIDEO_NON_SKIPPABLE_IN_STREAM_AD" || adType === "VIDEO_TRUEVIEW_IN_STREAM_AD" || adType === "IN_FEED_VIDEO_AD";
            // Helper: resolve the first asset reference in a list to a URL or YouTube ID
            var firstUrlFrom = function(arr) {
              if (!arr) return "";
              for (var i = 0; i < arr.length; i++) { var u = arr[i] && arr[i].asset ? assetUrlByRef[arr[i].asset] : ""; if (u) return u; }
              return "";
            };
            var firstYoutubeFrom = function(arr) {
              if (!arr) return "";
              for (var i = 0; i < arr.length; i++) { var y = arr[i] && arr[i].asset ? assetYoutubeIdByRef[arr[i].asset] : ""; if (y) return y; }
              return "";
            };
            var rdaObj = ad.responsiveDisplayAd || {};
            var appAdObj = ad.appAd || {};
            var vraObj = ad.videoResponsiveAd || {};

            if (isVideo && adAssets.youtubeId) {
              thumb = "https://img.youtube.com/vi/" + adAssets.youtubeId + "/hqdefault.jpg";
              preview = "https://www.youtube.com/watch?v=" + adAssets.youtubeId;
              format = "MP4";
            } else if (adAssets.image) {
              thumb = adAssets.image;
              preview = adAssets.image;
              format = isVideo ? "MP4" : "STATIC";
            } else if (ad.imageAd) {
              thumb = ad.imageAd.imageUrl || "";
              preview = ad.imageAd.imageUrl || "";
              format = (thumb.toLowerCase().indexOf(".gif") >= 0) ? "GIF" : "STATIC";
            } else if (rdaObj.marketingImages || rdaObj.squareMarketingImages || rdaObj.youtubeVideos) {
              // Responsive Display: resolve marketing image refs to URLs via our direct lookup
              var rdaYt = firstYoutubeFrom(rdaObj.youtubeVideos);
              if (rdaYt) {
                thumb = "https://img.youtube.com/vi/" + rdaYt + "/hqdefault.jpg";
                preview = "https://www.youtube.com/watch?v=" + rdaYt;
                format = "MP4";
              } else {
                thumb = firstUrlFrom(rdaObj.marketingImages) || firstUrlFrom(rdaObj.squareMarketingImages);
                preview = thumb;
                format = "RESPONSIVE";
              }
            } else if (appAdObj.images || appAdObj.youtubeVideos) {
              var appYt = firstYoutubeFrom(appAdObj.youtubeVideos);
              if (appYt) {
                thumb = "https://img.youtube.com/vi/" + appYt + "/hqdefault.jpg";
                preview = "https://www.youtube.com/watch?v=" + appYt;
                format = "MP4";
              } else {
                thumb = firstUrlFrom(appAdObj.images);
                preview = thumb;
                format = "RESPONSIVE";
              }
            } else if (vraObj.videos) {
              var vraYt = firstYoutubeFrom(vraObj.videos);
              if (vraYt) {
                thumb = "https://img.youtube.com/vi/" + vraYt + "/hqdefault.jpg";
                preview = "https://www.youtube.com/watch?v=" + vraYt;
                format = "MP4";
              }
            } else if (isVideo) {
              format = "MP4";
            }
            // Allow text-only Search ads through so spend totals reconcile. Format flagged TEXT, no thumbnail rendered.
            if (!thumb && (adType === "EXPANDED_TEXT_AD" || adType === "RESPONSIVE_SEARCH_AD" || adType === "TEXT_AD")) {
              format = "TEXT";
            }
            // Classify platform by Google channel type
            var chType = (r.campaign.advertisingChannelType || "").toUpperCase();
            var chSubType = (r.campaign.advertisingChannelSubType || "").toUpperCase();
            var gPlatform = "Google Display";
            if (chType === "VIDEO" || chSubType.indexOf("VIDEO") >= 0) gPlatform = "YouTube";
            else if (chType === "DISPLAY") gPlatform = "Google Display";
            else if (chType === "SEARCH") gPlatform = "Google Search";
            else if (chType === "PERFORMANCE_MAX") gPlatform = "Performance Max";
            else if (chType === "DISCOVERY" || chType === "DEMAND_GEN") gPlatform = "Demand Gen";
            else if ((r.campaign.name || "").toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
            var gPlace = gPlatform === "YouTube" ? "YouTube" : gPlatform === "Google Search" ? "Search" : gPlatform === "Performance Max" ? "Pmax" : gPlatform === "Demand Gen" ? "Demand" : "Display";
            var gConv = Math.round(parseFloat(r.metrics.conversions || 0));
            var nameObj = detectObjective(r.campaign.name);
            // Channel sub-type can hint at app campaigns
            var gObjective = (chSubType.indexOf("APP") >= 0 || chSubType.indexOf("APP_INSTALL") >= 0) ? "appinstall" : nameObj;
            var gResCount, gResType;
            if (gConv > 0) { gResCount = gConv; gResType = gObjective === "leads" ? "leads" : gObjective === "appinstall" ? "installs" : "conversions"; }
            else if (gObjective === "appinstall") { gResCount = clk; gResType = "store_clicks"; }
            else if (gObjective === "leads") { gResCount = clk; gResType = "clicks"; }
            else { gResCount = clk; gResType = "lp_clicks"; }
            allAds.push({
              platform: gPlatform,
              accountName: "MTN MoMo Google",
              campaignId: String(r.campaign.id || ""),
              campaignName: r.campaign.name,
              adsetName: r.adGroup.name,
              adId: ad.id,
              adName: (function(){
                if (ad.name) return ad.name;
                var rda = ad.responsiveDisplayAd || {};
                var rsa = ad.responsiveSearchAd || {};
                var appAdN = ad.appAd || {};
                var vraN = ad.videoResponsiveAd || {};
                if (rda.longHeadline && rda.longHeadline.text) return rda.longHeadline.text;
                if (rda.headlines && rda.headlines[0] && rda.headlines[0].text) return rda.headlines[0].text;
                if (rsa.headlines && rsa.headlines[0] && rsa.headlines[0].text) return rsa.headlines[0].text;
                if (appAdN.headlines && appAdN.headlines[0] && appAdN.headlines[0].text) return appAdN.headlines[0].text;
                if (vraN.headlines && vraN.headlines[0] && vraN.headlines[0].text) return vraN.headlines[0].text;
                if (ad.imageAd && ad.imageAd.name) return ad.imageAd.name;
                // Last resort: use ad group name + ad type so it reads meaningfully instead of a bare ID
                var typeLbl = (ad.type || "").replace(/_/g, " ").replace(/\bAD$/i, "").trim() || "Ad";
                var grp = r.adGroup && r.adGroup.name ? r.adGroup.name + " | " : "";
                return grp + typeLbl;
              })(),
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
    googleDebug.hadError = String(gErr && gErr.message ? gErr.message : gErr);
    console.error("Google ads error", gErr);
  }

  res.status(200).json({ ads: allAds, total: allAds.length });
}
