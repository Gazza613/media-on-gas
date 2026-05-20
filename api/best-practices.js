// Platform best-practices feed for the Command Centre Growth Plan.
//
// Returns a JSON payload describing what top-1% Meta / TikTok / Google
// agency thinking looks like THIS MONTH. Sourced in this order:
//   1. Redis key `bp:v1` — written by the monthly cron at
//      /api/cron/refresh-best-practices (Claude API call).
//   2. The bundled fallback file at api/data/best-practices.json,
//      which holds the last-known-good copy committed to the repo.
//
// The fallback always works (no env vars required). The Redis copy
// only exists once the cron has run at least once and ANTHROPIC_API_KEY
// is configured. Either way the dashboard always has a usable playbook.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { redisGetJson } from "./_pulseShared.js";
import fallback from "./data/best-practices.json" with { type: "json" };

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 120, maxPerHour: 600 }))) return;
  if (!(await checkAuth(req, res))) return;

  var bp = null;
  try {
    bp = await redisGetJson("bp:v1");
  } catch (_) { bp = null; }

  if (bp && bp.meta && bp.tiktok && bp.google) {
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-BP-Source", "redis");
    res.status(200).json(bp);
    return;
  }

  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-BP-Source", "fallback");
  res.status(200).json(fallback);
}
