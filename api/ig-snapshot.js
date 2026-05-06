import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { writeSnapshot, readRecent, readSnapshot, fetchLiveIgAccounts, ymd } from "./_igSnapshots.js";

// IG follower-count snapshot endpoint.
//
// CRON write:  fires daily at 04:00 UTC = 06:00 SAST. Captures
//              `followers_count` for every IG business account and
//              stores it in Redis keyed by SAST date. Idempotent via
//              SETNX so a Vercel double-fire on the same day collapses.
//
// GET read:    `?days=N` returns the most recent N snapshots
//              (default 7). `?date=YYYY-MM-DD` returns a single date.
//              Used by Community Growth on the dashboard and the daily
//              Pulse cron to reconcile live IG totals with historic
//              counts.
//
// SAST is computed by shifting now by +2h, so the cron's "today" key
// matches the date the team would write on a calendar.

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisSetIfAbsent(key, ttlSeconds) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, String(Date.now()), "NX", "EX", String(ttlSeconds)])
    });
    if (!r.ok) return null;
    var d = await r.json();
    return d && d.result === "OK";
  } catch (_) { return null; }
}

function sastDate() {
  var sastNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return ymd(sastNow);
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = !!(cronSecret && timingSafeStrEqual(authHeader, "Bearer " + cronSecret));

  // Cron write path. Anything else (including admin-triggered manual
  // writes) goes through the GET / explicit ?write=1 with API key.
  var explicitWrite = req.query.write === "1";

  if (isCron || explicitWrite) {
    if (!isCron && !explicitWrite) {
      // Should never happen given the guard above, but defensive.
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!isCron) {
      // Manual trigger needs admin auth + dashboard API key.
      if (!(await rateLimit(req, res, { maxPerMin: 6, maxPerHour: 30 }))) return;
      var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
      var expectedKey = process.env.DASHBOARD_API_KEY || "";
      if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    var dateStr = sastDate();

    // Idempotency on a SAST-day key. Same-day double-fire from Vercel
    // cron retries collapses, manual re-runs (?write=1&force=1) bypass.
    if (isCron) {
      var force = req.query.force === "1";
      if (!force) {
        var dedupKey = "ig:snap:sent:" + dateStr;
        var firstFire = await redisSetIfAbsent(dedupKey, 36 * 60 * 60);
        if (firstFire === false) {
          res.status(200).json({ ok: true, deduped: true, key: dedupKey });
          return;
        }
      }
    }

    var metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not configured" }); return; }

    var accounts = await fetchLiveIgAccounts(metaToken);
    if (accounts.length === 0) {
      res.status(200).json({ ok: false, reason: "no IG accounts returned from Meta", date: dateStr });
      return;
    }
    var ok = await writeSnapshot(dateStr, accounts);
    res.status(200).json({ ok: ok, date: dateStr, count: accounts.length, accounts: accounts.map(function(a){return{igAccountId:a.igAccountId,username:a.username,followersCount:a.followersCount};}) });
    return;
  }

  // GET — admin auth, return recent snapshots.
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
  if (!(await checkAuth(req, res))) return;

  if (req.query.date) {
    var snap = await readSnapshot(String(req.query.date));
    res.status(200).json({ snapshot: snap });
    return;
  }
  var days = req.query.days ? parseInt(req.query.days) : 7;
  var snaps = await readRecent(days);
  res.status(200).json({ snapshots: snaps });
}
