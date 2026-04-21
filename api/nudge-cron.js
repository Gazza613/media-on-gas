import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { readEmailLog } from "./_audit.js";
import { registeredDomain, clientIdentity, displayNameFromIdentity, isFreeMailDomain } from "./_clientIdentity.js";

// Daily cron: finds every client whose last report was sent more than 7
// days ago and emails the account manager a quirky nudge, BCCing Gary.
// Client identity comes from the recipient email domain (survives personnel
// changes at the client side). Account manager is the authenticated
// sender on the last send for that client.
//
// Trigger: Vercel cron hits GET /api/nudge-cron with Authorization:
// Bearer <CRON_SECRET>. An admin can also call it manually from a browser
// with a logged-in admin session, the response shows what would or did fire.

var SUPERADMIN_EMAIL = "gary@gasmarketing.co.za";
var SLA_DAYS = 7;
var BUFFER_HOURS = 2; // hit right after SLA, not in the middle of day 7

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildNudgeHtml(opts) {
  var clientName = escapeHtml(opts.clientName);
  var amName = escapeHtml(opts.amName || "there");
  var lastSentDisplay = opts.lastSentDisplay;
  var daysOverdue = opts.daysOverdue;
  var dashboardUrl = opts.dashboardUrl;
  var logoUrl = opts.origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gentle reminder, ${clientName} is due a report</title></head>
<body style="margin:0;padding:0;background:#06020e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#06020e;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">
      <tr><td style="padding:40px 40px 28px;text-align:center;">
        <div style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">
          <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
        </div>
        <div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">A gentle nudge, not a telling off</div>
      </td></tr>

      <tr><td style="padding:0 40px;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);"></div>
      </td></tr>

      <tr><td style="padding:36px 40px 12px;">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Reporting SLA check</div>
        <div style="font-size:26px;font-weight:900;color:#FFFBF8;line-height:1.25;margin-bottom:14px;">Pssst, ${clientName} hasn't had their report in ${daysOverdue} days.</div>
        <div style="font-size:15px;color:#FFFBF8;line-height:1.7;">Hi ${amName},</div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          Our client-facing SLA is one report every 7 days. The last report for <strong style="color:#F96203;">${clientName}</strong> was sent on <strong style="color:#F96203;">${lastSentDisplay}</strong>. That's now <strong style="color:#F96203;">${daysOverdue} days ago</strong>, which is past the line.
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          Takes two minutes to pull, two minutes to send. Your client is probably wondering where the numbers are.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Open Dashboard</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Pull the latest, click Share, pick ${clientName}, send</div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);"></div>
      </td></tr>

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
              <div style="font-size:10px;color:#8B7FA3;letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;">Automated SLA watcher</div>
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

