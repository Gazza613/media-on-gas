// Per-asset performance breakdown for a Meta "Flexible" / Dynamic
// Creative ("mixed") ad. A flexible ad is ONE ad object that Meta
// assembles from many images/videos at delivery time, so ad-level
// insights aggregate across every variant and can't tell you which
// creative won. Meta DOES expose the answer via the Insights API
// asset breakdowns (image_asset / video_asset). This endpoint pulls
// both, merges them, resolves a thumbnail per asset, and returns a
// ranked list the dashboard renders in plain language for clients.
//
//   GET /api/ad-assets?platform=meta&adId=...&campaignId=...&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Auth mirrors /api/ad-image: checkAuth + a client-scope guard on
// campaignId so a client view can only break down its own ads.
//
// Honest caveat surfaced to the UI: impressions / clicks / spend per
// asset are deterministic. Conversion attribution per asset in a
// flexible ad is Meta-modelled (Meta optimises combinations, it does
// not run clean isolated splits), so result counts are directional.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isCampaignAllowed } from "./_auth.js";

var GRAPH = "https://graph.facebook.com/v25.0";

// 10-min in-memory cache. Asset breakdowns are heavy (2 insights calls
// + N thumbnail resolves) and the modal can be opened repeatedly.
var assetCache = {};
var CACHE_TTL_MS = 10 * 60 * 1000;

