// Pixel health check. For Sales / Leads objectives the campaign won't
// optimize without fresh signal in the configured pixel. This endpoint
// asks Meta for the last 7 days of pixel event counts and surfaces:
//   - Total events fired
//   - Per-event-type counts (Lead, Purchase, etc.)
//   - Health verdict: HEALTHY (≥10 events of the target event-type in
//     7 days), THIN (1-9), STALE (0).
//
// Endpoint: GET /{pixel_id}/stats?aggregation=event&start_time=<unix>&end_time=<unix>
// Returns rows shaped { event, count, value }. We filter for the target
// event when the team is on Sales (PURCHASE) or Leads (LEAD) and roll
// up everything for context.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var pixelId = String(req.query.pixelId || "").trim();
  if (!pixelId || !/^\d+$/.test(pixelId)) { res.status(400).json({ error: "pixelId required" }); return; }
  var targetEvent = String(req.query.event || "").trim();

  var now = Math.floor(Date.now() / 1000);
  var sevenDaysAgo = now - 7 * 24 * 60 * 60;

  var url = "https://graph.facebook.com/" + META_API_VERSION + "/" + pixelId +
    "/stats?aggregation=event&start_time=" + sevenDaysAgo + "&end_time=" + now +
    "&access_token=" + encodeURIComponent(token);

  try {
    var r = await fetch(url);
    var d = await r.json();
    if (!r.ok || d.error) {
      // Most common: pixel not found / no permission. Still 200 so the
      // frontend treats it as "couldn't check, surface a warning".
      res.status(200).json({
        ok: false,
        verdict: "UNKNOWN",
        message: (d.error && d.error.message) || "Could not fetch pixel stats",
        meta: d.error || null
      });
      return;
    }

    var rows = (d.data || []).map(function(row){
      return { event: String(row.event || ""), count: parseInt(row.count || 0, 10), value: parseFloat(row.value || 0) };
    });
    var total = rows.reduce(function(a, r){ return a + (r.count || 0); }, 0);

    // Friendly verdict against the target event if specified, otherwise
    // against the total.
    var compareCount = total;
    if (targetEvent) {
      var match = rows.find(function(row){ return row.event.toLowerCase() === targetEvent.toLowerCase(); });
      compareCount = match ? match.count : 0;
    }
    var verdict;
    if (compareCount === 0) verdict = "STALE";
    else if (compareCount < 10) verdict = "THIN";
    else verdict = "HEALTHY";

    res.status(200).json({
      ok: true,
      pixelId: pixelId,
      targetEvent: targetEvent || null,
      windowDays: 7,
      total: total,
      compareCount: compareCount,
      verdict: verdict,
      events: rows
    });
  } catch (err) {
    console.error("pixel-verify error", err);
    res.status(500).json({ error: "Pixel stats request failed", message: String(err && err.message || err) });
  }
}
