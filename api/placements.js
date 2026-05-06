import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";

// Placement-level performance breakdown. Pulls Meta insights with the
// publisher_platform + platform_position breakdown so we can attribute
// spend / impressions / clicks / actions to specific placements
// (Facebook Feed, Instagram Reels, Stories, Audience Network, etc.)
// rather than just per-platform totals. TikTok rolls up to a single
// "TikTok For You Page" row since TikTok does not expose meaningful
// sub-placements at the insights level. Google rolls up to one row
// per channel sub-type.
//
// Honours the same campaignIds filter as /api/timeseries so the
// dashboard can scope the section to the user's selected campaigns.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MTN MoMo Meta" },
  { id: "act_3600654450252189", name: "MTN Khava" },
  { id: "act_825253026181227", name: "Concord College" },
  { id: "act_1187886635852303", name: "Eden College" },
  { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
  { id: "act_542990539806888", name: "GAS Agency" }
];

var FB_BLUE = "#1877F2";
var IG_PINK = "#E1306C";
var TT_TEAL = "#00F2EA";
var GD_GREEN = "#34A853";
var YT_RED = "#FF0000";
var SEARCH_BLUE = "#4285F4";
var AN_GREY = "#65676B";
var MSGR_BLUE = "#0084FF";
var THREADS_DARK = "#000000";

function placementName(pub, pos) {
  var p = (pub || "").toLowerCase();
  var po = (pos || "").toLowerCase();
  if (p === "facebook") {
    if (po === "feed") return "Facebook Feed";
    if (po === "right_hand_column") return "Facebook Right Column";
    if (po === "instream_video") return "Facebook In-Stream Video";
    if (po === "marketplace") return "Facebook Marketplace";
    if (po === "story" || po === "stories") return "Facebook Stories";
    if (po === "facebook_reels" || po === "reels") return "Facebook Reels";
    if (po === "video_feeds") return "Facebook Video Feeds";
    if (po === "search") return "Facebook Search";
    return "Facebook " + (po ? po.replace(/_/g, " ") : "Other");
  }
  if (p === "instagram") {
    if (po === "stream" || po === "feed") return "Instagram Feed";
    if (po === "story" || po === "stories") return "Instagram Stories";
    if (po === "reels" || po === "ig_reels") return "Instagram Reels";
    if (po === "explore" || po === "explore_home") return "Instagram Explore";
    if (po === "ig_search") return "Instagram Search";
    if (po === "shop") return "Instagram Shop";
    if (po === "profile_feed") return "Instagram Profile";
    return "Instagram " + (po ? po.replace(/_/g, " ") : "Other");
  }
  if (p === "audience_network") {
    if (po === "rewarded_video") return "Audience Network Rewarded Video";
    if (po === "instream_video") return "Audience Network In-Stream";
    if (po === "classic") return "Audience Network Classic";
    return "Audience Network";
  }
  if (p === "messenger") {
    if (po === "story" || po === "stories") return "Messenger Stories";
    if (po === "messenger_home") return "Messenger Home";
    return "Messenger";
  }
  if (p === "threads") return "Threads";
  if (p === "oculus") return "Oculus";
  return ((pub || "") + " " + (pos || "")).trim() || "Unknown";
}

function placementColor(pub) {
  var p = (pub || "").toLowerCase();
  if (p === "facebook") return FB_BLUE;
  if (p === "instagram") return IG_PINK;
  if (p === "audience_network") return AN_GREY;
  if (p === "messenger") return MSGR_BLUE;
  if (p === "threads") return THREADS_DARK;
  return "#888";
}

