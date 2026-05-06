// Daily IG follower-count snapshots, stored in Redis. The snapshot
// cron runs every morning and captures `followers_count` for every IG
// business account the team has access to. Storing the daily totals
// independently of Meta's per-day Page Insights gives us:
//
//   • a verifiable per-day history that does not drift when Meta's
//     follower_count metric settles late,
//   • a simple {date → count} lookup the dashboard and the daily Pulse
//     can reference for "today vs yesterday" / "today vs 7 days ago"
//     comparisons,
//   • independence from share-link cache windows on /api/campaigns.
//
// Storage layout (Redis):
//   ig:snap:{YYYY-MM-DD}            HASH  igAccountId → JSON({username,
//                                          followersCount, pageName,
//                                          pageId, capturedAt})
//   ig:snap:dates                   ZSET  member=YYYY-MM-DD, score=
//                                          parseInt(YYYYMMDD), used to
//                                          enumerate available history.

var DATES_KEY = "ig:snap:dates";

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
    console.error("IG snapshots redis error", err);
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

// Capture today's snapshot for a list of IG accounts. Each entry should
// have at least { igAccountId, username, followersCount }. Other fields
// are stored verbatim. The caller is the cron handler in api/ig-snapshot
// .js; this helper only handles the persistence.
export async function writeSnapshot(dateStr, accounts) {
  if (!dateStr || !Array.isArray(accounts) || accounts.length === 0) return false;
  var key = "ig:snap:" + dateStr;
  var capturedAt = new Date().toISOString();
  // HSET in batches via the multi-arg form. Upstash supports HSET with
  // multiple field/value pairs, so one call writes all accounts.
  var args = ["HSET", key];
  accounts.forEach(function(a) {
    if (!a || !a.igAccountId) return;
    args.push(String(a.igAccountId));
    args.push(JSON.stringify({
      username: a.username || "",
      followersCount: parseInt(a.followersCount || 0),
      pageName: a.pageName || "",
      pageId: a.pageId || "",
      capturedAt: capturedAt
    }));
  });
  if (args.length <= 2) return false; // nothing to write
  await redisCmd(args);
  // 90-day retention so the per-day key does not pile up indefinitely.
  await redisCmd(["EXPIRE", key, String(90 * 24 * 60 * 60)]);
  // Index the date in the dates ZSET for enumeration.
  await redisCmd(["ZADD", DATES_KEY, String(ymdInt(dateStr)), dateStr]);
  return true;
}

// Read one date's snapshot. Returns { date, accounts: { igAccountId →
// { username, followersCount, ... } } } or null if no snapshot exists.
export async function readSnapshot(dateStr) {
  if (!dateStr) return null;
  var key = "ig:snap:" + dateStr;
  var r = await redisCmd(["HGETALL", key]);
  if (!r || !r.result || !Array.isArray(r.result) || r.result.length === 0) return null;
  var accounts = {};
  for (var i = 0; i + 1 < r.result.length; i += 2) {
    try {
      accounts[String(r.result[i])] = JSON.parse(r.result[i + 1]);
    } catch (_) {}
  }
  return { date: dateStr, accounts: accounts };
}

// Read the most recent N snapshots, oldest → newest.
export async function readRecent(n) {
  var n2 = Math.max(1, Math.min(parseInt(n) || 7, 90));
  var r = await redisCmd(["ZRANGE", DATES_KEY, "0", "-1"]);
  if (!r || !r.result || !Array.isArray(r.result)) return [];
  var dates = r.result.slice(-n2);
  var out = [];
  for (var i = 0; i < dates.length; i++) {
    var snap = await readSnapshot(dates[i]);
    if (snap) out.push(snap);
  }
  return out;
}

// Fetch live IG account snapshots from Meta. Used by the cron writer
// AND by anywhere that needs a fresh account list (e.g. live count on
// the dashboard's Community Growth reconciliation line). Returns an
// array of { igAccountId, username, followersCount, pageName, pageId }.
export async function fetchLiveIgAccounts(metaToken) {
  if (!metaToken) return [];
  try {
    var pagesUrl = "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,followers_count,name}&limit=100&access_token=" + metaToken;
    var pAll = [];
    var pNext = pagesUrl;
    var pGuard = 0;
    while (pNext && pGuard < 10) {
      pGuard++;
      var pr = await fetch(pNext);
      if (!pr.ok) break;
      var pj = await pr.json();
      if (pj.data) pAll = pAll.concat(pj.data);
      pNext = pj.paging && pj.paging.next ? pj.paging.next : null;
    }
    var out = [];
    pAll.forEach(function(p) {
      if (!p.instagram_business_account) return;
      var ig = p.instagram_business_account;
      if (!ig.id) return;
      out.push({
        igAccountId: String(ig.id),
        username: ig.username || ig.name || "",
        followersCount: parseInt(ig.followers_count || 0),
        pageName: p.name || "",
        pageId: String(p.id || "")
      });
    });
    return out;
  } catch (err) {
    console.error("fetchLiveIgAccounts error", err);
    return [];
  }
}
