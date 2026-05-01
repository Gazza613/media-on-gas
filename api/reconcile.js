import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Admin-only reconciliation endpoint. For a given date range, it pulls the
// ground-truth campaign-level aggregate from each platform's API directly
// (no breakdowns, no fancy attribution), pulls what our dashboard's /api/campaigns
// returns, and diffs the two per campaign per metric.
//
// Green  = |delta| <= 1%         (noise / FP precision / timezone slop)
// Yellow = 1% < |delta| <= 5%    (investigate, usually attribution drift)
// Red    = |delta| > 5%          (real mismatch, needs action)
//
// If called with ?alert=1 and any red rows exist, emails gary@gasmarketing.co.za
// with the flagged rows. The existing Gmail SMTP setup (GMAIL_USER +
// GMAIL_APP_PASSWORD) handles delivery.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MTN MoMo Meta" },
  { id: "act_3600654450252189", name: "MTN Khava" },
  { id: "act_825253026181227", name: "Concord College" },
  { id: "act_1187886635852303", name: "Eden College" },
  { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
  { id: "act_542990539806888", name: "GAS Agency" }
];

function pct(source, dash) {
  var s = parseFloat(source || 0);
  var d = parseFloat(dash || 0);
  if (s === 0 && d === 0) return 0;
  if (s === 0) return 100;
  return ((d - s) / s) * 100;
}
function statusOf(deltaPct) {
  var a = Math.abs(deltaPct);
  if (a <= 1) return "green";
  if (a <= 5) return "yellow";
  return "red";
}

// Match the canonical objective classifier used in api/ads.js and
// api/campaigns.js. We scope the followers-combined count by objective so
// the source-of-truth doesn't treat post reactions on a Lead Gen campaign
// as followers, which is what the dashboard (after the "like" fix) no
// longer does.
function canonicalObjective(rawMetaObj, campaignName) {
  var o = String(rawMetaObj || "").toUpperCase();
  if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
  if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS") return "leads";
  if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT" || o === "EVENT_RESPONSES") return "followers";
  if (o === "LINK_CLICKS" || o === "OUTCOME_TRAFFIC" || o === "REACH" || o === "BRAND_AWARENESS" || o === "OUTCOME_AWARENESS" || o === "VIDEO_VIEWS") return "landingpage";
  if (o === "CONVERSIONS" || o === "OUTCOME_SALES" || o === "PRODUCT_CATALOG_SALES") return "leads";
  var n = (campaignName || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) return "appinstall";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "landingpage";
  return "landingpage";
}

// Source-of-truth fetches per platform, aggregated at campaign level
async function fetchMetaTruth(token, from, to) {
  var out = [];
  await Promise.all(META_ACCOUNTS.map(async function(acc) {
    try {
      // Pull campaign objectives first so SoT can scope followers the same
      // way the dashboard does, without this map every campaign would show
      // its post reactions ("like" action) as followers and drift red.
      var objMap = {};
      try {
        var oUrl = "https://graph.facebook.com/v25.0/" + acc.id + "/campaigns?fields=id,objective,name&limit=500&access_token=" + token;
        var oNext = oUrl;
        var oGuard = 0;
        while (oNext && oGuard < 10) {
          oGuard++;
          var oR = await fetch(oNext);
          if (!oR.ok) break;
          var oD = await oR.json();
          if (oD.data) oD.data.forEach(function(c) { objMap[c.id] = c.objective || ""; });
          oNext = oD.paging && oD.paging.next ? oD.paging.next : null;
        }
      } catch (_) { /* non-fatal, falls back to name-based detection */ }

      var url = "https://graph.facebook.com/v25.0/" + acc.id + "/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,reach,actions&level=campaign&time_range={\"since\":\"" + from + "\",\"until\":\"" + to + "\"}&limit=500&access_token=" + token;
      // Follow pagination so large accounts (>500 campaigns) aren't truncated.
      var allRows = [];
      var next = url;
      var guard = 0;
      while (next && guard < 10) {
        guard++;
        var r = await fetch(next);
        if (!r.ok) break;
        var d = await r.json();
        if (d.data) allRows = allRows.concat(d.data);
        next = d.paging && d.paging.next ? d.paging.next : null;
      }
      allRows.forEach(function(row) {
        var actions = {};
        (row.actions || []).forEach(function(a) { actions[a.action_type] = parseInt(a.value || 0); });
        var leads = Math.max(
          actions["lead"] || 0,
          actions["onsite_conversion.lead_grouped"] || 0,
          actions["offsite_conversion.fb_pixel_lead"] || 0
        );
        // "like" is POST REACTIONS on every non-follower campaign, only fold
        // it into the followers count when the campaign is actually a
        // follower-family campaign (PAGE_LIKES / OUTCOME_ENGAGEMENT etc.).
        // This keeps Lead Gen campaigns from showing phantom followers that
        // contradict the dashboard.
        var obj = canonicalObjective(objMap[row.campaign_id], row.campaign_name);
        var pageLikesRaw = actions["page_like"] || 0;
        if (obj === "followers") pageLikesRaw = Math.max(pageLikesRaw, actions["like"] || 0);
        var follows = actions["follow"] || actions["onsite_conversion.follow"] || actions["onsite_conversion.ig_follow"] || 0;
        var appInstalls = Math.max(actions["app_install"] || 0, actions["mobile_app_install"] || 0, actions["omni_app_install"] || 0);
        out.push({
          platform: "Meta",
          accountName: acc.name,
          campaignId: String(row.campaign_id || ""),
          campaignName: row.campaign_name || "",
          spend: parseFloat(row.spend || 0),
          impressions: parseInt(row.impressions || 0),
          clicks: parseInt(row.clicks || 0),
          reach: parseInt(row.reach || 0),
          leads: leads,
          followersCombined: pageLikesRaw + follows,
          appInstalls: appInstalls
        });
      });
    } catch (_) {}
  }));
  return out;
}

