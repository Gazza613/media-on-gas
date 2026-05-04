import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { getUser, createInvite, normalizeEmail, isSuperadminEmail } from "./_users.js";

// Superadmin-only: invite a team member. Creates a single-use token,
// stores it in Redis with a 7-day TTL, and emails the invitee a GAS
// Marketing branded link to set their own password.

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildInviteHtml(opts) {
  var greetingName = escapeHtml(opts.name || "there");
  var invitedByName = escapeHtml(opts.invitedByName || "Gary Berman");
  var signupUrl = opts.signupUrl;
  var logoUrl = opts.origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var expiresDisplay = new Date(opts.expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're invited to MEDIA ON GAS</title>
</head>
<body style="margin:0;padding:0;background:#06020e;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#06020e;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:linear-gradient(170deg,#0d0618 0%,#1a0b2e 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">

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
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Team Invitation</div>
        <div style="font-size:26px;font-weight:900;color:#FFFBF8;line-height:1.2;margin-bottom:14px;">You're invited to the dashboard</div>
        <div style="font-size:15px;color:#FFFBF8;line-height:1.7;">
          Hi ${greetingName},
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          <strong style="color:#F96203;">${invitedByName}</strong> has invited you to join the MEDIA ON GAS dashboard. This is the internal performance tool used by the GAS Marketing team to monitor paid media across Meta, TikTok, and Google.
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          Click the button below to set your own password and get started. This invitation expires on <strong style="color:#F96203;">${expiresDisplay}</strong>.
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${signupUrl}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Accept Invitation</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Sets your password and signs you in</div>
      </td></tr>

      <tr><td style="padding:20px 40px 0;">
        <div style="font-size:11px;color:rgba(255,251,248,0.55);line-height:1.6;text-align:center;">
          Trouble with the button? Copy this link into your browser:<br>
          <a href="${signupUrl}" style="color:#8B7FA3;word-break:break-all;">${signupUrl}</a>
        </div>
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
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 30 }))) return;
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  // Superadmin-only gate.
  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isSuperadminEmail(session.email)) { res.status(403).json({ error: "Superadmin only" }); return; }

  var body = req.body || {};
  var inviteEmail = normalizeEmail(body.email);
  var inviteName = String(body.name || "").trim();
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(inviteEmail)) { res.status(400).json({ error: "Valid email required" }); return; }
  if (!inviteName) { res.status(400).json({ error: "Name required" }); return; }

  // Prevent inviting the superadmin or an existing active account.
  var existing = await getUser(inviteEmail);
  if (existing && existing.passwordHash && existing.active !== false) {
    res.status(409).json({ error: "This user already has an active account." });
    return;
  }

  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) { res.status(500).json({ error: "Mailer not configured" }); return; }

  var invite = await createInvite(inviteEmail, inviteName, session.email);
  var origin = (req.headers.origin || req.headers.Origin || "https://media-on-gas.vercel.app").replace(/\/$/, "");
  var signupUrl = origin + "/signup?token=" + encodeURIComponent(invite.token);

  try {
    var transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass }
    });
    var html = buildInviteHtml({
      name: inviteName,
      invitedByName: session.name || "Gary Berman",
      signupUrl: signupUrl,
      expiresAt: invite.expiresAt,
      origin: origin
    });
    var text = "Hi " + inviteName + ",\n\n" +
      (session.name || "Gary Berman") + " has invited you to the MEDIA ON GAS dashboard.\n\n" +
      "Accept and set your password: " + signupUrl + "\n\n" +
      "This invitation expires on " + new Date(invite.expiresAt).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }) + ".\n\n" +
      "GAS Marketing Automation\n" + gmailUser;
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: inviteEmail,
      subject: "You're invited to MEDIA ON GAS",
      text: text,
      html: html
    });
  } catch (err) {
    console.error("Invite send failed", err);
    res.status(500).json({ error: "Email send failed: " + String(err && err.message || err) });
    return;
  }

  res.status(200).json({ ok: true, email: inviteEmail, name: inviteName, expiresAt: invite.expiresAt });
}
