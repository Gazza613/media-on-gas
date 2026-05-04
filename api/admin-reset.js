// Superadmin-only password reset trigger.
//
// Body: { email: "user@example.com" }
// Response on success:
//   { ok: true, email, resetUrl, expiresAt, emailSent: true|false }
//
// The endpoint always tries to email the target user (matching the
// self-serve UX), and also returns the resetUrl in the response so the
// superadmin can copy/paste it into Slack or another channel if email
// delivery is uncertain.
//
// Hard rule: a superadmin account cannot be reset by anyone via this
// endpoint, even another superadmin. The only path to reset a superadmin
// is the self-serve /api/forgot-password flow (where the email is the
// proof of identity).

import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { logUsageEvent } from "./_audit.js";
import {
  getUser, createResetToken, normalizeEmail, isSuperadminEmail
} from "./_users.js";
import { buildResetHtml, buildResetText, buildAuditHtml } from "./_resetEmail.js";

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  // Superadmin gate.
  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isSuperadminEmail(session.email)) {
    res.status(403).json({ error: "Superadmin only" });
    return;
  }

  var body = req.body || {};
  var targetEmail = normalizeEmail(body.email);
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(targetEmail)) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  // Refuse to reset another superadmin (defence-in-depth even though
  // there is only one superadmin today). Forces self-serve reset for that
  // role so the audit trail clearly shows the user's own action.
  if (isSuperadminEmail(targetEmail)) {
    res.status(403).json({
      error: "Superadmin accounts cannot be reset from the admin panel. Use the Forgot password? link on the login screen instead."
    });
    return;
  }

  var user = await getUser(targetEmail);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!user.passwordHash) {
    res.status(409).json({
      error: "This user hasn't accepted their invite yet. Resend the invitation instead of a reset."
    });
    return;
  }
  if (user.active === false) {
    res.status(409).json({
      error: "This account is revoked. Restore it first, then reset the password."
    });
    return;
  }

  var record;
  try {
    record = await createResetToken(targetEmail, session.email);
  } catch (err) {
    console.error("[admin-reset] createResetToken failed", err);
    res.status(500).json({ error: "Could not create reset token" });
    return;
  }

  var origin = (req.headers.origin || req.headers.Origin || "https://media-on-gas.vercel.app").replace(/\/$/, "");
  var resetUrl = origin + "/signup?token=" + encodeURIComponent(record.token);

  // Try to email the user. Email failure does NOT fail the request, since
  // the admin can still copy the resetUrl from the response and share it
  // out-of-band.
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  var emailSent = false;
  if (gmailUser && gmailPass) {
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
        triggeredBy: session.name || session.email
      });
      var text = buildResetText({
        name: user.name || "",
        resetUrl: resetUrl,
        expiresAt: record.expiresAt,
        triggeredBy: session.name || session.email
      });
      await transporter.sendMail({
        from: "GAS Marketing Automation <" + gmailUser + ">",
        to: targetEmail,
        subject: "Reset your MEDIA ON GAS password",
        text: text,
        html: html
      });
      emailSent = true;
      // Audit email to Gary so an admin reset is on the record even when
      // Gary is the one who triggered it (acts as a sanity check).
      try {
        await transporter.sendMail({
          from: "GAS Marketing Automation <" + gmailUser + ">",
          to: "gary@gasmarketing.co.za",
          subject: "[Audit] Admin reset triggered for " + targetEmail,
          html: buildAuditHtml({
            targetEmail: targetEmail,
            source: "admin",
            requestedBy: session.email
          })
        });
      } catch (auditErr) {
        console.error("[admin-reset] audit email failed", auditErr);
      }
    } catch (sendErr) {
      console.error("[admin-reset] send failed", sendErr);
    }
  }

  try {
    await logUsageEvent("password_reset_requested", targetEmail, {
      source: "admin",
      requestedBy: session.email,
      emailSent: emailSent
    });
  } catch (_) {}

  res.status(200).json({
    ok: true,
    email: targetEmail,
    resetUrl: resetUrl,
    expiresAt: record.expiresAt,
    emailSent: emailSent
  });
}
