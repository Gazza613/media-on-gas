// TikTok Ads Manager alignment diagnostic. Admin-only. Purpose:
// answer with certainty what TikTok itself reports as the dominant
// age band for the MoMo account under three different metric
// definitions, so we can settle whether the dashboard's 45-54
// dominant TikTok persona is TikTok's own truth or a data-pull bug.
//
// Runs one query — AUDIENCE report at AUCTION_CAMPAIGN with
// dimensions=[campaign_id, age] and every relevant metric — then
// aggregates per-age sums for impressions, broad clicks, link
// clicks, and reach, and returns the dominant age band for each.
//
// The verdict block at the top of the response spells out the
// answer in plain English:
//
//   "By IMPRESSIONS (reach): 18-24 dominant with X.X%"
//   "By CLICKS (broad taps): 45-54 dominant with Y.Y%"
//   "By LINK CLICKS (destination-URL clicks): 25-34 dominant with Z.Z%"
//
// If two different metrics point to two different dominant ages,
// the same data is telling two truthful stories and the choice of
// metric is a methodology question, not a bug. If one metric
// returns all zeros, it's not populated at this data_level for
// this account.
//
// Admin only. Also returns the full per-age table so the operator
// can eyeball edge cases and CTR asymmetry.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isAdminOrSuperadmin } from "./_auth.js";
import { validateDates } from "./_validate.js";

async function ttFetch(advId, token, params) {
  var u = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?" + params;
  try {
    var r = await fetch(u, { headers: { "Access-Token": token } });
    if (!r.ok) return { error: "HTTP " + r.status, url: u.slice(0, 200) };
    var d = await r.json();
    if (d.code && d.code !== 0) return { error: "code " + d.code + ": " + (d.message || ""), url: u.slice(0, 200) };
    return { ok: true, list: (d.data && d.data.list) || [] };
  } catch (e) {
    return { error: String(e && e.message || e), url: u.slice(0, 200) };
  }
}

function normaliseAge(raw) {
  var k = String(raw || "").toUpperCase();
  var m = /^AGE_(\d+)_(\d+)$/.exec(k);
  if (m) return m[1] + "-" + m[2];
  var m2 = /^AGE_(\d+)_(?:UP|PLUS|100)$/.exec(k);
  if (m2) return m2[1] + "+";
  if (k === "AGE_UNDETERMINED" || k === "NONE" || !raw) return "unknown";
  return String(raw);
}

