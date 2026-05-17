// Daily performance source-of-truth snapshot endpoint. Direct mirror
// of api/fb-page-snapshot.js, but it persists the prior fully-settled
// day's normalised per-campaign metrics (from the SAME /api/campaigns
// the dashboard uses) into Redis, so GAS gets a durable, first-party
// historical record without any third-party warehouse or connector.
//
// CRON write:  daily, captures YESTERDAY (SAST) per-campaign metrics,
//              keyed by that data day, idempotent via SETNX so a
//              Vercel double-fire collapses.
// GET read:    ?date=YYYY-MM-DD | ?days=N | ?campaignId=ID&days=N.
//              Admin-only. NOT wired into any existing view; a later,
//              opt-in step consumes this. Reversible kill switch: drop
//              the cron line in vercel.json and nothing else changes.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { fetchCampaigns } from "./_pulseShared.js";
import {
  writePerfSnapshot, readPerfSnapshot, readRecentPerf,
  readCampaignSeries, listPerfDates, ymd
} from "./_perfSnapshots.js";

export const config = { maxDuration: 60 };

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

function sastDate(offsetDays) {
  var ms = Date.now() + 2 * 60 * 60 * 1000 + (offsetDays || 0) * 24 * 60 * 60 * 1000;
  return ymd(new Date(ms));
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

    // The DATA day is yesterday (SAST): the last fully-settled day.
    // Snapshot is keyed by that day so perf:snap:2026-05-16 holds
    // 2026-05-16's final numbers.
    var snapDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
      ? String(req.query.date)
      : sastDate(-1);

    if (isCron) {
      var force = req.query.force === "1";
      if (!force) {
        var dedupKey = "perf:snap:sent:" + snapDate;
        var firstFire = await redisSetIfAbsent(dedupKey, 36 * 60 * 60);
        if (firstFire === false) {
          res.status(200).json({ ok: true, deduped: true, key: dedupKey });
          return;
        }
      }
    }

    var dashKey = process.env.DASHBOARD_API_KEY || "";
    if (!dashKey) { res.status(500).json({ error: "DASHBOARD_API_KEY not configured" }); return; }

    var data;
    try {
      // Same normalised source the dashboard + daily report use. No new
      // API connection; this only persists what is already fetched.
      data = await fetchCampaigns(snapDate, snapDate, dashKey);
    } catch (err) {
      res.status(502).json({ ok: false, reason: "campaigns fetch failed", message: String(err && err.message || err), date: snapDate });
      return;
    }
    var rows = (data && data.campaigns) || [];
    if (rows.length === 0) {
      res.status(200).json({ ok: false, reason: "no campaigns returned", date: snapDate });
      return;
    }
    var result = await writePerfSnapshot(snapDate, rows);
    res.status(200).json({ ok: result.ok, date: snapDate, count: result.count, fetched: rows.length });
    return;
  }

  // GET — admin auth, return history.
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
  if (!(await checkAuth(req, res))) return;
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }

  if (req.query.campaignId) {
    var series = await readCampaignSeries(String(req.query.campaignId), req.query.days ? parseInt(req.query.days) : 30);
    res.status(200).json({ campaignId: String(req.query.campaignId), series: series });
    return;
  }
  if (req.query.date) {
    var snap = await readPerfSnapshot(String(req.query.date));
    res.status(200).json({ snapshot: snap });
    return;
  }
  if (req.query.dates === "1") {
    res.status(200).json({ dates: await listPerfDates(0) });
    return;
  }
  var days = req.query.days ? parseInt(req.query.days) : 14;
  res.status(200).json({ snapshots: await readRecentPerf(days) });
}
