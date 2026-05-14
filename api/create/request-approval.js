// High-spend approval gate. When a campaign's daily budget exceeds
// R3,000/day or lifetime exceeds R20,000, the team can't launch it
// directly, they request approval here. A second-person approver
// (currently gary@ and sam@) gets an email with a one-click approve
// link. Once approved, the team's next submit includes the token and
// the campaign create endpoint validates and proceeds.
//
// Storage: Redis hash at `approval:<token>` with the campaign config
// fingerprint and approval status. Expires after 24 hours so stale
// approvals can't be used to push different campaigns later.

import nodemailer from "nodemailer";
import crypto from "crypto";
import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

export const config = { maxDuration: 30 };

// Approvers list. Currently only Gary. Easy to extend later by adding
// addresses here, every entry receives the same Approve link.
var APPROVERS = ["gary@gasmarketing.co.za"];
var TTL_SECONDS = 24 * 60 * 60;
var ORIGIN = "https://media-on-gas.vercel.app";

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getRedisCreds();
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

// Fingerprint scopes an approval to the exact campaign config. If any
// of these change after approval is granted, the token is invalidated
// on the campaign-create side and the team must re-request.
export function approvalFingerprint(b) {
  var parts = [
    String(b.accountId || ""),
    String(b.campaignName || ""),
    String(b.dailyBudgetCents || 0),
    String(b.lifetimeBudgetCents || 0),
    String(b.budgetMode || ""),
    String(b.funding || "")
  ].join("|");
  return crypto.createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10 }))) return;

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var fp = approvalFingerprint(body);
  var token = crypto.randomBytes(24).toString("hex");
  var requestedBy = (req.authPrincipal && (req.authPrincipal.email || req.authPrincipal.name)) || "create-tab";
  var record = {
    token: token,
    fingerprint: fp,
    status: "pending",
    requestedBy: requestedBy,
    requestedAt: new Date().toISOString(),
    approvedBy: null,
    approvedAt: null,
    campaignName: String(body.campaignName || ""),
    accountName: String(body.accountName || body.accountId || ""),
    productName: String(body.productName || ""),
    audienceLabel: String(body.audienceLabel || ""),
    objective: String(body.objective || ""),
    dailyBudgetCents: parseInt(body.dailyBudgetCents || 0, 10),
    lifetimeBudgetCents: parseInt(body.lifetimeBudgetCents || 0, 10),
    budgetMode: String(body.budgetMode || ""),
    funding: String(body.funding || "")
  };

  await redisCmd(["SET", "approval:" + token, JSON.stringify(record), "EX", String(TTL_SECONDS)]);

  // Send email to approvers. If GMAIL creds are missing we still return
  // success with the token so the team can manually verify out-of-band;
  // the warning surfaces in the response.
  var emailSent = false;
  var emailReason = "";
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    emailReason = "GMAIL credentials not configured";
  } else {
    try {
      var transporter = nodemailer.createTransport({
        host: "smtp.gmail.com", port: 465, secure: true,
        auth: { user: gmailUser, pass: gmailPass }
      });
      var rand = record.budgetMode === "lifetime"
        ? "R" + (record.lifetimeBudgetCents / 100).toLocaleString("en-ZA") + " lifetime"
        : "R" + (record.dailyBudgetCents / 100).toLocaleString("en-ZA") + " / day";
      var approveUrl = ORIGIN + "/api/create/approve?token=" + encodeURIComponent(token);
      var html = '<!DOCTYPE html><html><body style="margin:0;padding:30px;background:#070E16;font-family:Helvetica,Arial,sans-serif;color:#FFFBF8;">' +
        '<div style="max-width:560px;margin:0 auto;background:#0F1820;border:1px solid rgba(168,85,247,0.18);border-radius:18px;overflow:hidden;">' +
        '<div style="padding:28px 30px 18px;">' +
          '<div style="font-size:11px;color:#F96203;letter-spacing:5px;font-weight:800;text-transform:uppercase;margin-bottom:8px;">High-spend approval requested</div>' +
          '<div style="font-size:22px;font-weight:900;color:#FFFBF8;line-height:1.3;margin-bottom:14px;">' + escapeHtml(record.campaignName) + '</div>' +
          '<div style="font-size:13px;color:rgba(255,251,248,0.82);line-height:1.7;">' +
            '<strong>' + escapeHtml(requestedBy) + '</strong> wants to launch this campaign. Budget exceeds the high-spend threshold, so approval is required before it goes live in Meta.' +
          '</div>' +
        '</div>' +
        '<div style="padding:0 30px 18px;">' +
          '<div style="background:rgba(0,0,0,0.25);border-radius:10px;padding:14px 18px;font-size:12px;color:rgba(255,251,248,0.85);line-height:1.9;">' +
            'Account: <strong>' + escapeHtml(record.accountName) + '</strong><br/>' +
            'Objective: <strong>' + escapeHtml(record.objective) + '</strong><br/>' +
            'Product: <strong>' + escapeHtml(record.productName) + '</strong><br/>' +
            'Audience: <strong>' + escapeHtml(record.audienceLabel) + '</strong><br/>' +
            'Budget: <strong style="color:#F96203;">' + rand + '</strong> (' + escapeHtml(record.funding) + ')' +
          '</div>' +
        '</div>' +
        '<div style="padding:8px 30px 32px;text-align:center;">' +
          '<a href="' + approveUrl + '" style="display:inline-block;padding:14px 38px;background:linear-gradient(135deg,#FF3D00,#FF6B00);color:#fff;text-decoration:none;font-size:12px;font-weight:900;letter-spacing:3px;text-transform:uppercase;border-radius:12px;">Approve and unlock</a>' +
          '<div style="font-size:10px;color:rgba(255,251,248,0.58);margin-top:14px;letter-spacing:1.5px;text-transform:uppercase;">Link expires in 24 hours</div>' +
        '</div>' +
        '</div></body></html>';
      var text = "High-spend approval requested for " + record.campaignName + "\n\n" +
        "Requested by: " + requestedBy + "\n" +
        "Account: " + record.accountName + "\n" +
        "Objective: " + record.objective + "\n" +
        "Budget: " + rand + "\n\n" +
        "Approve: " + approveUrl + "\n\n" +
        "Link expires in 24 hours.";
      await transporter.sendMail({
        from: "GAS Marketing Automation <" + gmailUser + ">",
        to: APPROVERS.join(", "),
        subject: "Approval needed: " + record.campaignName,
        text: text,
        html: html
      });
      emailSent = true;
    } catch (err) {
      console.error("approval email send failed", err);
      emailReason = String(err && err.message || err);
    }
  }

  res.status(200).json({
    ok: true,
    token: token,
    fingerprint: fp,
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000).toISOString(),
    emailSent: emailSent,
    emailReason: emailReason,
    approvers: APPROVERS
  });
}
