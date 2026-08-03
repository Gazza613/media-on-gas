// Closed-month snapshot cache. When a request's `to` date is more
// than CLOSED_BUFFER_DAYS days in the past, the entire /api/campaigns
// or /api/ads response is stashed in Redis indefinitely and served on
// subsequent requests instead of re-hitting Meta / TikTok / Google.
// Rationale: closed-month data is effectively locked (Meta's longest
// standard attribution window is 28 days, but the last significant
// backdated adjustment for spend and delivery is usually within 3-5
// days of month-end). Serving from snapshot for historical ranges
// means:
//   - No pressure on Meta's app-level rate limit for old ranges
//   - Sub-second historical dashboard loads
//   - PDF generation for prior months is near-instant
//   - Prod fetches for the current week untouched
//
// Bust with ?fresh=1 on the endpoint if a genuine backdated
// adjustment lands and the snapshot needs a refresh.
//
// Storage: Upstash Redis SET/GET, key format `snap:<endpoint>:<key>`.
// The value is the full JSON response object (post-processing, pre-
// client-scoped-filter) so the existing per-request filter logic
// downstream still runs against the snapshot the same as it does
// against the in-memory cache.
//
// Same Upstash REST client pattern as _thumbOverrides.js and
// _objectiveOverrides.js.

var CLOSED_BUFFER_DAYS = 3;

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisCmd(args) {
  var creds = getCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) {
    console.error("Snapshot cache redis error", err);
    return null;
  }
}

// Is the requested `to` date old enough that the underlying platform
// data can be treated as locked? 3-day buffer covers the tail of
// Meta's late-arriving attribution and refund adjustments. Current
// month + last few days always fall through to live fetch.
export function isClosedPeriod(to) {
  if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(String(to))) return false;
  var toDate = new Date(to + "T23:59:59Z");
  if (isNaN(toDate.getTime())) return false;
  var cutoff = Date.now() - CLOSED_BUFFER_DAYS * 24 * 60 * 60 * 1000;
  return toDate.getTime() < cutoff;
}

export async function getSnapshot(key) {
  if (!getCreds()) return null;
  try {
    var r = await redisCmd(["GET", "snap:" + key]);
    if (!r || !r.result) return null;
    return JSON.parse(r.result);
  } catch (_) {
    return null;
  }
}

// Fire-and-forget write. The response is already being sent when we
// call this; failing to write the snapshot is not a client-facing
// error — worst case is the next request also hits live APIs and
// tries to write again.
export function setSnapshot(key, value) {
  if (!getCreds()) return;
  try {
    var payload = JSON.stringify(value);
    // Skip if payload is unreasonably large (>4MB — Upstash REST limits
    // + we'd waste bandwidth). This should never happen for a normal
    // response but guards against runaway growth.
    if (payload.length > 4 * 1024 * 1024) {
      console.warn("[snapshot] payload too large, skipping", { key: key, bytes: payload.length });
      return;
    }
    redisCmd(["SET", "snap:" + key, payload]).catch(function() {});
  } catch (_) { /* silent */ }
}

// Explicit clear for a specific snapshot. Used by the ?fresh=1
// override path so a manual refresh also evicts the closed-period
// snapshot rather than leaving it and re-fetching-but-ignoring.
export async function clearSnapshot(key) {
  if (!getCreds()) return;
  try {
    await redisCmd(["DEL", "snap:" + key]);
  } catch (_) { /* silent */ }
}
