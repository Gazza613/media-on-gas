// Internal GAS Campaign Load + Live Health command centre (roadmap #2).
// Admin/team only. NEVER client-facing (mirrors api/pages.js gating).
//
// Answers, per client and campaign, in one call: is it live, is it
// delivering, is it pacing to budget, and what needs a human now.
// Reads the SAME normalised /api/campaigns the dashboard uses (no new
// API connection) plus the perf-snapshot history from roadmap #1 for
// trend-based alerts. Pure read; creates/changes nothing.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { fetchCampaigns, fetchAdsByCampaign } from "./_pulseShared.js";
import { readRecentPerf, ymd } from "./_perfSnapshots.js";
import { fetchAdsetPacing, paceAdset } from "./_adsetBudgets.js";

export const config = { maxDuration: 60 };

function sast(offsetDays) {
  return new Date(Date.now() + 2 * 60 * 60 * 1000 + (offsetDays || 0) * 24 * 60 * 60 * 1000);
}
function num(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }

var PLATFORM_SUFFIX = /\s+(Meta|Google|TikTok|Facebook|Instagram|Ads|FB|IG)$/i;
function clientOf(c) {
  var raw = String(c.accountName || "").trim();
  var clean = raw.replace(PLATFORM_SUFFIX, "").replace(PLATFORM_SUFFIX, "").trim();
  return clean || raw || "Unknown";
}

