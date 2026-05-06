import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Admin-only. Returns every campaign from every platform with its detected
// objective and the reason for that classification. Managers use this to
// verify the accuracy of objective reporting, which is the core client KPI.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MTN MoMo Meta" },
  { id: "act_3600654450252189", name: "MTN Khava" },
  { id: "act_825253026181227", name: "Concord College" },
  { id: "act_1187886635852303", name: "Eden College" },
  { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
  { id: "act_542990539806888", name: "GAS Agency" }
];

// Mirror the exact rules the Summary tab uses via api/campaigns.js.
// Bucket names intentionally match the Summary labels so Audit and
// Summary are directly comparable ("Leads" not "Lead Generation",
// "Unclassified" rather than silently defaulting to Landing Page).
// Name-based classification, mirrors the rest of the backend
// (api/campaigns.js, api/ads.js, api/timeseries.js, api/reconcile.js).
// Lead/POS matching tightened to require word-boundary patterns so a
// substring match cannot false-flag (e.g. "PaidSocial" must never
// resolve to a Lead campaign).
function detectObjectiveFromName(campaignName) {
  var n = (campaignName || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0
      || n.indexOf("app-install") >= 0 || n.indexOf("app_campaign") >= 0 || n.indexOf("app campaign") >= 0
      || n.indexOf("appcampaign") >= 0 || n.indexOf("app_promo") >= 0 || n.indexOf("app promo") >= 0
      || n.indexOf("appprom") >= 0 || n.indexOf("app_promotion") >= 0 || n.indexOf("app promotion") >= 0
      || n.indexOf("app_download") >= 0 || n.indexOf("app download") >= 0 || n.indexOf("uac") >= 0
      || n.indexOf("googleapp") >= 0 || n.indexOf("google_app") >= 0 || n.indexOf("google app") >= 0) {
    return { obj: "Clicks to App Store", source: "name keyword: app install / app campaign / UAC / app promo" };
  }
  if (n.indexOf("follower") >= 0 || n.indexOf("_follow_") >= 0 || n.indexOf("_follow ") >= 0 || n.indexOf("|follow") >= 0 || n.indexOf("like&follow") >= 0 || n.indexOf("like_follow") >= 0 || n.indexOf("like+follow") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) {
    return { obj: "Followers & Likes", source: "name keyword: 'follower' / 'like&follow' / '_like_' / '_follow_'" };
  }
  if (n.indexOf("lead_gen") >= 0 || n.indexOf("_lead_") >= 0 || n.indexOf("_lead ") >= 0 || n.indexOf(" lead ") >= 0 || n.indexOf("|lead") >= 0 || n.indexOf("_pos_") >= 0 || n.indexOf(" pos ") >= 0 || n.indexOf("|pos") >= 0 || n.indexOf("momo pos") >= 0) {
    return { obj: "Leads", source: "name keyword: 'lead_gen' / '_lead_' / '_pos_' / 'momo pos'" };
  }
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) {
    return { obj: "Landing Page Clicks", source: "name keyword: 'homeloan' / 'traffic' / 'paidsearch'" };
  }
  return { obj: "Unclassified", source: "no name keyword matched" };
}

function mapMetaObjective(metaObj) {
  if (!metaObj) return null;
  var o = String(metaObj).toUpperCase();
  if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "Clicks to App Store";
  if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "Leads";
  if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "Followers & Likes";
  if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "Landing Page Clicks";
  if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "Leads";
  return null;
}

