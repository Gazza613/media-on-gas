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

// Mirror the exact rules from api/ads.js so the audit matches runtime behaviour.
function detectObjectiveFromName(campaignName) {
  var n = (campaignName || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) {
    return { obj: "Click to App Install", source: "name keyword: 'appinstall' / 'app install'" };
  }
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) {
    return { obj: "Followers & Likes", source: "name keyword: 'follower' / '_like_' / 'paidsocial_like'" };
  }
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) {
    return { obj: "Lead Generation", source: "name keyword: 'lead' / 'pos'" };
  }
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) {
    return { obj: "Landing Page Clicks", source: "name keyword: 'homeloan' / 'traffic' / 'paidsearch'" };
  }
  return { obj: "Landing Page Clicks", source: "default fallback (no keyword match)" };
}

function mapMetaObjective(metaObj) {
  if (!metaObj) return null;
  var o = String(metaObj).toUpperCase();
  if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "Click to App Install";
  if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "Lead Generation";
  if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "Followers & Likes";
  if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "Landing Page Clicks";
  if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "Lead Generation";
  return null;
}

function mapTikTokObjective(ttObj) {
  if (!ttObj) return null;
  var o = String(ttObj).toUpperCase();
  if (o.indexOf("APP_PROMOTION") >= 0 || o.indexOf("APP_INSTALL") >= 0) return "Click to App Install";
  if (o === "LEAD_GENERATION" || o === "WEB_CONVERSIONS" || o === "CONVERSIONS") return "Lead Generation";
  if (o === "COMMUNITY_INTERACTION" || o === "ENGAGEMENT" || o === "PAGE_VISITS") return "Followers & Likes";
  if (o === "TRAFFIC" || o === "REACH" || o === "VIDEO_VIEW" || o === "VIDEO_VIEWS") return "Landing Page Clicks";
  return null;
}

async function fetchMeta(account, token) {
  try {
    var url = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,name,objective,status,effective_status&limit=500&access_token=" + token;
    var r = await fetch(url);
    if (!r.ok) return [];
    var data = await r.json();
    if (!data.data) return [];
    return data.data.map(function(c) {
      var apiMapped = mapMetaObjective(c.objective);
      var classification = apiMapped
        ? { obj: apiMapped, source: "Meta API objective: " + c.objective }
        : detectObjectiveFromName(c.name);
      return {
        platform: "Meta",
        accountName: account.name,
        campaignId: c.id,
        campaignName: c.name || "(unnamed)",
        apiObjective: c.objective || "",
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        status: c.effective_status || c.status || ""
      };
    });
  } catch (err) {
    console.error("Meta audit fetch error", account.name, err);
    return [];
  }
}

async function fetchTikTok(advId, token) {
  try {
    var fields = encodeURIComponent(JSON.stringify(["campaign_id", "campaign_name", "objective_type", "operation_status"]));
    var url = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + advId + "&fields=" + fields + "&page_size=200";
    var r = await fetch(url, { headers: { "Access-Token": token } });
    if (!r.ok) return [];
    var data = await r.json();
    if (!data.data || !data.data.list) return [];
    return data.data.list.map(function(c) {
      var apiMapped = mapTikTokObjective(c.objective_type);
      var classification = apiMapped
        ? { obj: apiMapped, source: "TikTok API objective_type: " + c.objective_type }
        : detectObjectiveFromName(c.campaign_name);
      return {
        platform: "TikTok",
        accountName: "MTN MoMo TikTok",
        campaignId: String(c.campaign_id || ""),
        campaignName: c.campaign_name || "(unnamed)",
        apiObjective: c.objective_type || "",
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        status: c.operation_status || ""
      };
    });
  } catch (err) {
    console.error("TikTok audit fetch error", err);
    return [];
  }
}

async function fetchGoogle() {
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
    var query = "SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.advertising_channel_sub_type FROM campaign WHERE campaign.status != 'REMOVED'";
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
    return rows.map(function(r) {
      var chType = (r.campaign.advertisingChannelType || "").toUpperCase();
      var chSub = (r.campaign.advertisingChannelSubType || "").toUpperCase();
      var platform = "Google Display";
      if (chType === "VIDEO" || chSub.indexOf("VIDEO") >= 0) platform = "YouTube";
      else if (chType === "SEARCH") platform = "Google Search";
      else if (chType === "PERFORMANCE_MAX") platform = "Performance Max";
      else if (chType === "DISCOVERY" || chType === "DEMAND_GEN") platform = "Demand Gen";
      var name = r.campaign.name || "(unnamed)";
      var classification;
      if (chSub.indexOf("APP") >= 0 || chSub.indexOf("APP_INSTALL") >= 0) {
        classification = { obj: "Click to App Install", source: "Google advertising_channel_sub_type: " + chSub };
      } else {
        classification = detectObjectiveFromName(name);
      }
      return {
        platform: platform,
        accountName: "MTN MoMo Google",
        campaignId: String(r.campaign.id || ""),
        campaignName: name,
        apiObjective: chType + (chSub ? (" / " + chSub) : ""),
        detectedObjective: classification.obj,
        classificationSource: classification.source,
        status: r.campaign.status || ""
      };
    });
  } catch (err) {
    console.error("Google audit fetch error", err);
    return [];
  }
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 100 })) return;
  if (!checkAuth(req, res)) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  // Fetch everything in parallel.
  var tasks = [];
  if (metaToken) {
    META_ACCOUNTS.forEach(function(acc) { tasks.push(fetchMeta(acc, metaToken)); });
  }
  if (ttToken && ttAdvId) {
    tasks.push(fetchTikTok(ttAdvId, ttToken));
  }
  tasks.push(fetchGoogle());

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