function pickDominant(perAgeMap) {
  var top = "";
  var topVal = 0;
  var denom = 0;
  Object.keys(perAgeMap).forEach(function(a) {
    if (a === "unknown") return; // never headline unknown
    denom += perAgeMap[a];
    if (perAgeMap[a] > topVal) { topVal = perAgeMap[a]; top = a; }
  });
  return {
    age: top || "(none)",
    value: topVal,
    share: denom > 0 ? (topVal / denom * 100) : 0,
    denom: denom
  };
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
  var principal = req.authPrincipal || {};
  if (!isAdminOrSuperadmin(principal)) {
    return res.status(403).json({ error: "admin_required" });
  }
  if (!validateDates(req, res)) return;
  var from = req.query.from, to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  var advId = process.env.TIKTOK_ADVERTISER_ID;
  var token = process.env.TIKTOK_ACCESS_TOKEN;
  if (!advId || !token) return res.status(500).json({ error: "TikTok creds missing" });

  // AUDIENCE report at AUCTION_CAMPAIGN with age dimension — same
  // shape the persona reads. Every meaningful click definition
  // requested so we can see side-by-side which one Ads Manager
  // agrees with.
  var metrics = ["spend", "impressions", "clicks", "link_click_count", "reach"];
  var params =
    "advertiser_id=" + advId +
    "&report_type=AUDIENCE" +
    "&data_level=AUCTION_CAMPAIGN" +
    "&dimensions=" + encodeURIComponent(JSON.stringify(["campaign_id", "age"])) +
    "&metrics=" + encodeURIComponent(JSON.stringify(metrics)) +
    "&start_date=" + from +
    "&end_date=" + to +
    "&page_size=1000";
  var resp = await ttFetch(advId, token, params);

  if (!resp || !resp.ok) {
    return res.status(200).json({
      verdict: "TikTok API call failed — no data to compare against Ads Manager",
      apiError: (resp && resp.error) || "unknown",
      from: from, to: to
    });
  }

  // Aggregate per-age sums for each metric across every row (rows
  // are per campaign_id + age, so we sum campaign_ids into one
  // per-age view of the whole account).
  var perAge = {
    impressions: {},
    clicks: {},
    linkClicks: {},
    reach: {}
  };
  (resp.list || []).forEach(function(row) {
    var dim = row.dimensions || {};
    var met = row.metrics || {};
    var age = normaliseAge(dim.age);
    perAge.impressions[age] = (perAge.impressions[age] || 0) + (parseInt(met.impressions, 10) || 0);
    perAge.clicks[age] = (perAge.clicks[age] || 0) + (parseInt(met.clicks, 10) || 0);
    perAge.linkClicks[age] = (perAge.linkClicks[age] || 0) + (parseInt(met.link_click_count, 10) || 0);
    perAge.reach[age] = (perAge.reach[age] || 0) + (parseInt(met.reach, 10) || 0);
  });

  var domImps = pickDominant(perAge.impressions);
  var domClicks = pickDominant(perAge.clicks);
  var domLinkClicks = pickDominant(perAge.linkClicks);
  var domReach = pickDominant(perAge.reach);

  // Verdict block in plain English so the operator gets the answer
  // without having to interpret a JSON tree.
  var verdictLines = [];
  verdictLines.push("Window: " + from + " to " + to + " · advertiser " + advId + " · " + (resp.list || []).length + " campaign-age rows");
  verdictLines.push("");
  verdictLines.push("By IMPRESSIONS (paid reach — who TikTok's algorithm SERVED the ads to):");
  verdictLines.push("  " + domImps.age + " dominant with " + domImps.share.toFixed(2) + "% (" + Math.round(domImps.value).toLocaleString() + " of " + Math.round(domImps.denom).toLocaleString() + ")");
  verdictLines.push("");
  verdictLines.push("By CLICKS (broad taps — TikTok's default 'clicks' metric, includes video-area / CTA / profile taps):");
  verdictLines.push("  " + domClicks.age + " dominant with " + domClicks.share.toFixed(2) + "% (" + Math.round(domClicks.value).toLocaleString() + " of " + Math.round(domClicks.denom).toLocaleString() + ")");
  verdictLines.push("");
  verdictLines.push("By LINK CLICKS (link_click_count — destination-URL clicks only, apples-to-apples with Meta 'clicks'):");
  if (domLinkClicks.denom === 0) {
    verdictLines.push("  NOT POPULATED — link_click_count returned zero across every age band. Either this account has no link-click campaigns on TikTok, or the metric is not exposed at AUCTION_CAMPAIGN + AUDIENCE.");
  } else {
    verdictLines.push("  " + domLinkClicks.age + " dominant with " + domLinkClicks.share.toFixed(2) + "% (" + Math.round(domLinkClicks.value).toLocaleString() + " of " + Math.round(domLinkClicks.denom).toLocaleString() + ")");
  }
  verdictLines.push("");
  verdictLines.push("By REACH (unique users):");
  if (domReach.denom === 0) {
    verdictLines.push("  NOT POPULATED at this report level.");
  } else {
    verdictLines.push("  " + domReach.age + " dominant with " + domReach.share.toFixed(2) + "% (" + Math.round(domReach.value).toLocaleString() + " of " + Math.round(domReach.denom).toLocaleString() + ")");
  }
  verdictLines.push("");
  verdictLines.push("INTERPRETATION:");
  if (domImps.age !== domClicks.age) {
    verdictLines.push("  Impressions and Clicks point to DIFFERENT dominant ages. The younger cohort is reached more; the older cohort taps harder per impression. Both statements are true about the same data.");
    verdictLines.push("  Compare the CLICKS dominant against TikTok Ads Manager for the same window to confirm: " + domClicks.age + " should match.");
  } else {
    verdictLines.push("  Impressions and Clicks both point to " + domClicks.age + " dominant. This is TikTok's straightforward answer for MoMo — the algorithm both serves and gets clicks concentrated in that band.");
  }
  if (domLinkClicks.denom > 0 && domLinkClicks.age !== domClicks.age) {
    verdictLines.push("  Link Clicks disagrees with Broad Clicks (" + domLinkClicks.age + " vs " + domClicks.age + "). Meta's 'clicks' definition is link-click-equivalent, so cross-platform aggregate charts using TikTok's broad clicks are apples-to-oranges.");
  }

  // Per-age table for eyeballing edge cases and CTR asymmetry.
  var ageOrder = ["13-17","18-24","25-34","35-44","45-54","55-64","55+","65+","unknown"];
  var seenAges = {};
  Object.keys(perAge.impressions).forEach(function(a) { seenAges[a] = true; });
  Object.keys(perAge.clicks).forEach(function(a) { seenAges[a] = true; });
  var displayAges = ageOrder.filter(function(a) { return seenAges[a]; })
    .concat(Object.keys(seenAges).filter(function(a) { return ageOrder.indexOf(a) < 0; }));
  var perAgeTable = displayAges.map(function(a) {
    var imps = perAge.impressions[a] || 0;
    var clk = perAge.clicks[a] || 0;
    var lclk = perAge.linkClicks[a] || 0;
    var rch = perAge.reach[a] || 0;
    return {
      age: a,
      impressions: imps,
      broadClicks: clk,
      linkClicks: lclk,
      reach: rch,
      broadCtr: imps > 0 ? +(clk / imps * 100).toFixed(2) : 0,
      linkCtr: imps > 0 ? +(lclk / imps * 100).toFixed(2) : 0
    };
  });

  res.status(200).json({
    verdict: verdictLines.join("\n"),
    dominantBy: {
      impressions: { age: domImps.age, share: +domImps.share.toFixed(2), value: domImps.value },
      broadClicks: { age: domClicks.age, share: +domClicks.share.toFixed(2), value: domClicks.value },
      linkClicks: { age: domLinkClicks.age, share: +domLinkClicks.share.toFixed(2), value: domLinkClicks.value },
      reach: { age: domReach.age, share: +domReach.share.toFixed(2), value: domReach.value }
    },
    perAge: perAgeTable,
    meta: {
      from: from,
      to: to,
      advertiserId: advId,
      rowCount: (resp.list || []).length,
      reportType: "AUDIENCE",
      dataLevel: "AUCTION_CAMPAIGN",
      dimensions: ["campaign_id", "age"],
      metricsRequested: metrics
    }
  });
}