function ymd(d) {
  var p = function(n){ return n < 10 ? "0" + n : "" + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

// Sum the action types we treat as a "result" for the ad's objective.
// Mirrors the priority the rest of the dashboard uses: leads first,
// then installs, then follows/likes, else link clicks.
function resultsFromActions(actions) {
  if (!Array.isArray(actions)) return { leads: 0, installs: 0, follows: 0, linkClicks: 0 };
  var out = { leads: 0, installs: 0, follows: 0, linkClicks: 0 };
  actions.forEach(function(a) {
    var t = String(a.action_type || "");
    var v = parseFloat(a.value || 0) || 0;
    if (t === "lead" || t === "onsite_conversion.lead_grouped" || t.indexOf("leadgen") >= 0) out.leads += v;
    else if (t.indexOf("app_install") >= 0 || t === "mobile_app_install") out.installs += v;
    else if (t === "like" || t.indexOf("follow") >= 0 || t === "onsite_conversion.follow") out.follows += v;
    else if (t === "link_click") out.linkClicks += v;
  });
  return out;
}

// Pull ad-level insights broken down by one asset dimension.
async function fetchAssetBreakdown(adId, breakdown, from, to, token) {
  var url = GRAPH + "/" + encodeURIComponent(adId) + "/insights" +
    "?level=ad" +
    "&fields=" + encodeURIComponent("impressions,clicks,spend,actions,inline_link_clicks") +
    "&breakdowns=" + encodeURIComponent(breakdown) +
    "&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) +
    "&limit=200&access_token=" + encodeURIComponent(token);
  try {
    var r = await fetch(url);
    var d = await r.json();
    if (!r.ok || d.error || !Array.isArray(d.data)) return [];
    return d.data;
  } catch (_) { return []; }
}

// Resolve a hi-res thumbnail for an image-hash or a video-id. Best
// effort, a missing thumbnail just renders a placeholder client-side.
async function resolveImageThumb(accountId, hash, token) {
  if (!accountId || !hash) return "";
  try {
    var r = await fetch(GRAPH + "/" + accountId + "/adimages?hashes=" +
      encodeURIComponent(JSON.stringify([hash])) + "&fields=hash,url,permalink_url&access_token=" + encodeURIComponent(token));
    var d = await r.json();
    if (r.ok && d.data && d.data[0]) return d.data[0].url || d.data[0].permalink_url || "";
  } catch (_) {}
  return "";
}
async function resolveVideoThumb(videoId, token) {
  if (!videoId) return "";
  try {
    var r = await fetch(GRAPH + "/" + encodeURIComponent(videoId) +
      "?fields=picture,thumbnails{uri,width,height}&access_token=" + encodeURIComponent(token));
    var d = await r.json();
    if (r.ok) {
      if (d.thumbnails && d.thumbnails.data && d.thumbnails.data.length) {
        var best = d.thumbnails.data.slice().sort(function(a, b) {
          return (parseInt(b.width||0)*parseInt(b.height||0)) - (parseInt(a.width||0)*parseInt(a.height||0));
        })[0];
        if (best && best.uri) return best.uri;
      }
      if (d.picture) return d.picture;
    }
  } catch (_) {}
  return "";
}

// Core breakdown computation, framework-free so both the HTTP handler
// AND the client-report email (api/email-share.js) can call it
// directly without an internal round-trip. Returns the same payload
// shape the handler responds with. Pure aside from Meta fetches +
// the shared in-memory cache.
export async function computeAssetBreakdown(adId, from, to) {
  if (!adId) return { ok: false, error: "adId required" };

  // Default to last 30 days when the caller doesn't pass a window.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ""))) {
    var now0 = new Date();
    to = ymd(now0);
    from = ymd(new Date(now0.getTime() - 30 * 24 * 60 * 60 * 1000));
  }

  var cacheKey = adId + "|" + from + "|" + to;
  var hit = assetCache[cacheKey];
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.payload;

  var token = process.env.META_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "META_ACCESS_TOKEN not configured" };

  // account_id resolves image-hash thumbnails; campaign objective/name
  // decides which metric "winning" means. Awareness/reach campaigns
  // must NOT be ranked on link clicks (Phase 1 rule) — for those the
  // winner is the creative that delivered the most impressions (Meta's
  // asset breakdown does not expose reach per creative, only at the
  // ad/campaign level, so impressions is the correct per-asset proxy).
  var accountId = "";
  var awareness = false;
  try {
    var ar = await fetch(GRAPH + "/" + encodeURIComponent(adId) + "?fields=account_id,campaign{name,objective}&access_token=" + encodeURIComponent(token));
    var ad = await ar.json();
    if (ar.ok && ad.account_id) accountId = "act_" + ad.account_id;
    var campObj = String((ad.campaign && ad.campaign.objective) || "");
    var campName = String((ad.campaign && ad.campaign.name) || "");
    awareness = /AWARENESS|REACH|BRAND/i.test(campObj) ||
      /(^|[_\s|-])(awr|awareness|reach|brand)([_\s|-]|$)/i.test(campName);
  } catch (_) {}

  // Pull both visual breakdowns in parallel. A mixed ad usually leads
  // with images OR videos; we merge whatever Meta returns.
  var pair = await Promise.all([
    fetchAssetBreakdown(adId, "image_asset", from, to, token),
    fetchAssetBreakdown(adId, "video_asset", from, to, token)
  ]);
  var imageRows = pair[0];
  var videoRows = pair[1];

  var assets = [];

  imageRows.forEach(function(row) {
    var a = row.image_asset || {};
    if (!a.hash && !a.id) return;
    var imps = parseInt(row.impressions || 0, 10);
    var clicks = parseInt(row.clicks || 0, 10);
    var spend = parseFloat(row.spend || 0);
    var r = resultsFromActions(row.actions);
    assets.push({
      kind: "Image",
      assetId: a.id || a.hash || "",
      hash: a.hash || "",
      videoId: "",
      name: a.name || "Image",
      impressions: imps, clicks: clicks, spend: spend,
      ctr: imps > 0 ? parseFloat((clicks / imps * 100).toFixed(2)) : 0,
      cpc: clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0,
      leads: r.leads, installs: r.installs, follows: r.follows, linkClicks: r.linkClicks || clicks
    });
  });
  videoRows.forEach(function(row) {
    var a = row.video_asset || {};
    if (!a.video_id && !a.id) return;
    var imps = parseInt(row.impressions || 0, 10);
    var clicks = parseInt(row.clicks || 0, 10);
    var spend = parseFloat(row.spend || 0);
    var r = resultsFromActions(row.actions);
    assets.push({
      kind: "Video",
      assetId: a.id || a.video_id || "",
      hash: "",
      videoId: a.video_id || "",
      name: a.name || "Video",
      impressions: imps, clicks: clicks, spend: spend,
      ctr: imps > 0 ? parseFloat((clicks / imps * 100).toFixed(2)) : 0,
      cpc: clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : 0,
      leads: r.leads, installs: r.installs, follows: r.follows, linkClicks: r.linkClicks || clicks,
      preThumb: a.thumbnail_url || ""
    });
  });

  if (assets.length === 0) {
    var emptyPayload = {
      ok: true, supported: true, adId: adId, from: from, to: to,
      assets: [],
      note: "Meta has not yet returned a per-asset breakdown for this ad. This is normal in the first 24 to 48 hours after launch, before each creative has enough delivery to measure. Check back tomorrow."
    };
    assetCache[cacheKey] = { ts: Date.now(), payload: emptyPayload };
    return emptyPayload;
  }

  // Pick the primary "result" metric the same way the dashboard does
  // and rank by it, then by spend so the asset Meta invested most in
  // surfaces near the top when results are tied at zero.
  var totalLeads = assets.reduce(function(s, a){ return s + a.leads; }, 0);
  var totalInstalls = assets.reduce(function(s, a){ return s + a.installs; }, 0);
  var totalFollows = assets.reduce(function(s, a){ return s + a.follows; }, 0);
  // Awareness/reach: rank on impressions (the per-creative reach proxy)
  // and report cost as CPM, never link clicks. Everything else keeps
  // the leads/installs/follows/link-clicks ladder.
  var resultKey = awareness ? "impressions" : totalLeads > 0 ? "leads" : totalInstalls > 0 ? "installs" : totalFollows > 0 ? "follows" : "linkClicks";
  var resultLabel = awareness ? "Impressions" : resultKey === "leads" ? "Leads" : resultKey === "installs" ? "Installs" : resultKey === "follows" ? "Follows & Likes" : "Link Clicks";

  assets.forEach(function(a) {
    a.results = a[resultKey] || 0;
    // Awareness cost = CPM (cost per 1,000 impressions); spend/impr is
    // a meaningless fraction otherwise.
    a.costPerResult = awareness
      ? (a.impressions > 0 ? parseFloat((a.spend / a.impressions * 1000).toFixed(2)) : 0)
      : (a.results > 0 ? parseFloat((a.spend / a.results).toFixed(2)) : 0);
  });
  assets.sort(function(a, b) {
    if (b.results !== a.results) return b.results - a.results;
    return b.spend - a.spend;
  });

  // Resolve thumbnails (cap parallelism, isolate failures).
  await Promise.all(assets.slice(0, 20).map(async function(a) {
    if (a.kind === "Image") a.thumbnail = await resolveImageThumb(accountId, a.hash, token);
    else a.thumbnail = a.preThumb || await resolveVideoThumb(a.videoId, token);
  }));

  var payload = {
    ok: true, supported: true, adId: adId, from: from, to: to,
    resultLabel: resultLabel,
    basis: awareness ? "reach" : "results",
    assets: assets.map(function(a, i) {
      return {
        rank: i + 1,
        kind: a.kind,
        name: a.name,
        thumbnail: a.thumbnail || "",
        impressions: a.impressions,
        clicks: a.clicks,
        spend: a.spend,
        ctr: a.ctr,
        cpc: a.cpc,
        results: a.results,
        costPerResult: a.costPerResult
      };
    }),
    note: awareness
      ? "This is an awareness campaign, so the winning creative is the one that delivered the most impressions (reach is not exposed per creative by Meta, impressions is the per-creative proxy). Cost is shown as CPM. Spend, impressions and CTR per creative are exact."
      : "Spend, impressions, clicks and CTR per creative are exact. Result counts are Meta's modelled attribution, the platform optimises combinations rather than running clean isolated splits, so treat results as a strong directional signal rather than a lab test."
  };
  assetCache[cacheKey] = { ts: Date.now(), payload: payload };
  return payload;
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 120, maxPerHour: 1200 }))) return;
  if (!(await checkAuth(req, res))) return;

  var platform = String(req.query.platform || "meta").toLowerCase();
  var adId = String(req.query.adId || req.query.id || "").trim();
  var campaignId = String(req.query.campaignId || "").trim();
  var from = String(req.query.from || "").trim();
  var to = String(req.query.to || "").trim();

  if (!adId) { res.status(400).json({ error: "adId required" }); return; }

  // Asset breakdown is a Meta-only concept. TikTok/Google flexible
  // formats don't expose an equivalent, so tell the UI plainly.
  if (platform !== "meta") {
    res.status(200).json({ ok: false, supported: false, reason: "Per-asset breakdown is only available for Meta flexible ads." });
    return;
  }

  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    if (!campaignId) { res.status(400).json({ error: "campaignId required for client requests" }); return; }
    if (!isCampaignAllowed(principal, campaignId, "")) {
      res.status(403).json({ error: "Not allowed for this campaign" });
      return;
    }
  }

  var payload = await computeAssetBreakdown(adId, from, to);
  if (payload && payload.ok === false && payload.error) {
    res.status(payload.error === "META_ACCESS_TOKEN not configured" ? 500 : 400).json(payload);
    return;
  }
  res.status(200).json(payload);
}
