// Public, rate-limited password-reset request endpoint.
//
// Always returns 200, even when the email doesn't exist or the account is
// revoked. This prevents an attacker from probing valid emails. The audit
// email to gary@gasmarketing.co.za is fired only when a token actually got
// minted, so the inbox isn't flooded with bogus requests.
//
// Tighter rate limit than the invite endpoint: 5 attempts per minute per
// IP, 20 per hour. Reset tokens are themselves 1-hour TTL, one-time-use.

import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { logUsageEvent } from "./_audit.js";
import {
  getUser, createResetToken, normalizeEmail, isSuperadminEmail
} from "./_users.js";
import { buildResetHtml, buildResetText, buildAuditHtml } from "./_resetEmail.js";

var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];
function setCors(req, res) {
  var origin = req.headers.origin || req.headers.Origin || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 5, maxPerHour: 20 }))) return;

  var body = req.body || {};
  var email = normalizeEmail(body.email);
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) {
    // Even on malformed email return the generic OK message — never leak
    // anything an attacker could use to enumerate inputs.
    res.status(200).json({ ok: true });
    return;
  }

  var user = await getUser(email);
  // Generic OK if user doesn't exist, has never set a password, or is
  // currently revoked. We still spend a few ms processing so the response
  // time roughly matches the success path (a tiny defence against timing
  // attacks).
  if (!user || !user.passwordHash || user.active === false) {
    // Burn ~50ms so the timing roughly matches success.
    await new Promise(function(r){ setTimeout(r, 50); });
    res.status(200).json({ ok: true });
    return;
  }

  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    // Mailer misconfigured. Log it but still return generic OK so the
    // attacker (and the user) can't tell.
    console.error("[forgot-password] mailer not configured");
    res.status(200).json({ ok: true });
    return;
  }

  var record;
  try {
    record = await createResetToken(email, "self");
  } catch (err) {
    console.error("[forgot-password] createResetToken failed", err);
    res.status(200).json({ ok: true });
    return;
  }

  var origin = (req.headers.origin || req.headers.Origin || "https://media-on-gas.vercel.app").replace(/\/$/, "");
  var resetUrl = origin + "/signup?token=" + encodeURIComponent(record.token);

  try {
    var transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass }
    });
    var html = buildResetHtml({
      name: user.name || "",
      resetUrl: resetUrl,
      expiresAt: record.expiresAt,
      origin: origin,
      triggeredBy: "self"
    });
    var text = buildResetText({
      name: user.name || "",
      resetUrl: resetUrl,
      expiresAt: record.expiresAt,
      triggeredBy: "self"
    });
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: email,
      subject: "Reset your MEDIA ON GAS password",
      text: text,
      html: html
    });
    // Best-effort audit email to Gary, separate try/catch so a failure
    // here doesn't break the user's reset.
    try {
      await transporter.sendMail({
        from: "GAS Marketing Automation <" + gmailUser + ">",
        to: "gary@gasmarketing.co.za",
        subject: "[Audit] Password reset requested for " + email,
        html: buildAuditHtml({ targetEmail: email, source: "self" })
      });
    } catch (auditErr) {
      console.error("[forgot-password] audit email failed", auditErr);
    }
    try {
      await logUsageEvent("password_reset_requested", email, {
        source: "self",
        isSuperadmin: isSuperadminEmail(email)
      });
    } catch (_) {}
  } catch (err) {
    console.error("[forgot-password] send failed", err);
    // Even a send failure returns generic OK — don't help the attacker
    // distinguish.
  }

  res.status(200).json({ ok: true });
}
