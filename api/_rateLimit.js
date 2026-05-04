// Redis-backed sliding-window rate limit.
//
// Why Redis: Vercel Functions are stateless across cold starts and
// distributed across regions, so a module-level in-memory counter resets
// every few minutes of idle time. An attacker can defeat in-memory limits
// just by sending one request, waiting for the function to scale to zero,
// and trying again. The Redis counter is globally consistent across every
// invocation regardless of which function instance handles it.
//
// Implementation: two fixed-window counters (per-minute, per-hour). Each
// counter is INCR'd, with EXPIRE set on first creation. Lower-bound on
// minute/hour, fail-open if Redis is unreachable so a Redis outage does
// NOT lock the team out of the dashboard.
//
// Returns a Promise<boolean>: true if the request is allowed. On false the
// limiter has already responded with 429 + JSON body, the caller just
// needs to `return`.

import { rateLimitRedisIncr, rateLimitMemoryFallback } from "./_rateLimitStore.js";

function getIp(req) {
  // x-forwarded-for under Vercel is a comma-separated chain of proxies,
  // first entry is the real client IP. Falls back to socket address if
  // the header isn't present (local dev).
  var forwarded = req.headers["x-forwarded-for"] || "";
  return (forwarded.split(",")[0] || "").trim() ||
    (req.socket && req.socket.remoteAddress) || "unknown";
}

export async function rateLimit(req, res, opts) {
  var maxPerMin = (opts && opts.maxPerMin) || 60;
  var maxPerHour = (opts && opts.maxPerHour) || 500;
  var ip = getIp(req);
  var now = Date.now();

  var allowed;
  try {
    allowed = await rateLimitRedisIncr(ip, now, maxPerMin, maxPerHour);
  } catch (_) {
    allowed = null; // signal "Redis unavailable, use fallback"
  }

  // Fail-open with in-memory fallback if Redis is unreachable. We still
  // get some protection from the in-memory counter against a single
  // hot-instance burst, and the Redis outage will ring a different alarm.
  if (allowed === null) {
    allowed = rateLimitMemoryFallback(ip, now, maxPerMin, maxPerHour);
  }

  if (!allowed) {
    res.status(429).json({ error: "Too many requests" });
    return false;
  }
  return true;
}
