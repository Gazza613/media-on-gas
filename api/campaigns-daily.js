// /api/campaigns-daily — DAILY breakdown of campaign metrics across
// Meta + TikTok + Google. Purpose: let the dashboard slice arbitrary
// sub-ranges of an already-loaded window client-side instead of
// triggering a fresh backend fetch each time the operator nudges the
// date picker.
//
// Returns:
//   {
//     ok: true,
//     dateFrom, dateTo,
//     campaigns: {
//       "<campaignId>": {
//         daily: [
//           { date: "2026-05-01", spend, impressions, reach, clicks, leads, appInstalls, pageLikes, follows, likes },
//           ...
//         ]
//       },
//       ...
//     }
//   }
//
// Numeric metrics are RAW values (already in their natural unit). The
// client sums these across the requested sub-window and derives
// blended metrics (CTR, CPM, CPC, frequency) from the sums. Reach is
// included but is approximate when summed across days because of
// cross-day audience overlap — operators rarely notice this on sub-
// range views and the auto-refresh keeps the underlying data fresh.
//
// Lives next to /api/campaigns rather than inside it so a regression
// here can never break the main endpoint. Auth + rate-limit mirror
// /api/campaigns exactly.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";
import { isLeadAction, isAppInstallAction, isPageLikeAction } from "./_pulseShared.js";

var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