// Discrepancy state per row. Tells the operator at a glance how the
// final classification was reached:
//   agrees         — name tag and API objective both pointed to the
//                    same verdict (or only one signal was present and
//                    it succeeded).
//   name_overrode  — name tag and API objective DISAGREED, name won.
//                    This is the row to eyeball, the team named it
//                    one thing, the platform considers it another.
//   api_fallback   — no name keyword matched, the platform's API
//                    objective was used as the fallback.
//   unclassified   — neither name keyword nor API objective produced
//                    a verdict. Falls into the dashboard's
//                    "unknown / dropped" bucket.
function computeDiscrepancy(nameObj, apiObj) {
  var nameMatched = nameObj && nameObj !== "Unclassified";
  if (!nameMatched && !apiObj) return "unclassified";
  if (!nameMatched && apiObj) return "api_fallback";
  if (nameMatched && !apiObj) return "agrees";
  return nameObj === apiObj ? "agrees" : "name_overrode";
}

function mapTikTokObjective(ttObj) {
  if (!ttObj) return null;
  var o = String(ttObj).toUpperCase();
  if (o.indexOf("APP_PROMOTION") >= 0 || o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP") >= 0) return "Clicks to App Store";
  if (o === "LEAD_GENERATION" || o === "WEB_CONVERSIONS" || o === "CONVERSIONS") return "Leads";
  if (o === "COMMUNITY_INTERACTION" || o === "ENGAGEMENT" || o === "PAGE_VISITS") return "Followers & Likes";
  if (o === "TRAFFIC" || o === "REACH" || o === "VIDEO_VIEW" || o === "VIDEO_VIEWS") return "Landing Page Clicks";
  return null;
}

async function fetchMeta(account, token, activeFrom, activeTo) {
  try {
    // Fetch campaigns + recent-activity campaign_ids in parallel.
    var campsUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,name,objective,status,effective_status&limit=500&access_token=" + token;
    var activityUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id&level=campaign&time_range={\"since\":\"" + activeFrom + "\",\"until\":\"" + activeTo + "\"}&limit=500&access_token=" + token;
    var results = await Promise.all([fetch(campsUrl), fetch(activityUrl)]);
    var campsRes = results[0], actRes = results[1];
    if (!campsRes.ok) return [];
    var campsData = await campsRes.json();
    if (!campsData.data) return [];
    var activeSet = {};
    if (actRes.ok) {
      var actData = await actRes.json();
      if (actData.data) actData.data.forEach(function(row) { if (row.campaign_id) activeSet[String(row.campaign_id)] = true; });
    }
    var rows = [];
    campsData.data.forEach(function(c) {
      var isActive = (c.effective_status === "ACTIVE");
      var recentlyActive = !!activeSet[String(c.id)];
      if (!isActive && !recentlyActive) return;
      // Name-first classification, mirrors api/campaigns.js + api/ads.js
      // + api/timeseries.js + api/reconcile.js. The team's naming
      // convention is authoritative, Meta's API objective is the
      // fallback for campaigns without a recognised name tag. This
      // stops Home-Loan Traffic campaigns (Meta classifies as
      // LEAD_GENERATION but the team tagged "_Traffic_") from being
      // miscategorised as Leads in the audit while the rest of the
      // dashboard treats them as Landing Page.
      var nameClass = detectObjectiveFromName(c.name);
      var apiMapped = mapMetaObjective(c.objective);
      var classification = (nameClass.obj !== "Unclassified")
        ? nameClass
        : (apiMapped
            ? { obj: apiMapped, source: "Meta API objective: " + c.objective + " (no name keyword)" }
            : nameClass);
      rows.push({
        platform: "Meta",
        accountName: account.name,
        campaignId: c.id,
        campaignName: c.name || "(unnamed)",
        apiObjective: c.objective || "",
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        nameVerdict: nameClass.obj,
        apiVerdict: apiMapped || null,
        discrepancy: computeDiscrepancy(nameClass.obj, apiMapped),
        status: c.effective_status || c.status || "",
        activeLast30Days: recentlyActive
      });
    });
    return rows;
  } catch (err) {
    console.error("Meta audit fetch error", account.name, err);
    return [];
  }
}

async function fetchTikTok(advId, token, activeFrom, activeTo) {
  try {
    var fields = encodeURIComponent(JSON.stringify(["campaign_id", "campaign_name", "objective_type", "operation_status"]));
    var campsUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + advId + "&fields=" + fields + "&page_size=200";
    var actDims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    var actMetrics = encodeURIComponent(JSON.stringify(["spend", "impressions"]));
    var activityUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + advId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + actDims + "&metrics=" + actMetrics + "&start_date=" + activeFrom + "&end_date=" + activeTo + "&page_size=200";
    var results = await Promise.all([
      fetch(campsUrl, { headers: { "Access-Token": token } }),
      fetch(activityUrl, { headers: { "Access-Token": token } })
    ]);
    var campsRes = results[0], actRes = results[1];
    if (!campsRes.ok) return [];
    var data = await campsRes.json();
    if (!data.data || !data.data.list) return [];
    var activeSet = {};
    if (actRes.ok) {
      var actData = await actRes.json();
      if (actData.data && actData.data.list) {
        actData.data.list.forEach(function(row) {
          var dim = row.dimensions || {};
          var m = row.metrics || {};
          if (dim.campaign_id && (parseFloat(m.spend || 0) > 0 || parseFloat(m.impressions || 0) > 0)) {
            activeSet[String(dim.campaign_id)] = true;
          }
        });
      }
    }
    var rows = [];
    data.data.list.forEach(function(c) {
      var cid = String(c.campaign_id || "");
      var isActive = (c.operation_status === "ENABLE");
      var recentlyActive = !!activeSet[cid];
      if (!isActive && !recentlyActive) return;
      // Name-first classification, same priority as the Meta block above.
      var ttNameClass = detectObjectiveFromName(c.campaign_name);
      var apiMapped = mapTikTokObjective(c.objective_type);
      var classification = (ttNameClass.obj !== "Unclassified")
        ? ttNameClass
        : (apiMapped
            ? { obj: apiMapped, source: "TikTok API objective_type: " + c.objective_type + " (no name keyword)" }
            : ttNameClass);
      rows.push({
        platform: "TikTok",
        accountName: "MTN MoMo TikTok",
        campaignId: cid,
        campaignName: c.campaign_name || "(unnamed)",
        apiObjective: c.objective_type || "",
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        nameVerdict: ttNameClass.obj,
        apiVerdict: apiMapped || null,
        discrepancy: computeDiscrepancy(ttNameClass.obj, apiMapped),
        status: c.operation_status || "",
        activeLast30Days: recentlyActive
      });
    });
    return rows;
  } catch (err) {
    console.error("TikTok audit fetch error", err);
    return [];
  }
}

async function fetchGoogle(activeFrom, activeTo) {
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (!gClientId || !gRefreshToken || !gDevToken) return [];
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) return [];
    // Single query: every campaign with metrics in the last 30 days OR currently enabled.
    // We ask for status + impressions over the period, then filter client-side for
    // ENABLED or impressions > 0.
    var query = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type, metrics.impressions FROM campaign WHERE campaign.status != 'REMOVED' AND segments.date BETWEEN '" + activeFrom + "' AND '" + activeTo + "'";
    var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + tokenData.access_token,
        "developer-token": gDevToken,
        "login-customer-id": gManagerId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: query })
    });
    if (gRes.status !== 200) return [];
    var gData = await gRes.json();
    var rows = gData.results || [];
    // Group by campaign id, keeping any row with impressions to flag as recently active.
    var byId = {};
    rows.forEach(function(r) {
      var id = String(r.campaign.id || "");
      if (!id) return;
      var imps = parseFloat((r.metrics || {}).impressions || 0);
      if (!byId[id]) byId[id] = { campaign: r.campaign, totalImps: 0 };
      byId[id].totalImps += imps;
    });
    // Some currently-enabled campaigns may have no impressions in the window but
    // still deserve to appear. Fetch those separately to union in.
    var enabledQuery = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type FROM campaign WHERE campaign.status = 'ENABLED'";
    var enRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + tokenData.access_token,
        "developer-token": gDevToken,
        "login-customer-id": gManagerId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: enabledQuery })
    });
    if (enRes.status === 200) {
      var enData = await enRes.json();
      (enData.results || []).forEach(function(r) {
        var id = String(r.campaign.id || "");
        if (!id) return;
        if (!byId[id]) byId[id] = { campaign: r.campaign, totalImps: 0 };
      });
    }
    var out = [];
    Object.keys(byId).forEach(function(id) {
      var r = byId[id];
      var campaign = r.campaign;
      var chType = (campaign.advertisingChannelType || "").toUpperCase();
      var chSub = (campaign.advertisingChannelSubType || "").toUpperCase();
      var platform = "Google Display";
      if (chType === "VIDEO" || chSub.indexOf("VIDEO") >= 0) platform = "YouTube";
      else if (chType === "SEARCH") platform = "Google Search";
      else if (chType === "PERFORMANCE_MAX") platform = "Performance Max";
      else if (chType === "DISCOVERY" || chType === "DEMAND_GEN") platform = "Demand Gen";
      var name = campaign.name || "(unnamed)";
      var nameClass = detectObjectiveFromName(name);
      // MULTI_CHANNEL is Google's channel type for UAC / App campaigns.
      // advertising_channel_sub_type can also contain APP_CAMPAIGN / APP_INSTALL.
      // Channel hint is rock-solid for app campaigns (the campaign type is
      // structurally enforced by Google), so it wins for app classification.
      // For everything else, name-based detection drives.
      var channelHintObj = (chType === "MULTI_CHANNEL" || chSub.indexOf("APP") >= 0) ? "Clicks to App Store" : null;
      var classification;
      if (channelHintObj) {
        classification = { obj: channelHintObj, source: "Google channel: " + chType + (chSub ? (" / " + chSub) : "") };
      } else {
        classification = nameClass;
      }
      out.push({
        platform: platform,
        accountName: "MTN MoMo Google",
        campaignId: id,
        campaignName: name,
        apiObjective: chType + (chSub ? (" / " + chSub) : ""),
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        nameVerdict: nameClass.obj,
        apiVerdict: channelHintObj,
        discrepancy: computeDiscrepancy(nameClass.obj, channelHintObj),
        status: campaign.status || "",
        activeLast30Days: r.totalImps > 0
      });
    });
    return out;
  } catch (err) {
    console.error("Google audit fetch error", err);
    return [];
  }
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 100 }))) return;
  if (!(await checkAuth(req, res))) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin" && req.authPrincipal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  // Compute a 30-day window used for the "active in last 30 days" check on
  // every platform. ISO date strings are consistent across Meta, TikTok, Google.
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  var activeFrom = thirtyDaysAgo.toISOString().slice(0, 10);
  var activeTo = now.toISOString().slice(0, 10);

  // Fetch everything in parallel.
  var tasks = [];
  if (metaToken) {
    META_ACCOUNTS.forEach(function(acc) { tasks.push(fetchMeta(acc, metaToken, activeFrom, activeTo)); });
  }
  if (ttToken && ttAdvId) {
    tasks.push(fetchTikTok(ttAdvId, ttToken, activeFrom, activeTo));
  }
  tasks.push(fetchGoogle(activeFrom, activeTo));

  var all = [];
  try {
    var batches = await Promise.all(tasks);
    batches.forEach(function(b) { if (Array.isArray(b)) all = all.concat(b); });
  } catch (err) {
    console.error("Objective audit aggregate error", err);
  }

  // Sort: platform first, then account, then campaign name
  all.sort(function(a, b) {
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
    if (a.accountName !== b.accountName) return a.accountName.localeCompare(b.accountName);
    return (a.campaignName || "").localeCompare(b.campaignName || "");
  });

  res.status(200).json({ campaigns: all, total: all.length });
}
