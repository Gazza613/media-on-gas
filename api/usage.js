import { checkAuth } from "./_auth.js";
import { rateLimit } from "./_rateLimit.js";
import { readUsageEvents, isAuditEnabled } from "./_audit.js";

// Admin-only. Returns the last N usage events (admin logins + client
// share-link views), deduplicated per (actor, hour) at write time so the
// list stays meaningful rather than flooded.
export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 })) return;
  if (!checkAuth(req, res)) return;
  if (req.authPrincipal && req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }
  if (!isAuditEnabled()) {
    res.status(200).json({ enabled: false, events: [] });
    return;
  }
  var limit = parseInt(req.query.limit, 10) || 1000;
  try {
    var events = await readUsageEvents(limit);
    res.status(200).json({ enabled: true, events: events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