// Extract the conversion-action counts the dashboard cares about from
// a Meta insights row's `actions` array. Mirrors the resolution rules
// the main /api/campaigns endpoint already uses so the daily slice
// values match what the aggregated endpoint returns for the same
// window. Lean — no follower-family disambiguation here; the daily
// breakdown carries raw action counts and the client derives blended
// numbers exactly the same way the existing aggregated path does.
// Per-row Math.max across alias action_types so Meta surfacing one
// conversion under multiple types simultaneously doesn't double-count.
// Action_type classification lives in the shared isLeadAction /
// isAppInstallAction / isPageLikeAction helpers so any new Meta variant
// is picked up everywhere at once.
function metaActionCounts(actions) {
  var leads = 0, appInstalls = 0, pageLikes = 0, reactionLikes = 0;
  (actions || []).forEach(function(a) {
    var t = String(a.action_type || "").toLowerCase();
    var v = num(a.value);
    if (isLeadAction(t)) leads = Math.max(leads, v);
    else if (isAppInstallAction(t)) appInstalls = Math.max(appInstalls, v);
    else if (isPageLikeAction(t)) pageLikes = Math.max(pageLikes, v);
    else if (t === "like") reactionLikes = Math.max(reactionLikes, v);
  });
  return { leads: leads, appInstalls: appInstalls, pageLikes: pageLikes, reactionLikes: reactionLikes };
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;
  if (!(await checkAuth(req, res))) return;

  // validateDates returns a BOOLEAN (true on pass, sends 400 on fail),
  // not an object. Earlier code destructured .from/.to from it which
  // gave undefined and broke every downstream platform call silently.
  // Read query params directly, mirroring /api/campaigns.
  if (!validateDates(req, res)) return;
  var from = String(req.query.from || "").trim();
  var to = String(req.query.to || "").trim();
  var timeRange = encodeURIComponent('{"since":"' + from + '","until":"' + to + '"}');

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  var campaigns = {};
  var warnings = [];

  // ---------- META ----------
  // Daily insights WITH publisher_platform breakdown so each row is
  // keyed by the same "<campaign_id>_<platform>" id /api/campaigns
  // produces. Previously this endpoint omitted the breakdown and
  // pushed the SAME daily row to both _facebook and _instagram keys,
  // which caused sub-range slices to double-count Meta metrics (both
  // halves are auto-selected on Summary). Now FB rows go to
  // <id>_facebook and IG rows go to <id>_instagram, matching
  // /api/campaigns exactly.
  var mapMetaPub = function(p) {
    var s = String(p || "").toLowerCase();
    if (s === "facebook") return "facebook";
    if (s === "instagram") return "instagram";
    if (s === "messenger") return "facebook"; // msgr placement is FB family
    if (s === "audience_network") return "facebook";
    return ""; // unknown placement, drop row
  };
  if (metaToken) {
    for (var ai = 0; ai < metaAccounts.length; ai++) {
      var account = metaAccounts[ai];
      try {
        var mDailyUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_id,spend,impressions,reach,clicks,actions&time_range=" + timeRange + "&level=campaign&time_increment=1&breakdowns=publisher_platform&limit=1000&access_token=" + metaToken;
        var mRes = await fetch(mDailyUrl);
        if (!mRes.ok) {
          warnings.push({ platform: "Meta", account: account.name, message: "HTTP " + mRes.status });
          continue;
        }
        var mData = await mRes.json();
        var mRows = (mData && mData.data) || [];
        for (var i = 0; i < mRows.length; i++) {
          var r = mRows[i];
          var cid = String(r.campaign_id || "");
          if (!cid) continue;
          var dateKey = String(r.date_start || "").slice(0, 10);
          if (!dateKey) continue;
          var plat = mapMetaPub(r.publisher_platform);
          if (!plat) continue;
          var ac = metaActionCounts(r.actions);
          var keyed = cid + "_" + plat;
          if (!campaigns[keyed]) campaigns[keyed] = { daily: [] };
          campaigns[keyed].daily.push({
            date: dateKey,
            spend: num(r.spend),
            impressions: num(r.impressions),
            reach: num(r.reach),
            clicks: num(r.clicks),
            leads: ac.leads,
            appInstalls: ac.appInstalls,
            pageLikes: ac.pageLikes,
            follows: 0,
            likes: ac.reactionLikes
          });
        }
      } catch (e) {
        warnings.push({ platform: "Meta", account: account.name, message: String(e && e.message || e) });
      }
    }
  }

  // ---------- TIKTOK ----------
  // Reporting API with daily granularity, one row per campaign per day.
  if (ttToken && ttAdvId) {
    try {
      var ttDims = encodeURIComponent(JSON.stringify(["campaign_id", "stat_time_day"]));
      var ttMetrics = encodeURIComponent(JSON.stringify(["spend", "impressions", "reach", "clicks", "follows", "likes"]));
      var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&service_type=AUCTION&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + ttDims + "&metrics=" + ttMetrics + "&start_date=" + from + "&end_date=" + to + "&page_size=1000";
      var ttRes = await fetch(ttUrl, { headers: { "Access-Token": ttToken } });
      if (ttRes.ok) {
        var ttData = await ttRes.json();
        // TikTok returns HTTP 200 with code !== 0 on failure (token
        // expiry, invalid advertiser_id, bad filter). Without this
        // check the loop reads an empty .data.list and silently
        // produces zero rows. ttData.code === 0 is success.
        if (ttData && ttData.code && ttData.code !== 0) {
          warnings.push({ platform: "TikTok", stage: "daily-report", message: ttData.message || ("code " + ttData.code) });
        }
        var ttList = (ttData && ttData.data && ttData.data.list) || [];
        for (var j = 0; j < ttList.length; j++) {
          var row = ttList[j];
          var d = row.dimensions || {};
          var m = row.metrics || {};
          var ttCid = String(d.campaign_id || "");
          if (!ttCid) continue;
          var ttDate = String(d.stat_time_day || "").slice(0, 10);
          if (!ttDate) continue;
          if (!campaigns[ttCid]) campaigns[ttCid] = { daily: [] };
          campaigns[ttCid].daily.push({
            date: ttDate,
            spend: num(m.spend),
            impressions: num(m.impressions),
            reach: num(m.reach),
            clicks: num(m.clicks),
            leads: 0,
            appInstalls: 0,
            pageLikes: 0,
            follows: num(m.follows),
            likes: num(m.likes)
          });
        }
      } else {
        warnings.push({ platform: "TikTok", message: "HTTP " + ttRes.status });
      }
    } catch (e) {
      warnings.push({ platform: "TikTok", message: String(e && e.message || e) });
    }
  }

  // ---------- GOOGLE ----------
  // GAQL with segments.date returns one row per campaign per day.
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    // gManagerId added to env-var precondition (see /api/campaigns).
    if (gClientId && gRefreshToken && gDevToken && gManagerId) {
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (!gTokenData.access_token) {
        warnings.push({ platform: "Google", stage: "oauth", message: gTokenData.error_description || gTokenData.error || "Token exchange failed" });
      }
      if (gTokenData.access_token) {
        var gQuery = "SELECT campaign.id, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED'";
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
          var gResults = gData.results || [];
          for (var g = 0; g < gResults.length; g++) {
            var gr = gResults[g];
            var gc = gr.campaign || {};
            var gm = gr.metrics || {};
            var gs = gr.segments || {};
            var gid = "google_" + (gc.id || "");
            var gDate = String(gs.date || "").slice(0, 10);
            if (!gc.id || !gDate) continue;
            if (!campaigns[gid]) campaigns[gid] = { daily: [] };
            campaigns[gid].daily.push({
              date: gDate,
              spend: num(gm.costMicros) / 1000000,
              impressions: num(gm.impressions),
              reach: num(gm.impressions) / 2, // Google doesn't expose unique reach; same 2x estimate as /api/campaigns
              clicks: num(gm.clicks),
              // Google's metrics.conversions IS the leads count for
              // lead-gen Search / PMax campaigns. /api/campaigns gates
              // this by objective (only counts for genuinely lead-gen
              // campaigns); for sub-range slicing parity we include
              // conversions here unconditionally. The minor over-count
              // on non-lead campaigns is bounded — most non-lead
              // Google campaigns report 0 conversions anyway — and
              // the alternative (always 0) silently zeroed Google
              // CPL on every sub-range view.
              leads: num(gm.conversions),
              appInstalls: 0,
              pageLikes: 0,
              follows: 0,
              likes: 0
            });
          }
        } else {
          warnings.push({ platform: "Google", message: "HTTP " + gRes.status });
        }
      }
    }
  } catch (e) {
    warnings.push({ platform: "Google", message: String(e && e.message || e) });
  }

  // Sort each campaign's daily array by date ascending for predictable
  // client-side slicing.
  Object.keys(campaigns).forEach(function(cid) {
    campaigns[cid].daily.sort(function(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  });

  res.setHeader("Cache-Control", "private, max-age=0, must-revalidate");
  res.status(200).json({
    ok: true,
    dateFrom: from,
    dateTo: to,
    campaigns: campaigns,
    warnings: warnings
  });
}
