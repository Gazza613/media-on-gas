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

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";
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
      var listUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=name,id,effective_status,created_time,start_time,stop_time&filtering=[{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\"]}]&limit=100&access_token=" + metaToken;
      var listRes = await fetch(listUrl);
      var listData = await listRes.json();
      if (listData.data) {
        for (var k = 0; k < listData.data.length; k++) {
          var camp = listData.data[k];
          campaignInfo[camp.id] = { name: camp.name, status: camp.effective_status, created: new Date(camp.created_time), startTime: camp.start_time || null, stopTime: camp.stop_time || null };
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

          var leads = 0, appInstalls = 0, landingPageViews = 0, pageLikes = 0, pageFollows = 0;
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
              if (act.action_type === "like") pageLikes = Math.max(pageLikes, parseInt(act.value));
              if (act.action_type === "page_engagement") pageFollows = Math.max(pageFollows, parseInt(act.value));
            }
          }

          if (!rowMap[uniqueId]) {
            rowMap[uniqueId] = {
              platform: platName,
              metaPlatform: platName.toLowerCase(),
              accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""),
              accountId: account.id,
              campaignId: uniqueId,
              rawCampaignId: c.campaign_id,
              campaignName: c.campaign_name,
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
        allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name + (account.name.indexOf("Meta")<0&&account.name.indexOf("meta")<0?" Meta":""), accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: campaignInfo[cid].name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled" });
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
            allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tc.dimensions.campaign_id, rawCampaignId: tc.dimensions.campaign_id, campaignName: ttNames[tc.dimensions.campaign_id] || "TikTok Campaign " + tc.dimensions.campaign_id, impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach||0)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0"), spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: (parseFloat(tm.impressions||0)>0?(parseFloat(tm.clicks||0)/parseFloat(tm.impressions)*100).toFixed(2):"0"), clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", startDate: "", endDate: "", status: ttStatus });
          }
        }
      }
    } catch (parseErr) { console.error("TikTok parse error", parseErr); }

    Object.keys(ttNames).forEach(function(tid) {
      if (!ttSeenIds[tid]) {
        allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tid, rawCampaignId: tid, campaignName: ttNames[tid], impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", follows: "0", likes: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", status: "active" });
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
              allCampaigns.push({
                platform: gPlatform,
                metaPlatform: "google",
                accountName: "MTN MoMo Google",
                accountId: gCustomerId,
                campaignId: "google_" + gc.id,
                rawCampaignId: gc.id,
                campaignName: gName,
                impressions: gImps.toString(),
                reach: "0",
                frequency: "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                conversions: gConv.toFixed(0),
                // Google Ads reports conversions at the campaign level; for PaidSearch
                // and Display lead-gen campaigns this IS the leads count. Reconcile
                // and ads.js treat it identically, so campaigns.js must map it here
                // or the dashboard shows 0 leads while source-of-truth shows the real count.
                leads: gConv > 0 ? Math.round(gConv).toString() : "0",
                appInstalls: "0",
                landingPageViews: "0",
                pageLikes: "0",
                follows: "0",
                likes: "0",
                costPerLead: gConv > 0 ? (gSpend / gConv).toFixed(2) : "0",
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


  // Client-scoped filtering: if request came from a client share token, restrict output
  // to the campaigns on that token's allowlist. Admin requests are not filtered.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    var ids = principal.allowedCampaignIds || [];
    var names = principal.allowedCampaignNames || [];
    allCampaigns = allCampaigns.filter(function(c) {
      var raw = String(c.rawCampaignId || "");
      var cid = String(c.campaignId || "");
      if (ids.indexOf(raw) >= 0 || ids.indexOf(cid) >= 0) return true;
      if (names.indexOf(c.campaignName || "") >= 0) return true;
      return false;
    });
  }
  res.status(200).json({ totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns, pages: pageData, warnings: warnings });
}