async function fetchTikTokTruth(token, advId, from, to) {
  try {
    var dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    var metrics = encodeURIComponent(JSON.stringify(["campaign_name", "spend", "impressions", "clicks", "reach", "follows", "likes"]));
    var base = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + advId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + dims + "&metrics=" + metrics + "&start_date=" + from + "&end_date=" + to + "&page_size=500";
    // Follow TikTok pagination via page_info.total_page.
    var all = [];
    var page = 1;
    while (page < 10) {
      var r = await fetch(base + "&page=" + page, { headers: { "Access-Token": token } });
      if (!r.ok) break;
      var d = await r.json();
      var list = (d.data || {}).list || [];
      all = all.concat(list);
      var totalPage = (d.data && d.data.page_info && d.data.page_info.total_page) || 1;
      if (page >= totalPage) break;
      page++;
    }
    return all.map(function(row) {
      var m = row.metrics || {};
      return {
        platform: "TikTok",
        accountName: "MTN MoMo TikTok",
        campaignId: String((row.dimensions || {}).campaign_id || ""),
        campaignName: m.campaign_name || "",
        spend: parseFloat(m.spend || 0),
        impressions: parseInt(m.impressions || 0),
        clicks: parseInt(m.clicks || 0),
        reach: parseInt(m.reach || 0),
        leads: 0,
        followersCombined: parseInt(m.follows || 0) + parseInt(m.likes || 0),
        appInstalls: 0
      };
    });
  } catch (_) { return []; }
}