function platformOf(pub) {
  var p = (pub || "").toLowerCase();
  if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
  if (p === "instagram" || p === "threads") return "Instagram";
  return "Other";
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;
  if (!(await checkAuth(req, res))) return;
  if (!validateDates(req, res)) return;

  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  // campaignIds query param: same matching logic as /api/timeseries.
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
  var idAllowed = function(id) {
    if (!hasSelection) return true;
    var sid = String(id || "");
    return !!(selectionIds[sid] || selectionIds[sid.replace(/^google_/, "")]);
  };

  var placements = {};
  var addRow = function(key, base, m) {
    if (!placements[key]) {
      placements[key] = Object.assign({
        key: key, spend: 0, impressions: 0, clicks: 0,
        leads: 0, appInstalls: 0, follows: 0, pageLikes: 0
      }, base);
    }
    var p = placements[key];
    p.spend += parseFloat(m.spend || 0);
    p.impressions += parseInt(m.impressions || 0);
    p.clicks += parseInt(m.clicks || 0);
    if (m.leads) p.leads = Math.max(p.leads, parseInt(m.leads));
    if (m.appInstalls) p.appInstalls = Math.max(p.appInstalls, parseInt(m.appInstalls));
    if (m.follows) p.follows += parseInt(m.follows);
    if (m.pageLikes) p.pageLikes = Math.max(p.pageLikes, parseInt(m.pageLikes));
  };

  // Meta insights with publisher_platform + platform_position breakdowns.
  if (metaToken) {
    for (var i = 0; i < META_ACCOUNTS.length; i++) {
      var acc = META_ACCOUNTS[i];
      try {
        var timeRange = JSON.stringify({ since: from, until: to });
        var url = "https://graph.facebook.com/v25.0/" + acc.id + "/insights?fields=campaign_id,impressions,clicks,spend,actions&breakdowns=publisher_platform,platform_position&time_range=" + timeRange + "&level=campaign&limit=500&access_token=" + metaToken;
        var allRows = [];
        var next = url, guard = 0;
        while (next && guard < 12) {
          guard++;
          var r = await fetch(next);
          if (!r.ok) break;
          var d = await r.json();
          if (d.data) allRows = allRows.concat(d.data);
          next = d.paging && d.paging.next ? d.paging.next : null;
        }
        allRows.forEach(function(row) {
          if (!idAllowed(row.campaign_id)) return;
          var pub = row.publisher_platform || "facebook";
          var pos = row.platform_position || "";
          var key = pub + "::" + pos;
          var leads = 0, installs = 0, follows = 0, pageLikes = 0;
          (row.actions || []).forEach(function(a) {
            var at = String(a.action_type || "").toLowerCase();
            var v = parseInt(a.value || 0);
            if (at === "lead" || at === "onsite_web_lead" || at === "offsite_conversion.fb_pixel_lead" || at === "onsite_conversion.lead_grouped" || at === "offsite_complete_registration_add_meta_leads") leads = Math.max(leads, v);
            if (at.indexOf("app_install") >= 0 || at === "mobile_app_install" || at === "omni_app_install") installs = Math.max(installs, v);
            if (at === "page_like") pageLikes = Math.max(pageLikes, v);
            if (at === "follow" || at === "onsite_conversion.follow") follows = Math.max(follows, v);
          });
          addRow(key, {
            name: placementName(pub, pos),
            platform: platformOf(pub),
            color: placementColor(pub)
          }, {
            spend: row.spend, impressions: row.impressions, clicks: row.clicks,
            leads: leads, appInstalls: installs, follows: follows, pageLikes: pageLikes
          });
        });
      } catch (e) {
        console.error("placements meta error", acc.name, e);
      }
    }
  }

  // TikTok: one placement row, the For You Page is the only meaningful
  // surface and the API does not expose sub-placement breakdown.
  if (ttToken && ttAdvId) {
    try {
      var ttDims = encodeURIComponent(JSON.stringify(["campaign_id"]));
      var ttMetrics = encodeURIComponent(JSON.stringify(["spend", "impressions", "clicks", "follows"]));
      var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + ttDims + "&metrics=" + ttMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=500";
      var ttPage = 1, ttList = [];
      while (ttPage < 10) {
        var ttRes = await fetch(ttUrl + "&page=" + ttPage, { headers: { "Access-Token": ttToken } });
        if (!ttRes.ok) break;
        var ttJson = await ttRes.json();
        var rows = (ttJson.data && ttJson.data.list) || [];
        ttList = ttList.concat(rows);
        var totalPage = (ttJson.data && ttJson.data.page_info && ttJson.data.page_info.total_page) || 1;
        if (ttPage >= totalPage) break;
        ttPage++;
      }
      ttList.forEach(function(row) {
        var cid = row.dimensions && row.dimensions.campaign_id;
        if (!idAllowed(cid)) return;
        var m = row.metrics || {};
        addRow("tiktok::fyp", {
          name: "TikTok For You Page",
          platform: "TikTok",
          color: TT_TEAL
        }, {
          spend: m.spend, impressions: m.impressions, clicks: m.clicks,
          follows: m.follows
        });
      });
    } catch (e) { console.error("placements tiktok error", e); }
  }

  // Google: roll up by channel sub-type. Single Google Ads search call
  // returns campaign-level rows we group into one placement per channel
  // (Display, YouTube, Search, Performance Max, Demand Gen).
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (gClientId && gRefreshToken && gDevToken) {
      var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var tokenData = await tokenRes.json();
      if (tokenData.access_token) {
        var query = "SELECT campaign.id, campaign.advertising_channel_type, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
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
        if (gRes.status === 200) {
          var gData = await gRes.json();
          (gData.results || []).forEach(function(r) {
            if (!idAllowed(r.campaign && r.campaign.id)) return;
            var chType = (r.campaign && r.campaign.advertisingChannelType) || "";
            var pname, color;
            if (chType === "VIDEO") { pname = "YouTube"; color = YT_RED; }
            else if (chType === "SEARCH") { pname = "Google Search"; color = SEARCH_BLUE; }
            else if (chType === "PERFORMANCE_MAX") { pname = "Performance Max"; color = "#A855F7"; }
            else if (chType === "DEMAND_GEN" || chType === "DISCOVERY") { pname = "Demand Gen"; color = "#F472B6"; }
            else { pname = "Google Display"; color = GD_GREEN; }
            var key = "google::" + chType.toLowerCase();
            addRow(key, { name: pname, platform: pname, color: color }, {
              spend: parseFloat(r.metrics.costMicros || 0) / 1000000,
              impressions: r.metrics.impressions,
              clicks: r.metrics.clicks
            });
          });
        }
      }
    }
  } catch (e) { console.error("placements google error", e); }

  var arr = Object.keys(placements).map(function(k) { return placements[k]; });
  // Drop empty rows (nothing to show when spend AND impressions are both 0).
  arr = arr.filter(function(p) { return p.spend > 0 || p.impressions > 0; });
  arr.sort(function(a, b) { return b.spend - a.spend; });

  res.status(200).json({ placements: arr, dateFrom: from, dateTo: to });
}
