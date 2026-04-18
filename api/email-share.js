import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { issueToken } from "./_jwt.js";

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

// Pull live campaign data using the internal /api/campaigns endpoint. Returns null on
// any failure so the email still sends with its usual CTA block.
async function fetchCampaignSummary(req, from, to, campaignIds, campaignNames) {
  try {
    var apiKey = process.env.DASHBOARD_API_KEY;
    if (!apiKey) return null;
    var internalHost = req.headers.host;
    var internalProto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
    if (!internalHost) return null;
    var url = internalProto + "://" + internalHost + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    var r = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!r.ok) return null;
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
    if (filtered.length === 0) return null;
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

  // Render KPIs as two rows of three cells using a nested table (max compatibility)
  var kpiRows = "";
  for (var i = 0; i < kpis.length; i += 3) {
    var group = kpis.slice(i, i + 3);
    kpiRows += '<tr>' + group.map(function(k) {
      return '<td valign="top" width="33.33%" style="padding:6px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.18);border-radius:10px;">' +
        '<tr><td style="padding:14px 14px 12px;">' +
        '<div style="font-size:8px;color:' + k.accent + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">' + k.label + '</div>' +
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

  // Objective outcomes row (leads / follows / LP clicks / installs), only show those > 0
  var outcomes = [];
  var totalFollows = g.follows + g.pageLikes + g.likes;
  if (g.leads > 0) outcomes.push({ label: "Leads generated", value: fmtNum(g.leads), cost: g.leads > 0 ? fmtR(g.spend / Math.max(1, g.leads)) + " per lead" : "", accent: "#F43F5E" });
  if (totalFollows > 0) outcomes.push({ label: "New followers", value: fmtNum(totalFollows), cost: totalFollows > 0 ? fmtR(g.spend / totalFollows) + " per follower" : "", accent: "#00F2EA" });
  if (g.appInstalls > 0) outcomes.push({ label: "App installs", value: fmtNum(g.appInstalls), cost: g.appInstalls > 0 ? fmtR(g.spend / g.appInstalls) + " per install" : "", accent: "#4599FF" });
  if (g.landingPageViews > 0 && outcomes.length < 3) outcomes.push({ label: "Landing page views", value: fmtNum(g.landingPageViews), cost: "", accent: "#22D3EE" });

  var outcomeRows = "";
  if (outcomes.length > 0) {
    outcomeRows = '<tr>' + outcomes.map(function(o) {
      var w = Math.floor(100 / outcomes.length);
      return '<td valign="top" width="' + w + '%" style="padding:6px;">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.04);border:1px solid ' + o.accent + '33;border-left:3px solid ' + o.accent + ';border-radius:10px;">' +
        '<tr><td style="padding:14px 16px;">' +
        '<div style="font-size:8px;color:' + o.accent + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">' + o.label + '</div>' +
        '<div style="font-size:22px;font-weight:900;color:#FFFBF8;margin-top:4px;line-height:1;font-family:Helvetica,Arial,sans-serif;">' + o.value + '</div>' +
        (o.cost ? '<div style="font-size:10px;color:#8B7FA3;margin-top:5px;font-family:Helvetica,Arial,sans-serif;">' + o.cost + '</div>' : '') +
        '</td></tr></table></td>';
    }).join("") + '</tr>';
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

function buildEmailHtml(opts) {
  var clientName = opts.clientSlug
    .split("-")
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(" ");
  var dateRange = opts.from + " to " + opts.to;
  var url = opts.shareUrl;
  var expiresDisplay = new Date(opts.expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  var origin = opts.origin || "https://media-on-gas.vercel.app";
  var logoUrl = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var personal = escapeHtml(opts.personalMessage || "").replace(/\n/g, "<br>");
  var senderName = escapeHtml(opts.senderName || "");
  var senderTitle = escapeHtml(opts.senderTitle || "");
  var summaryBlock = renderSummaryBlock(opts.summary);

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
          Hi ${clientName},
        </div>
        ${personal ? `<div style="font-size:14px;color:#FFFBF8;line-height:1.75;margin-top:14px;padding:16px 20px;background:rgba(249,98,3,0.06);border-left:3px solid #F96203;border-radius:0 10px 10px 0;">${personal}</div>` : ""}
        <div style="font-size:14px;color:rgba(255,251,248,0.78);line-height:1.7;margin-top:14px;">
          Here is the live performance snapshot for <strong style="color:#F96203;">${dateRange}</strong>. Every figure below is pulled directly from the ad platforms at the moment this email was sent.
        </div>
      </td></tr>

      ${summaryBlock}

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
  var toList = parseList(body.to);
  var ccList = parseList(body.cc);
  var bccList = parseList(body.bcc);

  if (!clientSlug) { res.status(400).json({ error: "clientSlug required" }); return; }
  if (campaignIds.length === 0 && campaignNames.length === 0) {
    res.status(400).json({ error: "Select at least one campaign" }); return;
  }
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }
  if (toList.length === 0) { res.status(400).json({ error: "At least one valid recipient email required" }); return; }

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

    // Fetch live summary data to embed. If it fails, email still sends with CTA only.
    var summary = await fetchCampaignSummary(req, from, to, campaignIds, campaignNames);

    var html = buildEmailHtml({
      clientSlug: clientSlug,
      from: from,
      to: to,
      shareUrl: shareUrl,
      expiresAt: expiresAt,
      personalMessage: body.personalMessage || "",
      senderName: body.senderName || "",
      senderTitle: body.senderTitle || "",
      origin: origin,
      summary: summary
    });

    // Plain-text alternative for SpamAssassin MIME_HTML_ONLY and text-only mail clients.
    var clientName = clientSlug.split("-").map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
    var expiresDisplay = new Date(expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
    var textLines = [];
    textLines.push("Hi " + clientName + ",");
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

    res.status(200).json({
      ok: true,
      messageId: info.messageId,
      shareUrl: shareUrl,
      expiresAt: expiresAt,
      sentTo: toList,
      cc: ccList,
      bcc: bccList,
      summaryEmbedded: !!summary
    });
  } catch (err) {
    console.error("Email share error", err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
