import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { issueToken } from "./_jwt.js";

// Admin-only endpoint. Issues a signed share token and emails a branded HTML
// report link from grow@gasmarketing.co.za via Gmail SMTP (app password).
// Env vars required: GMAIL_USER, GMAIL_APP_PASSWORD, DASHBOARD_JWT_SECRET.

function buildEmailHtml(opts) {
  var clientName = opts.clientSlug
    .split("-")
    .map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); })
    .join(" ");
  var dateRange = opts.from + " to " + opts.to;
  var url = opts.shareUrl;
  var expiresDisplay = new Date(opts.expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
  // World-class in this context: dark brand-aligned, single hero CTA, crisp spacing, no noise.
  // Inline styles only since email clients strip <style>.
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
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">

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
          Your live performance dashboard is ready.
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.78);line-height:1.7;margin-top:12px;">
          One click opens a full, interactive view of your media performance for the period above. Every metric is pulled live from the ad platforms, no exports, no stale numbers, always current.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${url}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">View Live Dashboard</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Opens instantly, no login required</div>
      </td></tr>

      <tr><td style="padding:32px 40px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(168,85,247,0.16);border-radius:12px;">
          <tr><td style="padding:18px 22px;">
            <div style="font-size:9px;color:#F96203;letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:8px;">Inside your dashboard</div>
            <div style="font-size:13px;color:#FFFBF8;line-height:1.9;">
              Reach, impressions and frequency across all active platforms<br>
              Clicks, click-through rate and cost-per-click blended<br>
              Lead volume, cost per lead and conversion efficiency<br>
              Platform-by-platform spend and performance breakdown<br>
              Creative top performers and objective-level insights
            </div>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:20px 40px 0;">
        <div style="font-size:11px;color:rgba(255,251,248,0.55);line-height:1.6;">
          This link is scoped specifically to your campaigns. No login required, it stays active until <strong style="color:#F96203;">${expiresDisplay}</strong>.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);"></div>
      </td></tr>

      <tr><td style="padding:16px 40px 32px;text-align:center;">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:1px;line-height:1.7;font-weight:500;">
          Delivered by <strong style="color:#F96203;">GAS Marketing Automation</strong><br>
          <a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a>
        </div>
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

    var html = buildEmailHtml({
      clientSlug: clientSlug,
      from: from,
      to: to,
      shareUrl: shareUrl,
      expiresAt: expiresAt
    });

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
      html: html
    });

    res.status(200).json({
      ok: true,
      messageId: info.messageId,
      shareUrl: shareUrl,
      expiresAt: expiresAt,
      sentTo: toList,
      cc: ccList,
      bcc: bccList
    });
  } catch (err) {
    console.error("Email share error", err);
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