async function fetchGoogleTruth(from, to) {
  try {
    var cid = process.env.GOOGLE_ADS_CLIENT_ID;
    var cs = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var rt = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var dt = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var mg = process.env.GOOGLE_ADS_MANAGER_ID;
    var customer = "9587382256";
    if (!cid || !rt || !dt) return [];
    var tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "client_id=" + cid + "&client_secret=" + cs + "&refresh_token=" + rt + "&grant_type=refresh_token" });
    var tokD = await tok.json();
    if (!tokD.access_token) return [];
    var q = "SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
    // Follow nextPageToken pagination for accounts exceeding a single page.
    var rows = [];
    var pageToken = null;
    var gGuard = 0;
    do {
      gGuard++;
      var body = pageToken ? { query: q, pageToken: pageToken } : { query: q };
      var r = await fetch("https://googleads.googleapis.com/v21/customers/" + customer + "/googleAds:search", {
        method: "POST",
        headers: { "Authorization": "Bearer " + tokD.access_token, "developer-token": dt, "login-customer-id": mg, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (r.status !== 200) break;
      var d = await r.json();
      if (d.results) rows = rows.concat(d.results);
      pageToken = d.nextPageToken || null;
    } while (pageToken && gGuard < 20);
    var byId = {};
    rows.forEach(function(row) {
      var id = String(row.campaign.id || "");
      if (!byId[id]) byId[id] = { campaignId: id, campaignName: row.campaign.name || "", spend: 0, impressions: 0, clicks: 0, conversions: 0 };
      byId[id].spend += parseFloat(row.metrics.costMicros || 0) / 1000000;
      byId[id].impressions += parseInt(row.metrics.impressions || 0);
      byId[id].clicks += parseInt(row.metrics.clicks || 0);
      byId[id].conversions += parseFloat(row.metrics.conversions || 0);
    });
    return Object.keys(byId).map(function(id) {
      var v = byId[id];
      // Google conversions count as leads ONLY when the campaign is
      // lead-gen objective. Traffic / landing-page / YouTube campaigns
      // often have non-lead conversion tracking set up (button clicks,
      // video completes) and those must not be reported as leads, or
      // SoT disagrees with the dashboard which correctly scopes leads
      // to lead-gen campaigns. Mirrors api/campaigns.js + canonicalObjective.
      var gObj = canonicalObjective("", v.campaignName);
      var leadsForRow = gObj === "leads" ? Math.round(v.conversions) : 0;
      return {
        platform: "Google",
        accountName: "MTN MoMo Google",
        campaignId: id,
        campaignName: v.campaignName,
        spend: v.spend,
        impressions: v.impressions,
        clicks: v.clicks,
        reach: 0,
        leads: leadsForRow,
        followersCombined: 0,
        appInstalls: 0
      };
    });
  } catch (_) { return []; }
}

// Ad-level sums per raw campaign id. If ads API drops rows (Meta's
// placement-split attribution quirk, TikTok page paging issues), the sum
// will drift from the campaign total and the Creative tab shows
// undercounted spend. This catches that.
async function fetchAdSumsByCampaign(req, from, to) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) return {};
    var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "media-on-gas.vercel.app";
    var r = await fetch("https://" + host + "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&fresh=1", { headers: { "x-api-key": apiKey } });
    if (!r.ok) return {};
    var d = await r.json();
    var out = {};
    (d.ads || []).forEach(function(a) {
      var id = String(a.campaignId || "").replace(/^google_/, "");
      if (!id) return;
      if (!out[id]) out[id] = { spend: 0, impressions: 0, clicks: 0 };
      out[id].spend += parseFloat(a.spend || 0);
      out[id].impressions += parseFloat(a.impressions || 0);
      out[id].clicks += parseFloat(a.clicks || 0);
    });
    return out;
  } catch (_) { return {}; }
}

// Adset-level sums per raw campaign id. Drives the Audience Targeting tab,
// same reasoning as ads: if the adsets endpoint drops rows, targeting
// insights become misleading.
async function fetchAdsetSumsByCampaign(req, from, to) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) return {};
    var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "media-on-gas.vercel.app";
    var r = await fetch("https://" + host + "/api/adsets?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to), { headers: { "x-api-key": apiKey } });
    if (!r.ok) return {};
    var d = await r.json();
    var out = {};
    (d.adsets || []).forEach(function(a) {
      var id = String(a.campaignId || "").replace(/^google_/, "");
      if (!id) return;
      if (!out[id]) out[id] = { spend: 0, impressions: 0, clicks: 0 };
      out[id].spend += parseFloat(a.spend || 0);
      out[id].impressions += parseFloat(a.impressions || 0);
      out[id].clicks += parseFloat(a.clicks || 0);
    });
    return out;
  } catch (_) { return {}; }
}

// Sum of daily series values across the period. Drives the Budget Pacing
// spend line. If daily sum does not match campaign total, the chart is
// lying.
async function fetchTimeseriesTotals(req, from, to) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) return null;
    var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "media-on-gas.vercel.app";
    var r = await fetch("https://" + host + "/api/timeseries?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&granularity=day", { headers: { "x-api-key": apiKey } });
    if (!r.ok) return null;
    var d = await r.json();
    // /api/timeseries returns series = [{platform, objective, points: [{bucket, spend, ...}]}]
    // Need to iterate points across every series, NOT assume series items
    // carry spend themselves.
    var series = d.series || [];
    var totals = { spend: 0, impressions: 0, clicks: 0 };
    series.forEach(function(s) {
      (s.points || []).forEach(function(pt) {
        totals.spend += parseFloat(pt.spend || 0);
        totals.impressions += parseFloat(pt.impressions || 0);
        totals.clicks += parseFloat(pt.clicks || 0);
      });
    });
    return totals;
  } catch (_) { return null; }
}