function isActiveStatus(s) {
  s = String(s || "").toLowerCase();
  return s === "active" || s === "enable" || s === "enabled";
}
function endedInPast(c) {
  if (!c || !c.endDate) return false;
  var t = Date.parse(c.endDate);
  return isFinite(t) && t < Date.now();
}
// Best-effort deep link straight to this campaign in the right Ads
// Manager. Meta is exact (account + campaign); TikTok/Google fall back
// to the advertiser/account dashboard (no reliable public per-campaign
// deep link). "" when we cannot build one.
function adsManagerUrlFor(c) {
  var plat = String(c.platform || "").toLowerCase();
  var meta = plat.indexOf("facebook") >= 0 || plat.indexOf("instagram") >= 0 || String(c.metaPlatform || "") === "facebook";
  var raw = String(c.rawCampaignId || c.campaignId || "").replace(/_facebook$|_instagram$/i, "");
  if (meta) {
    var actNum = String(c.accountId || "").replace(/[^0-9]/g, "");
    if (!actNum) return "";
    return "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=" + actNum +
      (raw ? "&selected_campaign_ids=" + encodeURIComponent(raw) : "");
  }
  if (plat.indexOf("tiktok") >= 0) {
    var adv = String(c.accountId || "").replace(/[^0-9]/g, "");
    return adv ? "https://ads.tiktok.com/i18n/perf?aadvid=" + adv : "https://ads.tiktok.com/i18n/perf";
  }
  if (plat.indexOf("google") >= 0 || plat.indexOf("youtube") >= 0) {
    return "https://ads.google.com/aw/campaigns";
  }
  return "";
}
// Resolve a campaign's objective family and its CORRECT result metric,
// so alerts + the headline tile speak the campaign's own KPI (installs
// for app campaigns, leads for lead campaigns, follows for community,
// clicks for traffic, impressions for awareness) instead of always
// assuming "leads". Canon objective first, campaign-name fallback,
// mirrors the dashboard's classification.
//
// FOLLOWERS family is platform-aware to match the rest of the dashboard
// (Summary / Community / Deep Dive / Creative / Demographics):
//   Facebook  -> c.pageLikes, label "Page Likes"     (per-ad attribution,
//                gated server-side by ad-set optimization_goal=PAGE_LIKES)
//   Instagram -> c.clicks,    label "Profile Visits" (Meta does NOT
//                attribute IG follows per ad; clicks is the proxy)
//   TikTok    -> c.follows,   label "Follows"        (real per-ad attrib)
function resolveObjective(c) {
  var canon = String(c.objective || "").toLowerCase();
  var nm = String(c.campaignName || "").toLowerCase();
  var fam;
  if (canon === "appinstall" || /app[_\s-]?instal/.test(nm)) fam = "appinstall";
  else if (canon === "leads" || /(^|[_\s-])lead/.test(nm) || /(^|[_\s-])pos(\b|[_\s-])/.test(nm)) fam = "leads";
  else if (canon === "followers" || /follow|_like[_\s]|like_facebook|like_instagram|paidsocial_like/.test(nm)) fam = "followers";
  else if (canon === "landingpage" || /landing|traffic|paidsearch|homeloan/.test(nm)) fam = "traffic";
  else fam = "awareness";
  var spend = num(c.spend);
  var plat = String(c.platform || "").toLowerCase();
  var isFB = plat.indexOf("facebook") >= 0;
  var isIG = plat.indexOf("instagram") >= 0;
  var isTT = plat.indexOf("tiktok") >= 0;
  var result, resultLabel, costLabel;
  // App Store campaigns here drive CLICKS TO THE APP STORE, not SDK
  // installs (no install SDK in play). The dashboard classifies these
  // as "Clicks to App Store" with clicks as the result; mirror that.
  // installs===0 is expected and is NOT a tracking break.
  if (fam === "appinstall") { result = num(c.clicks); resultLabel = "App Store Clicks"; costLabel = "CPC"; }
  else if (fam === "leads") { result = num(c.leads); resultLabel = "Leads"; costLabel = "CPL"; }
  else if (fam === "followers") {
    if (isFB) {
      result = num(c.pageLikes); resultLabel = "Page Likes"; costLabel = "Cost / Page Like";
    } else if (isIG) {
      // Meta doesn't attribute IG follows per ad; the dashboard uses
      // clicks as the profile-visits proxy on every other surface,
      // mirror it here so the Command Centre lines up.
      result = num(c.clicks); resultLabel = "Profile Visits"; costLabel = "Cost / Profile Visit";
    } else if (isTT) {
      result = num(c.follows); resultLabel = "Follows"; costLabel = "CPF";
    } else {
      result = num(c.pageLikes) + num(c.follows); resultLabel = "Followers"; costLabel = "CPF";
    }
  }
  else if (fam === "traffic") { result = num(c.clicks); resultLabel = "Clicks"; costLabel = "CPC"; }
  else { result = num(c.impressions); resultLabel = "Impressions"; costLabel = "CPM"; }
  var costPer = fam === "awareness"
    ? (result > 0 ? spend / result * 1000 : 0)
    : (result > 0 ? spend / result : 0);
  return {
    family: fam, result: result, resultLabel: resultLabel,
    costLabel: costLabel, costPer: costPer,
    platform: isFB ? "facebook" : isIG ? "instagram" : isTT ? "tiktok" : "other",
    // Count this campaign's result in the client-header rollup. True for
    // any objective with a meaningful per-campaign result (leads, all
    // followers families incl. FB page likes + IG profile visits).
    // Awareness has no discrete result, click-KPI families keep their
    // existing rollup exclusion to avoid double-counting clicks.
    countsAsResult: fam === "leads" || fam === "followers",
    // Gate for the "spent + clicked, zero results" alert. Only LEADS and
    // TikTok FOLLOWERS have per-ad attribution reliable enough to flag:
    //   - FB followers: zero per-ad page likes is often a tooling artefact
    //     (ad-set optimization_goal != PAGE_LIKES, so Meta doesn't
    //     attribute the action per ad). Whole-account snapshot growth on
    //     Summary is the trustworthy signal there. Don't flag here.
    //   - IG followers: result IS clicks (profile visits proxy), so the
    //     "no clicks" branch already handles it, never get a stray
    //     "no follows" alert.
    //   - TikTok followers: real per-ad attribution, flag away.
    hasConversion: fam === "leads" || (fam === "followers" && isTT),
    // Click-KPI objectives: a click-break (spend + impressions but zero
    // clicks) IS a real problem and gets its own alert.
    clickKpi: fam === "appinstall" || fam === "traffic"
  };
}

