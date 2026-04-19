import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { issueToken } from "./_jwt.js";
import { logEmailSend } from "./_audit.js";

// Admin-only endpoint. Issues a signed share token, fetches the campaign summary,
// and emails a branded HTML report from grow@gasmarketing.co.za via Gmail SMTP.
// Env vars required: GMAIL_USER, GMAIL_APP_PASSWORD, DASHBOARD_JWT_SECRET, DASHBOARD_API_KEY.

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(n) {
  n = parseFloat(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}
function fmtR(n) {
  n = parseFloat(n) || 0;
  return "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  n = parseFloat(n) || 0;
  return n.toFixed(2) + "%";
}

// Aggregate a flat array of campaigns into one summed object + derived metrics.
function aggregate(arr) {
  var s = { impressions: 0, reach: 0, spend: 0, clicks: 0, leads: 0, appInstalls: 0, follows: 0, pageLikes: 0, likes: 0, landingPageViews: 0 };
  arr.forEach(function(c) {
    s.impressions += parseFloat(c.impressions || 0);
    s.reach += parseFloat(c.reach || 0);
    s.spend += parseFloat(c.spend || 0);
    s.clicks += parseFloat(c.clicks || 0);
    s.leads += parseFloat(c.leads || 0);
    s.appInstalls += parseFloat(c.appInstalls || 0);
    s.follows += parseFloat(c.follows || 0);
    s.pageLikes += parseFloat(c.pageLikes || 0);
    s.likes += parseFloat(c.likes || 0);
    s.landingPageViews += parseFloat(c.landingPageViews || 0);
  });
  s.cpm = s.impressions > 0 ? (s.spend / s.impressions * 1000) : 0;
  s.cpc = s.clicks > 0 ? (s.spend / s.clicks) : 0;
  s.ctr = s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0;
  s.frequency = s.reach > 0 ? (s.impressions / s.reach) : 0;
  return s;
}

// Pull live top creative ads for the allowed campaigns. Top 3 per platform by spend.
async function fetchTopAds(req, from, to, campaignIds, campaignNames) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) { console.warn("[email-share] DASHBOARD_API_KEY missing, top ads skipped"); return null; }
    var internalHost = req.headers.host;
    var internalProto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    if (!internalHost) return null;
    var url = internalProto + "://" + internalHost + "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    var r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) { console.warn("[email-share] /api/ads internal fetch failed", r.status); return null; }
    var d = await r.json();
    var all = d.ads || [];
    var idSet = {}; campaignIds.forEach(function(x) { idSet[String(x)] = true; });
    var nameSet = {}; campaignNames.forEach(function(x) { nameSet[x] = true; });
    var filtered = all.filter(function(a) {
      var cid = String(a.campaignId || "");
      if (idSet[cid]) return true;
      if (a.campaignName && nameSet[a.campaignName]) return true;
      return false;
    });
    if (filtered.length === 0) return null;
    // Group by platform, pick top 3 by results then spend
    var byPlat = {};
    filtered.forEach(function(a) {
      var p = a.platform || "Other";
      if (!byPlat[p]) byPlat[p] = [];
      byPlat[p].push(a);
    });
    var platforms = Object.keys(byPlat).map(function(p) {
      var arr = byPlat[p].slice().sort(function(a, b) {
        var ar = parseFloat(a.results || 0);
        var br = parseFloat(b.results || 0);
        if (br !== ar) return br - ar;
        return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
      }).slice(0, 3);
      return { platform: p, ads: arr };
    }).sort(function(a, b) {
      var aSpend = a.ads.reduce(function(s, x) { return s + parseFloat(x.spend || 0); }, 0);
      var bSpend = b.ads.reduce(function(s, x) { return s + parseFloat(x.spend || 0); }, 0);
      return bSpend - aSpend;
    }).slice(0, 3); // cap at 3 platforms to keep email scannable
    return platforms;
  } catch (err) {
    console.error("Email top ads fetch error", err);
    return null;
  }
}

