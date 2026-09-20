// Sami Hub admin-triggered email notifications.
//
// Two lifecycle events send an email so the team member knows to act:
//   1. Admin flips SAMI ON       → "Access granted, set your PIN"
//   2. Admin clicks RESET PIN    → "Your PIN was reset, set a new one"
//
// Uses the same nodemailer + Gmail SMTP transport nudge-cron.js and
// invite.js already use. Missing GMAIL_USER / GMAIL_APP_PASSWORD makes
// the send a silent no-op so the underlying access toggle / reset
// still succeeds during local dev or a broken mail config.

import nodemailer from "nodemailer";

var HUB_URL = process.env.SAMI_HUB_URL || "https://media.gasmarketing.co.za";

function getTransport() {
  var user = process.env.GMAIL_USER;
  var pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: user, pass: pass }
  });
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function shell(bodyHtml) {
  return [
    "<div style=\"font-family:Inter,system-ui,sans-serif;background:#0F0723;padding:28px 20px;color:#FFFBF8\">",
    "  <div style=\"max-width:520px;margin:0 auto;background:linear-gradient(170deg,#0F1820,#13202C);border-radius:20px;border:1px solid rgba(249,98,3,0.20);padding:36px 32px\">",
    "    <div style=\"font-size:11px;font-weight:800;color:#F96203;letter-spacing:6px;text-transform:uppercase;margin-bottom:4px\">GAS Marketing Automation</div>",
    "    <div style=\"font-size:20px;font-weight:900;color:#FFFBF8;letter-spacing:2px;margin-bottom:20px\">SAMI · CAMPAIGN HUB</div>",
    bodyHtml,
    "    <div style=\"margin-top:24px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);font-size:10px;color:#8B7FA3\">Sent automatically by the GAS dashboard. If you were not expecting this, reply and let Gary know.</div>",
    "  </div>",
    "</div>"
  ].join("");
}

// Called after setSamiAccess(email, true) succeeds AND the member was
// not previously enabled. `invitedByName` is the admin's display name
// (falls back to email if the session lacks a name).
export async function sendSamiAccessGrantedEmail(user, invitedByName) {
  var transporter = getTransport();
  if (!transporter) return { sent: false, reason: "no-mailer" };
  var name = user && user.name ? user.name : (user && user.email ? user.email.split("@")[0] : "there");
  var email = user && user.email;
  if (!email) return { sent: false, reason: "no-email" };

  var body = [
    "    <div style=\"font-size:16px;font-weight:800;margin-bottom:12px\">Hi " + escapeHtml(name) + ", you now have access to Sami.</div>",
    "    <div style=\"font-size:13px;line-height:1.65;color:#c9c1d5;margin-bottom:16px\">",
    "      " + escapeHtml(invitedByName || "Your admin") + " has enabled you to use the Create & Optimise Hub. Sami plans campaigns with you and pushes the changes live to Meta, TikTok, Google Ads and LinkedIn, with every write paused and awaiting your approval.",
    "    </div>",
    "    <div style=\"background:rgba(249,98,3,0.08);border:1px solid rgba(249,98,3,0.28);border-radius:12px;padding:16px;margin-bottom:16px\">",
    "      <div style=\"font-size:11px;font-weight:800;color:#F96203;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px\">Next step</div>",
    "      <div style=\"font-size:13px;color:#FFFBF8;line-height:1.6\">Set your own 4-digit Sami PIN. Nobody, including admins, ever sees it. If you forget it, an admin can reset it and you set a fresh one.</div>",
    "    </div>",
    "    <div style=\"text-align:center;margin-bottom:14px\">",
    "      <a href=\"" + HUB_URL + "\" style=\"display:inline-block;background:linear-gradient(135deg,#FF3D00,#FF6B00);color:#fff;padding:12px 28px;border-radius:10px;font-weight:800;font-size:12px;letter-spacing:2px;text-decoration:none;text-transform:uppercase\">Open the Dashboard</a>",
    "    </div>",
    "    <div style=\"font-size:11px;color:#8B7FA3;line-height:1.65\">Sign in as usual, click the <strong>Create</strong> tab, and you will be prompted to set your PIN. Any tab that lets Sami spend money paints a preview card first, so you can Approve or Reject every single write.</div>"
  ].join("\n");

  await transporter.sendMail({
    from: "GAS Marketing Automation <" + process.env.GMAIL_USER + ">",
    to: email,
    subject: "Sami Hub access granted · set your 4-digit PIN",
    html: shell(body)
  });
  return { sent: true, to: email };
}

// Called after clearSamiPin(email) succeeds via admin op=reset. Tells
// the member to set a new PIN on next Sami visit.
export async function sendSamiPinResetEmail(user, resetByName) {
  var transporter = getTransport();
  if (!transporter) return { sent: false, reason: "no-mailer" };
  var name = user && user.name ? user.name : (user && user.email ? user.email.split("@")[0] : "there");
  var email = user && user.email;
  if (!email) return { sent: false, reason: "no-email" };

  var body = [
    "    <div style=\"font-size:16px;font-weight:800;margin-bottom:12px\">Hi " + escapeHtml(name) + ", your Sami PIN was reset.</div>",
    "    <div style=\"font-size:13px;line-height:1.65;color:#c9c1d5;margin-bottom:16px\">",
    "      " + escapeHtml(resetByName || "An admin") + " reset your Sami PIN. On your next visit to the Create tab, you will be prompted to set a fresh 4-digit PIN before you can enter Sami.",
    "    </div>",
    "    <div style=\"text-align:center;margin-bottom:14px\">",
    "      <a href=\"" + HUB_URL + "\" style=\"display:inline-block;background:linear-gradient(135deg,#FF3D00,#FF6B00);color:#fff;padding:12px 28px;border-radius:10px;font-weight:800;font-size:12px;letter-spacing:2px;text-decoration:none;text-transform:uppercase\">Open the Dashboard</a>",
    "    </div>",
    "    <div style=\"font-size:11px;color:#8B7FA3;line-height:1.65\">If you did not expect this, reply to this email and let Gary know. Nobody, including admins, ever sees the plaintext PIN.</div>"
  ].join("\n");

  await transporter.sendMail({
    from: "GAS Marketing Automation <" + process.env.GMAIL_USER + ">",
    to: email,
    subject: "Sami Hub PIN reset · set a new PIN on next visit",
    html: shell(body)
  });
  return { sent: true, to: email };
}
