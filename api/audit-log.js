import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { readEmailLog, isAuditEnabled } from "./_audit.js";

// Admin-only. Returns up to 1000 most recent email-send audit entries (newest first).
// Search/filter is handled client-side so the same response can power multiple views.

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 60, maxPerHour: 1000 })) return;
  if (!checkAuth(req, res)) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }
  if (!isAuditEnabled()) {
    res.status(200).json({ entries: [], enabled: false, reason: "Upstash Redis not configured on server" });
    return;
  }
  var limit = parseInt(req.query.limit || "500", 10);
  if (!limit || limit < 1) limit = 500;
  if (limit > 1000) limit = 1000;
  try {
    var entries = await readEmailLog(limit);
    res.status(200).json({ entries: entries, enabled: true, total: entries.length });
  } catch (err) {
    console.error("audit-log read failed", err);
    res.status(500).json({ error: String(err && err.message ? err.message : err), enabled: true });
  }
}