// Pull live campaign data using the internal /api/campaigns endpoint. Returns null on
// any failure so the email still sends with its usual CTA block.
async function fetchCampaignSummary(req, from, to, campaignIds, campaignNames) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) { console.warn("[email-share] DASHBOARD_API_KEY missing, summary skipped"); return null; }
    var internalHost = req.headers.host;
    var internalProto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    if (!internalHost) return null;
    var url = internalProto + "://" + internalHost + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    var r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) { console.warn("[email-share] /api/campaigns internal fetch failed", r.status); return null; }
    var d = await r.json();
    var all = d.campaigns || [];
    var idSet = {}; campaignIds.forEach(function(x) { idSet[String(x)] = true; });
    var nameSet = {}; campaignNames.forEach(function(x) { nameSet[x] = true; });
    var filtered = all.filter(function(c) {
      var raw = String(c.rawCampaignId || "");
      var cid = String(c.campaignId || "");
      if (idSet[raw] || idSet[cid]) return true;
      if (c.campaignName && nameSet[c.campaignName]) return true;
      return false;
    });
    if (filtered.length === 0) { console.warn("[email-share] Campaign allowlist matched zero of", all.length, "campaigns. Check campaignIds format."); return null; }
    var grand = aggregate(filtered);
    // Platform buckets
    var byPlat = {};
    filtered.forEach(function(c) {
      var p = c.platform || "Other";
      if (!byPlat[p]) byPlat[p] = [];
      byPlat[p].push(c);
    });
    var platforms = Object.keys(byPlat).map(function(p) {
      var agg = aggregate(byPlat[p]);
      return { platform: p, impressions: agg.impressions, spend: agg.spend, clicks: agg.clicks, ctr: agg.ctr };
    }).sort(function(a, b) { return b.spend - a.spend; });
    return {
      grand: grand,
      platforms: platforms,
      campaignCount: filtered.length
    };
  } catch (err) {
    console.error("Email summary fetch error", err);
    return null;
  }
}