// Fetch what our dashboard reports (from /api/campaigns)
async function fetchDashboardNumbers(req, from, to) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) return [];
    var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "media-on-gas.vercel.app";
    // ?fresh=1 bypasses the 5-minute response cache so the audit compares
    // freshly fetched dashboard numbers against freshly fetched source-of-truth.
    // Without this, the audit was flagging Summary metrics as yellow because
    // the cached /api/campaigns response could be up to 5 min stale relative
    // to the just-fetched Meta truth on actively-spending campaigns.
    var r = await fetch("https://" + host + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&fresh=1", { headers: { "x-api-key": apiKey } });
    if (!r.ok) return [];
    var d = await r.json();
    return (d.campaigns || []).map(function(c) {
      return {
        platform: c.platform,
        campaignId: String(c.rawCampaignId || c.campaignId || ""),
        campaignName: c.campaignName || "",
        spend: parseFloat(c.spend || 0),
        impressions: parseFloat(c.impressions || 0),
        clicks: parseFloat(c.clicks || 0),
        reach: parseFloat(c.reach || 0),
        leads: parseFloat(c.leads || 0),
        followersCombined: parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0) + parseFloat(c.likes || 0),
        appInstalls: parseFloat(c.appInstalls || 0)
      };
    });
  } catch (_) { return []; }
}

// Diff source vs dashboard, produce per-campaign result rows. Each metric
// carries a `tab` field identifying which dashboard surface would be
// affected if the delta is real. That lets the UI sort/filter by tab so
// the user can jump straight to the affected section.
function buildReconciliation(sourceRows, dashRows, adSums, adsetSums) {
  adSums = adSums || {};
  adsetSums = adsetSums || {};
  // Index dashboard rows by campaignId. Meta dashboard rows have IDs with suffix
  // (e.g. _facebook / _instagram), so also index by raw id without suffix.
  var dashIndex = {};
  dashRows.forEach(function(dr) {
    var id = String(dr.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "");
    if (!dashIndex[id]) dashIndex[id] = { rows: [] };
    dashIndex[id].rows.push(dr);
  });

  var results = [];
  sourceRows.forEach(function(s) {
    var entry = dashIndex[s.campaignId] || { rows: [] };
    // For Meta, dashboard splits FB vs IG, so sum both rows for a fair compare
    var dashAgg = { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, followersCombined: 0, appInstalls: 0 };
    entry.rows.forEach(function(r) {
      dashAgg.spend += r.spend;
      dashAgg.impressions += r.impressions;
      dashAgg.clicks += r.clicks;
      dashAgg.reach += r.reach;
      dashAgg.leads += r.leads;
      dashAgg.followersCombined += r.followersCombined;
      dashAgg.appInstalls += r.appInstalls;
    });

    var metrics = [];
    var pushMetric = function(name, source, dash, relevant, tab) {
      if (!relevant) return;
      var delta = pct(source, dash);
      metrics.push({ name: name, source: source, dashboard: dash, deltaPct: parseFloat(delta.toFixed(2)), status: statusOf(delta), tab: tab || "Summary" });
    };
    // Summary tab: campaign-level rollups shown on KPI tiles, tables,
    // email share, Community Growth.
    pushMetric("spend", s.spend, dashAgg.spend, true, "Summary");
    pushMetric("impressions", s.impressions, dashAgg.impressions, true, "Summary");
    pushMetric("clicks", s.clicks, dashAgg.clicks, true, "Summary");
    pushMetric("reach", s.reach, dashAgg.reach, s.reach > 0, "Summary");
    pushMetric("leads", s.leads, dashAgg.leads, s.leads > 0 || dashAgg.leads > 0, "Summary");
    pushMetric("followers", s.followersCombined, dashAgg.followersCombined, s.followersCombined > 0 || dashAgg.followersCombined > 0, "Summary");
    pushMetric("appInstalls", s.appInstalls, dashAgg.appInstalls, s.appInstalls > 0 || dashAgg.appInstalls > 0, "Summary");

    // Creative tab: ad-level rows should sum to the campaign total.
    // Catches dropped ad rows (Meta placement attribution, TikTok paging).
    var adSum = adSums[s.campaignId];
    if (adSum) {
      pushMetric("ads sum spend", s.spend, adSum.spend, s.spend > 0 || adSum.spend > 0, "Creative");
      pushMetric("ads sum impressions", s.impressions, adSum.impressions, s.impressions > 0 || adSum.impressions > 0, "Creative");
    }

    // Audience tab: adset-level rows should sum to the campaign total.
    var adsetSum = adsetSums[s.campaignId];
    if (adsetSum) {
      pushMetric("adsets sum spend", s.spend, adsetSum.spend, s.spend > 0 || adsetSum.spend > 0, "Audience");
      pushMetric("adsets sum impressions", s.impressions, adsetSum.impressions, s.impressions > 0 || adsetSum.impressions > 0, "Audience");
    }

    // Sort metrics within each campaign red > yellow > green so the
    // first thing the user sees on a row is the issue.
    var sev = { red: 0, yellow: 1, green: 2 };
    metrics.sort(function(a, b) {
      if (sev[a.status] !== sev[b.status]) return sev[a.status] - sev[b.status];
      return (a.name || "").localeCompare(b.name || "");
    });

    var worstStatus = "green";
    metrics.forEach(function(m) {
      if (m.status === "red") worstStatus = "red";
      else if (m.status === "yellow" && worstStatus !== "red") worstStatus = "yellow";
    });

    results.push({
      platform: s.platform,
      accountName: s.accountName,
      campaignId: s.campaignId,
      campaignName: s.campaignName,
      dashboardMatched: entry.rows.length > 0,
      metrics: metrics,
      overallStatus: worstStatus
    });
  });
  return results;
}

