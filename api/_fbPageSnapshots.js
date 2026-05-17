// Daily Facebook Page follower-count snapshots, stored in Redis.
// Direct mirror of _igSnapshots.js but for FB Pages. Meta deprecated /
// reshaped most page_fan_* Insights metrics, and follower vs fan
// counts have diverged, so the only durable way to report whole-
// account FB follower growth over a window is our own daily snapshot
// of `followers_count` and a delta across the window, exactly as we
// already do for IG.
//
// Storage layout (Redis):
//   fb:pagesnap:{YYYY-MM-DD}   HASH  pageId → JSON({name, followersCount,
//                                     fanCount, capturedAt})
//   fb:pagesnap:dates          ZSET  member=YYYY-MM-DD, score=YYYYMMDD

var DATES_KEY = "fb:pagesnap:dates";

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
    console.error("FB page snapshots redis error", err);
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

// Capture today's snapshot. `pages` = [{ pageId, name, followersCount,
// fanCount }]. Caller is the cron handler in api/fb-page-snapshot.js.
export async function writeSnapshot(dateStr, pages) {
  if (!dateStr || !Array.isArray(pages) || pages.length === 0) return false;
  var key = "fb:pagesnap:" + dateStr;
  var capturedAt = new Date().toISOString();
  var args = ["HSET", key];
  pages.forEach(function(p) {
    if (!p || !p.pageId) return;
    args.push(String(p.pageId));
    args.push(JSON.stringify({
      name: p.name || "",
      followersCount: parseInt(p.followersCount || 0),
      fanCount: parseInt(p.fanCount || 0),
      capturedAt: capturedAt
    }));
  });
  if (args.length <= 2) return false;
  await redisCmd(args);
  await redisCmd(["EXPIRE", key, String(90 * 24 * 60 * 60)]);
  await redisCmd(["ZADD", DATES_KEY, String(ymdInt(dateStr)), dateStr]);
  return true;
}

// Read one date's snapshot → { date, pages: { pageId → {...} } } | null.
export async function readSnapshot(dateStr) {
  if (!dateStr) return null;
  var key = "fb:pagesnap:" + dateStr;
  var r = await redisCmd(["HGETALL", key]);
  if (!r || !r.result || !Array.isArray(r.result) || r.result.length === 0) return null;
  var pages = {};
  for (var i = 0; i + 1 < r.result.length; i += 2) {
    try { pages[String(r.result[i])] = JSON.parse(r.result[i + 1]); } catch (_) {}
  }
  return { date: dateStr, pages: pages };
}

// Most recent N snapshots, oldest → newest.
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

// Net follower growth per page across [from,to]: end-of-window count
// minus the baseline (the last snapshot on/before `from`, else the
// earliest snapshot inside the window). Returns { pageId: growthInt }.
// Mirrors how the IG path reports whole-account growth for the period.
export async function fbGrowthByPage(from, to) {
  if (!from || !to) return {};
  var fInt = ymdInt(from), tInt = ymdInt(to);
  var r = await redisCmd(["ZRANGE", DATES_KEY, "0", "-1"]);
  if (!r || !r.result || !Array.isArray(r.result) || r.result.length === 0) return {};
  var dates = r.result.slice();
  // Baseline date = latest snapshot strictly before `from`; fall back
  // to the earliest snapshot within the window if no prior history.
  var baselineDate = null, endDate = null, firstInWindow = null;
  for (var i = 0; i < dates.length; i++) {
    var di = ymdInt(dates[i]);
    if (di < fInt) baselineDate = dates[i];
    if (di >= fInt && di <= tInt) {
      if (!firstInWindow) firstInWindow = dates[i];
      endDate = dates[i];
    }
  }
  if (!baselineDate) baselineDate = firstInWindow;
  if (!endDate || !baselineDate) return {};
  var startSnap = await readSnapshot(baselineDate);
  var endSnap = await readSnapshot(endDate);
  if (!startSnap || !endSnap) return {};
  var out = {};
  Object.keys(endSnap.pages).forEach(function(pid) {
    var endC = parseInt((endSnap.pages[pid] && endSnap.pages[pid].followersCount) || 0);
    var startP = startSnap.pages[pid];
    if (!startP) return; // no baseline for this page → cannot state growth
    var startC = parseInt(startP.followersCount || 0);
    out[String(pid)] = endC - startC;
  });
  return out;
}

// Fetch live FB pages from Meta. Used by the cron writer.
// Returns [{ pageId, name, followersCount, fanCount }].
export async function fetchLiveFbPages(metaToken) {
  if (!metaToken) return [];
  try {
    var url = "https://graph.facebook.com/v25.0/me/accounts?fields=id,name,followers_count,fan_count&limit=100&access_token=" + metaToken;
    var all = [];
    var next = url;
    var guard = 0;
    while (next && guard < 10) {
      guard++;
      var pr = await fetch(next);
      if (!pr.ok) break;
      var pj = await pr.json();
      if (pj.data) all = all.concat(pj.data);
      next = pj.paging && pj.paging.next ? pj.paging.next : null;
    }
    return all.filter(function(p) { return p && p.id; }).map(function(p) {
      return {
        pageId: String(p.id),
        name: p.name || "",
        followersCount: parseInt(p.followers_count || p.fan_count || 0),
        fanCount: parseInt(p.fan_count || 0)
      };
    });
  } catch (err) {
    console.error("fetchLiveFbPages error", err);
    return [];
  }
}
