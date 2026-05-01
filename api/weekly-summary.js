import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { readEmailLog, readUsageEvents } from "./_audit.js";
import { registeredDomain, clientIdentity, displayNameFromIdentity } from "./_clientIdentity.js";
import { listUsers, normalizeEmail } from "./_users.js";

// Weekly management summary email. Fires every Friday at 8am UTC via
// Vercel cron. Covers the previous 7 days of:
//   1. Dashboard logins per team member (+ session time)
//   2. Reports sent to clients
//   3. Clients currently overdue for their 7-day SLA report
//
// Recipient: gary@gasmarketing.co.za  CC: sam@gasmarketing.co.za

var TO_EMAIL = "gary@gasmarketing.co.za";
var CC_EMAIL = "sam@gasmarketing.co.za";
var SLA_DAYS = 7;
var TEAM_DOMAIN = "gasmarketing.co.za";

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function isTeamEmail(addr) {
  var e = String(addr || "").toLowerCase().trim();
  var at = e.lastIndexOf("@");
  if (at < 0) return false;
  return e.slice(at + 1) === TEAM_DOMAIN;
}

function fmtDur(min) {
  if (!min || min <= 0) return "-";
  if (min < 60) return min + "m";
  return Math.floor(min / 60) + "h " + (min % 60) + "m";
}