// Render the KPI + platform + objective blocks. Table-based with inline styles so
// Outlook, Gmail, Apple Mail, and mobile clients all render consistently.
function renderSummaryBlock(summary) {
  if (!summary) return "";
  var g = summary.grand;

  var kpis = [
    { label: "Ads Served", value: fmtNum(g.impressions), sub: summary.campaignCount + " campaign" + (summary.campaignCount === 1 ? "" : "s"), accent: "#F96203" },
    { label: "Reach", value: fmtNum(g.reach), sub: "unique people", accent: "#A855F7" },
    { label: "Spend", value: fmtR(g.spend), sub: "total media invested", accent: "#FF3D00" },
    { label: "Clicks", value: fmtNum(g.clicks), sub: "engagements generated", accent: "#22D3EE" },
    { label: "Click-through rate", value: fmtPct(g.ctr), sub: "of ads clicked", accent: "#34D399" },
    { label: "Cost per click", value: fmtR(g.cpc), sub: "blended across platforms", accent: "#FFAA00" }
  ];

  // KPIs as two rows of three tiles. Fixed row height so labels + values + subtext align
  // cleanly across tiles even when subtext wraps differently in different clients.
  var KPI_TILE_HEIGHT = 118;
  var kpiRows = "";
  for (var i = 0; i < kpis.length; i += 3) {
    var group = kpis.slice(i, i + 3);
    kpiRows += '<tr>' + group.map(function(k) {
      return '<td valign="top" width="33.33%" style="padding:6px;">' +
        '<table role="presentation" width="100%" height="' + KPI_TILE_HEIGHT + '" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.18);border-radius:10px;height:' + KPI_TILE_HEIGHT + 'px;">' +
        '<tr><td valign="top" style="padding:14px 14px 12px;">' +
        '<div style="font-size:8px;color:' + k.accent + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;min-height:20px;">' + k.label + '</div>' +
        '<div style="font-size:22px;font-weight:900;color:#FFFBF8;margin-top:6px;line-height:1;font-family:Helvetica,Arial,sans-serif;">' + k.value + '</div>' +
        '<div style="font-size:9px;color:#8B7FA3;margin-top:6px;font-family:Helvetica,Arial,sans-serif;">' + k.sub + '</div>' +
        '</td></tr></table></td>';
    }).join("") + '</tr>';
  }

  // Platform breakdown table
  var platformHeader = '<tr style="background:rgba(168,85,247,0.08);">' +
    '<td style="padding:10px 14px;font-size:9px;color:#F96203;letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">Platform</td>' +
    '<td align="right" style="padding:10px 14px;font-size:9px;color:#F96203;letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">Ads Served</td>' +
    '<td align="right" style="padding:10px 14px;font-size:9px;color:#F96203;letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">Spend</td>' +
    '<td align="right" style="padding:10px 14px;font-size:9px;color:#F96203;letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">CTR</td>' +
    '</tr>';
  var platformRows = summary.platforms.map(function(p, idx) {
    return '<tr style="' + (idx > 0 ? 'border-top:1px solid rgba(168,85,247,0.12);' : '') + '">' +
      '<td style="padding:12px 14px;font-size:12px;color:#FFFBF8;font-weight:600;font-family:Helvetica,Arial,sans-serif;">' + escapeHtml(p.platform) + '</td>' +
      '<td align="right" style="padding:12px 14px;font-size:12px;color:#FFFBF8;font-family:Helvetica,Arial,sans-serif;">' + fmtNum(p.impressions) + '</td>' +
      '<td align="right" style="padding:12px 14px;font-size:12px;color:#FFFBF8;font-family:Helvetica,Arial,sans-serif;">' + fmtR(p.spend) + '</td>' +
      '<td align="right" style="padding:12px 14px;font-size:12px;color:#FFFBF8;font-family:Helvetica,Arial,sans-serif;">' + fmtPct(p.ctr) + '</td>' +
      '</tr>';
  }).join("");

  // Only render tiles for objectives that have actual results. Keeps the email
  // honest for campaign shapes that focus on a single objective, a leads-only
  // campaign no longer shows empty followers/installs/LP tiles.
  var totalFollows = g.follows + g.pageLikes + g.likes;
  var allOutcomes = [
    { label: "Leads generated", value: g.leads, cost: g.leads > 0 ? fmtR(g.spend / g.leads) + " per lead" : "", accent: "#F43F5E" },
    { label: "New followers", value: totalFollows, cost: totalFollows > 0 ? fmtR(g.spend / totalFollows) + " per follower" : "", accent: "#00F2EA" },
    { label: "Clicks to App Store", value: g.appInstalls, cost: g.appInstalls > 0 ? fmtR(g.spend / g.appInstalls) + " per click" : "", accent: "#4599FF" },
    { label: "Landing page views", value: g.landingPageViews, cost: g.landingPageViews > 0 ? fmtR(g.spend / g.landingPageViews) + " per view" : "", accent: "#22D3EE" }
  ];
  var outcomes = allOutcomes.filter(function(o) { return o.value > 0; });
  var OUTCOME_TILE_HEIGHT = 110;
  var outcomeRows = "";
  // If only one outcome, render full-width. If 2+, use 2x2 (or 2x1 for exactly 2). Never render an empty tile.
  if (outcomes.length === 1) {
    var solo = outcomes[0];
    outcomeRows = '<tr><td valign="top" width="100%" style="padding:6px;">' +
      '<table role="presentation" width="100%" height="' + OUTCOME_TILE_HEIGHT + '" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.04);border:1px solid ' + solo.accent + '33;border-left:3px solid ' + solo.accent + ';border-radius:10px;height:' + OUTCOME_TILE_HEIGHT + 'px;">' +
      '<tr><td valign="top" style="padding:14px 16px;">' +
      '<div style="font-size:8px;color:' + solo.accent + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;min-height:20px;">' + solo.label + '</div>' +
      '<div style="font-size:26px;font-weight:900;color:#FFFBF8;margin-top:4px;line-height:1;font-family:Helvetica,Arial,sans-serif;">' + fmtNum(solo.value) + '</div>' +
      '<div style="font-size:10px;color:#8B7FA3;margin-top:5px;font-family:Helvetica,Arial,sans-serif;">' + solo.cost + '</div>' +
      '</td></tr></table></td></tr>';
  } else if (outcomes.length >= 2) {
    for (var oi = 0; oi < outcomes.length; oi += 2) {
      var pair = outcomes.slice(oi, oi + 2);
      outcomeRows += '<tr>' + pair.map(function(o) {
        return '<td valign="top" width="50%" style="padding:6px;">' +
          '<table role="presentation" width="100%" height="' + OUTCOME_TILE_HEIGHT + '" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.04);border:1px solid ' + o.accent + '33;border-left:3px solid ' + o.accent + ';border-radius:10px;height:' + OUTCOME_TILE_HEIGHT + 'px;">' +
          '<tr><td valign="top" style="padding:14px 16px;">' +
          '<div style="font-size:8px;color:' + o.accent + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;min-height:20px;">' + o.label + '</div>' +
          '<div style="font-size:22px;font-weight:900;color:#FFFBF8;margin-top:4px;line-height:1;font-family:Helvetica,Arial,sans-serif;">' + fmtNum(o.value) + '</div>' +
          '<div style="font-size:10px;color:#8B7FA3;margin-top:5px;font-family:Helvetica,Arial,sans-serif;">' + o.cost + '</div>' +
          '</td></tr></table></td>';
      }).join("") + '</tr>';
    }
  }

  return '' +
    '<tr><td style="padding:30px 40px 0;">' +
      '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:14px;font-family:Helvetica,Arial,sans-serif;">Performance Summary</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-left:-6px;margin-right:-6px;">' +
        kpiRows +
      '</table>' +
    '</td></tr>' +
    (outcomeRows ? '<tr><td style="padding:14px 40px 0;">' +
      '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:14px;font-family:Helvetica,Arial,sans-serif;">Objective Outcomes</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-left:-6px;margin-right:-6px;">' +
        outcomeRows +
      '</table>' +
    '</td></tr>' : '') +
    (summary.platforms.length > 1 ? '<tr><td style="padding:22px 40px 0;">' +
      '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:14px;font-family:Helvetica,Arial,sans-serif;">Platform Breakdown</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(168,85,247,0.16);border-radius:12px;">' +
        platformHeader + platformRows +
      '</table>' +
    '</td></tr>' : '');
}

