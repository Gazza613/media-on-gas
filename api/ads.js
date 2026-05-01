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

// Whole-response cache for /api/ads keyed by from|to. 5-min TTL means a user hard-
// refreshing or opening the dashboard in multiple tabs within that window gets an
// instant return, skipping the whole 5-15s fan-out across Meta / TikTok / Google.
var adsResponseCache = {};
var ADS_RESPONSE_TTL_MS = 5 * 60 * 1000;

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

  // Admin-only debug flag that returns the raw Meta actionsAgg + trueTotals
  // per ad so we can verify what Meta is actually returning when a tile
  // number looks wrong. Bypasses cache so diagnostic is always fresh.
  var debugFollows = String(req.query.debug || "") === "1";

  // Whole-response cache check: if we've served this exact date range within the last
  // 5 minutes on this warm instance, return immediately and skip every downstream fetch.
  var cacheKey = from + "|" + to;
  var cached = debugFollows ? null : adsResponseCache[cacheKey];
  if (cached && Date.now() - cached.ts < ADS_RESPONSE_TTL_MS) {
    var pCached = req.authPrincipal || { role: "admin" };
    if (pCached.role === "client") {
      var cIds = (pCached.allowedCampaignIds || []).map(String);
      // Strict ID-only match. The campaignName fallback used to accept any
      // ad whose name matched a name in the token's allowedCampaignNames list,
      // which could cross-match same-named campaigns across different clients'
      // ad accounts. Tokens carry the full suffixed + raw-variant expansion so
      // an ID-only match is lossless for legitimate access.
      var allowed = {};
      cIds.forEach(function(x) {
        var s = String(x);
        allowed[s] = true;
        allowed[s.replace(/_(facebook|instagram)$/, "")] = true;
      });
      var cFiltered = (cached.data.ads || []).filter(function(a) {
        var cid = String(a.campaignId || "");
        var rawCid = cid.replace(/_(facebook|instagram)$/, "");
        return allowed[cid] === true || allowed[rawCid] === true;
      });
      res.status(200).json({ ads: cFiltered, total: cFiltered.length });
    } else {
      res.status(200).json(cached.data);
    }
    return;
  }

  var allAds = [];

  /* ═══ META (Facebook + Instagram) ═══ */
  // Parallelise all 6 ad accounts at once instead of serial for-loop. Each account's work
  // takes 2-3s on its own; serial was ~15-18s for Meta, parallel brings it down to ~3-4s.
  await Promise.all(metaAccounts.map(async function(account) {
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
      // Single publisher_platform breakdown only. The earlier `platform_position`
      // breakdown caused Meta to drop most ad rows entirely for Page Like and
      // similar campaigns (a 45-ad campaign would return just 1 row). We split
      // FB vs IG via publisher_platform but take no further breakdowns.
      var insUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,ad_name,campaign_name,campaign_id,adset_name,adset_id,impressions,clicks,spend,cpc,cpm,ctr,reach,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
      // Follow paging.next so accounts with more than 500 ad rows don't silently drop data.
      var insAllRows = [];
      var insNext = insUrl;
      var insGuard = 0;
      while (insNext && insGuard < 10) {
        insGuard++;
        var insPageRes = await fetch(insNext);
        var insPageData = await insPageRes.json();
        if (insPageData.data) insAllRows = insAllRows.concat(insPageData.data);
        insNext = insPageData.paging && insPageData.paging.next ? insPageData.paging.next : null;
      }
      var insData = { data: insAllRows };
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
          // Map publisher platform to the display platform family.
          // audience_network + messenger + oculus => Facebook. threads => Instagram.
          // Matches Meta Ads Manager's default "Facebook" view and stops those
          // placements from being silently dropped from totals.
          var rawPub = (ins.publisher_platform || "facebook").toLowerCase();
          var pub;
          if (rawPub === "instagram" || rawPub === "threads") pub = "instagram";
          else if (rawPub === "facebook" || rawPub === "audience_network" || rawPub === "messenger" || rawPub === "oculus") pub = "facebook";
          else return; // genuinely unknown
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
          // placements populated from a secondary query below with the
          // publisher_platform + platform_position breakdown. Don't seed
          // from this query — the main query doesn't carry position data.
        });
      }

      // Secondary insights call purely for placement distribution. Meta drops
      // rows if we pile too many fields onto a platform_position breakdown,
      // so request only impressions here. Merge the breakdown back into
      // insMap so the preview modal can show Feed / Stories / Reels / etc.
      try {
        var placeUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,impressions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform,platform_position&limit=500&access_token=" + metaToken;
        var placeRows = [];
        var placeNext = placeUrl;
        var placeGuard = 0;
        while (placeNext && placeGuard < 10) {
          placeGuard++;
          var placeRes = await fetch(placeNext);
          var placeData = await placeRes.json();
          if (placeData.data) placeRows = placeRows.concat(placeData.data);
          placeNext = placeData.paging && placeData.paging.next ? placeData.paging.next : null;
        }
        placeRows.forEach(function(pr) {
          var rawP = (pr.publisher_platform || "facebook").toLowerCase();
          var pub2;
          if (rawP === "instagram" || rawP === "threads") pub2 = "instagram";
          else if (rawP === "facebook" || rawP === "audience_network" || rawP === "messenger" || rawP === "oculus") pub2 = "facebook";
          else return;
          var key2 = pr.ad_id + "_" + pub2;
          var row = insMap[key2];
          if (!row) return;
          var place2 = normalizePlace(pr.platform_position);
          var imps2 = parseInt(pr.impressions || 0);
          if (imps2 <= 0) return;
          if (!row.placements[place2]) row.placements[place2] = { spend: 0, impressions: 0, clicks: 0 };
          row.placements[place2].impressions += imps2;
        });
      } catch (placeErr) { console.error("Meta placement breakdown error", account.name, placeErr); }

      // Second insights pull WITHOUT platform_position breakdown. Meta doesn't attribute
      // lead/install conversion actions cleanly across position rows (they get duplicated
      // or dropped), so the actionsAgg we built above from the position-broken query is
      // unreliable for conversion counts. Rebuild actionsAgg from a publisher-only pull.
      try {
        var actUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
        var actRes = await fetch(actUrl);
        var actData = await actRes.json();
        if (actData.data) {
          // Aggregate by (ad_id, FB/IG family) across all publisher rows so AN +
          // Messenger action counts roll into Facebook not get dropped.
          var familyAgg = {};
          actData.data.forEach(function(row) {
            var rawPub = (row.publisher_platform || "facebook").toLowerCase();
            var pub;
            if (rawPub === "instagram" || rawPub === "threads") pub = "instagram";
            else if (rawPub === "facebook" || rawPub === "audience_network" || rawPub === "messenger" || rawPub === "oculus") pub = "facebook";
            else return;
            var key = row.ad_id + "_" + pub;
            if (!familyAgg[key]) familyAgg[key] = {};
            (row.actions || []).forEach(function(a) {
              familyAgg[key][a.action_type] = (familyAgg[key][a.action_type] || 0) + parseInt(a.value || 0);
            });
          });
          Object.keys(familyAgg).forEach(function(key) {
            if (!insMap[key]) return;
            insMap[key].actionsAgg = familyAgg[key];
          });
        }
      } catch (actErr) { console.error("Meta actions override fetch error", account.name, actErr); }

      // Third pass: no-breakdown per-ad action totals. Page likes and follows in
      // particular don't sum back to the campaign aggregate even under a single
      // publisher_platform breakdown (Meta attributes at the campaign level for
      // Page Like campaigns in a way that's lost in ad+placement rows). Fetching
      // per-ad without any breakdown gives us the authoritative per-ad count.
      var adTrueTotals = {};
      try {
        // Fetch campaign_id too so we can check objective before folding the
        // ambiguous "like" action into page_likes (see note below).
        var trueUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,campaign_id,actions&time_range=" + timeRange + "&level=ad&limit=500&access_token=" + metaToken;
        var trueRes = await fetch(trueUrl);
        var trueData = await trueRes.json();
        if (trueData.data) {
          trueData.data.forEach(function(row) {
            // Track follow-like actions per-placement-family so the dashboard
            // can attach the RIGHT number to each row. Without splitting, the
            // IG Top Performers tile showed FB page_likes + IG post hearts,
            // producing "3.3K IG follows" on ads whose real IG follow count
            // was under 200.
            var totals = {
              reactionLikes: 0,  // "like" action, ambiguous (FB page likes OR post reactions)
              page_like: 0,      // unambiguous FB page likes
              fbFollow: 0,       // generic FB follow (rare, usually 0)
              igFollow: 0,       // unambiguous IG follows
              lead: 0,
              app_install: 0
            };
            (row.actions || []).forEach(function(a) {
              var at = a.action_type;
              var v = parseInt(a.value || 0);
              if (at === "page_like") totals.page_like = Math.max(totals.page_like, v);
              if (at === "like") totals.reactionLikes = Math.max(totals.reactionLikes, v);
              // IG follows: any action type scoped to Instagram. These are
              // unambiguous, Instagram doesn't have "page likes", only follows.
              if (at === "ig_follow" || at === "onsite_conversion.ig_follow" || at === "onsite_conversion.total_ig_follow") {
                totals.igFollow = Math.max(totals.igFollow, v);
              }
              // Generic "follow" / "onsite_conversion.follow" are most often
              // FB page follows (PAGE_LIKES campaigns), but IG can surface
              // them too. Treat as FB for now, if the primary per-placement
              // pass shows IG rows with high follows via this field we'd
              // revisit. In practice the IG follow count comes via ig_follow.
              if (at === "follow" || at === "onsite_conversion.follow") totals.fbFollow = Math.max(totals.fbFollow, v);
              if (at === "lead" || at.indexOf("fb_pixel_lead") >= 0 || at === "onsite_conversion.lead_grouped") totals.lead = Math.max(totals.lead, v);
              if (at === "app_install" || at === "mobile_app_install" || at === "omni_app_install") totals.app_install = Math.max(totals.app_install, v);
            });
            // Fold the ambiguous "like" into FB page_likes for any follower-
            // objective campaign. Safe because "like" at ad level reflects
            // FB page likes for PAGE_LIKES / OUTCOME_ENGAGEMENT page-like
            // goals, IG post hearts are returned in the same key but we
            // never attach this value to an IG placement row (see below).
            var isFollowerObj = mapMetaObjective(campObjMap[row.campaign_id]) === "followers";
            var pageLikeFinal = isFollowerObj ? Math.max(totals.page_like, totals.reactionLikes) : totals.page_like;
            adTrueTotals[row.ad_id] = {
              pageLikes: pageLikeFinal,
              follows: totals.fbFollow + totals.igFollow,  // kept for backward compat
              // Per-placement true totals. Attached to each row by publisher.
              followsFb: pageLikeFinal + totals.fbFollow,  // for publisher_platform=facebook rows
              followsIg: totals.igFollow,                  // for publisher_platform=instagram rows
              leads: totals.lead,
              appInstalls: totals.app_install,
              followersCombined: pageLikeFinal + totals.fbFollow + totals.igFollow
            };
          });
        }
      } catch (trueErr) { console.error("Meta no-breakdown totals fetch error", account.name, trueErr); }

      // Authoritative campaign-level spend (no breakdowns) so we can scale
      // ad-level spend to match. Meta's ad-level publisher_platform breakdown
      // often sums to ~93-99% of the campaign total because some spend is
      // attributed at higher levels (deleted ads, attribution overhead, etc.).
      var campAuthSpend = {};
      try {
        var campSpendUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,spend&time_range=" + timeRange + "&level=campaign&limit=500&access_token=" + metaToken;
        var campSpendRes = await fetch(campSpendUrl);
        var campSpendData = await campSpendRes.json();
        if (campSpendData.data) {
          campSpendData.data.forEach(function(r) {
            var s = parseFloat(r.spend || 0);
            if (s > 0) campAuthSpend[r.campaign_id] = (campAuthSpend[r.campaign_id] || 0) + s;
          });
        }
      } catch (_) {}

      // Scale ad spend proportionally so the sum per campaign matches the
      // authoritative campaign-level total.
      var adSpendByCamp = {};
      Object.keys(insMap).forEach(function(k) {
        var r = insMap[k];
        var cid = r.campaign_id;
        if (!adSpendByCamp[cid]) adSpendByCamp[cid] = 0;
        adSpendByCamp[cid] += r.spend;
      });
      Object.keys(insMap).forEach(function(k) {
        var r = insMap[k];
        var cid = r.campaign_id;
        var auth = campAuthSpend[cid];
        var adSum = adSpendByCamp[cid];
        if (auth && adSum > 0 && Math.abs(auth - adSum) > 0.01) {
          r.spend = parseFloat((auth * (r.spend / adSum)).toFixed(2));
        }
      });

      var insights = Object.keys(insMap).map(function(k) {
        var row = insMap[k];
        row.trueTotals = adTrueTotals[row.ad_id] || null;
        return row;
      });

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
        if (cached) {
          // Backwards-compat: warm-start cache entries may be plain strings
          // from before the {url,width,height} upgrade. Normalise so
          // downstream readers can trust the object shape.
          videoThumbs[vid] = (typeof cached === "string") ? { url: cached, width: 0, height: 0 } : cached;
        } else {
          videoIdsToFetch.push(vid);
        }
      });
      // Extract the best thumbnail from a video payload. Returns the URL plus
      // the pixel dimensions so downstream code can decide whether it's big
      // enough to use directly or whether to fall back to a higher-res source
      // (hashThumb / asset_feed_spec / post attachments). Sorts by AREA so
      // portrait-format thumbnails (Reels, 1080x1920) aren't disadvantaged
      // versus landscape variants.
      var pickThumbFromVideo = function(v) {
        if (!v || v.error) return { url: "", width: 0, height: 0 };
        if (v.thumbnails && v.thumbnails.data && v.thumbnails.data.length > 0) {
          var largest = v.thumbnails.data.slice().sort(function(a, b) {
            var aw = parseInt(a.width || 0, 10), ah = parseInt(a.height || 0, 10);
            var bw = parseInt(b.width || 0, 10), bh = parseInt(b.height || 0, 10);
            return (bw * bh) - (aw * ah);
          })[0];
          return { url: largest.uri || "", width: parseInt(largest.width || 0, 10), height: parseInt(largest.height || 0, 10) };
        }
        return { url: v.picture || "", width: 0, height: 0 };
      };
      // Batch via ?ids= counts as 1 API call per batch, staying well under Meta's app rate limit.
      // If the batch itself returns an error (e.g. one bad id poisons the response), fall back
      // to individual fetches for just the ids in that batch.
      var fetchOneVideoThumb = async function(vid) {
        try {
          var r = await fetch("https://graph.facebook.com/v25.0/" + vid + "?fields=picture,thumbnails{uri,height,width}&access_token=" + metaToken);
          var v = await r.json();
          var info = pickThumbFromVideo(v);
          if (info.url) { videoThumbs[vid] = info; cacheSet(videoThumbCache, vid, info); }
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
                var info = pickThumbFromVideo(v);
                if (info.url) { videoThumbs[vid] = info; cacheSet(videoThumbCache, vid, info); }
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
        // Walk every variant video id until one resolves. Split the result into
        // "bigVidThumb" (>= 500px on the long side, sharp enough to use as
        // primary) and "smallVidThumb" (<500px, Meta's auto-picked thumbnail
        // that often upscales into a blurry card). Small thumbs move to the
        // bottom of the fallback chain below, so we reach for hashThumb /
        // asset_feed_spec / post attachments first when those exist.
        var bigVidThumb = "";
        var smallVidThumb = "";
        var candidateVids = [];
        if (cr.video_id) candidateVids.push(cr.video_id);
        var oss = cr.object_story_spec || {};
        if (oss.video_data && oss.video_data.video_id && candidateVids.indexOf(oss.video_data.video_id) < 0) candidateVids.push(oss.video_data.video_id);
        if (oss.link_data && oss.link_data.video_id && candidateVids.indexOf(oss.link_data.video_id) < 0) candidateVids.push(oss.link_data.video_id);
        if (afs.videos) afs.videos.forEach(function(v) { if (v.video_id && candidateVids.indexOf(v.video_id) < 0) candidateVids.push(v.video_id); });
        for (var cvi = 0; cvi < candidateVids.length && !bigVidThumb && !smallVidThumb; cvi++) {
          var info = videoThumbs[candidateVids[cvi]];
          if (!info || !info.url) continue;
          var longSide = Math.max(info.width || 0, info.height || 0);
          if (longSide >= 500) bigVidThumb = info.url;
          else smallVidThumb = info.url;
        }
        var hashThumb = "";
        var candidateHashes = [];
        if (cr.image_hash) candidateHashes.push(cr.image_hash);
        if (oss.link_data && oss.link_data.image_hash) candidateHashes.push(oss.link_data.image_hash);
        if (oss.video_data && oss.video_data.image_hash) candidateHashes.push(oss.video_data.image_hash);
        if (oss.link_data && oss.link_data.child_attachments) oss.link_data.child_attachments.forEach(function(ch) { if (ch.image_hash && candidateHashes.indexOf(ch.image_hash) < 0) candidateHashes.push(ch.image_hash); });
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
        // Priority:
        // 1. bigVidThumb         — video frame >=500px (sharp on cards)
        // 2. hashThumb           — /adimages permalink, the uploaded-original asset
        // 3. afsDirectUrl        — direct asset_feed_spec image URL (DCO ads)
        // 4. postHiThumb         — post attachment hi-res image
        // 5. postThumb           — post full_picture
        // 6. cr.image_url        — creative image URL
        // 7. smallVidThumb       — video frame <500px, only if nothing better
        // 8. cr.thumbnail_url    — absolute last resort (Meta bakes an stp= modifier that forces 64-192px)
        var thumb = upsizeFb(bigVidThumb || hashThumb || afsDirectUrl || postHiThumb || postThumb || cr.image_url || smallVidThumb || cr.thumbnail_url || "");
        var preview = "";
        if (pub === "instagram" && cr.instagram_permalink_url) {
          preview = cr.instagram_permalink_url;
        } else if (cr.effective_object_story_id) {
          preview = "https://www.facebook.com/" + cr.effective_object_story_id;
        }
        // Compute objective FIRST so we can decide how to treat the ambiguous
        // "like" action (post reactions vs. page likes, see below).
        var rawMetaObj = campObjMap[ins.campaign_id] || "";
        var apiObj = mapMetaObjective(rawMetaObj);
        var objective = apiObj || detectObjective(ins.campaign_name);
        var isFbPlacement = pub === "facebook" || pub === "audience_network" || pub === "messenger" || pub === "oculus";

        var leads = 0, installs = 0, pageLikes = 0, reactionLikes = 0, follows = 0;
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
          // "page_like" is the unambiguous page-follow signal. "like" at ad
          // level is POST REACTIONS (hearts on the post itself), not follows,
          // a high-engagement post can show thousands of reactions that have
          // no relationship to community growth. Track separately and only
          // fold reactions into page_likes when the campaign is Page Likes
          // objective (where Meta returns page likes under legacy "like").
          if (at === "page_like") pageLikes = Math.max(pageLikes, v);
          if (at === "like") reactionLikes = Math.max(reactionLikes, v);
          // Strict follow-type list. No catch-all indexOf("follow") because
          // Meta has action types that contain "follow" in misleading ways
          // (experiments + deprecated keys). Track FB + IG follows separately
          // so we can attach the placement-correct count per row later.
          if (at === "follow" || at === "onsite_conversion.follow") {
            // Generic follow, treat as placement-appropriate. On an IG row
            // Meta should have emitted ig_follow, but be permissive.
            if (isFbPlacement) follows = Math.max(follows, v);
          }
          if (at === "ig_follow" || at === "onsite_conversion.ig_follow" || at === "onsite_conversion.total_ig_follow") {
            if (!isFbPlacement) follows = Math.max(follows, v);
          }
          // Drop the page_engagement "soft fallback" — it was too permissive
          // and caught post-level engagement that is not a follow. If no
          // page_like or follow action fires, the result is legitimately 0.
        });
        // Fold "like" into page likes for any follower-family campaign on
        // an FB placement. That covers strict PAGE_LIKES AND the modern
        // OUTCOME_ENGAGEMENT objective (ODAX consolidated the two in 2022+).
        // The FB-placement check keeps IG post reactions out of the count,
        // IG hearts are returned under the same "like" key but are never
        // page follows.
        if (objective === "followers" && isFbPlacement && reactionLikes > pageLikes) pageLikes = reactionLikes;
        var ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions * 100) : 0;
        var cpc = ins.clicks > 0 ? (ins.spend / ins.clicks) : 0;
        var cpm = ins.impressions > 0 ? (ins.spend / ins.impressions * 1000) : 0;
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
          followsRaw: pageLikes + follows,
          // Per-placement true per-ad total from the no-breakdown insights
          // pass. FB rows get FB page_likes + FB follows, IG rows get IG
          // follows only, NOT the combined followersCombined value, which
          // leaked FB page_likes (and folded-in post reactions on
          // PAGE_LIKES campaigns) into IG Top Performer tiles.
          followsTrue: (function() {
            if (!ins.trueTotals) return 0;
            if (pub === "facebook") return ins.trueTotals.followsFb || 0;
            if (pub === "instagram") return ins.trueTotals.followsIg || 0;
            // Unknown publisher, defensive: return 0 rather than the
            // combined FB+IG total so an unmapped placement does not
            // leak FB page likes into an IG-display tile.
            return 0;
          })(),
          leadsTrue: (ins.trueTotals && ins.trueTotals.leads) || 0,
          appInstallsTrue: (ins.trueTotals && ins.trueTotals.appInstalls) || 0,
          // Debug-only, expose raw action aggregation + per-placement splits
          // so we can verify what Meta actually returns when a tile looks
          // wrong. Stripped from the payload unless ?debug=1 is passed.
          _debugActionsAgg: debugFollows ? (ins.actionsAgg || {}) : undefined,
          _debugTrueTotals: debugFollows ? (ins.trueTotals || null) : undefined,
          // Meta video id for in-dashboard playback via /api/ad-video proxy.
          // Falls back to the first DCO variant video if the primary creative is static.
          videoId: cr.video_id || (candidateVids.length > 0 ? candidateVids[0] : ""),
          placements: ins.placements
        });
      });
    } catch (err) {
      console.error("Meta ads error for", account.name, err);
    }
  }));

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
      var ttInsBase = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_AD&dimensions=" + ttDims + "&metrics=" + ttMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=200";
      // Follow TikTok pagination via page_info.total_page. Single-page fetch
      // silently dropped ~20% of ads on accounts with >200 ad rows, showing
      // up as RED "ads sum spend" deltas in the reconcile tab.
      var ttAllIns = [];
      var ttPage = 1;
      while (ttPage < 20) {
        var ttPageRes = await fetch(ttInsBase + "&page=" + ttPage, { headers: { "Access-Token": ttToken } });
        if (!ttPageRes.ok) break;
        var ttPageData = await ttPageRes.json();
        var ttList = (ttPageData.data || {}).list || [];
        ttAllIns = ttAllIns.concat(ttList);
        var ttTotalPage = (ttPageData.data && ttPageData.data.page_info && ttPageData.data.page_info.total_page) || 1;
        if (ttPage >= ttTotalPage) break;
        ttPage++;
      }
      var ttInsData = { data: { list: ttAllIns } };

      // Authoritative campaign-level totals (no ad dimension). TikTok's
      // AUCTION_AD query can undercount by 15 to 25 percent on app-install
      // campaigns because some delivery types (TopView, boosted-post, RF
      // spillover) do not attribute to a single ad_id. Fetching without
      // the ad dimension gives the matching campaign total, which we then
      // apportion across the ad rows below.
      var ttCampTruth = {};
      try {
        var ttCtDims = encodeURIComponent(JSON.stringify(["campaign_id"]));
        var ttCtMetrics = encodeURIComponent(JSON.stringify(["spend", "impressions", "clicks"]));
        var ttCtBase = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + ttCtDims + "&metrics=" + ttCtMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=500";
        var ttCtPage = 1;
        while (ttCtPage < 20) {
          var ttCtRes = await fetch(ttCtBase + "&page=" + ttCtPage, { headers: { "Access-Token": ttToken } });
          if (!ttCtRes.ok) break;
          var ttCtData = await ttCtRes.json();
          var ttCtList = (ttCtData.data && ttCtData.data.list) || [];
          ttCtList.forEach(function(row) {
            var cid = String((row.dimensions || {}).campaign_id || "");
            if (!cid) return;
            ttCampTruth[cid] = {
              spend: parseFloat((row.metrics || {}).spend || 0),
              impressions: parseInt((row.metrics || {}).impressions || 0),
              clicks: parseInt((row.metrics || {}).clicks || 0)
            };
          });
          var ttCtTotal = (ttCtData.data && ttCtData.data.page_info && ttCtData.data.page_info.total_page) || 1;
          if (ttCtPage >= ttCtTotal) break;
          ttCtPage++;
        }
      } catch (_) { /* non-fatal, falls back to raw ad-level sums */ }

      // Stage ad rows in a temp array so we can apply the per-campaign
      // scaling pass before pushing to allAds.
      var ttStaged = [];
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
          // TikTok "likes" metric = video hearts (engagement), NOT follows.
          // Only count actual follows for the Followers objective. Bundling
          // video likes into follows wildly inflates the Top Performer tile
          // on any TikTok ad with viral engagement.
          if (ttObjective === "followers") { ttResCount = follows; ttResType = "follows"; }
          else if (ttObjective === "appinstall") { ttResCount = ttClicks; ttResType = "store_clicks"; }
          else if (ttObjective === "leads") { ttResCount = ttClicks; ttResType = "clicks"; }
          else { ttResCount = ttClicks; ttResType = "lp_clicks"; }
          ttStaged.push({
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
            followsRaw: follows,
            videoId: ad.video_id || "",
            placements: { "FYP": { spend: ttSpend, impressions: ttImps, clicks: ttClicks } }
          });
        });
      }

      // Per-campaign apportionment: scale staged ad rows up so the sum
      // matches the campaign-level authoritative total. Only scales up.
      var ttByCamp = {};
      ttStaged.forEach(function(r) {
        if (!ttByCamp[r.campaignId]) ttByCamp[r.campaignId] = { rows: [], spend: 0, imps: 0, clicks: 0 };
        ttByCamp[r.campaignId].rows.push(r);
        ttByCamp[r.campaignId].spend += r.spend;
        ttByCamp[r.campaignId].imps += r.impressions;
        ttByCamp[r.campaignId].clicks += r.clicks;
      });
      Object.keys(ttByCamp).forEach(function(cid) {
        var bucket = ttByCamp[cid];
        var truth = ttCampTruth[cid];
        var sSpend = (truth && bucket.spend > 0) ? (truth.spend / bucket.spend) : 1;
        var sImps = (truth && bucket.imps > 0) ? (truth.impressions / bucket.imps) : 1;
        var sClk = (truth && bucket.clicks > 0) ? (truth.clicks / bucket.clicks) : 1;
        if (sSpend < 1) sSpend = 1;
        if (sImps < 1) sImps = 1;
        if (sClk < 1) sClk = 1;
        bucket.rows.forEach(function(r) {
          r.spend = parseFloat((r.spend * sSpend).toFixed(2));
          r.impressions = Math.round(r.impressions * sImps);
          r.clicks = Math.round(r.clicks * sClk);
          r.placements = { "FYP": { spend: r.spend, impressions: r.impressions, clicks: r.clicks } };
          allAds.push(r);
        });
      });
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
              followsRaw: 0,
              // YouTube ID parsed from preview URL (youtube.com/watch?v=<id>) for in-dashboard
              // iframe embed. Empty for Display/Search ads (static images or text only).
              youtubeId: (function(){ var m = /[?&]v=([^&#]+)/.exec(preview||""); return m ? m[1] : ""; })(),
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

  var response = { ads: allAds, total: allAds.length };
  // Cache the unfiltered (admin) response keyed by date range. Client-scoped filtering
  // happens after the cache read on every request so tokens cannot see wider data.
  adsResponseCache[cacheKey] = { data: response, ts: Date.now() };
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    var ids = (principal.allowedCampaignIds || []).map(String);
    // Strict ID-only match, no campaignName fallback, which used to cross-match
    // same-named campaigns across different clients' ad accounts.
    var allowedSet = {};
    ids.forEach(function(x) {
      allowedSet[x] = true;
      allowedSet[x.replace(/_(facebook|instagram)$/, "")] = true;
    });
    var filtered = allAds.filter(function(a) {
      var cid = String(a.campaignId || "");
      var rawCid = cid.replace(/_(facebook|instagram)$/, "");
      return allowedSet[cid] === true || allowedSet[rawCid] === true;
    });
    res.status(200).json({ ads: filtered, total: filtered.length });
    return;
  }
  res.status(200).json(response);
}