// Groups audit entries by client identity, returns the last-send record
// per client plus derived fields.
function groupByClient(entries) {
  var byIdentity = {};
  entries.forEach(function(e) {
    // Identity is stored on each entry now (added in email-share.js). Fall
    // back to deriving on the fly for historical rows that predate the
    // field being captured.
    var primary = Array.isArray(e.to) && e.to.length > 0 ? e.to[0] : "";
    var identity = e.clientIdentity || clientIdentity(primary, e.clientSlug) || "";
    if (!identity) return;
    var ts = Date.parse(e.sentAt || "");
    if (!ts) return;
    var cur = byIdentity[identity];
    if (!cur || ts > cur.lastSentTs) {
      byIdentity[identity] = {
        identity: identity,
        lastSentTs: ts,
        lastSentIso: e.sentAt,
        lastSlug: e.clientSlug || "",
        lastSenderEmail: e.senderEmail || "",
        lastSenderName: e.senderName || "",
        lastPrimaryRecipient: primary,
        lastRecipients: e.to || [],
        lastDomain: registeredDomain(primary)
      };
    }
  });
  return byIdentity;
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = cronSecret && authHeader === "Bearer " + cronSecret;
  var isManual = false;

  if (!isCron) {
    if (!rateLimit(req, res, { maxPerMin: 6, maxPerHour: 30 })) return;
    // Allow an admin to trigger manually from the dashboard.
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    isManual = true;
  }

  var dryRun = req.query.dryRun === "1" || req.query.dry === "1";

  // Pull a reasonably deep window of audit entries so a client that last
  // reported 29 days ago still registers.
  var entries = [];
  try { entries = await readEmailLog(1000); } catch (_) { entries = []; }

  var byClient = groupByClient(entries);
  var identities = Object.keys(byClient);
  var now = Date.now();
  var slaMs = SLA_DAYS * 24 * 60 * 60 * 1000 + BUFFER_HOURS * 60 * 60 * 1000;

  var overdue = identities.map(function(id) { return byClient[id]; })
    .filter(function(c) { return (now - c.lastSentTs) > slaMs; });

  var results = [];
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  var canSend = !!(gmailUser && gmailPass);
  var transporter = canSend ? nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  }) : null;

  var origin = "https://media-on-gas.vercel.app";
  var todayKey = new Date().toISOString().slice(0, 10);

  for (var i = 0; i < overdue.length; i++) {
    var c = overdue[i];
    var am = c.lastSenderEmail || SUPERADMIN_EMAIL;
    var daysOverdue = Math.floor((now - c.lastSentTs) / (24 * 60 * 60 * 1000));
    var clientName = displayNameFromIdentity(c.identity, c.lastSlug);
    var lastSentDisplay = new Date(c.lastSentTs).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });

    // Dedup: only nudge once per calendar day per client, so a long-
    // overdue client doesn't get a daily blast if the cron re-fires.
    var dedupKey = "nudge:sent:" + c.identity + ":" + todayKey;
    if (!dryRun && canSend) {
      var seen = await redisCmd(["SET", dedupKey, "1", "EX", "172800", "NX"]);
      if (!seen || seen.result !== "OK") {
        results.push({ identity: c.identity, clientName: clientName, status: "already_nudged_today" });
        continue;
      }
    }

    var html = buildNudgeHtml({
      clientName: clientName,
      amName: c.lastSenderName || "",
      lastSentDisplay: lastSentDisplay,
      daysOverdue: daysOverdue,
      dashboardUrl: origin,
      origin: origin
    });
    var text = "Pssst, " + clientName + " hasn't had a report in " + daysOverdue + " days.\n\n" +
      "Last sent on " + lastSentDisplay + ".\n\n" +
      "Open the dashboard and send: " + origin + "\n\n" +
      "GAS Marketing Automation";

    if (dryRun || !canSend) {
      results.push({
        identity: c.identity, clientName: clientName, am: am,
        lastSent: c.lastSentIso, daysOverdue: daysOverdue,
        wouldNotify: [am, SUPERADMIN_EMAIL], status: dryRun ? "dry_run" : "mailer_not_configured"
      });
      continue;
    }

    try {
      var bccList = am.toLowerCase() === SUPERADMIN_EMAIL ? [] : [SUPERADMIN_EMAIL];
      await transporter.sendMail({
        from: "GAS Marketing Automation <" + gmailUser + ">",
        to: am,
        bcc: bccList,
        subject: "Pssst, " + clientName + " is " + daysOverdue + " days overdue for a report",
        text: text,
        html: html
      });
      results.push({ identity: c.identity, clientName: clientName, am: am, daysOverdue: daysOverdue, status: "sent" });
    } catch (err) {
      console.error("Nudge send failed", c.identity, err);
      results.push({ identity: c.identity, clientName: clientName, am: am, status: "error: " + String(err && err.message || err) });
    }
  }

  res.status(200).json({
    ok: true,
    mode: isCron ? "cron" : "manual",
    dryRun: dryRun,
    slaDays: SLA_DAYS,
    clientsTracked: identities.length,
    overdueCount: overdue.length,
    nudges: results,
    checkedAt: new Date().toISOString()
  });
}
