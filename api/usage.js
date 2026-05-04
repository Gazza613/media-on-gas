import { checkAuth } from "./_auth.js";
import { rateLimit } from "./_rateLimit.js";
import { readUsageEvents, logUsageEvent, isAuditEnabled } from "./_audit.js";

// Admin-only. Returns the last N usage events (admin logins + client
// share-link views), deduplicated per (actor, hour) at write time so the
// list stays meaningful rather than flooded.
//
// ?ping=1 writes a synthetic event (bypassing dedup) and returns the
// Redis response so the admin can verify the write pipe end-to-end from
// the browser.
export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;
  if (!(await checkAuth(req, res))) return;
  if (req.authPrincipal && req.authPrincipal.role !== "admin" && req.authPrincipal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }
  if (!isAuditEnabled()) {
    res.status(200).json({ enabled: false, events: [], reason: "UPSTASH_REDIS_REST_URL / TOKEN not configured on server" });
    return;
  }

  // Session-end beacon: fired by the dashboard on logout, idle timeout, or
  // tab close via navigator.sendBeacon. Records the session duration.
  if (req.query.kind === "session_end") {
    var actor = req.query.actor || "";
    var duration = parseInt(req.query.duration || "0");
    var reason = req.query.reason || "unknown";
    if (actor) {
      await logUsageEvent("session_end", actor, { durationMin: duration, reason: reason }, { skipDedup: true });
    }
    res.status(200).json({ ok: true });
    return;
  }

  // Write-path diagnostic, skips dedup so you always see a fresh event.
  if (req.query.ping === "1") {
    try {
      var writeResult = await logUsageEvent("ping_test", "diagnostic", { source: "ping endpoint" }, { skipDedup: true });
      var latest = await readUsageEvents(50);
      res.status(200).json({ enabled: true, pingWrite: writeResult, latestEvents: latest, totalAfterWrite: latest.length });
      return;
    } catch (err) {
      res.status(500).json({ error: String(err && err.message || err) });
      return;
    }
  }

  var limit = parseInt(req.query.limit, 10) || 1000;
  try {
    var events = await readUsageEvents(limit);
    res.status(200).json({ enabled: true, events: events, total: events.length });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
