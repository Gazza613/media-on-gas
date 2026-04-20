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

// Shared name-based objective fallback for cross-platform rows (TikTok,
// Google, scheduled-but-no-metrics). Mirrors api/ads.js detectObjective.
function objectiveFromName(name) {
  var n = (name || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) return "appinstall";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "landingpage";
  return "landingpage";
}


// Whole-response cache. /api/ads already does this, /api/campaigns did
// not, so every email-share preview re-fetched Meta + TikTok + Google
// even though the admin dashboard had just loaded the same data seconds
// earlier. A 5-minute TTL is the same window share-email preview +
// confirm-and-send + reconcile run happens in, covering them all.
var campaignsResponseCache = {};
var CAMPAIGNS_RESPONSE_TTL_MS = 5 * 60 * 1000;

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";

  var cacheKey = from + "|" + to;
  var cached = campaignsResponseCache[cacheKey];
  if (cached && Date.now() - cached.ts < CAMPAIGNS_RESPONSE_TTL_MS) {
    var pCached = req.authPrincipal || { role: "admin" };
    if (pCached.role === "client") {
      var cIds = pCached.allowedCampaignIds || [];
      var cNames = pCached.allowedCampaignNames || [];
      var filtered = (cached.data.campaigns || []).filter(function(c) {
        var raw = String(c.rawCampaignId || "");
        var cid = String(c.campaignId || "");
        if (cIds.indexOf(raw) >= 0 || cIds.indexOf(cid) >= 0) return true;
        if (cNames.indexOf(c.campaignName || "") >= 0) return true;
        return false;
      });
      res.status(200).json({ totalCampaigns: filtered.length, dateFrom: cached.data.dateFrom, dateTo: cached.data.dateTo, campaigns: filtered, pages: cached.data.pages, warnings: cached.data.warnings });
    } else {
      res.status(200).json(cached.data);
    }
    return;
  }

  var allCampaigns = [];
  var seenIds = {};
  // Surface per-platform fetch failures so the dashboard can show a banner
  // instead of silently rendering zeros.
  var warnings = [];
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    var campaignInfo = {};

    try {
      var listUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=name,id,objective,effective_status,created_time,start_time,stop_time&filtering=[{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\"]}]&limit=100&access_token=" + metaToken;
      var listRes = await fetch(listUrl);
      var listData = await listRes.json();
      if (listData.data) {
        for (var k = 0; k < listData.data.length; k++) {
          var camp = listData.data[k];
          campaignInfo[camp.id] = { name: camp.name, status: camp.effective_status, objective: camp.objective || "", created: new Date(camp.created_time), startTime: camp.start_time || null, stopTime: camp.stop_time || null };
        }
      }
    } catch (err) { console.error("Meta campaign list error for", account.name, err); warnings.push({ platform: "Meta", account: account.name, stage: "campaign-list", message: String(err && err.message || err) }); }

    try {
      var timeRange = JSON.stringify({since: from, until: to});
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + timeRange + "&level=campaign&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
      // Follow paging.next to capture all rows, not just the first 500.
      var allMetaRows = [];
      var nextUrl = url;
      var pageGuard = 0;
      while (nextUrl && pageGuard < 10) {
        pageGuard++;
        var pageRes = await fetch(nextUrl);
        var pageData = await pageRes.json();
        if (pageData.data) allMetaRows = allMetaRows.concat(pageData.data);
        nextUrl = pageData.paging && pageData.paging.next ? pageData.paging.next : null;
      }

      // Authoritative campaign-level reach (no breakdowns). Meta dedupes reach across
      // placements at the campaign level; summing or maxing the publisher rows isn't
      // the same number as what Ads Manager reports in its default "campaign reach"
      // view. We fetch it once here and apportion it to the merged FB / IG rows below
      // so the dashboard total matches the source of truth.
      var reachMap = {};
      try {
        var reachUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,reach&time_range=" + timeRange + "&level=campaign&limit=500&access_token=" + metaToken;
        var rAll = [];
        var rNext = reachUrl;
        var rGuard = 0;
        while (rNext && rGuard < 10) {
          rGuard++;
          var rRes = await fetch(rNext);
          if (!rRes.ok) break;
          var rJson = await rRes.json();
          if (rJson.data) rAll = rAll.concat(rJson.data);
          rNext = rJson.paging && rJson.paging.next ? rJson.paging.next : null;
        }
        rAll.forEach(function(row) { reachMap[String(row.campaign_id)] = parseInt(row.reach || 0); });
      } catch (_) { /* non-fatal */ }

      // Merge publisher rows into one row per (campaign_id, platform family).
      // audience_network + messenger + oculus collapse into Facebook. threads into
      // Instagram. This matches Meta Ads Manager's default "Facebook" view (which is
      // inclusive of AN + Messenger) and stops those placements from being silently dropped.
      var mapPubToPlat = function(pub) {
        var p = (pub || "facebook").toLowerCase();
        if (p === "instagram" || p === "threads") return "Instagram";
        if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
        return null;
      };
      var rowMap = {};

      if (allMetaRows.length > 0) {
        for (var j = 0; j < allMetaRows.length; j++) {
          var c = allMetaRows[j];
          if (!(parseFloat(c.impressions) > 0 || parseFloat(c.spend) > 0)) continue;
          var platName = mapPubToPlat(c.publisher_platform || "facebook");
          if (!platName) continue;
          var uniqueId = c.campaign_id + "_" + platName.toLowerCase();
          seenIds[c.campaign_id] = true;

          // Raw Meta objective string + canonical key. Exposing `objective`
          // on each row lets downstream consumers (email-share aggregation,
          // chat, etc.) scope outcome counts by objective without re-doing
          // name detection.
          var rawMetaObj = String((campaignInfo[c.campaign_id] || {}).objective || "").toUpperCase();
          var isFbPlacement = platName === "Facebook";
          var canonObj = (function() {
            var o = rawMetaObj;
            if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
            if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads";
            if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers";
            if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage";
            if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads";
            // Name-based fallback mirrors ads.js detectObjective().
            var nm = (c.campaign_name || "").toLowerCase();
            if (nm.indexOf("appinstal") >= 0 || nm.indexOf("app install") >= 0 || nm.indexOf("app_install") >= 0) return "appinstall";
            if (nm.indexOf("follower") >= 0 || nm.indexOf("_like_") >= 0 || nm.indexOf("_like ") >= 0 || nm.indexOf("paidsocial_like") >= 0 || nm.indexOf("like_facebook") >= 0 || nm.indexOf("like_instagram") >= 0) return "followers";
            if (nm.indexOf("lead") >= 0 || nm.indexOf("pos") >= 0) return "leads";
            if (nm.indexOf("homeloan") >= 0 || nm.indexOf("traffic") >= 0 || nm.indexOf("paidsearch") >= 0) return "landingpage";
            return "landingpage";
          })();

          var leads = 0, appInstalls = 0, landingPageViews = 0, pageLikes = 0, reactionLikes = 0, pageFollows = 0;
          if (c.actions) {
            for (var a = 0; a < c.actions.length; a++) {
              var act = c.actions[a];
              if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead" || act.action_type === "onsite_conversion.lead_grouped" || act.action_type === "offsite_complete_registration_add_meta_leads") {
                leads = Math.max(leads, parseInt(act.value));
              }
              if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install" || act.action_type === "mobile_app_install" || act.action_type === "omni_app_install") {
                appInstalls = Math.max(appInstalls, parseInt(act.value));
              }
              if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") {
                landingPageViews = Math.max(landingPageViews, parseInt(act.value));
              }
              // "page_like" is the unambiguous page-like action. "like" is
              // POST REACTIONS (hearts/likes on the post itself) for all
              // non-follower campaigns, counting those as page likes would
              // wildly inflate follower counts on engagement-heavy creative.
              if (act.action_type === "page_like") pageLikes = Math.max(pageLikes, parseInt(act.value));
              if (act.action_type === "like") reactionLikes = Math.max(reactionLikes, parseInt(act.value));
              if (act.action_type === "page_engagement") pageFollows = Math.max(pageFollows, parseInt(act.value));
            }
          }
          // Fold reactions into page likes for any follower-family campaign
          // on an FB placement. Covers strict PAGE_LIKES and the modern
          // OUTCOME_ENGAGEMENT objective (ODAX consolidated these in 2022+).
          // The placement check keeps IG post hearts out of the count on
          // broader engagement-family campaigns that run on IG too.
          if (canonObj === "followers" && isFbPlacement && reactionLikes > pageLikes) pageLikes = reactionLikes;

          if (!rowMap[uniqueId]) {
            rowMap[uniqueId] = {
              platform: platName,
              metaPlatform: platName.toLowerCase(),
              accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""),
              accountId: account.id,
              campaignId: uniqueId,
              rawCampaignId: c.campaign_id,
              campaignName: c.campaign_name,
              objective: canonObj,
              _sumImpressions: 0, _sumSpend: 0, _sumClicks: 0, _sumReachPublisher: 0,
              leads: 0, appInstalls: 0, landingPageViews: 0, pageLikes: 0, pageFollows: 0,
              actions: []
            };
          }
          var row = rowMap[uniqueId];
          row._sumImpressions += parseFloat(c.impressions || 0);
          row._sumSpend += parseFloat(c.spend || 0);
          row._sumClicks += parseFloat(c.clicks || 0);
          row._sumReachPublisher += parseFloat(c.reach || 0);
          row.leads = Math.max(row.leads, leads);
          row.appInstalls = Math.max(row.appInstalls, appInstalls);
          row.landingPageViews = Math.max(row.landingPageViews, landingPageViews);
          row.pageLikes = Math.max(row.pageLikes, pageLikes);
          row.pageFollows = Math.max(row.pageFollows, pageFollows);
          if (c.actions) row.actions = row.actions.concat(c.actions);
        }
      }

      // Apportion authoritative campaign reach across merged FB / IG rows by
      // impression share so the dashboard total matches the authoritative number.
      // Fallback to the summed publisher reach when authoritative isn't available.
      var campTotalImps = {};
      Object.keys(rowMap).forEach(function(k) {
        var r = rowMap[k];
        campTotalImps[r.rawCampaignId] = (campTotalImps[r.rawCampaignId] || 0) + r._sumImpressions;
      });

      Object.keys(rowMap).forEach(function(k) {
        var r = rowMap[k];
        var authReach = reachMap[String(r.rawCampaignId)];
        var totalImps = campTotalImps[r.rawCampaignId] || 0;
        var reachForRow;
        if (authReach && totalImps > 0) {
          reachForRow = Math.round(authReach * (r._sumImpressions / totalImps));
        } else {
          reachForRow = r._sumReachPublisher;
        }
        var impsStr = r._sumImpressions.toString();
        var spendStr = r._sumSpend.toFixed(2);
        var clicksStr = r._sumClicks.toString();
        var reachStr = reachForRow.toString();
        var cpm = r._sumImpressions > 0 ? ((r._sumSpend / r._sumImpressions) * 1000).toFixed(2) : "0";
        var cpc = r._sumClicks > 0 ? (r._sumSpend / r._sumClicks).toFixed(2) : "0";
        var ctr = r._sumImpressions > 0 ? ((r._sumClicks / r._sumImpressions) * 100).toFixed(2) : "0";
        var freq = reachForRow > 0 ? (r._sumImpressions / reachForRow).toFixed(2) : "0";
        allCampaigns.push({
          platform: r.platform,
          metaPlatform: r.metaPlatform,
          accountName: r.accountName,
          accountId: r.accountId,
          campaignId: r.campaignId,
          rawCampaignId: r.rawCampaignId,
          campaignName: r.campaignName,
          objective: r.objective || "landingpage",
          impressions: impsStr,
          reach: reachStr,
          frequency: freq,
          spend: spendStr,
          cpm: cpm,
          cpc: cpc,
          ctr: ctr,
          clicks: clicksStr,
          leads: r.leads.toString(),
          appInstalls: r.appInstalls.toString(),
          landingPageViews: r.landingPageViews.toString(),
          pageLikes: r.pageLikes.toString(),
          pageFollows: r.pageFollows.toString(),
          costPerLead: r.leads > 0 ? (r._sumSpend / r.leads).toFixed(2) : "0",
          costPerInstall: r.appInstalls > 0 ? (r._sumSpend / r.appInstalls).toFixed(2) : "0",
          actions: r.actions || [],
          startDate: campaignInfo[r.rawCampaignId] && campaignInfo[r.rawCampaignId].startTime ? campaignInfo[r.rawCampaignId].startTime.substring(0,10) : "",
          endDate: campaignInfo[r.rawCampaignId] && campaignInfo[r.rawCampaignId].stopTime ? campaignInfo[r.rawCampaignId].stopTime.substring(0,10) : "",
          status: campaignInfo[r.rawCampaignId] ? campaignInfo[r.rawCampaignId].status.toLowerCase().replace('campaign_paused','paused').replace('adset_paused','paused') : "active"
        });
      });
    } catch (err) { console.error("Meta insights error for", account.name, err); warnings.push({ platform: "Meta", account: account.name, stage: "insights", message: String(err && err.message || err) }); }

    Object.keys(campaignInfo).forEach(function(cid) {
      if (!seenIds[cid] && campaignInfo[cid] && campaignInfo[cid].status === "SCHEDULED") {
        allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""), accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: campaignInfo[cid].name, objective: objectiveFromName(campaignInfo[cid].name), impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled" });
      }
    });
  }

  try {
    var ttNames = {};
    var ttStatuses = {};
    var ttListUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=100";
    var ttListRes = await fetch(ttListUrl, {headers: {"Access-Token": ttToken}});
    var ttListData = await ttListRes.json();
    if (ttListData.data && ttListData.data.list) {
      for (var l = 0; l < ttListData.data.list.length; l++) {
        var ttCamp = ttListData.data.list[l];
        ttNames[ttCamp.campaign_id] = ttCamp.campaign_name;
        ttStatuses[ttCamp.campaign_id] = ttCamp.operation_status;
      }
    }

    var dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    var metrics = encodeURIComponent(JSON.stringify(["spend","impressions","reach","clicks","cpm","cpc","ctr","follows","likes","comments","shares"]));
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + dims + "&metrics=" + metrics + "&start_date=" + from + "&end_date=" + to + "&page_size=50";
    var ttRes = await fetch(ttUrl, {headers: {"Access-Token": ttToken}});
    var ttRaw = await ttRes.text();
    var ttSeenIds = {};

    try {
      var ttData = JSON.parse(ttRaw);
      if (ttData.data && ttData.data.list) {
        for (var n = 0; n < ttData.data.list.length; n++) {
          var tc = ttData.data.list[n];
          var tm = tc.metrics;
          if (parseFloat(tm.impressions) > 0 || parseFloat(tm.spend) > 0) {
            ttSeenIds[tc.dimensions.campaign_id] = true;
            var ttStatus = ttStatuses[tc.dimensions.campaign_id] === "ENABLE" ? "active" : ttStatuses[tc.dimensions.campaign_id] === "DISABLE" ? "paused" : "completed";
            allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tc.dimensions.campaign_id, rawCampaignId: tc.dimensions.campaign_id, campaignName: ttNames[tc.dimensions.campaign_id] || "TikTok Campaign " + tc.dimensions.campaign_id, objective: objectiveFromName(ttNames[tc.dimensions.campaign_id] || ""), impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach||0)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0"), spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: (parseFloat(tm.impressions||0)>0?(parseFloat(tm.clicks||0)/parseFloat(tm.impressions)*100).toFixed(2):"0"), clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", startDate: "", endDate: "", status: ttStatus });
          }
        }
      }
    } catch (parseErr) { console.error("TikTok parse error", parseErr); }

    Object.keys(ttNames).forEach(function(tid) {
      if (!ttSeenIds[tid]) {
        allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tid, rawCampaignId: tid, campaignName: ttNames[tid], objective: objectiveFromName(ttNames[tid]), impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", follows: "0", likes: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", status: "active" });
      }
    });
  } catch (ttErr) { console.error("TikTok campaigns error", ttErr); warnings.push({ platform: "TikTok", stage: "campaigns", message: String(ttErr && ttErr.message || ttErr) }); }

  // Google Ads
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
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (gTokenData.access_token) {
        var gQuery = "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";
        var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + gTokenData.access_token,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({query: gQuery})
        });
        if (gRes.status === 200) {
          var gData = await gRes.json();
          var gResults = gData.results || [];
          for (var g = 0; g < gResults.length; g++) {
            var gr = gResults[g];
            var gc = gr.campaign;
            var gm = gr.metrics;
            var gSpend = parseFloat(gm.costMicros || 0) / 1000000;
            var gClicks = parseInt(gm.clicks || 0);
            var gImps = parseInt(gm.impressions || 0);
            var gConv = parseFloat(gm.conversions || 0);
            if (gImps > 0 || gSpend > 0) {
              var gPlatform = "Google Display";
              var gName = gc.name || "";
              if (gName.toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
              // Classify the Google campaign BEFORE pushing so we can scope
              // conversions -> leads only when it's actually a lead-gen
              // campaign. For a traffic / landing-page Google campaign,
              // Google "conversions" are typically page-engagement events
              // (button clicks, page views) not real leads, counting them
              // as leads misleads the chat bot and email reports.
              var gObjective = objectiveFromName(gName);
              var gIsLeadsCampaign = gObjective === "leads";
              allCampaigns.push({
                platform: gPlatform,
                metaPlatform: "google",
                accountName: "MTN MoMo Google",
                accountId: gCustomerId,
                campaignId: "google_" + gc.id,
                rawCampaignId: gc.id,
                campaignName: gName,
                objective: gObjective,
                impressions: gImps.toString(),
                // Google Ads does NOT expose unique-user reach. To keep the
                // blended frequency meaningful across the media mix we apply
                // a conservative industry-standard estimate of 2x frequency
                // on Google Display + YouTube, deriving reach as impressions / 2.
                // Every surface that consumes this row (charts, grand totals,
                // blended frequency) inherits the estimate automatically.
                reach: gImps > 0 ? Math.round(gImps / 2).toString() : "0",
                frequency: gImps > 0 ? "2.00" : "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                conversions: gConv.toFixed(0),
                // Leads come from Google conversions ONLY on lead-gen
                // campaigns. Traffic / landing-page campaigns often have
                // non-lead conversions (engagement, page views) that must
                // not be reported as leads.
                leads: (gIsLeadsCampaign && gConv > 0) ? Math.round(gConv).toString() : "0",
                appInstalls: "0",
                landingPageViews: "0",
                pageLikes: "0",
                follows: "0",
                likes: "0",
                costPerLead: (gIsLeadsCampaign && gConv > 0) ? (gSpend / gConv).toFixed(2) : "0",
                costPerInstall: "0",
                actions: [],
                startDate: "", endDate: "", status: gc.status === "ENABLED" ? "active" : "paused"
              });
            }
          }
        }
      }
    }
  } catch (gErr) { console.error("Google Ads error", gErr); warnings.push({ platform: "Google", stage: "ads", message: String(gErr && gErr.message || gErr) }); }

  allCampaigns.sort(function(a, b) { return parseFloat(b.spend) - parseFloat(a.spend); });

  // Fetch page follower data
  var pageData = [];
  try {
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,access_token,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + metaToken);
    var pagesJson = await pagesRes.json();
    if (pagesJson.data) {
      for (var pi = 0; pi < pagesJson.data.length; pi++) {
        var pg = pagesJson.data[pi];
        var pgToken = pg.access_token || metaToken;
        if (pg.instagram_business_account) {
          try {
            var igId = pg.instagram_business_account.id;
            var since = Math.floor(new Date(from).getTime() / 1000);
            var until = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);
            var igUrl = "https://graph.facebook.com/v25.0/" + igId + "/insights?metric=follower_count&period=day&since=" + since + "&until=" + until + "&access_token=" + pgToken;
            var igRes = await fetch(igUrl);
            if (igRes.status === 200) {
              var igData = await igRes.json();
              if (igData.data && igData.data[0] && igData.data[0].values) {
                var totalGrowth = 0;
                for (var v = 0; v < igData.data[0].values.length; v++) { totalGrowth += igData.data[0].values[v].value; }
                pg.instagram_business_account.follower_growth = totalGrowth;
              }
            }
          } catch (igErr) { console.error("IG insights error", igErr); }
        }
        delete pg.access_token;
      }
      pageData = pagesJson.data;
    }
  } catch (pgErr) { console.error("Pages error", pgErr); }


  // Build the full (unfiltered) response once, cache it keyed by date
  // range so dashboard + email preview + reconcile within the next 5 min
  // all reuse the same upstream data instead of re-fetching Meta +
  // TikTok + Google. Client-scoped filtering happens on read so admin
  // and client callers share one cache entry safely.
  var fullResponse = { totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns, pages: pageData, warnings: warnings };
  campaignsResponseCache[cacheKey] = { data: fullResponse, ts: Date.now() };

  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    var ids = principal.allowedCampaignIds || [];
    var names = principal.allowedCampaignNames || [];
    var filteredCamps = allCampaigns.filter(function(c) {
      var raw = String(c.rawCampaignId || "");
      var cid = String(c.campaignId || "");
      if (ids.indexOf(raw) >= 0 || ids.indexOf(cid) >= 0) return true;
      if (names.indexOf(c.campaignName || "") >= 0) return true;
      return false;
    });
    res.status(200).json({ totalCampaigns: filteredCamps.length, dateFrom: from, dateTo: to, campaigns: filteredCamps, pages: pageData, warnings: warnings });
    return;
  }
  res.status(200).json(fullResponse);
}