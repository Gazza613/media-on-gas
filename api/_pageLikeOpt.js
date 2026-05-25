// Cached per-account "is this campaign page-like optimised" + objective
// maps. Under Meta ODAX a "Follows or likes" campaign and a
// "profile visits" campaign are BOTH objective=OUTCOME_ENGAGEMENT, so
// only the ad-set optimization_goal distinguishes them. Resolving that
// per /api/ads request (campaigns + adsets pagination across 6
// accounts) blew the function time budget AND Meta's per-user rate
// limit ("User request limit reached"), so /api/ads returned partial
// data and followsTrue read 0. Campaign objective / optimization_goal
// changes almost never, so we resolve it AT MOST once per TTL per
// account and cache in our own Redis (same Upstash REST creds the
// perf-snapshot history uses). Cache hit => ZERO extra Graph calls.
// See project_meta_like_action, project_source_of_truth.

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
    return await r.json();
  } catch (err) { return null; }
}

var TTL_SECONDS = 6 * 60 * 60; // 6h; objective/optimization_goal is near-static

// Returns { objMap: {campaignId: rawObjective}, plOpt: {campaignId: true} }.
// NEVER throws. On any failure returns whatever it has (possibly empty)
// so the caller's primary ad data is never blocked by this enrichment.
export async function getPageLikeMaps(accountId, token) {
  var key = "pageopt:v1:" + accountId;
  try {
    var cached = await redisCmd(["GET", key]);
    if (cached && cached.result) {
      var p = JSON.parse(cached.result);
      if (p && p.objMap && p.plOpt) return p;
    }
  } catch (_) {}

  var objMap = {};
  var plOpt = {};
  // Raw map: campaignId → array of {adsetId, name, optimization_goal}.
  // Lets the optgoalprobe diagnostic surface what Meta actually returned
  // without making a second round-trip (rate-limit friendly).
  var rawOptGoals = {};
  // Lightweight campaigns objective (id,objective only — small payload).
  try {
    var cNext = "https://graph.facebook.com/v25.0/" + accountId + "/campaigns?fields=id,name,objective&limit=500&access_token=" + token;
    var cg = 0;
    while (cNext && cg < 15) {
      cg++;
      var cr = await fetch(cNext);
      var cd = await cr.json();
      if (cd && cd.error) break;
      (cd.data || []).forEach(function(c) {
        objMap[c.id] = c.objective || "";
        if (String(c.objective || "").toUpperCase() === "PAGE_LIKES") plOpt[c.id] = true;
      });
      cNext = cd.paging && cd.paging.next ? cd.paging.next : null;
    }
  } catch (_) {}
  // Bounded adsets optimization_goal (now also captured raw for diagnostics).
  try {
    var aNext = "https://graph.facebook.com/v25.0/" + accountId + "/adsets?fields=id,name,campaign_id,optimization_goal,effective_status&limit=500&access_token=" + token;
    var ag = 0;
    while (aNext && ag < 12) {
      ag++;
      var ar = await fetch(aNext);
      var ad = await ar.json();
      if (ad && ad.error) break;
      (ad.data || []).forEach(function(s) {
        var st = String(s.effective_status || "").toUpperCase();
        if (st === "DELETED" || st === "ARCHIVED") return;
        var og = String(s.optimization_goal || "").toUpperCase();
        if (og === "PAGE_LIKES" || og === "LIKE_PAGE" || og.indexOf("PAGE_LIKE") >= 0 || og === "LIKES") plOpt[s.campaign_id] = true;
        if (!rawOptGoals[s.campaign_id]) rawOptGoals[s.campaign_id] = [];
        rawOptGoals[s.campaign_id].push({
          adsetId: s.id,
          adsetName: s.name || "",
          optimization_goal: s.optimization_goal || "(null)",
          effective_status: s.effective_status || ""
        });
      });
      aNext = ad.paging && ad.paging.next ? ad.paging.next : null;
    }
  } catch (_) {}

  var out = { objMap: objMap, plOpt: plOpt, rawOptGoals: rawOptGoals };
  // Only cache a non-empty result so a transient Graph failure does not
  // poison the cache with an empty map for 6 hours.
  if (Object.keys(objMap).length > 0 || Object.keys(plOpt).length > 0) {
    try {
      await redisCmd(["SET", key, JSON.stringify(out)]);
      await redisCmd(["EXPIRE", key, String(TTL_SECONDS)]);
    } catch (_) {}
  }
  return out;
}