// Generate 2-3 paragraphs of plain-English commentary from aggregate metrics.
function renderCommentaryBlock(summary) {
  if (!summary) return "";
  var g = summary.grand;
  var paras = [];

  // Awareness paragraph
  var cpmQuality = g.cpm > 0 && g.cpm <= 12 ? "exceptional value" : g.cpm <= 18 ? "excellent value" : g.cpm <= 25 ? "healthy value" : "solid reach delivery";
  var awarenessText = "Your campaigns delivered <strong>" + fmtNum(g.impressions) + "</strong> ads served to <strong>" + fmtNum(g.reach) + "</strong> unique people";
  if (g.frequency > 0) awarenessText += ", with each person seeing the message an average of <strong>" + g.frequency.toFixed(2) + " times</strong>";
  awarenessText += ". At " + fmtR(g.cpm) + " per 1,000 ads served, this reflects " + cpmQuality + " against the paid social benchmark";
  if (summary.platforms.length > 1) {
    var bestCpm = summary.platforms.slice().filter(function(p) { return p.impressions > 0; }).sort(function(a, b) { return (a.spend / a.impressions) - (b.spend / b.impressions); })[0];
    if (bestCpm) awarenessText += ", with <strong>" + escapeHtml(bestCpm.platform) + "</strong> emerging as the most cost-efficient reach channel";
  }
  awarenessText += ".";
  paras.push(awarenessText);

  // Engagement paragraph
  var ctrQuality = g.ctr >= 2.0 ? "exceptionally strong, well above" : g.ctr >= 1.4 ? "outstanding, clearly above" : g.ctr >= 0.9 ? "healthy and within" : "steady and close to";
  var engagementText = "The audience responded actively with <strong>" + fmtNum(g.clicks) + "</strong> clicks, converting " + fmtPct(g.ctr) + " of ads served into genuine engagement. That click-through rate is " + ctrQuality + " the SA benchmark of 0.9 to 1.4 percent, a clear signal the creative is cutting through. A blended cost per click of <strong>" + fmtR(g.cpc) + "</strong> demonstrates efficient value for every user action.";
  paras.push(engagementText);

  // Outcomes paragraph (only if results exist)
  var totalFollows = g.follows + g.pageLikes + g.likes;
  var outcomeParts = [];
  if (g.leads > 0) outcomeParts.push("<strong>" + fmtNum(g.leads) + " leads</strong> at " + fmtR(g.spend / g.leads) + " per lead");
  if (totalFollows > 0) outcomeParts.push("<strong>" + fmtNum(totalFollows) + " new followers</strong> at " + fmtR(g.spend / totalFollows) + " per follower");
  if (g.appInstalls > 0) outcomeParts.push("<strong>" + fmtNum(g.appInstalls) + " clicks to app store</strong> at " + fmtR(g.spend / g.appInstalls) + " per click");
  if (outcomeParts.length > 0) {
    paras.push("Campaign objectives delivered " + outcomeParts.join(", ") + ". These outcomes confirm the creative strategy and audience targeting are working together to move the audience from awareness through to measurable action.");
  }

  var paraHtml = paras.map(function(p) {
    return '<p style="margin:0 0 14px;font-size:14px;color:#FFFBF8;line-height:1.8;font-family:Helvetica,Arial,sans-serif;">' + p + '</p>';
  }).join("");

  return '<tr><td style="padding:28px 40px 0;">' +
    '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:14px;font-family:Helvetica,Arial,sans-serif;">Media Analyst Insights</div>' +
    '<div style="background:rgba(249,98,3,0.04);border-left:3px solid #F96203;border-radius:0 12px 12px 0;padding:20px 22px;">' +
      paraHtml +
    '</div>' +
  '</td></tr>';
}

