// TikTok Ads Manager alignment diagnostic. Admin-only. Purpose:
// answer with certainty whether the impressions/clicks numbers our
// /api/demographics endpoint reads from TikTok's `report/integrated/
// get` at `report_type=AUDIENCE` `data_level=AUCTION_CAMPAIGN` MATCH
// what TikTok Ads Manager displays for the same campaigns in the
// same window.
//
// Runs three side-by-side queries against the SAME date range so a
// hand-comparison against Ads Manager pinpoints exactly which metric
// definition the AUDIENCE report is returning:
//
//   1. AUDIENCE report at AUCTION_CAMPAIGN (age,gender dims, our
//      persona source) — same call demographics.js makes
//   2. BASIC report at AUCTION_CAMPAIGN (no audience dims, plain
//      campaign totals with EXPLICIT metric list) — closest thing to
//      the top of the Ads Manager "Campaign" tab summary strip
//   3. BASIC report at AUCTION_AD (per-ad totals with the same
//      explicit metrics) so we can eyeball ad-level parity
//
// The `metrics` list is explicit and covers TikTok's different click
// definitions:
//   - `clicks`          — the default "clicks" field (any tappable
//                          area, wide definition)
//   - `link_click_count` — clicks that led to the ad's destination
//                          URL (closest to Ads Manager "Link Clicks"
//                          for feed/carousel ads)
//   - `real_time_clicks` — clicks reported in real-time (may differ
//                          from finalised clicks by <24h)
//
// Reading the three responses side by side tells us:
//   - If AUDIENCE.clicks (row summed) ~= BASIC.clicks   -> our
//     persona source is the same click metric as the campaign strip
//   - If AUDIENCE.clicks >> BASIC.link_click_count      -> AUDIENCE
//     is returning broad clicks not link clicks; we know to switch
//     the fetch to link_click_count if we want Ads-Manager parity
//   - If numbers don't match at all                     -> different
//     issue (auth scope, timezone, campaign-status filter, cache)
//
// Admin only. Returns a single JSON blob with the three responses
// plus computed sums for one-glance comparison.

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

function sumMetric(list, key) {
  var s = 0;
  (list || []).forEach(function(row) {
    var m = row.metrics || {};
    var v = parseFloat(m[key] || 0);
    if (!isNaN(v)) s += v;
  });
  return Math.round(s);
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

  // Explicit metric list. Includes the three click variants so we can
  // compare which one AUDIENCE.clicks corresponds to.
  var metrics = ["spend", "impressions", "clicks", "link_click_count", "real_time_clicks", "reach", "cost_per_1000_reached"];
  var mParam = encodeURIComponent(JSON.stringify(metrics));

  // 1) AUDIENCE report at AUCTION_CAMPAIGN with age,gender dims —
  //    the exact call demographics.js makes for the persona.
  var audienceParams =
    "advertiser_id=" + advId +
    "&report_type=AUDIENCE" +
    "&data_level=AUCTION_CAMPAIGN" +
    "&dimensions=" + encodeURIComponent(JSON.stringify(["campaign_id", "age", "gender"])) +
    "&metrics=" + mParam +
    "&start_date=" + from +
    "&end_date=" + to +
    "&page_size=1000";
  var audience = await ttFetch(advId, token, audienceParams);

  // 2) BASIC report at AUCTION_CAMPAIGN — closest to the Ads Manager
  //    campaign summary strip. If AUDIENCE.clicks summed does NOT
  //    equal BASIC.clicks summed, that's the smoking gun.
  var basicCampParams =
    "advertiser_id=" + advId +
    "&report_type=BASIC" +
    "&data_level=AUCTION_CAMPAIGN" +
    "&dimensions=" + encodeURIComponent(JSON.stringify(["campaign_id"])) +
    "&metrics=" + mParam +
    "&start_date=" + from +
    "&end_date=" + to +
    "&page_size=1000";
  var basicCamp = await ttFetch(advId, token, basicCampParams);

  // 3) BASIC report at AUCTION_AD — per-ad rows for spot-checking a
  //    single ad against Ads Manager's "Ads" tab.
  var basicAdParams =
    "advertiser_id=" + advId +
    "&report_type=BASIC" +
    "&data_level=AUCTION_AD" +
    "&dimensions=" + encodeURIComponent(JSON.stringify(["ad_id", "campaign_id"])) +
    "&metrics=" + mParam +
    "&start_date=" + from +
    "&end_date=" + to +
    "&page_size=1000";
  var basicAd = await ttFetch(advId, token, basicAdParams);

  // Sum every metric across every row of every response so a
  // hand-comparison against Ads Manager fits on one screen. If the
  // three impression sums agree with each other AND with Ads Manager,
  // impressions are aligned. If AUDIENCE.clicks and BASIC.clicks
  // agree with each other but disagree with Ads Manager's Link Clicks
  // total, we're pulling the wrong click definition.
  var summarise = function(resp) {
    if (!resp || !resp.ok) return { error: (resp && resp.error) || "no response" };
    var out = { rowCount: resp.list.length };
    metrics.forEach(function(m) {
      out[m] = sumMetric(resp.list, m);
    });
    return out;
  };

  var response = {
    from: from,
    to: to,
    advertiserId: advId,
    note: "Compare `sums` below against TikTok Ads Manager for the same date range and campaign selection. impressions should match exactly across all three of ours; if clicks disagree between AUDIENCE and BASIC, we're on a different click metric than expected.",
    sums: {
      audienceReport_AUCTION_CAMPAIGN_ageGender: summarise(audience),
      basicReport_AUCTION_CAMPAIGN: summarise(basicCamp),
      basicReport_AUCTION_AD: summarise(basicAd)
    },
    // First 3 rows from each response so we can see the raw dimension
    // + metric shape.
    sampleRows: {
      audience: (audience && audience.ok ? audience.list.slice(0, 3) : audience),
      basicCamp: (basicCamp && basicCamp.ok ? basicCamp.list.slice(0, 3) : basicCamp),
      basicAd: (basicAd && basicAd.ok ? basicAd.list.slice(0, 3) : basicAd)
    }
  };

  res.status(200).json(response);
}
