// Frontend polls this to discover when an approver has clicked the
// email link. Returns the approval record or null. Authed via the
// standard checkCreateAuth gate so client-domain sessions can't
// snoop tokens.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

export const config = { maxDuration: 10 };

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

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 120 }))) return;

  var token = String(req.query.token || "").trim();
  if (!token) { res.status(400).json({ error: "token required" }); return; }
  var existing = await redisCmd(["GET", "approval:" + token]);
  if (!existing || !existing.result) {
    res.status(200).json({ ok: true, found: false, status: "expired" });
    return;
  }
  var record;
  try { record = JSON.parse(existing.result); } catch (_) { record = null; }
  if (!record) { res.status(500).json({ error: "Approval record corrupt" }); return; }
  res.status(200).json({
    ok: true, found: true,
    status: record.status,
    fingerprint: record.fingerprint,
    approvedAt: record.approvedAt || null
  });
}
