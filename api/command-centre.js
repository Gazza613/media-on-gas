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
import { fetchCampaigns } from "./_pulseShared.js";
import { readCampaignSeries, ymd } from "./_perfSnapshots.js";

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
// Loose objective family check for result-based alerts.
function isLeadType(obj) {
  return /lead|conver|sale|sign|regist|purchase|acquisi|app_?install|install/i.test(String(obj || ""));
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
  var monthStart = todayStr.slice(0, 8) + "01";
  var dayOfMonth = parseInt(todayStr.slice(8, 10), 10) || 1;

  var periodData, todayData;
  try {
    var pair = await Promise.all([
      fetchCampaigns(monthStart, todayStr, dashKey),  // month-to-date
      fetchCampaigns(todayStr, todayStr, dashKey)      // today only
    ]);
    periodData = pair[0]; todayData = pair[1];
  } catch (err) {
    res.status(502).json({ error: "Upstream campaign fetch failed", message: String(err && err.message || err) });
    return;
  }

  var todaySpendById = {};
  (todayData && todayData.campaigns || []).forEach(function(c) {
    todaySpendById[String(c.campaignId || c.rawCampaignId || "")] = num(c.spend);
  });

  var rows = (periodData && periodData.campaigns) || [];
  var clients = {};
  var summary = { campaigns: 0, live: 0, needsAttention: 0, spendToday: 0, spendPeriod: 0, alerts: 0 };

  for (var i = 0; i < rows.length; i++) {
    var c = rows[i];
    var id = String(c.campaignId || c.rawCampaignId || "");
    var statusActive = isActiveStatus(c.status);
    var periodSpend = num(c.spend);
    var todaySpend = todaySpendById[id] || 0;
    var ended = endedInPast(c);

    // The command centre is "what is in flight + what needs a human",
    // not an archive: keep active, or anything that delivered this
    // month / today, or an active-but-ended config (that IS an alert).
    if (!statusActive && periodSpend === 0 && todaySpend === 0) continue;

    var impressions = num(c.impressions), clicks = num(c.clicks), leads = num(c.leads);
    var ctr = num(c.ctr), cpm = num(c.cpm), cpc = num(c.cpc), frequency = num(c.frequency);
    var budgetDaily = num(c.budgetDaily), budgetAmount = num(c.budgetAmount);
    var cpl = leads > 0 ? periodSpend / leads : 0;
    var live = statusActive && !ended;

    // Pacing: expected month-to-date = daily budget x days elapsed.
    var pacing = null;
    if (budgetDaily > 0) {
      var expected = budgetDaily * dayOfMonth;
      var ratio = expected > 0 ? periodSpend / expected : null;
      pacing = {
        budgetDaily: budgetDaily,
        expectedToDate: Math.round(expected),
        actualToDate: Math.round(periodSpend),
        ratioPct: ratio == null ? null : parseFloat((ratio * 100).toFixed(2)),
        state: ratio == null ? "unknown" : ratio < 0.8 ? "behind" : ratio > 1.25 ? "ahead" : "on_track"
      };
    }

    // Current-state alerts (deliberately conservative to avoid noise).
    var alerts = [];
    if (statusActive && ended) {
      alerts.push({ severity: "high", code: "ended_still_active", message: "Status is active but the end date has passed. Turn it off or extend it." });
    }
    if (live && (budgetDaily > 0 || budgetAmount > 0) && periodSpend === 0) {
      alerts.push({ severity: "high", code: "live_no_spend", message: "Live with a budget but zero spend this month. Check delivery / approval / payment." });
    } else if (live && periodSpend > 0 && todaySpend === 0 && !ended) {
      alerts.push({ severity: "medium", code: "today_no_spend", message: "Was delivering this month but no spend today. Check it has not stalled." });
    }
    if (periodSpend >= 200 && clicks === 0) {
      alerts.push({ severity: "high", code: "spend_no_clicks", message: "R" + periodSpend.toFixed(2) + " spent with zero clicks. Creative or targeting problem." });
    }
    if (isLeadType(c.objective) && clicks >= 50 && leads === 0) {
      alerts.push({ severity: "medium", code: "clicks_no_results", message: clicks + " clicks, zero leads. Likely a landing page / tracking break." });
    }
    if (frequency >= 3) {
      alerts.push({ severity: "medium", code: "frequency_high", message: "Frequency " + frequency.toFixed(2) + ". Creative fatigue risk, refresh or widen audience." });
    }
    if (pacing && pacing.state === "behind") {
      alerts.push({ severity: "medium", code: "pacing_behind", message: "Pacing behind: R" + Math.round(periodSpend) + " spent vs ~R" + pacing.expectedToDate + " expected by day " + dayOfMonth + "." });
    } else if (pacing && pacing.state === "ahead") {
      alerts.push({ severity: "low", code: "pacing_ahead", message: "Pacing ahead of plan: R" + Math.round(periodSpend) + " vs ~R" + pacing.expectedToDate + " expected. Budget may exhaust early." });
    }
    // Trend alert from first-party snapshot history (roadmap #1 payoff).
    try {
      var series = await readCampaignSeries(id, 8);
      var trend = cplTrend(series);
      if (trend) alerts.push(trend);
    } catch (_) {}

    var cl = clientOf(c);
    if (!clients[cl]) clients[cl] = { client: cl, campaigns: [], rollup: { spendPeriod: 0, spendToday: 0, leads: 0, live: 0, alerts: 0 } };
    clients[cl].campaigns.push({
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
        leads: Math.round(leads),
        cpl: parseFloat(cpl.toFixed(2))
      },
      pacing: pacing,
      alerts: alerts
    });
    var rr = clients[cl].rollup;
    rr.spendPeriod += periodSpend; rr.spendToday += todaySpend; rr.leads += leads;
    if (live) rr.live++;
    rr.alerts += alerts.length;

    summary.campaigns++;
    if (live) summary.live++;
    if (alerts.length > 0) summary.needsAttention++;
    summary.alerts += alerts.length;
    summary.spendToday += todaySpend;
    summary.spendPeriod += periodSpend;
  }

  // Round rollups; order clients by attention then spend; campaigns
  // needing attention float to the top of each client.
  var sevRank = { high: 3, medium: 2, low: 1 };
  var topSev = function(a) { return a.reduce(function(m, x) { return Math.max(m, sevRank[x.severity] || 0); }, 0); };
  var clientList = Object.keys(clients).map(function(k) {
    var grp = clients[k];
    grp.rollup.spendPeriod = parseFloat(grp.rollup.spendPeriod.toFixed(2));
    grp.rollup.spendToday = parseFloat(grp.rollup.spendToday.toFixed(2));
    grp.rollup.leads = Math.round(grp.rollup.leads);
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
    period: { from: monthStart, to: todayStr, label: "Month to date" },
    summary: summary,
    clients: clientList
  });
}
