// Daily performance source-of-truth snapshots, stored in Redis.
// Direct mirror of _fbPageSnapshots.js / _igSnapshots.js, but for the
// normalised per-campaign metrics the dashboard already computes.
//
// WHY: today every campaign/ads/GA4 number is live-pulled per request
// with short ephemeral caches. There is no durable historical record
// (only IG/FB follower snapshots persist). This captures one faithful
// daily snapshot of the prior, fully-settled day's per-campaign
// metrics so we can later do pacing, trend, "what changed" and
// outage-resilient reads WITHOUT a third-party warehouse or connector.
// It only persists what /api/campaigns already returns; it adds no new
// API connection.
//
// Storage layout (Redis):
//   perf:snap:{YYYY-MM-DD}  HASH  campaignId -> JSON({ ...metrics,
//                                  name, platform, accountName, ...,
//                                  capturedAt })
//   perf:snap:dates         ZSET  member=YYYY-MM-DD, score=YYYYMMDD
//
// Retention: 90-day EXPIRE per day-key, matching the existing snapshot
// pattern so storage growth stays bounded (the Upstash-capacity
// caveat). Extending retention later is a deliberate, capacity-aware
// decision, not a default.

var DATES_KEY = "perf:snap:dates";
var RETENTION_DAYS = 90;

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
    console.error("perf snapshots redis error", err);
    return null;
  }
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
export function ymd(date) {
  var d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
export function ymdInt(s) {
  return parseInt(String(s).replace(/-/g, ""), 10) || 0;
}

function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

// Reduce a normalised /api/campaigns row to the durable, faithful
// subset needed for trend / pacing / longitudinal anomaly reads.
// Identity + the metrics the dashboard ranks on. Lossless enough to
// rebuild per-client rollups at read time using the same accountName
// / campaignName the dashboard derives clients from.
export function pickPerfRow(c) {
  if (!c) return null;
  var id = String(c.campaignId || c.rawCampaignId || "");
  if (!id) return null;
  return {
    campaignId: id,
    rawCampaignId: String(c.rawCampaignId || ""),
    campaignName: String(c.campaignName || ""),
    platform: String(c.platform || ""),
    accountName: String(c.accountName || ""),
    accountId: String(c.accountId || ""),
    objective: String(c.objective || ""),
    status: String(c.status || ""),
    startDate: String(c.startDate || ""),
    endDate: String(c.endDate || ""),
    spend: num(c.spend),
    impressions: num(c.impressions),
    reach: num(c.reach),
    clicks: num(c.clicks),
    ctr: num(c.ctr),
    cpm: num(c.cpm),
    cpc: num(c.cpc),
    frequency: num(c.frequency),
    leads: num(c.leads),
    follows: num(c.follows),
    likes: num(c.likes),
    landingPageViews: num(c.landingPageViews),
    pageLikes: num(c.pageLikes),
    budgetDaily: c.budgetDaily == null ? null : num(c.budgetDaily),
    budgetAmount: c.budgetAmount == null ? null : num(c.budgetAmount),
    budgetMode: String(c.budgetMode || "")
  };
}

// Write one day's snapshot. `dateStr` = the DATA day (the fully
// settled prior day), `rows` = normalised /api/campaigns rows.
// Idempotent at the HSET level; the cron also SETNX-dedupes the fire.
export async function writePerfSnapshot(dateStr, rows) {
  if (!dateStr || !Array.isArray(rows) || rows.length === 0) return { ok: false, count: 0 };
  var key = "perf:snap:" + dateStr;
  var capturedAt = new Date().toISOString();
  var args = ["HSET", key];
  var n = 0;
  rows.forEach(function(c) {
    var p = pickPerfRow(c);
    if (!p) return;
    p.capturedAt = capturedAt;
    args.push(p.campaignId);
    args.push(JSON.stringify(p));
    n++;
  });
  if (n === 0) return { ok: false, count: 0 };
  await redisCmd(args);
  await redisCmd(["EXPIRE", key, String(RETENTION_DAYS * 24 * 60 * 60)]);
  await redisCmd(["ZADD", DATES_KEY, String(ymdInt(dateStr)), dateStr]);
  return { ok: true, count: n };
}

// Read one date's snapshot -> { date, campaigns: { campaignId -> {...} } } | null
export async function readPerfSnapshot(dateStr) {
  if (!dateStr) return null;
  var r = await redisCmd(["HGETALL", "perf:snap:" + dateStr]);
  if (!r || !r.result || !Array.isArray(r.result) || r.result.length === 0) return null;
  var out = {};
  for (var i = 0; i + 1 < r.result.length; i += 2) {
    try { out[String(r.result[i])] = JSON.parse(r.result[i + 1]); } catch (_) {}
  }
  return { date: dateStr, campaigns: out };
}

// Available snapshot dates, oldest -> newest (optionally last n).
export async function listPerfDates(n) {
  var r = await redisCmd(["ZRANGE", DATES_KEY, "0", "-1"]);
  if (!r || !r.result || !Array.isArray(r.result)) return [];
  var dates = r.result.slice();
  if (n && n > 0) dates = dates.slice(-n);
  return dates;
}

// Most recent N daily snapshots, oldest -> newest.
export async function readRecentPerf(n) {
  var n2 = Math.max(1, Math.min(parseInt(n) || 14, RETENTION_DAYS));
  var dates = await listPerfDates(n2);
  var out = [];
  for (var i = 0; i < dates.length; i++) {
    var snap = await readPerfSnapshot(dates[i]);
    if (snap) out.push(snap);
  }
  return out;
}

// Per-campaign time series across the last N days:
//   [{ date, ...metrics }] oldest -> newest. Drives pacing/trend reads.
export async function readCampaignSeries(campaignId, n) {
  if (!campaignId) return [];
  var n2 = Math.max(1, Math.min(parseInt(n) || 30, RETENTION_DAYS));
  var dates = await listPerfDates(n2);
  var series = [];
  for (var i = 0; i < dates.length; i++) {
    var snap = await readPerfSnapshot(dates[i]);
    if (snap && snap.campaigns && snap.campaigns[campaignId]) {
      series.push(Object.assign({ date: dates[i] }, snap.campaigns[campaignId]));
    }
  }
  return series;
}