// Trend alert from the first-party snapshot history: trailing median
// daily CPL vs the most recent snapshot day. Silent unless there are
// >=3 history days WITH leads, so it never cries wolf early.
function cplTrend(series) {
  var pts = (series || []).map(function(d) {
    var leads = num(d.leads), spend = num(d.spend);
    return leads > 0 ? { date: d.date, cpl: spend / leads } : null;
  }).filter(Boolean);
  if (pts.length < 3) return null;
  var latest = pts[pts.length - 1];
  var prior = pts.slice(0, -1).map(function(p) { return p.cpl; }).sort(function(a, b) { return a - b; });
  var mid = Math.floor(prior.length / 2);
  var median = prior.length % 2 ? prior[mid] : (prior[mid - 1] + prior[mid]) / 2;
  if (median <= 0) return null;
  var ratio = latest.cpl / median;
  if (ratio >= 1.5) {
    return { severity: "medium", code: "cpl_trend_up",
      message: "CPL trending up: latest R" + latest.cpl.toFixed(2) + " vs R" + median.toFixed(2) + " trailing median (" + ((ratio - 1) * 100).toFixed(2) + "% higher)" };
  }
  return null;
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;
  if (!(await checkAuth(req, res))) return;
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }

  var dashKey = process.env.DASHBOARD_API_KEY || "";
  if (!dashKey) { res.status(500).json({ error: "DASHBOARD_API_KEY not configured" }); return; }

  var todayStr = ymd(sast(0));
  // Honour the operator's selected dashboard period. Only fall back to
  // month-to-date when no valid range is supplied. (Previously this
  // endpoint always used month-to-date and ignored the date picker,
  // so it surfaced campaigns/issues outside the selected window.)
  var validYmd = function(x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || "")); };
  var qFrom = String(req.query.from || "").trim();
  var qTo = String(req.query.to || "").trim();
  var periodFrom = validYmd(qFrom) ? qFrom : (todayStr.slice(0, 8) + "01");
  var periodTo = validYmd(qTo) ? qTo : todayStr;
  if (periodFrom > periodTo) { var _t = periodFrom; periodFrom = periodTo; periodTo = _t; }
  // Days elapsed within the window up to today, for budget pacing.
  var pacingEnd = periodTo < todayStr ? periodTo : todayStr;
  var elapsedDays = Math.max(1, Math.round(
    (Date.parse(pacingEnd + "T00:00:00Z") - Date.parse(periodFrom + "T00:00:00Z")) / 86400000) + 1);
  // "Today" spend only means something when today is inside the window.
  var todayInWindow = todayStr >= periodFrom && todayStr <= periodTo;

  var periodData, todayData;
  try {
    // Reuse the dashboard /api/campaigns 5-min response cache instead of
    // forcing fresh=1: the command centre is consulted continuously and
    // does not need bleeding-edge numbers. fresh=1 was timing the
    // function out (two ~30s upstream pulls back-to-back exceeded
    // Vercel's 60s ceiling), surfacing as "Network error" on the
    // dashboard. Cache lag is at most 5 min, which is fine here.
    var jobs = [ fetchCampaigns(periodFrom, periodTo, dashKey, { fresh: false }) ];
    if (todayInWindow) jobs.push(fetchCampaigns(todayStr, todayStr, dashKey, { fresh: false }));
    var pair = await Promise.all(jobs);
    periodData = pair[0];
    todayData = todayInWindow ? pair[1] : { campaigns: [] };
  } catch (err) {
    res.status(502).json({ error: "Upstream campaign fetch failed", message: String(err && err.message || err) });
    return;
  }

  // Top-ad thumbnail per campaign for the cockpit (best-effort; same
  // source the daily anomaly email uses). Never fails the request.
  var adsByCampaign = {};
  try { adsByCampaign = await fetchAdsByCampaign(periodFrom, periodTo, dashKey) || {}; } catch (_) { adsByCampaign = {}; }

  // Fetch the perf-snapshot history ONCE (was per-campaign inside the
  // loop = O(N) x ~9 serial Redis round-trips, which timed the function
  // out on large accounts like Psycho Bunny). Derive each campaign's
  // series in-memory from this single read.
  var recentSnaps = [];
  try { recentSnaps = await readRecentPerf(8) || []; } catch (_) { recentSnaps = []; }
  var seriesFor = function (cid) {
    var out = [];
    for (var k = 0; k < recentSnaps.length; k++) {
      var sn = recentSnaps[k];
      if (sn && sn.campaigns && sn.campaigns[cid]) out.push(Object.assign({ date: sn.date }, sn.campaigns[cid]));
    }
    return out;
  };

  var todaySpendById = {};
  (todayData && todayData.campaigns || []).forEach(function(c) {
    todaySpendById[String(c.campaignId || c.rawCampaignId || "")] = num(c.spend);
  });

  var rows = (periodData && periodData.campaigns) || [];
  var clients = {};
  var adsetTargets = [];
  var summary = { campaigns: 0, live: 0, needsAttention: 0, spendToday: 0, spendPeriod: 0, alerts: 0 };

  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    var id = String(c.campaignId || c.rawCampaignId || "");
    var statusActive = isActiveStatus(c.status);
    var periodSpend = num(c.spend);
    var todaySpend = todaySpendById[id] || 0;
    var ended = endedInPast(c);

    var impressions = num(c.impressions), clicks = num(c.clicks), leads = num(c.leads);
    // The command centre is "what is actually in flight this period".
    // Require SOME delivery in the selected window (spend, today spend,
    // or impressions). A campaign left ENABLED on the platform but with
    // no delivery in the window (e.g. a Feb/Mar/Apr TikTok campaign
    // never switched off) is NOT in flight now and must not appear or
    // be flagged "live but zero spend". This is the dormant-noise fix.
    if (periodSpend === 0 && todaySpend === 0 && impressions === 0) continue;

    var ctr = num(c.ctr), cpm = num(c.cpm), cpc = num(c.cpc), frequency = num(c.frequency);
    var live = statusActive && !ended;
    var ob = resolveObjective(c);

    // Pacing: handle daily AND lifetime budgets, at campaign OR ad-set
    // (ABO) level. /api/campaigns exposes a campaign-level view; for
    // ABO multi-ad-set setups the campaign row often has no budget
    // figure. In that case we say so plainly instead of the misleading
    // "no daily budget set", and we do NOT fabricate a pacing verdict.
    var bMode = String(c.budgetMode || "").toLowerCase();
    var bDaily = num(c.budgetDaily), bAmount = num(c.budgetAmount), bFlight = num(c.budgetFlightDays);
    var dailyTarget = 0;
    if (bMode === "daily" && bDaily > 0) dailyTarget = bDaily;
    else if (bMode === "lifetime" && bAmount > 0 && bFlight > 0) dailyTarget = bAmount / bFlight;
    else if (bDaily > 0) dailyTarget = bDaily;
    else if (bAmount > 0 && bFlight > 0) dailyTarget = bAmount / bFlight;
    var pacing;
    if (dailyTarget > 0) {
      var expected = dailyTarget * elapsedDays;
      if (bAmount > 0 && (bMode === "lifetime" || bFlight > 0)) expected = Math.min(expected, bAmount);
      var ratio = expected > 0 ? periodSpend / expected : null;
      pacing = {
        budgetMode: bMode === "lifetime" ? "lifetime" : "daily",
        budgetDaily: Math.round(dailyTarget),
        expectedToDate: Math.round(expected),
        actualToDate: Math.round(periodSpend),
        ratioPct: ratio == null ? null : parseFloat((ratio * 100).toFixed(2)),
        state: ratio == null ? "unknown" : ratio < 0.8 ? "behind" : ratio > 1.25 ? "ahead" : "on_track",
        note: ""
      };
    } else {
      // Empty note: the campaign tile's spend / today / alerts already
      // tell the story. The verbose "Budget is set at ad-set level..."
      // copy was repetitive on every ABO row and added no actionable
      // information. The per-ad-set pacing pass below will replace this
      // pacing object with real numbers when the Graph read succeeds.
      pacing = {
        budgetMode: bMode || "unset", budgetDaily: 0,
        expectedToDate: 0, actualToDate: Math.round(periodSpend),
        ratioPct: null, state: "na",
        note: ""
      };
    }

    // Current-state alerts (deliberately conservative to avoid noise).
    var alerts = [];
    // Only flag "active but past end date" when the campaign is ALSO
    // still delivering today. If todaySpend is zero, the operator has
    // already effectively turned it off (or the platform stopped
    // delivery automatically) and the warning is noise — even if
    // Meta's `effective_status` is still nominally ACTIVE due to a
    // cache lag or campaign-vs-adset toggle mismatch. Was firing on
    // ENDED rows the user had already paused at campaign level.
    if (statusActive && ended && todaySpend > 0) {
      alerts.push({ severity: "high", code: "ended_still_active", message: "Status is active but the end date has passed. Turn it off or extend it." });
    }
    // "No spend today" is only a real stall signal when (a) the campaign
    // had been delivering at a meaningful daily pace (not just a R20/day
    // dribble where R0 in any given day is normal), AND (b) it is late
    // enough in the SAST day for the lack of delivery to be unusual
    // (Meta/TikTok delivery is often back-loaded; R0 at 09:00 SAST is
    // typical and not actionable). Without these gates the alert
    // appeared on every low-volume campaign every morning, training the
    // operator to ignore it.
    if (todayInWindow && live && periodSpend > 0 && todaySpend === 0 && !ended) {
      var avgDaily = elapsedDays > 0 ? periodSpend / elapsedDays : 0;
      // SAST = UTC+2 (no DST). getUTCHours then +2 for the local hour.
      var sastHour = (new Date(Date.now() + 2 * 60 * 60 * 1000)).getUTCHours();
      var meaningfulPace = avgDaily >= 100;
      var lateEnough = sastHour >= 14; // past 14:00 SAST
      if (meaningfulPace && lateEnough) {
        alerts.push({
          severity: "medium",
          code: "today_no_spend",
          message: "Was delivering ~R" + Math.round(avgDaily) + "/day but no spend today by " + sastHour + ":00 SAST. Check it has not stalled."
        });
      }
    }
    // Money out, nothing delivered (objective-agnostic). Zero clicks is
    // NOT the signal — a follower / awareness campaign legitimately has
    // zero link clicks. Zero IMPRESSIONS for real spend is the signal.
    if (periodSpend >= 200 && impressions === 0) {
      alerts.push({ severity: "high", code: "spend_no_delivery", message: "R" + periodSpend.toFixed(2) + " spent but zero impressions delivered. Check approval / targeting / account status." });
    }
    // Click break ONLY for click objectives (traffic / landing page),
    // where clicks ARE the KPI. Followers / awareness / app installs
    // are judged on their own metric below, never on clicks.
    else if (ob.clickKpi && periodSpend >= 200 && impressions > 0 && clicks === 0) {
      var clkWhat = ob.family === "appinstall" ? "app-store clicks" : "landing-page clicks";
      alerts.push({ severity: "high", code: "no_clicks", message: "R" + periodSpend.toFixed(2) + " spent with impressions but zero " + clkWhat + ". Creative / targeting / destination problem." });
    }
    // "Delivering but zero of its own tracked conversion" — ONLY leads
    // and TikTok followers (genuine per-ad tracked conversions). FB
    // followers and IG followers are deliberately excluded via
    // ob.hasConversion to avoid false noise: FB page-like attribution
    // is gated by ad-set optimization_goal and IG follows aren't
    // attributed per ad at all (see resolveObjective).
    if (ob.hasConversion && (clicks >= 50 || periodSpend >= 200) && ob.result === 0) {
      var noun = ob.family === "followers" ? "follows" : "leads";
      var cause = ob.family === "followers" ? "the follow CTA / destination" : "a landing page / tracking break";
      alerts.push({ severity: "medium", code: "no_results", message: Math.round(clicks) + " clicks, zero " + noun + ". Likely " + cause + "." });
    }
    // TikTok tolerates much higher frequency than Meta before fatigue;
    // only flag TikTok over 6, everything else over 3.
    var freqLimit = /tiktok/i.test(String(c.platform || "")) ? 6 : 3;
    if (frequency >= freqLimit) {
      alerts.push({ severity: "medium", code: "frequency_high", message: "Frequency " + frequency.toFixed(2) + ". Creative fatigue risk, refresh or widen audience." });
    }
    if (pacing && pacing.state === "behind") {
      alerts.push({ severity: "medium", code: "pacing_behind", message: "Pacing behind: R" + Math.round(periodSpend) + " spent vs ~R" + pacing.expectedToDate + " expected over " + elapsedDays + " day" + (elapsedDays === 1 ? "" : "s") + "." });
    } else if (pacing && pacing.state === "ahead") {
      alerts.push({ severity: "low", code: "pacing_ahead", message: "Pacing ahead of plan: R" + Math.round(periodSpend) + " vs ~R" + pacing.expectedToDate + " expected. Budget may exhaust early." });
    }
    // Trend alert from first-party snapshot history (roadmap #1 payoff).
    // In-memory now, no per-campaign Redis call.
    try {
      var trend = cplTrend(seriesFor(id));
      if (trend) alerts.push(trend);
    } catch (_) {}

    var cl = clientOf(c);
    if (!clients[cl]) clients[cl] = { client: cl, campaigns: [], rollup: { spendPeriod: 0, spendToday: 0, results: 0, live: 0, alerts: 0 } };
    var entry = {
      campaignId: id,
      campaignName: String(c.campaignName || ""),
      platform: String(c.platform || ""),
      objective: String(c.objective || ""),
      status: String(c.status || ""),
      live: live,
      ended: ended,
      startDate: String(c.startDate || ""),
      endDate: String(c.endDate || ""),
      delivery: {
        spendPeriod: parseFloat(periodSpend.toFixed(2)),
        spendToday: parseFloat(todaySpend.toFixed(2)),
        impressions: Math.round(impressions),
        clicks: Math.round(clicks),
        ctr: parseFloat(ctr.toFixed(2)),
        cpm: parseFloat(cpm.toFixed(2)),
        cpc: parseFloat(cpc.toFixed(2)),
        frequency: parseFloat(frequency.toFixed(2)),
        // Objective-aware headline metric (Installs / Leads / Followers
        // / Clicks / Impressions) + its cost label, so the tile speaks
        // the campaign's own KPI instead of always "Leads / CPL".
        result: Math.round(ob.result),
        resultLabel: ob.resultLabel,
        costLabel: ob.costLabel,
        costPer: parseFloat((ob.costPer || 0).toFixed(2))
      },
      pacing: pacing,
      alerts: alerts,
      thumbnail: (adsByCampaign[String(c.rawCampaignId || "")] || adsByCampaign[id] || {}).thumbnail || "",
      adsManagerUrl: adsManagerUrlFor(c)
    };
    clients[cl].campaigns.push(entry);
    // Meta campaign with no campaign-level budget = ABO / ad-set-level.
    // Queue it for a precise per-ad-set pacing pass after the loop.
    var isMeta = /facebook|instagram/i.test(String(c.platform || "")) || String(c.metaPlatform || "") === "facebook";
    if (pacing && pacing.state === "na" && isMeta && c.accountId && (c.rawCampaignId || c.campaignId)) {
      adsetTargets.push({ accountId: String(c.accountId), rawCampaignId: String(c.rawCampaignId || c.campaignId), entry: entry });
    }
    var rr = clients[cl].rollup;
    rr.spendPeriod += periodSpend; rr.spendToday += todaySpend; rr.results += (ob.countsAsResult ? ob.result : 0);
    if (live) rr.live++;
    // Alert counters are tallied AFTER the post-loop ad-set pacing pass
    // (which can add a pacing alert), so they are computed in the
    // clientList pass below, not here.
    summary.campaigns++;
    if (live) summary.live++;
    summary.spendToday += todaySpend;
    summary.spendPeriod += periodSpend;
  }

  // ---- Per-ad-set pacing for Meta ABO / ad-set-level budgets -------
  // The campaign-level view could not express these; resolve them now
  // with a batched Graph read. Best-effort: on any miss the campaign
  // keeps its existing "budget at ad-set level" note (no regression).
  if (adsetTargets.length > 0) {
    try {
      var pacingMap = await fetchAdsetPacing(
        adsetTargets.map(function (t) { return { accountId: t.accountId, rawCampaignId: t.rawCampaignId }; }),
        periodFrom, periodTo);
      adsetTargets.forEach(function (t) {
        var list = pacingMap[t.accountId + "::" + t.rawCampaignId];
        if (!list || !list.length) return;
        var paced = list.map(function (a) { return paceAdset(a, periodFrom, periodTo, todayStr); });
        var expSum = paced.reduce(function (s, p) { return s + p.expectedToDate; }, 0);
        var actSum = paced.reduce(function (s, p) { return s + p.actualToDate; }, 0);
        var ratio = expSum > 0 ? actSum / expSum : null;
        t.entry.pacing = {
          mode: "adset",
          budgetMode: "adset",
          adsets: paced,
          expectedToDate: Math.round(expSum),
          actualToDate: Math.round(actSum),
          ratioPct: ratio == null ? null : parseFloat((ratio * 100).toFixed(2)),
          state: ratio == null ? "unknown" : ratio < 0.8 ? "behind" : ratio > 1.25 ? "ahead" : "on_track",
          note: paced.length + " ad set" + (paced.length === 1 ? "" : "s") + " (ABO)"
        };
        if (t.entry.pacing.state === "behind") {
          t.entry.alerts.push({ severity: "medium", code: "pacing_behind", message: "Pacing behind across " + paced.length + " ad set" + (paced.length === 1 ? "" : "s") + ": R" + Math.round(actSum) + " spent vs ~R" + Math.round(expSum) + " expected." });
        } else if (t.entry.pacing.state === "ahead") {
          t.entry.alerts.push({ severity: "low", code: "pacing_ahead", message: "Pacing ahead across " + paced.length + " ad set" + (paced.length === 1 ? "" : "s") + ": R" + Math.round(actSum) + " vs ~R" + Math.round(expSum) + " expected. Budget may exhaust early." });
        }
      });
    } catch (_) {}
  }

  // Tally alert counters now that ad-set pacing may have added alerts.
  Object.keys(clients).forEach(function (k) {
    var grp = clients[k];
    grp.rollup.alerts = 0;
    grp.campaigns.forEach(function (cm) {
      var n2 = (cm.alerts && cm.alerts.length) || 0;
      grp.rollup.alerts += n2;
      summary.alerts += n2;
      if (n2 > 0) summary.needsAttention++;
    });
  });

  // Round rollups; order clients by attention then spend; campaigns
  // needing attention float to the top of each client.
  var sevRank = { high: 3, medium: 2, low: 1 };
  var topSev = function(a) { return a.reduce(function(m, x) { return Math.max(m, sevRank[x.severity] || 0); }, 0); };
  var clientList = Object.keys(clients).map(function(k) {
    var grp = clients[k];
    grp.rollup.spendPeriod = parseFloat(grp.rollup.spendPeriod.toFixed(2));
    grp.rollup.spendToday = parseFloat(grp.rollup.spendToday.toFixed(2));
    grp.rollup.results = Math.round(grp.rollup.results);
    grp.campaigns.sort(function(a, b) {
      var d = topSev(b.alerts) - topSev(a.alerts);
      if (d) return d;
      return b.delivery.spendPeriod - a.delivery.spendPeriod;
    });
    return grp;
  }).sort(function(a, b) {
    if (b.rollup.alerts !== a.rollup.alerts) return b.rollup.alerts - a.rollup.alerts;
    return b.rollup.spendPeriod - a.rollup.spendPeriod;
  });

  summary.spendToday = parseFloat(summary.spendToday.toFixed(2));
  summary.spendPeriod = parseFloat(summary.spendPeriod.toFixed(2));

  res.status(200).json({
    ok: true,
    generatedAt: new Date().toISOString(),
    period: { from: periodFrom, to: periodTo, label: "Selected period" },
    summary: summary,
    clients: clientList
  });
}