// Render top creative ads per platform with thumbnails + key metrics.
function renderTopAdsBlock(topAds) {
  if (!topAds || topAds.length === 0) return "";
  var platColors = { "Facebook": "#4599FF", "Instagram": "#E1306C", "TikTok": "#00F2EA", "Google Display": "#34A853", "YouTube": "#FF0000", "Google Search": "#FFAA00", "Performance Max": "#7C3AED", "Demand Gen": "#D946EF" };
  var resultLabel = function(rt) { return rt === "leads" ? "Leads" : rt === "installs" ? "App Clicks" : rt === "follows" ? "Followers" : rt === "conversions" ? "Conversions" : rt === "store_clicks" ? "App Clicks" : rt === "lp_clicks" ? "LP Clicks" : rt === "clicks" ? "Clicks" : "Results"; };
  var costPerLabel = function(rt) { return rt === "leads" ? "per lead" : rt === "installs" ? "per click" : rt === "follows" ? "per follower" : "per click"; };

  var platformBlocks = topAds.map(function(pl) {
    var accent = platColors[pl.platform] || "#F96203";
    var adsHtml = pl.ads.map(function(ad) {
      var results = parseFloat(ad.results || 0);
      var spend = parseFloat(ad.spend || 0);
      var clicks = parseFloat(ad.clicks || 0);
      var impressions = parseFloat(ad.impressions || 0);
      var ctr = parseFloat(ad.ctr || 0);
      var adName = (ad.adName || "Unnamed ad").length > 44 ? (ad.adName || "").substring(0, 42) + "," : (ad.adName || "Unnamed ad");
      var hasThumb = ad.thumbnail && String(ad.thumbnail).indexOf("http") === 0;
      var thumbCell = hasThumb ?
        '<img src="' + escapeHtml(ad.thumbnail) + '" alt="" width="120" height="120" style="width:120px;height:120px;object-fit:cover;border-radius:10px;display:block;border:0;background:#1a0f2a;"/>' :
        '<div style="width:120px;height:120px;border-radius:10px;background:linear-gradient(135deg,' + accent + '55,' + accent + '15 55%,#0a0618 100%);display:table-cell;vertical-align:middle;text-align:center;color:#fff;font-size:11px;font-weight:800;letter-spacing:1px;font-family:Helvetica,Arial,sans-serif;">' + escapeHtml(pl.platform) + '</div>';
      var metricBlock = results > 0 ?
        '<div style="font-size:18px;font-weight:900;color:#FFFBF8;font-family:Helvetica,Arial,sans-serif;line-height:1;margin-bottom:4px;">' + fmtNum(results) + ' <span style="font-size:10px;color:' + accent + ';font-weight:700;letter-spacing:1px;text-transform:uppercase;">' + resultLabel(ad.resultType) + '</span></div>' +
        '<div style="font-size:11px;color:#8B7FA3;font-family:Helvetica,Arial,sans-serif;">' + fmtR(spend / results) + ' ' + costPerLabel(ad.resultType) + '</div>' :
        '<div style="font-size:11px;color:#8B7FA3;font-family:Helvetica,Arial,sans-serif;">Still collecting results</div>';
      return '<tr><td style="padding:10px 0;border-bottom:1px solid rgba(168,85,247,0.08);">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr>' +
        '<td valign="top" style="width:130px;padding-right:14px;">' + thumbCell + '</td>' +
        '<td valign="top">' +
          '<div style="font-size:13px;color:#FFFBF8;font-weight:700;margin-bottom:6px;line-height:1.4;font-family:Helvetica,Arial,sans-serif;">' + escapeHtml(adName) + '</div>' +
          metricBlock +
          '<div style="font-size:11px;color:#8B7FA3;margin-top:8px;font-family:Helvetica,Arial,sans-serif;">' + fmtR(spend) + ' spent, ' + fmtNum(impressions) + ' ads served, ' + fmtPct(ctr) + ' CTR</div>' +
        '</td>' +
        '</tr></table>' +
      '</td></tr>';
    }).join("");

    return '<tr><td style="padding:18px 40px 0;">' +
      '<div style="display:block;margin-bottom:10px;">' +
        '<span style="display:inline-block;width:8px;height:8px;background:' + accent + ';border-radius:50%;vertical-align:middle;margin-right:8px;"></span>' +
        '<span style="font-size:11px;color:' + accent + ';letter-spacing:3px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;vertical-align:middle;">' + escapeHtml(pl.platform) + ' Top Performers</span>' +
      '</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(168,85,247,0.14);border-radius:12px;padding:0 18px;">' +
        adsHtml +
      '</table>' +
    '</td></tr>';
  }).join("");

  return '<tr><td style="padding:32px 40px 0;">' +
    '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:6px;font-family:Helvetica,Arial,sans-serif;">Creative Highlights</div>' +
    '<div style="font-size:12px;color:#8B7FA3;margin-bottom:12px;font-family:Helvetica,Arial,sans-serif;">Top performing ads per platform this period</div>' +
  '</td></tr>' + platformBlocks;
}

