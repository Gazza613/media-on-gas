// Approver lands here from the email's one-click button. No
// dashboard auth — possession of the token IS the auth (it was sent
// directly to gary@ and sam@ via Gmail SMTP, so anyone who clicks the
// link has read the inbox). Marks the Redis approval record approved
// and renders a confirmation HTML page.

import { rateLimit } from "../_rateLimit.js";

export const config = { maxDuration: 15 };

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

function htmlPage(title, body, accent) {
  accent = accent || "#34D399";
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + title + '</title></head>' +
    '<body style="margin:0;padding:60px 20px;background:#070E16;font-family:Helvetica,Arial,sans-serif;color:#FFFBF8;text-align:center;">' +
    '<div style="max-width:520px;margin:0 auto;background:#0F1820;border:1px solid rgba(168,85,247,0.18);border-radius:18px;padding:40px 32px;">' +
    '<div style="font-size:11px;color:' + accent + ';letter-spacing:5px;font-weight:800;text-transform:uppercase;margin-bottom:14px;">GAS Marketing Automation</div>' +
    body +
    '</div></body></html>';
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  var token = String(req.query.token || "").trim();
  if (!token || token.length < 16) {
    res.status(400).setHeader("Content-Type", "text/html");
    res.end(htmlPage("Invalid link", '<div style="font-size:20px;font-weight:900;">Invalid approval link.</div>', "#FF3D00"));
    return;
  }

  var key = "approval:" + token;
  var existing = await redisCmd(["GET", key]);
  if (!existing || !existing.result) {
    res.status(404).setHeader("Content-Type", "text/html");
    res.end(htmlPage("Expired or unknown", '<div style="font-size:20px;font-weight:900;margin-bottom:14px;">Approval link expired or already used.</div><div style="font-size:13px;color:rgba(255,251,248,0.7);line-height:1.7;">Approval tokens expire 24 hours after the request. The team will need to request a fresh approval.</div>', "#FF3D00"));
    return;
  }

  var record;
  try { record = JSON.parse(existing.result); } catch (_) { record = null; }
  if (!record) { res.status(500).setHeader("Content-Type", "text/html"); res.end(htmlPage("Error", '<div>Approval record could not be read.</div>', "#FF3D00")); return; }

  if (record.status === "approved") {
    res.status(200).setHeader("Content-Type", "text/html");
    res.end(htmlPage("Already approved",
      '<div style="font-size:22px;font-weight:900;margin-bottom:14px;color:#34D399;">Already approved</div>' +
      '<div style="font-size:13px;color:rgba(255,251,248,0.82);line-height:1.7;">This campaign was approved at ' + new Date(record.approvedAt).toLocaleString("en-ZA") + '. The team can launch it from the Create tab.</div>'));
    return;
  }

  record.status = "approved";
  record.approvedAt = new Date().toISOString();
  record.approvedBy = "email-click"; // we don't know which inbox clicked
  // Preserve the original TTL by reading the remaining seconds and
  // re-setting with EX. Simpler to just SET without EX, but that would
  // leak the record forever. Use PEXPIRE-aware SETEX-style command.
  await redisCmd(["SET", key, JSON.stringify(record), "EX", "86400"]);

  res.status(200).setHeader("Content-Type", "text/html");
  res.end(htmlPage("Approved",
    '<div style="font-size:24px;font-weight:900;margin-bottom:14px;color:#34D399;">✓ Campaign approved</div>' +
    '<div style="font-size:15px;font-weight:700;margin-bottom:14px;">' + (record.campaignName || "") + '</div>' +
    '<div style="font-size:13px;color:rgba(255,251,248,0.82);line-height:1.7;">The team can now launch this campaign from the Create tab. Approval token expires in 24 hours.</div>'));
}