function buildHtml(opts) {
  var weekLabel = opts.weekLabel;
  var loginRows = opts.loginRows;
  var reportRows = opts.reportRows;
  var overdueRows = opts.overdueRows;
  var origin = opts.origin;
  var logoUrl = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";

  var loginTableRows = loginRows.length === 0
    ? '<tr><td colspan="4" style="padding:14px;color:#8B7FA3;text-align:center;font-size:12px;">No admin logins this week.</td></tr>'
    : loginRows.map(function(r) {
        return '<tr>' +
          '<td style="padding:10px 12px;color:#FFFBF8;font-size:12px;border-bottom:1px solid rgba(168,85,247,0.12);">' + escapeHtml(r.user) + '</td>' +
          '<td style="padding:10px 12px;color:#F96203;font-weight:700;font-size:13px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + r.logins + '</td>' +
          '<td style="padding:10px 12px;color:#FFFBF8;font-size:12px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + fmtDur(r.totalMin) + '</td>' +
          '<td style="padding:10px 12px;color:#8B7FA3;font-size:11px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + escapeHtml(r.lastLogin) + '</td>' +
          '</tr>';
      }).join("");

  var reportTableRows = reportRows.length === 0
    ? '<tr><td colspan="4" style="padding:14px;color:#8B7FA3;text-align:center;font-size:12px;">No reports sent this week.</td></tr>'
    : reportRows.map(function(r) {
        return '<tr>' +
          '<td style="padding:10px 12px;color:#F96203;font-weight:700;font-size:12px;border-bottom:1px solid rgba(168,85,247,0.12);">' + escapeHtml(r.clientName) + '</td>' +
          '<td style="padding:10px 12px;color:#FFFBF8;font-size:12px;border-bottom:1px solid rgba(168,85,247,0.12);">' + escapeHtml(r.sentBy) + '</td>' +
          '<td style="padding:10px 12px;color:#8B7FA3;font-size:11px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + escapeHtml(r.sentDate) + '</td>' +
          '<td style="padding:10px 12px;color:#8B7FA3;font-size:11px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + escapeHtml(r.period) + '</td>' +
          '</tr>';
      }).join("");

  var overdueSection = overdueRows.length === 0
    ? '<div style="padding:16px 20px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);border-radius:10px;text-align:center;">' +
      '<div style="font-size:22px;font-weight:900;color:#34D399;margin-bottom:4px;">ALL CLEAR</div>' +
      '<div style="font-size:12px;color:#8B7FA3;">Every client has received a report within the 7-day SLA window.</div></div>'
    : '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
      '<tr>' +
      '<th style="padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#FF3D00;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(168,85,247,0.18);background:rgba(255,61,0,0.08);">Client</th>' +
      '<th style="padding:10px 12px;text-align:center;font-size:9px;font-weight:800;color:#FF3D00;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(168,85,247,0.18);background:rgba(255,61,0,0.08);">Days overdue</th>' +
      '<th style="padding:10px 12px;text-align:center;font-size:9px;font-weight:800;color:#FF3D00;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(168,85,247,0.18);background:rgba(255,61,0,0.08);">Last report</th>' +
      '</tr>' +
      overdueRows.map(function(r) {
        return '<tr>' +
          '<td style="padding:10px 12px;color:#FF3D00;font-weight:700;font-size:12px;border-bottom:1px solid rgba(168,85,247,0.12);">' + escapeHtml(r.clientName) + '</td>' +
          '<td style="padding:10px 12px;color:#FFFBF8;font-weight:900;font-size:14px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + r.daysOverdue + '</td>' +
          '<td style="padding:10px 12px;color:#8B7FA3;font-size:11px;border-bottom:1px solid rgba(168,85,247,0.12);text-align:center;">' + escapeHtml(r.lastSentDisplay) + '</td>' +
          '</tr>';
      }).join("") +
      '</table>';

  var thStyle = 'padding:10px 12px;text-align:left;font-size:9px;font-weight:800;color:#F96203;letter-spacing:2px;text-transform:uppercase;border-bottom:1px solid rgba(168,85,247,0.18);background:rgba(249,98,3,0.08);';

  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Activity Summary</title></head>' +
    '<body style="margin:0;padding:0;background:#06020e;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#06020e;padding:40px 16px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">' +

    // Header
    '<tr><td style="padding:40px 40px 28px;text-align:center;">' +
    '<div style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>' +
    '<div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">' +
    '<span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span></div>' +
    '<div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">Weekly Activity Summary</div>' +
    '</td></tr>' +

    // Divider
    '<tr><td style="padding:0 40px;"><div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);"></div></td></tr>' +

    // Period
    '<tr><td style="padding:24px 40px 8px;">' +
    '<div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:6px;">Reporting period</div>' +
    '<div style="font-size:18px;font-weight:900;color:#FFFBF8;line-height:1.3;">' + escapeHtml(weekLabel) + '</div>' +
    '</td></tr>' +

    // KPI strip
    '<tr><td style="padding:20px 40px 8px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td width="33%" style="padding:0 4px 0 0;">' +
    '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.18);border-radius:10px;padding:14px 12px;text-align:center;">' +
    '<div style="font-size:9px;color:#8B7FA3;letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Team logins</div>' +
    '<div style="font-size:24px;font-weight:900;color:#F96203;">' + loginRows.reduce(function(a, r) { return a + r.logins; }, 0) + '</div></div></td>' +
    '<td width="33%" style="padding:0 2px;">' +
    '<div style="background:rgba(255,255,255,0.04);border:1px solid rgba(168,85,247,0.18);border-radius:10px;padding:14px 12px;text-align:center;">' +
    '<div style="font-size:9px;color:#8B7FA3;letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Reports sent</div>' +
    '<div style="font-size:24px;font-weight:900;color:#22D3EE;">' + reportRows.length + '</div></div></td>' +
    '<td width="33%" style="padding:0 0 0 4px;">' +
    '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + (overdueRows.length > 0 ? 'rgba(255,61,0,0.35)' : 'rgba(52,211,153,0.25)') + ';border-radius:10px;padding:14px 12px;text-align:center;">' +
    '<div style="font-size:9px;color:#8B7FA3;letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;">Overdue</div>' +
    '<div style="font-size:24px;font-weight:900;color:' + (overdueRows.length > 0 ? '#FF3D00' : '#34D399') + ';">' + overdueRows.length + '</div></div></td>' +
    '</tr></table></td></tr>' +

    // Section 1: Team logins
    '<tr><td style="padding:28px 40px 8px;">' +
    '<div style="font-size:11px;color:#F96203;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:12px;">Dashboard activity by team member</div>' +
    '<div style="border:1px solid rgba(168,85,247,0.18);border-radius:10px;overflow:hidden;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
    '<tr>' +
    '<th style="' + thStyle + '">User</th>' +
    '<th style="' + thStyle + 'text-align:center;">Logins</th>' +
    '<th style="' + thStyle + 'text-align:center;">Session time</th>' +
    '<th style="' + thStyle + 'text-align:center;">Last active</th>' +
    '</tr>' +
    loginTableRows +
    '</table></div></td></tr>' +

    // Section 2: Reports sent
    '<tr><td style="padding:28px 40px 8px;">' +
    '<div style="font-size:11px;color:#22D3EE;letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:12px;">Client reports sent this week</div>' +
    '<div style="border:1px solid rgba(168,85,247,0.18);border-radius:10px;overflow:hidden;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
    '<tr>' +
    '<th style="' + thStyle.replace(/#F96203/g, "#22D3EE").replace(/249,98,3/g, "34,211,238") + '">Client</th>' +
    '<th style="' + thStyle.replace(/#F96203/g, "#22D3EE").replace(/249,98,3/g, "34,211,238") + '">Sent by</th>' +
    '<th style="' + thStyle.replace(/#F96203/g, "#22D3EE").replace(/249,98,3/g, "34,211,238") + 'text-align:center;">Date</th>' +
    '<th style="' + thStyle.replace(/#F96203/g, "#22D3EE").replace(/249,98,3/g, "34,211,238") + 'text-align:center;">Period</th>' +
    '</tr>' +
    reportTableRows +
    '</table></div></td></tr>' +

    // Section 3: Overdue alerts
    '<tr><td style="padding:28px 40px 8px;">' +
    '<div style="font-size:11px;color:' + (overdueRows.length > 0 ? '#FF3D00' : '#34D399') + ';letter-spacing:3px;font-weight:800;text-transform:uppercase;margin-bottom:12px;">SLA overdue alerts</div>' +
    '<div style="border:1px solid rgba(168,85,247,0.18);border-radius:10px;overflow:hidden;">' +
    overdueSection +
    '</div></td></tr>' +

    // CTA button
    '<tr><td style="padding:28px 40px 8px;" align="center">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
    '<tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">' +
    '<a href="' + origin + '" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:\'Helvetica Neue\',Helvetica,Arial,sans-serif;">Open Dashboard</a>' +
    '</td></tr></table></td></tr>' +

    // Divider
    '<tr><td style="padding:28px 40px 8px;"><div style="height:1px;background:rgba(168,85,247,0.16);"></div></td></tr>' +

    // Footer
    '<tr><td style="padding:20px 40px 32px;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
    '<tr><td valign="middle" style="width:56px;padding-right:14px;">' +
    '<img src="' + logoUrl + '" alt="GAS Marketing" width="48" height="48" style="width:48px;height:48px;border-radius:50%;display:block;border:0;"/>' +
    '</td><td valign="middle">' +
    '<div style="font-size:12px;color:#FFFBF8;font-weight:800;letter-spacing:3px;">' +
    '<span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span></div>' +
    '<div style="font-size:10px;color:#8B7FA3;letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;">Weekly Management Summary</div>' +
    '<div style="font-size:11px;color:#8B7FA3;margin-top:6px;">' +
    '<a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a></div>' +
    '</td></tr></table></td></tr>' +

    '</table></td></tr></table></body></html>';
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = cronSecret && authHeader === "Bearer " + cronSecret;

  if (!isCron) {
    if (!rateLimit(req, res, { maxPerMin: 6, maxPerHour: 20 })) return;
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  var dryRun = req.query.dryRun === "1" || req.query.dry === "1";
  var origin = "https://media-on-gas.vercel.app";

  // Date window: previous 7 days
  var now = new Date();
  var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var weekAgoIso = weekAgo.toISOString();
  var fmtD = function(d) { return d.toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }); };
  var weekLabel = fmtD(weekAgo) + " to " + fmtD(now);

  // 1. Usage events (logins + session durations)
  var usageEvents = [];
  try { usageEvents = await readUsageEvents(5000); } catch (_) {}

  var loginEvts = usageEvents.filter(function(e) {
    return (e.kind === "admin_login" || e.kind === "client_pw_login") && e.ts >= weekAgoIso;
  });
  var sessionEndEvts = usageEvents.filter(function(e) {
    return e.kind === "session_end" && e.ts >= weekAgoIso;
  });

  // Aggregate logins per user
  var loginByUser = {};
  loginEvts.forEach(function(e) {
    var who = e.actor || "unknown";
    if (!loginByUser[who]) loginByUser[who] = { user: who, logins: 0, totalMin: 0, lastLogin: "" };
    loginByUser[who].logins++;
    if (e.ts > loginByUser[who].lastLogin) loginByUser[who].lastLogin = e.ts;
  });
  // Merge session durations
  sessionEndEvts.forEach(function(e) {
    var who = e.actor || "unknown";
    var dur = e.meta && e.meta.durationMin ? parseInt(e.meta.durationMin) : 0;
    if (!loginByUser[who]) loginByUser[who] = { user: who, logins: 0, totalMin: 0, lastLogin: "" };
    loginByUser[who].totalMin += dur;
  });
  var loginRows = Object.keys(loginByUser).map(function(k) { return loginByUser[k]; })
    .sort(function(a, b) { return b.logins - a.logins; });
  // Format last login
  loginRows.forEach(function(r) {
    if (r.lastLogin) {
      try { r.lastLogin = new Date(r.lastLogin).toLocaleDateString("en-ZA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
      catch (_) {}
    }
  });

  // 2. Reports sent this week
  var emailLog = [];
  try { emailLog = await readEmailLog(1000); } catch (_) {}

  var teamEmailSet = {};
  try {
    var users = await listUsers();
    users.forEach(function(u) { if (u && u.email) teamEmailSet[normalizeEmail(u.email)] = true; });
  } catch (_) {}

  var reportRows = emailLog.filter(function(e) {
    if (!e.sentAt || e.sentAt < weekAgoIso) return false;
    // Skip internal test sends
    var to = Array.isArray(e.to) ? e.to : [];
    if (to.length === 0) return false;
    var allInternal = true;
    for (var i = 0; i < to.length; i++) {
      if (!teamEmailSet[normalizeEmail(to[i])]) { allInternal = false; break; }
    }
    return !allInternal;
  }).map(function(e) {
    return {
      clientName: e.clientName || e.clientSlug || "Unknown",
      sentBy: e.senderName || e.senderEmail || "Unknown",
      sentDate: (function() {
        try { return new Date(e.sentAt).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }); }
        catch (_) { return e.sentAt ? e.sentAt.substring(0, 10) : "-"; }
      })(),
      period: (e.fromDate || "?") + " to " + (e.toDate || "?")
    };
  }).sort(function(a, b) { return (b.sentDate || "").localeCompare(a.sentDate || ""); });

  // 3. Overdue SLA alerts (same logic as nudge-cron)
  var slaMs = SLA_DAYS * 24 * 60 * 60 * 1000;
  var byIdentity = {};
  emailLog.forEach(function(e) {
    // Skip internal test sends
    var to = Array.isArray(e.to) ? e.to : [];
    if (to.length === 0) return;
    var allInternal = true;
    for (var i = 0; i < to.length; i++) {
      if (!teamEmailSet[normalizeEmail(to[i])]) { allInternal = false; break; }
    }
    if (allInternal) return;
    var primary = to[0] || "";
    var identity = e.clientIdentity || clientIdentity(primary, e.clientSlug) || "";
    if (!identity) return;
    var ts = Date.parse(e.sentAt || "");
    if (!ts) return;
    var cur = byIdentity[identity];
    if (!cur || ts > cur.lastSentTs) {
      byIdentity[identity] = {
        identity: identity, lastSentTs: ts, lastSlug: e.clientSlug || ""
      };
    }
  });
  // Merge by slug (same fix as nudge-cron)
  var bySlug = {};
  Object.keys(byIdentity).forEach(function(id) {
    var rec = byIdentity[id];
    var ns = String(rec.lastSlug || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!ns) return;
    var prev = bySlug[ns];
    if (!prev || rec.lastSentTs > prev.lastSentTs) bySlug[ns] = rec;
  });
  Object.keys(byIdentity).forEach(function(id) {
    var rec = byIdentity[id];
    var ns = String(rec.lastSlug || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (ns && bySlug[ns] && bySlug[ns] !== rec) delete byIdentity[id];
  });

  var overdueRows = Object.keys(byIdentity).map(function(id) { return byIdentity[id]; })
    .filter(function(c) { return (now.getTime() - c.lastSentTs) > slaMs; })
    .map(function(c) {
      return {
        clientName: displayNameFromIdentity(c.identity, c.lastSlug),
        daysOverdue: Math.floor((now.getTime() - c.lastSentTs) / (24 * 60 * 60 * 1000)),
        lastSentDisplay: new Date(c.lastSentTs).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })
      };
    })
    .sort(function(a, b) { return b.daysOverdue - a.daysOverdue; });

  // Build email
  var html = buildHtml({
    weekLabel: weekLabel,
    loginRows: loginRows,
    reportRows: reportRows,
    overdueRows: overdueRows,
    origin: origin
  });

  var text = "MEDIA ON GAS Weekly Activity Summary\n" +
    weekLabel + "\n\n" +
    "Team logins: " + loginRows.reduce(function(a, r) { return a + r.logins; }, 0) + "\n" +
    "Reports sent: " + reportRows.length + "\n" +
    "Overdue: " + overdueRows.length + "\n\n" +
    "Open dashboard: " + origin;

  if (dryRun) {
    res.status(200).json({
      ok: true, dryRun: true, weekLabel: weekLabel,
      loginRows: loginRows, reportRows: reportRows, overdueRows: overdueRows,
      html: html
    });
    return;
  }

  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(200).json({ ok: false, reason: "GMAIL credentials not configured", dryRun: false,
      loginRows: loginRows, reportRows: reportRows, overdueRows: overdueRows });
    return;
  }

  var transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  });

  try {
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: TO_EMAIL,
      cc: CC_EMAIL,
      subject: "Weekly Activity Summary | " + weekLabel,
      text: text,
      html: html
    });
    res.status(200).json({ ok: true, sent: true, to: TO_EMAIL, cc: CC_EMAIL, weekLabel: weekLabel,
      loginCount: loginRows.length, reportCount: reportRows.length, overdueCount: overdueRows.length });
  } catch (err) {
    console.error("Weekly summary send failed", err);
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
}
