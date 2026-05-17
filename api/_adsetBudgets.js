// Ad-set-level budget + spend for Meta campaigns, so the Command
// Centre can pace ABO / per-ad-set lifetime budgets (which the
// campaign-level /api/campaigns view cannot express). Meta only.
//
// Batched per ACCOUNT (2 Graph calls each), not per campaign, and
// cached briefly so listing many campaigns stays cheap. Best-effort:
// any failure returns {} and the caller falls back to the existing
// "budget set at ad-set level" note (no regression).

var CACHE = {};
var TTL_MS = 5 * 60 * 1000;

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function ymd(d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function actId(id) { var s = String(id || "").trim(); return s.indexOf("act_") === 0 ? s : (s ? "act_" + s.replace(/[^0-9]/g, "") : ""); }
function centsToRand(v) { var n = parseInt(v, 10); return isFinite(n) && n > 0 ? n / 100 : 0; }

async function graph(url) {
  try {
    var r = await fetch(url);
    if (!r.ok) return null;
    var j = await r.json();
    if (!j || j.error) return null;
    return j;
  } catch (_) { return null; }
}

// One account -> { campaignId: [ {adsetId,name,budgetMode,budgetAmount,
// dailyBudget,startTime,endTime,status,spendWindow} ] }. Cached.
async function fetchAccount(account, fromYmd, toYmd, token) {
  var acc = actId(account);
  if (!acc) return {};
  var key = acc + "|" + fromYmd + "|" + toYmd;
  var hit = CACHE[key];
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

  var base = "https://graph.facebook.com/v25.0/" + acc;
  var cfgUrl = base + "/adsets?fields=id,name,campaign_id,daily_budget,lifetime_budget,start_time,end_time,effective_status&limit=500&access_token=" + encodeURIComponent(token);
  var tr = encodeURIComponent(JSON.stringify({ since: fromYmd, until: toYmd }));
  var spUrl = base + "/insights?level=adset&fields=adset_id,spend&time_range=" + tr + "&limit=500&access_token=" + encodeURIComponent(token);

  var pair = await Promise.all([graph(cfgUrl), graph(spUrl)]);
  var cfg = pair[0], sp = pair[1];
  if (!cfg || !Array.isArray(cfg.data)) { CACHE[key] = { ts: Date.now(), data: {} }; return {}; }

  var spendById = {};
  if (sp && Array.isArray(sp.data)) {
    sp.data.forEach(function (r) { spendById[String(r.adset_id)] = parseFloat(r.spend || 0); });
  }

  var byCampaign = {};
  cfg.data.forEach(function (a) {
    if (!a || !a.campaign_id) return;
    var lifetime = parseInt(a.lifetime_budget || 0, 10) > 0;
    var cid = String(a.campaign_id);
    if (!byCampaign[cid]) byCampaign[cid] = [];
    byCampaign[cid].push({
      adsetId: String(a.id),
      name: String(a.name || ""),
      budgetMode: lifetime ? "lifetime" : (parseInt(a.daily_budget || 0, 10) > 0 ? "daily" : "unset"),
      budgetAmount: centsToRand(a.lifetime_budget),
      dailyBudget: centsToRand(a.daily_budget),
      startTime: a.start_time ? ymd(a.start_time) : "",
      endTime: a.end_time ? ymd(a.end_time) : "",
      status: String(a.effective_status || ""),
      spendWindow: parseFloat((spendById[String(a.id)] || 0).toFixed(2))
    });
  });
  CACHE[key] = { ts: Date.now(), data: byCampaign };
  return byCampaign;
}

// Public: resolve ad-set pacing for the given Meta (accountId,
// rawCampaignId) pairs over [from,to]. Returns
// { "<accountId>::<rawCampaignId>": [adsets...] }. Never throws.
export async function fetchAdsetPacing(targets, fromYmd, toYmd) {
  var out = {};
  try {
    var token = process.env.META_ACCESS_TOKEN || "";
    if (!token || !Array.isArray(targets) || targets.length === 0) return out;
    var accounts = {};
    targets.forEach(function (t) { if (t && t.accountId) accounts[actId(t.accountId)] = true; });
    var accList = Object.keys(accounts).filter(Boolean).slice(0, 12);
    var maps = {};
    await Promise.all(accList.map(async function (acc) {
      maps[acc] = await fetchAccount(acc, fromYmd, toYmd, token);
    }));
    targets.forEach(function (t) {
      var acc = actId(t.accountId);
      var cid = String(t.rawCampaignId || "");
      var list = (maps[acc] && maps[acc][cid]) || null;
      if (list && list.length) out[t.accountId + "::" + cid] = list;
    });
  } catch (_) {}
  return out;
}

// Pace a single ad set within the selected window. Pure, no I/O.
export function paceAdset(a, periodFrom, periodTo, todayStr) {
  function di(s) { return parseInt(String(s).replace(/-/g, ""), 10) || 0; }
  function days(a1, b1) { return Math.round((Date.parse(b1 + "T00:00:00Z") - Date.parse(a1 + "T00:00:00Z")) / 86400000) + 1; }
  var asStart = a.startTime && di(a.startTime) > di(periodFrom) ? a.startTime : periodFrom;
  var capEnd = periodTo < todayStr ? periodTo : todayStr;
  var asEnd = a.endTime && di(a.endTime) < di(capEnd) ? a.endTime : capEnd;
  var elapsed = di(asEnd) >= di(asStart) ? Math.max(0, days(asStart, asEnd)) : 0;
  var flightDays = (a.startTime && a.endTime && di(a.endTime) >= di(a.startTime)) ? days(a.startTime, a.endTime) : 0;
  var dailyTarget = 0;
  if (a.budgetMode === "lifetime" && a.budgetAmount > 0 && flightDays > 0) dailyTarget = a.budgetAmount / flightDays;
  else if (a.budgetMode === "daily" && a.dailyBudget > 0) dailyTarget = a.dailyBudget;
  var expected = dailyTarget * elapsed;
  if (a.budgetMode === "lifetime" && a.budgetAmount > 0) expected = Math.min(expected, a.budgetAmount);
  var actual = a.spendWindow || 0;
  var ratio = expected > 0 ? actual / expected : null;
  var state = elapsed === 0 ? "pending"
    : ratio == null ? "unknown"
    : ratio < 0.8 ? "behind" : ratio > 1.25 ? "ahead" : "on_track";
  return {
    name: a.name,
    budgetMode: a.budgetMode,
    budgetLabel: a.budgetMode === "lifetime"
      ? ("R" + Math.round(a.budgetAmount) + " lifetime" + (flightDays > 0 ? " / " + flightDays + "d" : ""))
      : (a.dailyBudget > 0 ? ("R" + Math.round(a.dailyBudget) + "/day") : "no budget"),
    window: asStart + " to " + asEnd,
    expectedToDate: Math.round(expected),
    actualToDate: Math.round(actual),
    ratioPct: ratio == null ? null : parseFloat((ratio * 100).toFixed(2)),
    state: state
  };
}
