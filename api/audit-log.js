import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { readEmailLog, deleteEmailLogEntry, isAuditEnabled } from "./_audit.js";

// Admin-only.
// GET  /api/audit-log?limit=500  -> { entries, enabled, total }
// DELETE /api/audit-log?id=XYZ   -> { ok, removed }
//   (or POST /api/audit-log with body { action:"delete", id:"XYZ" } for clients that
//    can't send DELETE bodies reliably)

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 60, maxPerHour: 1000 })) return;
  if (!(await checkAuth(req, res))) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin" && req.authPrincipal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }

  if (!isAuditEnabled()) {
    res.status(200).json({ entries: [], enabled: false, reason: "Upstash Redis not configured on server" });
    return;
  }

  // Delete path. Accept DELETE or POST with action:"delete"
  var isDelete = req.method === "DELETE" ||
    (req.method === "POST" && req.body && req.body.action === "delete");
  if (isDelete) {
    var id = (req.query.id || (req.body && req.body.id) || "").toString();
    if (!id) {
      res.status(400).json({ error: "id required" });
      return;
    }
    try {
      var result = await deleteEmailLogEntry(id);
      if (!result.ok) {
        res.status(404).json({ error: result.reason || "not found" });
        return;
      }
      res.status(200).json({ ok: true, removed: result.removed });
    } catch (err) {
      console.error("audit-log delete failed", err);
      res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
    return;
  }

  // Default: GET, list entries.
  var limit = parseInt(req.query.limit || "500", 10);
  if (!limit || limit < 1) limit = 500;
  if (limit > 1000) limit = 1000;
  try {
    var entries = await readEmailLog(limit);
    // Explicit newest-first sort (LPUSH already stores this way, but keep guard)
    entries.sort(function(a, b) {
      var aT = a && a.sentAt ? Date.parse(a.sentAt) : 0;
      var bT = b && b.sentAt ? Date.parse(b.sentAt) : 0;
      return bT - aT;
    });
    res.status(200).json({ entries: entries, enabled: true, total: entries.length });
  } catch (err) {
    console.error("audit-log read failed", err);
    res.status(500).json({ error: String(err && err.message ? err.message : err), enabled: true });
  }
}