async function sendAlertEmail(flagged, from, to) {
  try {
    var gmailUser = process.env.GMAIL_USER;
    var gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass || flagged.length === 0) return { ok: false, reason: "no-creds-or-empty" };
    var transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gmailUser, pass: gmailPass } });
    var rowsHtml = flagged.map(function(r) {
      var mHtml = r.metrics.filter(function(m) { return m.status !== "green"; }).map(function(m) {
        return "<li><strong>" + m.name + "</strong>: source=" + m.source + " dashboard=" + m.dashboard + " delta=" + m.deltaPct + "%</li>";
      }).join("");
      return "<tr><td>" + r.platform + "</td><td>" + (r.campaignName || r.campaignId) + "</td><td><ul>" + mHtml + "</ul></td></tr>";
    }).join("");
    var html = '<html><body style="font-family:Helvetica,Arial;padding:20px;">' +
      '<h2 style="color:#F96203">GAS Reconciliation Alert</h2>' +
      '<p>Period ' + from + ' to ' + to + '. <strong>' + flagged.length + '</strong> campaigns with deltas above 1%.</p>' +
      '<table border="1" cellpadding="8" style="border-collapse:collapse;font-size:12px;"><thead><tr style="background:#eee"><th>Platform</th><th>Campaign</th><th>Flagged metrics</th></tr></thead><tbody>' +
      rowsHtml +
      '</tbody></table>' +
      '<p style="color:#666;font-size:11px">Automated check from /api/reconcile.</p></body></html>';
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: "gary@gasmarketing.co.za",
      subject: "GAS Reconciliation Alert, " + flagged.length + " campaigns flagged for " + from + " to " + to,
      html: html
    });
    return { ok: true, sentTo: "gary@gasmarketing.co.za" };
  } catch (err) {
    console.error("Reconcile alert send failed", err);
    return { ok: false, reason: String(err && err.message || err) };
  }
}