function buildEmailHtml(opts) {
  // Client name is used for the report title and header. It's derived from the
  // slug so the report always has a clean brand name in the banner.
  var clientName = opts.clientSlug
    .split("-")
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(" ");
  // Greeting name is what appears in "Hi ___,". If the sender gave a recipient
  // name on the form (a person or company), use that. Falls back to the
  // derived client name so old flows still work.
  var greetingName = escapeHtml((opts.recipientName || "").trim() || clientName);
  var dateRange = opts.from + " to " + opts.to;
  var url = opts.shareUrl;
  var expiresDisplay = new Date(opts.expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  var origin = opts.origin || "https://media-on-gas.vercel.app";
  var logoUrl = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var personal = escapeHtml(opts.personalMessage || "").replace(/\n/g, "<br>");
  var senderName = escapeHtml(opts.senderName || "");
  var senderTitle = escapeHtml(opts.senderTitle || "");
  var summaryBlock = renderSummaryBlock(opts.summary);
  var commentaryBlock = renderCommentaryBlock(opts.summary);
  var topAdsBlock = renderTopAdsBlock(opts.topAds);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Performance Metrics That Matter</title>
</head>
<body style="margin:0;padding:0;background:#06020e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#06020e;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">

      <tr><td style="padding:40px 40px 28px;text-align:center;">
        <div style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">
          <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
        </div>
        <div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">Performance Metrics That Matter</div>
      </td></tr>

      <tr><td style="padding:0 40px;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);"></div>
      </td></tr>

      <tr><td style="padding:36px 40px 12px;">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Client Report</div>
        <div style="font-size:28px;font-weight:900;color:#FFFBF8;line-height:1.2;margin-bottom:10px;">${clientName}</div>
        <div style="font-size:14px;color:#F96203;font-weight:600;letter-spacing:1px;">${dateRange}</div>
      </td></tr>

      <tr><td style="padding:16px 40px 8px;">
        <div style="font-size:15px;color:#FFFBF8;line-height:1.7;font-weight:400;">
          Hi ${greetingName},
        </div>
        ${personal ? `<div style="font-size:14px;color:#FFFBF8;line-height:1.75;margin-top:14px;padding:16px 20px;background:rgba(249,98,3,0.06);border-left:3px solid #F96203;border-radius:0 10px 10px 0;">${personal}</div>` : ""}
        <div style="font-size:14px;color:rgba(255,251,248,0.78);line-height:1.7;margin-top:14px;">
          Here is the live performance snapshot for <strong style="color:#F96203;">${dateRange}</strong>. Every figure below is pulled directly from the ad platforms at the moment this email was sent.
        </div>
      </td></tr>

      ${summaryBlock}
      ${commentaryBlock}
      ${topAdsBlock}

      <tr><td style="padding:34px 40px 8px;" align="center">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:700;margin-bottom:14px;">Want the full interactive view?</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${url}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Visit Live Dashboard</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Opens instantly, no login required</div>
      </td></tr>

      <tr><td style="padding:20px 40px 0;">
        <div style="font-size:11px;color:rgba(255,251,248,0.55);line-height:1.6;text-align:center;">
          Your dashboard unlocks creative top performers, audience insights, and objective-level deep dives. Link stays active until <strong style="color:#F96203;">${expiresDisplay}</strong>.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);"></div>
      </td></tr>

      ${(senderName || senderTitle) ? `
      <tr><td style="padding:18px 40px 4px;">
        <div style="font-size:13px;color:#FFFBF8;font-weight:600;">Kind regards,</div>
        ${senderName ? `<div style="font-size:14px;color:#FFFBF8;font-weight:700;margin-top:6px;">${senderName}</div>` : ""}
        ${senderTitle ? `<div style="font-size:12px;color:#8B7FA3;margin-top:2px;">${senderTitle}</div>` : ""}
      </td></tr>` : ""}

      <tr><td style="padding:20px 40px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td valign="middle" style="width:56px;padding-right:14px;">
              <img src="${logoUrl}" alt="GAS Marketing" width="48" height="48" style="width:48px;height:48px;border-radius:50%;display:block;border:0;"/>
            </td>
            <td valign="middle">
              <div style="font-size:12px;color:#FFFBF8;font-weight:800;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
              </div>
              <div style="font-size:10px;color:#8B7FA3;letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;">Performance Metrics That Matter</div>
              <div style="font-size:11px;color:#8B7FA3;margin-top:6px;">
                <a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 100 })) return;
  if (!checkAuth(req, res)) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(500).json({ error: "Gmail credentials not configured on server" });
    return;
  }

  var body = req.body || {};
  var clientSlug = (body.clientSlug || "").toString().trim().toLowerCase().replace(/[^a-z0-9\-]/g, "");
  var campaignIds = Array.isArray(body.campaignIds) ? body.campaignIds.map(String) : [];
  var campaignNames = Array.isArray(body.campaignNames) ? body.campaignNames.map(String) : [];
  var from = body.from || "";
  var to = body.to || "";
  var expiresInDays = parseInt(body.expiresInDays || 30, 10);
  if (!expiresInDays || expiresInDays < 1) expiresInDays = 30;
  if (expiresInDays > 365) expiresInDays = 365;

  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var parseList = function(raw) {
    if (!raw) return [];
    return String(raw).split(/[,;]/).map(function(s) { return s.trim(); }).filter(function(s) { return emailRe.test(s); });
  };
  // Email recipient fields use distinct names to avoid colliding with body.to (end date).
  // Previously the frontend wrote the email address into body.to, which then got used as
  // the "to date" in every downstream render. Renaming fixes it cleanly.
  var toList = parseList(body.emailTo);
  var ccList = parseList(body.emailCc);
  var bccList = parseList(body.emailBcc);

  // Preview mode: build the HTML and return it without sending. Used by the
  // Share modal's preview pane so account managers can review the final email
  // before committing the send.
  var previewMode = body.preview === true;

  if (!clientSlug) { res.status(400).json({ error: "clientSlug required" }); return; }
  if (campaignIds.length === 0 && campaignNames.length === 0) {
    res.status(400).json({ error: "Select at least one campaign" }); return;
  }
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }
  // Only require a recipient email for actual sends, preview doesn't need it
  if (!previewMode && toList.length === 0) {
    res.status(400).json({ error: "At least one valid recipient email required" }); return;
  }

  try {
    var token = issueToken({
      sub: clientSlug,
      camps: campaignIds,
      names: campaignNames,
      from: from,
      to: to
    }, expiresInDays * 24 * 60 * 60);
    var origin = (req.headers.origin || req.headers.Origin || "https://media-on-gas.vercel.app").replace(/\/$/, "");
    var shareUrl = origin + "/view/?token=" + encodeURIComponent(token);
    var expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    // Fetch summary + top ads in parallel so the email isn't sequential slow.
    // If either fails the email still sends, just with fewer inline sections.
    var results = await Promise.all([
      fetchCampaignSummary(req, from, to, campaignIds, campaignNames),
      fetchTopAds(req, from, to, campaignIds, campaignNames)
    ]);
    var summary = results[0];
    var topAds = results[1];

    var html = buildEmailHtml({
      clientSlug: clientSlug,
      from: from,
      to: to,
      shareUrl: shareUrl,
      expiresAt: expiresAt,
      personalMessage: body.personalMessage || "",
      senderName: body.senderName || "",
      senderTitle: body.senderTitle || "",
      recipientName: body.recipientName || "",
      origin: origin,
      summary: summary,
      topAds: topAds
    });

    // Plain-text alternative for SpamAssassin MIME_HTML_ONLY and text-only mail clients.
    var clientName = clientSlug.split("-").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
    var greetingName = (body.recipientName || "").trim() || clientName;
    var expiresDisplay = new Date(expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
    var textLines = [];
    textLines.push("Hi " + greetingName + ",");
    textLines.push("");
    if (body.personalMessage) { textLines.push(String(body.personalMessage).trim()); textLines.push(""); }
    textLines.push("Performance snapshot for " + from + " to " + to + ":");
    textLines.push("");
    if (summary) {
      var g = summary.grand;
      textLines.push("Ads served: " + fmtNum(g.impressions));
      textLines.push("Reach: " + fmtNum(g.reach) + " unique people");
      textLines.push("Spend: " + fmtR(g.spend));
      textLines.push("Clicks: " + fmtNum(g.clicks));
      textLines.push("Click-through rate: " + fmtPct(g.ctr));
      textLines.push("Cost per click: " + fmtR(g.cpc));
      if (g.leads > 0) textLines.push("Leads: " + fmtNum(g.leads) + " at " + fmtR(g.spend / g.leads) + " per lead");
      textLines.push("");
    }
    textLines.push("View full interactive dashboard: " + shareUrl);
    textLines.push("");
    textLines.push("This link stays active until " + expiresDisplay + ".");
    textLines.push("");
    textLines.push("Kind regards,");
    if (body.senderName) textLines.push(String(body.senderName).trim());
    if (body.senderTitle) textLines.push(String(body.senderTitle).trim());
    textLines.push("GAS Marketing Automation");
    textLines.push("grow@gasmarketing.co.za");
    var text = textLines.join("\n");

    // Preview short-circuit: return the rendered HTML + plain text so the
    // Share modal can show it for account-manager review. No send, no audit.
    if (previewMode) {
      res.status(200).json({
        ok: true,
        preview: true,
        html: html,
        text: text,
        shareUrl: shareUrl,
        expiresAt: expiresAt,
        summaryEmbedded: !!summary,
        topAdsEmbedded: !!topAds
      });
      return;
    }

    var transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass }
    });

    var info = await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: toList.join(", "),
      cc: ccList.length ? ccList.join(", ") : undefined,
      bcc: bccList.length ? bccList.join(", ") : undefined,
      subject: "Your Performance Metrics That Matter Have Just Arrived From GAS Marketing Automation!",
      text: text,
      html: html
    });

    // Fire-and-forget audit write. Graceful no-op if Upstash env vars aren't set yet.
    logEmailSend({
      clientSlug: clientSlug,
      clientName: clientSlug.split("-").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" "),
      to: toList,
      cc: ccList,
      bcc: bccList,
      fromDate: from,
      toDate: to,
      campaignCount: campaignIds.length + campaignNames.length,
      senderName: body.senderName || "",
      senderTitle: body.senderTitle || "",
      summaryEmbedded: !!summary,
      topAdsEmbedded: !!topAds,
      messageId: info.messageId || ""
    }).catch(function(err) { console.error("Audit log failed", err); });

    var diagnostic = "";
    if (!process.env.DASHBOARD_API_KEY) diagnostic = "DASHBOARD_API_KEY env var is not set on Vercel, inline summary + ad previews are skipped.";
    else if (!summary) diagnostic = "Internal /api/campaigns fetch returned no matching campaigns for the allowlist. Check Vercel logs.";
    else if (!topAds) diagnostic = "Summary embedded but top ads fetch returned no matches.";

    res.status(200).json({
      ok: true,
      messageId: info.messageId,
      shareUrl: shareUrl,
      expiresAt: expiresAt,
      sentTo: toList,
      cc: ccList,
      bcc: bccList,
      summaryEmbedded: !!summary,
      topAdsEmbedded: !!topAds,
      diagnostic: diagnostic
    });
  } catch (err) {
    console.error("Email share error", err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
