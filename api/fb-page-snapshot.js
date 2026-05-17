import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { writeSnapshot, readRecent, readSnapshot, fetchLiveFbPages, ymd } from "./_fbPageSnapshots.js";

// Facebook Page follower-count snapshot endpoint. Direct mirror of
// api/ig-snapshot.js for FB Pages.
//
// CRON write:  daily, captures followers_count for every FB Page on
//              the admin token, keyed by SAST date, idempotent via
//              SETNX so a Vercel double-fire collapses.
// GET read:    ?days=N (default 7) / ?date=YYYY-MM-DD. Admin-only.

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
  var explicitWrite = req.query.write === "1";

  if (isCron || explicitWrite) {
    if (!isCron) {
      if (!(await rateLimit(req, res, { maxPerMin: 6, maxPerHour: 30 }))) return;
      var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
      var expectedKey = process.env.DASHBOARD_API_KEY || "";
      if (!apiKey || !expectedKey || apiKey !== expectedKey) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    var dateStr = sastDate();
    if (isCron) {
      var force = req.query.force === "1";
      if (!force) {
        var dedupKey = "fb:pagesnap:sent:" + dateStr;
        var firstFire = await redisSetIfAbsent(dedupKey, 36 * 60 * 60);
        if (firstFire === false) {
          res.status(200).json({ ok: true, deduped: true, key: dedupKey });
          return;
        }
      }
    }

    var metaToken = process.env.META_ACCESS_TOKEN;
    if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not configured" }); return; }

    var pages = await fetchLiveFbPages(metaToken);
    if (pages.length === 0) {
      res.status(200).json({ ok: false, reason: "no FB pages returned from Meta", date: dateStr });
      return;
    }
    var ok = await writeSnapshot(dateStr, pages);
    res.status(200).json({ ok: ok, date: dateStr, count: pages.length, pages: pages.map(function(p){ return { pageId: p.pageId, name: p.name, followersCount: p.followersCount }; }) });
    return;
  }

  // GET — admin auth, return recent snapshots.
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
  if (!(await checkAuth(req, res))) return;
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }

  if (req.query.date) {
    var snap = await readSnapshot(String(req.query.date));
    res.status(200).json({ snapshot: snap });
    return;
  }
  var days = req.query.days ? parseInt(req.query.days) : 7;
  var snaps = await readRecent(days);
  res.status(200).json({ snapshots: snaps });
}