export default async function handler(req, res) {
  // Cron-triggered calls from Vercel arrive with an Authorization: Bearer <CRON_SECRET>
  // header that only Vercel's infrastructure knows. Short-circuit auth for that case
  // so the scheduled reconciliation can run without a human session. We still refuse
  // anything else on this short-circuit path.
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = cronSecret && authHeader === "Bearer " + cronSecret;

  if (isCron) {
    req.authPrincipal = { role: "admin" };
  } else {
    if (!rateLimit(req, res, { maxPerMin: 6, maxPerHour: 50 })) return;
    if (!(await checkAuth(req, res))) return;
    if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
      res.status(403).json({ error: "Admin-only" });
      return;
    }
  }

  // Cron default: last 30 days. Manual calls can override with ?from=&to=.
  var defaultTo = new Date().toISOString().slice(0, 10);
  var defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  var from = req.query.from || (isCron ? defaultFrom : "2026-04-01");
  var to = req.query.to || (isCron ? defaultTo : "2026-04-30");
  var wantAlert = req.query.alert === "1" || req.query.alert === "true";

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  var results = await Promise.all([
    metaToken ? fetchMetaTruth(metaToken, from, to) : Promise.resolve([]),
    ttToken && ttAdvId ? fetchTikTokTruth(ttToken, ttAdvId, from, to) : Promise.resolve([]),
    fetchGoogleTruth(from, to),
    fetchDashboardNumbers(req, from, to),
    fetchAdSumsByCampaign(req, from, to),
    fetchAdsetSumsByCampaign(req, from, to),
    fetchTimeseriesTotals(req, from, to)
  ]);
  var metaTruth = results[0], ttTruth = results[1], gTruth = results[2], dashRows = results[3];
  var adSums = results[4], adsetSums = results[5], tsTotals = results[6];
  var sourceRows = metaTruth.concat(ttTruth).concat(gTruth);

  var reconciled = buildReconciliation(sourceRows, dashRows, adSums, adsetSums);

  // Standalone top-level row comparing the period-wide totals to the
  // sum of daily timeseries points. Catches a Budget Pacing chart that
  // drifts from campaign-level truth even when per-campaign rows look ok.
  if (tsTotals) {
    var totalTruth = { spend: 0, impressions: 0, clicks: 0 };
    sourceRows.forEach(function(s) {
      totalTruth.spend += parseFloat(s.spend || 0);
      totalTruth.impressions += parseFloat(s.impressions || 0);
      totalTruth.clicks += parseFloat(s.clicks || 0);
    });
    var tsMetrics = [];
    var tsPush = function(name, src, dash) {
      var delta = pct(src, dash);
      tsMetrics.push({ name: name, source: src, dashboard: dash, deltaPct: parseFloat(delta.toFixed(2)), status: statusOf(delta), tab: "Summary (Budget Pacing)" });
    };
    tsPush("daily spend sum", totalTruth.spend, tsTotals.spend);
    tsPush("daily impressions sum", totalTruth.impressions, tsTotals.impressions);
    tsPush("daily clicks sum", totalTruth.clicks, tsTotals.clicks);
    var sevTs = { red: 0, yellow: 1, green: 2 };
    tsMetrics.sort(function(a, b) { return sevTs[a.status] - sevTs[b.status]; });
    var worstTs = "green";
    tsMetrics.forEach(function(m) {
      if (m.status === "red") worstTs = "red";
      else if (m.status === "yellow" && worstTs !== "red") worstTs = "yellow";
    });
    reconciled.push({
      platform: "All",
      accountName: "Budget Pacing chart",
      campaignId: "_timeseries_overall",
      campaignName: "Daily timeseries totals (across all platforms)",
      dashboardMatched: true,
      metrics: tsMetrics,
      overallStatus: worstTs
    });
  }

  reconciled.sort(function(a, b) {
    var ord = { red: 0, yellow: 1, green: 2 };
    if (ord[a.overallStatus] !== ord[b.overallStatus]) return ord[a.overallStatus] - ord[b.overallStatus];
    return (a.campaignName || "").localeCompare(b.campaignName || "");
  });
  var summary = { total: reconciled.length, green: 0, yellow: 0, red: 0 };
  reconciled.forEach(function(r) { summary[r.overallStatus]++; });

  var alertResult = null;
  if (wantAlert) {
    var flagged = reconciled.filter(function(r) { return r.overallStatus !== "green"; });
    alertResult = await sendAlertEmail(flagged, from, to);
  }

  res.status(200).json({
    from: from,
    to: to,
    checkedAt: new Date().toISOString(),
    summary: summary,
    rows: reconciled,
    alert: alertResult
  });
}
