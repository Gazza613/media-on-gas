import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";

// Same account list as /api/ads, keep in sync
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
function mapMetaObjective(o) { if (!o) return null; o = String(o).toUpperCase(); if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall"; if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads"; if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers"; if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage"; if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads"; return null; }
function mapTikTokObjective(o) { if (!o) return null; o = String(o).toUpperCase(); if (o.indexOf("APP_PROMOTION") >= 0 || o.indexOf("APP_INSTALL") >= 0) return "appinstall"; if (o === "LEAD_GENERATION" || o === "WEB_CONVERSIONS" || o === "CONVERSIONS") return "leads"; if (o === "COMMUNITY_INTERACTION" || o === "ENGAGEMENT" || o === "PAGE_VISITS") return "followers"; if (o === "TRAFFIC" || o === "REACH" || o === "VIDEO_VIEW" || o === "VIDEO_VIEWS") return "landingpage"; return null; }

// Compute the Monday of the ISO week for a given YYYY-MM-DD string (weekly bucket)
function weekStart(ymd) {
  var d = new Date(ymd + "T00:00:00Z");
  var day = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  var diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}
function monthStart(ymd) { return ymd.substring(0, 7) + "-01"; }
function bucketKey(ymd, gran) { return gran === "month" ? monthStart(ymd) : weekStart(ymd); }

function addTo(seriesMap, platform, objective, bucket, metrics) {
  var key = platform + "||" + objective;
  if (!seriesMap[key]) seriesMap[key] = { platform: platform, objective: objective, buckets: {} };
  if (!seriesMap[key].buckets[bucket]) seriesMap[key].buckets[bucket] = { spend: 0, impressions: 0, clicks: 0, results: 0 };
  var b = seriesMap[key].buckets[bucket];
  b.spend += metrics.spend || 0;
  b.impressions += metrics.impressions || 0;
  b.clicks += metrics.clicks || 0;
  b.results += metrics.results || 0;
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;

  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";
  var granularity = (req.query.granularity || "week").toLowerCase();
  if (granularity !== "week" && granularity !== "month") granularity = "week";

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID || "7446793748044202000";

  var principal = req.authPrincipal || { role: "admin" };
  var allowedIds = {};
  var allowedNames = {};
  var isClientScoped = principal.role === "client";
  (principal.allowedCampaignIds || []).forEach(function(id) { allowedIds[String(id)] = true; });
  (principal.allowedCampaignNames || []).forEach(function(n) { allowedNames[String(n)] = true; });

  // Optional campaignIds query param lets the admin dashboard further
  // narrow the trendline to the selection on screen. When present it
  // acts as an AND filter on top of the client-scope allowlist. We
  // accept any of: suffixed (123_facebook), raw (123), or google_-
  // prefixed so the backend matches rows from every platform shape.
  var selectionIds = {};
  var hasSelection = false;
  if (req.query.campaignIds) {
    String(req.query.campaignIds).split(",").forEach(function(raw) {
      var s = raw.trim();
      if (!s) return;
      hasSelection = true;
      selectionIds[s] = true;
      selectionIds[s.replace(/_(facebook|instagram)$/, "")] = true;
      selectionIds[s.replace(/^google_/, "")] = true;
    });
  }

  var campaignAllowed = function(id, name) {
    if (isClientScoped) {
      if (!(id && allowedIds[String(id)]) && !(name && allowedNames[String(name)])) return false;
    }
    if (hasSelection) {
      var sid = String(id || "");
      if (!selectionIds[sid] && !selectionIds[sid.replace(/^google_/, "")]) return false;
    }
    return true;
  };

  var seriesMap = {};
  var debug = { meta: {}, tiktok: {}, google: {} };

  /* META, weekly time_increment via insights per account */
  if (metaToken) {
    for (var i = 0; i < metaAccounts.length; i++) {
      var account = metaAccounts[i];
      try {
        // Campaign objective map
        var campObjMap = {};
        try {
          var campUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,objective&limit=500&access_token=" + metaToken;
          var campRes = await fetch(campUrl);
          var campData = await campRes.json();
          if (campData.data) campData.data.forEach(function(c) { campObjMap[c.id] = c.objective; });
        } catch (e) {}

        // Map AN / Messenger / Oculus into Facebook family and Threads into
        // Instagram. Dropping them silently undercut timeseries totals by 2 to 5
        // percent on Advantage+ Meta flights.
        var tsMapPub = function(p) {
          p = (p || "facebook").toLowerCase();
          if (p === "instagram" || p === "threads") return "Instagram";
          if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
          return null;
        };
        var timeRange = encodeURIComponent(JSON.stringify({ since: from, until: to }));
        var incr = granularity === "month" ? "monthly" : "7";
        var insUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,actions&level=campaign&breakdowns=publisher_platform&time_range=" + timeRange + "&time_increment=" + incr + "&limit=500&access_token=" + metaToken;
        // Follow pagination for big date ranges / many campaigns.
        var metaAllRows = [];
        var insNext = insUrl;
        var insGuard = 0;
        while (insNext && insGuard < 10) {
          insGuard++;
          var insRes = await fetch(insNext);
          if (!insRes.ok) break;
          var insData = await insRes.json();
          if (insData.data) metaAllRows = metaAllRows.concat(insData.data);
          insNext = insData.paging && insData.paging.next ? insData.paging.next : null;
        }
        metaAllRows.forEach(function(row) {
          var platform = tsMapPub(row.publisher_platform);
          if (!platform) return;
          var objective = mapMetaObjective(campObjMap[row.campaign_id]) || detectObjective(row.campaign_name);
          var bucket = row.date_start;
          var spend = parseFloat(row.spend || 0);
          var imps = parseInt(row.impressions || 0);
          var clk = parseInt(row.clicks || 0);
          var results = 0;
          if (row.actions) {
            row.actions.forEach(function(a) {
              var at = String(a.action_type || "").toLowerCase();
              var v = parseInt(a.value || 0);
              if (objective === "leads" && (at === "lead" || at.indexOf("fb_pixel_lead") >= 0 || at.indexOf("onsite_conversion.lead") >= 0)) results = Math.max(results, v);
              else if (objective === "appinstall" && (at.indexOf("app_install") >= 0 || at.indexOf("mobile_app_install") >= 0)) results = Math.max(results, v);
              else if (objective === "followers" && (at === "like" || at === "page_like" || at === "follow" || at.indexOf("ig_follow") >= 0)) results = Math.max(results, v);
            });
          }
          if (objective === "landingpage" || (results === 0 && objective === "appinstall")) results = clk;
          if (!campaignAllowed(row.campaign_id, row.campaign_name)) return;
          addTo(seriesMap, platform, objective, bucket, { spend: spend, impressions: imps, clicks: clk, results: results });
        });
        debug.meta[account.name] = metaAllRows.length;
      } catch (e) { debug.meta[account.name] = "error: " + String(e); }
    }
  }

  /* TIKTOK, daily, aggregate server-side into weekly/monthly */
  if (ttToken && ttAdvId) {
    try {
      // Campaign objective map
      var ttCampObjMap = {};
      try {
        var ttCampFields = encodeURIComponent(JSON.stringify(["campaign_id", "campaign_name", "objective_type"]));
        var ttCampUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=200&fields=" + ttCampFields;
        var ttCampRes = await fetch(ttCampUrl, { headers: { "Access-Token": ttToken } });
        var ttCampData = await ttCampRes.json();
        if (ttCampData.data && ttCampData.data.list) ttCampData.data.list.forEach(function(c) { ttCampObjMap[String(c.campaign_id)] = c.objective_type; });
      } catch (e) {}

      var ttDims = encodeURIComponent(JSON.stringify(["campaign_id", "stat_time_day"]));
      var ttMetrics = encodeURIComponent(JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "follows", "likes"]));
      var ttBase = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + ttDims + "&metrics=" + ttMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=500";
      // Follow TikTok pagination, dropping pages 2+ undercounted large date ranges.
      var ttAllRows = [];
      var ttPage = 1;
      while (ttPage < 20) {
        var ttRes = await fetch(ttBase + "&page=" + ttPage, { headers: { "Access-Token": ttToken } });
        if (!ttRes.ok) break;
        var ttPageData = await ttRes.json();
        var ttList = (ttPageData.data && ttPageData.data.list) || [];
        ttAllRows = ttAllRows.concat(ttList);
        var ttTotalPage = (ttPageData.data && ttPageData.data.page_info && ttPageData.data.page_info.total_page) || 1;
        if (ttPage >= ttTotalPage) break;
        ttPage++;
      }
      var ttData = { data: { list: ttAllRows } };
      if (ttData.data && ttData.data.list) {
        ttData.data.list.forEach(function(row) {
          var d = row.dimensions || {};
          var m = row.metrics || {};
          var rawDay = d.stat_time_day || "";
          var day = (rawDay + "").split(" ")[0].split("T")[0];
          if (!day) return;
          var bucket = bucketKey(day, granularity);
          var objective = mapTikTokObjective(ttCampObjMap[String(d.campaign_id || "")]) || detectObjective(m.campaign_name);
          var spend = parseFloat(m.spend || 0);
          var imps = parseInt(m.impressions || 0);
          var clk = parseInt(m.clicks || 0);
          // TikTok "likes" metric is video hearts (engagement), NOT follows,
          // never fold them into the follower-objective result count.
          var follows = parseInt(m.follows || 0);
          var results = objective === "followers" ? follows : clk;
          if (!campaignAllowed(d.campaign_id, m.campaign_name)) return;
          addTo(seriesMap, "TikTok", objective, bucket, { spend: spend, impressions: imps, clicks: clk, results: results });
        });
      }
      debug.tiktok.rows = (ttData.data && ttData.data.list || []).length;
    } catch (e) { debug.tiktok.error = String(e); }
  }

  /* GOOGLE, daily, aggregate server-side */
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (gClientId && gRefreshToken && gDevToken) {
      var tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token" });
      var tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        var q = "SELECT campaign.id, campaign.name, campaign.advertising_channel_type, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED'";
        // Follow nextPageToken. Single-request Google fetches truncate on any
        // account with more than a page's worth of daily rows across the period.
        var gAllResults = [];
        var gPageToken = null;
        var gGuard = 0;
        do {
          gGuard++;
          var gBody = gPageToken ? { query: q, pageToken: gPageToken } : { query: q };
          var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
            method: "POST",
            headers: { "Authorization": "Bearer " + tokenData.access_token, "developer-token": gDevToken, "login-customer-id": gManagerId, "Content-Type": "application/json" },
            body: JSON.stringify(gBody)
          });
          if (gRes.status !== 200) break;
          var gData = await gRes.json();
          if (gData.results) gAllResults = gAllResults.concat(gData.results);
          gPageToken = gData.nextPageToken || null;
        } while (gPageToken && gGuard < 20);
        {
          var gData = { results: gAllResults };
          (gData.results || []).forEach(function(r) {
            var day = (r.segments && r.segments.date) || "";
            if (!day) return;
            var bucket = bucketKey(day, granularity);
            var chType = (r.campaign && r.campaign.advertisingChannelType) || "";
            var gPlatform = chType === "VIDEO" || (r.campaign.name || "").toLowerCase().indexOf("youtube") >= 0 ? "YouTube" : chType === "SEARCH" ? "Google Search" : chType === "PERFORMANCE_MAX" ? "Performance Max" : chType === "DEMAND_GEN" || chType === "DISCOVERY" ? "Demand Gen" : "Google Display";
            // Roll all Google sub-platforms into "Google" for the matrix to keep it readable
            var bucketPlat = "Google";
            var objective = detectObjective(r.campaign.name);
            var spend = parseFloat(r.metrics.costMicros || 0) / 1000000;
            var imps = parseInt(r.metrics.impressions || 0);
            var clk = parseInt(r.metrics.clicks || 0);
            var conv = Math.round(parseFloat(r.metrics.conversions || 0));
            var results = conv > 0 ? conv : clk;
            if (!campaignAllowed(r.campaign && r.campaign.id, r.campaign && r.campaign.name)) return;
            addTo(seriesMap, bucketPlat, objective, bucket, { spend: spend, impressions: imps, clicks: clk, results: results });
          });
          debug.google.rows = (gData.results || []).length;
        }
      }
    }
  } catch (e) { debug.google.error = String(e); }

  // Materialise the full bucket list across the date range so every series has zeros where
  // it didn't spend (makes sparklines line up visually).
  var allBuckets = {};
  Object.keys(seriesMap).forEach(function(k) { Object.keys(seriesMap[k].buckets).forEach(function(b) { allBuckets[b] = true; }); });
  // Also seed from date range so empty platforms still appear
  var start = new Date(from + "T00:00:00Z");
  var end = new Date(to + "T00:00:00Z");
  if (granularity === "week") {
    var s = weekStart(from);
    var cur = new Date(s + "T00:00:00Z");
    while (cur <= end) { allBuckets[cur.toISOString().split("T")[0]] = true; cur.setUTCDate(cur.getUTCDate() + 7); }
  } else {
    var ms = monthStart(from);
    var mcur = new Date(ms + "T00:00:00Z");
    while (mcur <= end) { allBuckets[mcur.toISOString().split("T")[0]] = true; mcur.setUTCMonth(mcur.getUTCMonth() + 1); }
  }
  var bucketList = Object.keys(allBuckets).sort();

  var series = Object.keys(seriesMap).map(function(k) {
    var s = seriesMap[k];
    return {
      platform: s.platform,
      objective: s.objective,
      points: bucketList.map(function(b) {
        var x = s.buckets[b] || { spend: 0, impressions: 0, clicks: 0, results: 0 };
        return { bucket: b, spend: parseFloat(x.spend.toFixed(2)), impressions: x.impressions, clicks: x.clicks, results: x.results };
      })
    };
  });

  // Echo the selection filter state so the admin can verify the
  // endpoint received and applied the campaign filter.
  debug.selectionFilter = {
    received: String(req.query.campaignIds || ""),
    hasSelection: hasSelection,
    selectionIdCount: Object.keys(selectionIds).length
  };
  res.status(200).json({ granularity: granularity, from: from, to: to, buckets: bucketList, series: series, debug: debug });
}
