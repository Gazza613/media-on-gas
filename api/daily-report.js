import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { labelFor } from "./_clientLabels.js";

// Daily Pulse — campaign performance snapshot for EXCO. Fires every morning
// at 08:15 SAST (06:15 UTC) via Vercel cron. Compares yesterday's per-campaign
// metrics against the campaign's own rolling 7-day baseline to derive a
// colour-coded disposition (ACTION / WARNING / WATCH / HEALTHY / BASELINING).
//
// Campaigns are grouped by the first underscore-segment of the campaign name
// — the "Client" token in the {Client}_{Obj}_{Funding}_{YYYYMM}_{Variant}
// naming convention — so MTN MoMo, MTN MoMo POS, Willowbrook etc. each get
// their own block in the email.
//
// Recipient (v1): gary@gasmarketing.co.za only. Other EXCO members will be
// added once the report is calibrated.

var TO_EMAIL = "gary@gasmarketing.co.za";
var ORIGIN = "https://media-on-gas.vercel.app";

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
async function redisSetIfAbsent(key, ttlSeconds) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, String(Date.now()), "NX", "EX", String(ttlSeconds)])
    });
    if (!r.ok) return null;
    var d = await r.json();
    return d && d.result === "OK";
  } catch (_) { return null; }
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function fmtR(v) {
  var n = parseFloat(v) || 0;
  if (Math.abs(n) >= 1000) return "R" + Math.round(n).toLocaleString("en-ZA");
  return "R" + n.toFixed(2);
}
function fmtNum(v) {
  var n = parseInt(v) || 0;
  return n.toLocaleString("en-ZA");
}
function fmtDate(d) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// Map campaign objective → result metric, value, and cost-per-result label.
// The "result" metric is what the cost-per-result (CPR) deviation is computed
// against. Falls back to clicks/CPC for any objective we don't recognise.
function resultMetricFor(c) {
  var obj = String(c.objective || "").toLowerCase();
  var name = String(c.campaignName || "").toLowerCase();
  if (obj.indexOf("appinstall") >= 0 || obj.indexOf("app_install") >= 0 || obj.indexOf("app_promotion") >= 0 || name.indexOf("appinstal") >= 0) {
    // App Install campaigns are judged on CLICKS TO THE APP STORE, not
    // on the downstream install. Meta + TikTok rarely report installs
    // back through ads insights (the SDK / app-events integration owns
    // that signal), so install counts run near zero on most days even
    // when the campaign is delivering well. Every click on the App
    // Install CTA is a click to the store, which is the in-platform
    // success metric. Matches the Creative tab and Summary's
    // CLICKS TO APP STORE label.
    return { kind: "Clicks to App Store", value: parseInt(c.clicks || 0), costLabel: "CPC" };
  }
  if (obj === "lead_generation" || obj === "outcome_leads" || obj.indexOf("lead") >= 0) {
    return { kind: "Leads", value: parseInt(c.leads || 0), costLabel: "CPL" };
  }
  if (obj.indexOf("page_likes") >= 0 || obj.indexOf("post_engagement") >= 0 || obj.indexOf("outcome_engagement") >= 0 || obj.indexOf("follower") >= 0 || name.indexOf("like") >= 0 || name.indexOf("follow") >= 0) {
    // Sum across both platforms' field names — Meta uses pageLikes /
    // pageFollows, TikTok uses follows / likes. The undefined fields
    // coerce to 0 so a Meta campaign and a TikTok campaign both produce
    // the right total without branching on platform.
    var f = parseInt(c.follows || 0) + parseInt(c.likes || 0) + parseInt(c.pageLikes || 0) + parseInt(c.pageFollows || 0);
    return { kind: "Follows + Likes", value: f, costLabel: "CPF" };
  }
  return { kind: "Clicks", value: parseInt(c.clicks || 0), costLabel: "CPC" };
}

// Worst-colour-wins lattice. Sample-size is handled separately as an
// override that can DOWNGRADE a flag (red→yellow on thin samples) but
// never escalate past its own ceiling.
var COLOR_RANK = { green: 0, yellow: 1, orange: 2, red: 3 };
function worse(a, b) { return COLOR_RANK[a] >= COLOR_RANK[b] ? a : b; }

// Disposition decision. Reads yesterday's row + the 7-day aggregate row,
// returns a colour, a status tag, FLAGS (problems driving the disposition,
// rendered red), WINS (improvements vs baseline, rendered green), and
// CONTEXT (informational notes like thin-sample / baselining).
//
// Hard rules that override any deviation logic:
//   1. Zero results on R100+ spend, on a result objective → ACTION (no
//      thin-sample mercy: spending money for nothing is failure regardless
//      of sample size or campaign age).
//   2. Sub-7-day-old campaigns flag BASELINING but still get a red ACTION
//      if rule 1 fires — a Day-1 campaign burning R1k/day with zero
//      installs needs to be flagged immediately, not 6 days from now.
function dispositionFor(yesterday, baseline, baselineDays, ageDays) {
  var spendY = parseFloat(yesterday.spend || 0);
  var rmY = resultMetricFor(yesterday);
  var rmB = baseline ? resultMetricFor(baseline) : null;
  var sample7d = rmB ? rmB.value : 0;

  // Result-driving objectives where zero results on material spend is
  // a critical failure regardless of anything else. App Install uses
  // CLICKS TO APP STORE as its in-platform success metric (Meta and
  // TikTok rarely report downstream installs through ads insights), so
  // it's included alongside Leads and Follows + Likes.
  var ZERO_RESULT_FLOOR = 100; // R100 — anything spending more than this without a single result is on fire
  var isResultObjective = rmY.kind === "Clicks to App Store" || rmY.kind === "Leads" || rmY.kind === "Follows + Likes";
  if (isResultObjective && rmY.value === 0 && spendY >= ZERO_RESULT_FLOOR) {
    return {
      color: "red",
      tag: "ACTION",
      flags: ["Zero " + rmY.kind.toLowerCase() + " on " + fmtR(spendY) + " spend yesterday"],
      wins: [],
      context: sample7d > 0 ? ["7d total: " + sample7d + " " + rmY.kind.toLowerCase()] : []
    };
  }

  // BASELINING — campaign younger than 7 days. Suppress deviation flags
  // (baselines aren't reliable yet) but the zero-result hard-rule above
  // still applies.
  if (ageDays !== null && ageDays < 7) {
    return {
      color: "yellow",
      tag: "BASELINING",
      flags: [],
      wins: [],
      context: ["Day " + (ageDays + 1) + " of 7, establishing baseline"]
    };
  }

  // No baseline at all — campaign launched but had zero spend in the 7d
  // window. Treat as baselining.
  if (!baseline || baselineDays === 0) {
    return { color: "yellow", tag: "BASELINING", flags: [], wins: [], context: ["No 7-day history yet"] };
  }

  var color = "green";
  var flags = [];
  var wins = [];
  var context = [];

  // 1. Cost-per-result deviation vs own 7d average daily CPR
  var cprY = rmY.value > 0 ? spendY / rmY.value : null;
  var cprB = rmB && rmB.value > 0 ? parseFloat(baseline.spend) / rmB.value : null;
  if (cprY !== null && cprB !== null && cprB > 0) {
    var d = (cprY - cprB) / cprB * 100;
    if (d >= 50) { color = worse(color, "red"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs 7d"); }
    else if (d >= 25) { color = worse(color, "orange"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs 7d"); }
    else if (d >= 10) { color = worse(color, "yellow"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs 7d"); }
    else if (d <= -10) { wins.push(rmY.costLabel + " " + fmtR(cprY) + " down " + Math.abs(d).toFixed(0) + "% vs 7d"); }
  }

  // 2. Frequency (Meta only — TikTok/Google don't report comparable freq)
  var freq = parseFloat(yesterday.frequency || 0);
  var platform = String(yesterday.platform || "").toLowerCase();
  if (freq > 0 && (platform.indexOf("facebook") >= 0 || platform.indexOf("instagram") >= 0)) {
    if (freq > 4) { color = worse(color, "red"); flags.push("Frequency " + freq.toFixed(2) + "x, saturation"); }
    else if (freq >= 3.5) { color = worse(color, "orange"); flags.push("Frequency " + freq.toFixed(2) + "x, approaching ceiling"); }
    else if (freq >= 3) { color = worse(color, "yellow"); flags.push("Frequency " + freq.toFixed(2) + "x, elevated"); }
  }

  // 3. CTR deviation vs own 7d
  var ctrY = parseFloat(yesterday.ctr || 0);
  var ctrB = parseFloat(baseline.ctr || 0);
  if (ctrY > 0 && ctrB > 0) {
    var cd = (ctrY - ctrB) / ctrB * 100;
    if (cd <= -40) { color = worse(color, "red"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs 7d"); }
    else if (cd <= -20) { color = worse(color, "orange"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs 7d"); }
    else if (cd <= -10) { color = worse(color, "yellow"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs 7d"); }
    else if (cd >= 10) { wins.push("CTR " + ctrY.toFixed(2) + "% up " + cd.toFixed(0) + "% vs 7d"); }
  }

  // 4. CPC deviation vs own 7d. Even on result objectives where CPR
  // already drives the colour, a CPC blowout signals auction pressure or
  // creative fatigue and is worth surfacing on its own.
  var clicksY = parseInt(yesterday.clicks || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var clicksB = baseline ? parseInt(baseline.clicks || 0) : 0;
  var cpcB = baseline && clicksB > 0 ? parseFloat(baseline.spend || 0) / clicksB : null;
  if (cpcY !== null && cpcB !== null && cpcB > 0) {
    var pd = (cpcY - cpcB) / cpcB * 100;
    if (pd >= 50) { color = worse(color, "red"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs 7d"); }
    else if (pd >= 25) { color = worse(color, "orange"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs 7d"); }
    else if (pd >= 10) { color = worse(color, "yellow"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs 7d"); }
    else if (pd <= -10) { wins.push("CPC " + fmtR(cpcY) + " down " + Math.abs(pd).toFixed(0) + "% vs 7d"); }
  }

  // Thin-sample handling. Note in CONTEXT (not as a flag) so it's clearly
  // informational. Cap escalation at WATCH for thin samples — small
  // baselines are noisy and a single bad day shouldn't trigger ACTION
  // when 7-day history is too sparse to read confidently.
  var thin = sample7d < 50;
  if (thin) {
    if (color === "red" || color === "orange") color = "yellow";
    context.push("Thin baseline: " + sample7d + " " + rmY.kind.toLowerCase() + " in 7d");
  }

  var tag = color === "red" ? "ACTION" : color === "orange" ? "WARNING" : color === "yellow" ? "WATCH" : "HEALTHY";
  return { color: color, tag: tag, flags: flags, wins: wins, context: context };
}

function clientKeyOf(name) {
  var first = String(name || "").split("_")[0] || "";
  return first || "Unsorted";
}

function ageDaysFor(c) {
  // /api/campaigns exposes start/end dates as `startDate` / `endDate`
  // (YYYY-MM-DD strings). Older code read `startTime` which doesn't exist
  // on the response — every campaign appeared as "no age info" and the
  // BASELINING branch never fired. Use startDate first, fall back to
  // startTime for any future shape change.
  var raw = c.startDate || c.startTime || "";
  if (!raw) return null;
  var s = Date.parse(raw);
  if (!s) return null;
  var d = (Date.now() - s) / (24 * 60 * 60 * 1000);
  return d < 0 ? 0 : Math.floor(d);
}

// Per-campaign analyst commentary. Synthesises spend, CTR, CPC, and the
// objective-aligned result count into a single one-to-two-sentence read of
// what the day actually says — the way a senior media analyst would brief
// it verbally. Branches are ordered so the highest-signal observation wins:
// conversion-funnel breakdowns, fatigue signatures, auction-pressure
// signatures, scale unlocks, then steady-state.
function analystNote(yesterday, baseline, rmY, ageDays) {
  var spendY = parseFloat(yesterday.spend || 0);
  var clicksY = parseInt(yesterday.clicks || 0);
  var ctrY = parseFloat(yesterday.ctr || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var resY = rmY.value;
  var isResultObj = rmY.kind === "Leads" || rmY.kind === "Clicks to App Store" || rmY.kind === "Follows + Likes";
  var cprY = resY > 0 ? spendY / resY : null;

  var ctrB = baseline ? parseFloat(baseline.ctr || 0) : 0;
  var clicksB = baseline ? parseInt(baseline.clicks || 0) : 0;
  var spendB = baseline ? parseFloat(baseline.spend || 0) : 0;
  var cpcB = clicksB > 0 ? spendB / clicksB : null;
  var ctrDelta = (ctrY > 0 && ctrB > 0) ? ((ctrY - ctrB) / ctrB * 100) : null;
  var cpcDelta = (cpcY !== null && cpcB !== null && cpcB > 0) ? ((cpcY - cpcB) / cpcB * 100) : null;

  // Pre-7d-campaigns are noisy. Refuse to over-interpret.
  if (ageDays !== null && ageDays < 7) {
    return "Day " + (ageDays + 1) + " of delivery, insufficient history for a defensible read. CTR " + ctrY.toFixed(2) + "% and CPC " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " are the early-tell signals to watch as the auction settles.";
  }

  // Engagement → conversion breakdown. Clicks are present, results aren't.
  // The ad funnel is doing its job; the bottleneck is post-click.
  if (isResultObj && resY === 0 && clicksY >= 30) {
    var postClick = rmY.kind === "Leads" ? "lead form (fields, friction, validation)"
      : rmY.kind === "Clicks to App Store" ? "app store listing (ratings, screenshots, description)"
      : "follow flow (profile content quality, first-impression load)";
    return fmtNum(clicksY) + " clicks landed but zero " + rmY.kind.toLowerCase() + " converted. The creative and targeting are earning attention; the breakdown is post-click. Audit " + postClick + " — that is where today's spend is leaking.";
  }

  // Strong creative + expensive auction → buy cheaper inventory, keep the assets.
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta >= 5 && cpcDelta >= 20) {
    return "CTR holding at " + ctrY.toFixed(2) + "% (up " + ctrDelta.toFixed(0) + "% vs 7d) but CPC up " + cpcDelta.toFixed(0) + "% to " + fmtR(cpcY) + ". Creative is still winning attention, the auction is just more crowded. Layer in lookalike expansion or push toward Advantage+ placements to cheapen inventory without touching what is working.";
  }

  // Classic fatigue signature — CTR softening + CPC inflating.
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta <= -10 && cpcDelta >= 10) {
    return "Fatigue signature: CTR down " + Math.abs(ctrDelta).toFixed(0) + "% to " + ctrY.toFixed(2) + "% while CPC climbed " + cpcDelta.toFixed(0) + "% to " + fmtR(cpcY) + ". Audience has seen the asset enough times to scroll past it. Rotate creative within 48 hours before CPC compounds further.";
  }

  // Scale unlock — both directions favourable.
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta >= 10 && cpcDelta <= -10) {
    return "Both efficiency vectors moving the right way: CTR up " + ctrDelta.toFixed(0) + "% to " + ctrY.toFixed(2) + "%, CPC down " + Math.abs(cpcDelta).toFixed(0) + "% to " + fmtR(cpcY) + ". This is the scale signal, lift daily budget 15-20% and let the algorithm extend the win.";
  }

  // CTR softening on a click-pacing objective without proportional CPC move.
  if (ctrDelta !== null && ctrDelta <= -20) {
    return "CTR fell " + Math.abs(ctrDelta).toFixed(0) + "% vs own 7d to " + ctrY.toFixed(2) + "%. Spend is converting fewer impressions into clicks, which compresses the top of the funnel for everything downstream. First lever is creative refresh, second is audience widening.";
  }

  // CPC drift without CTR drop — auction got harder.
  if (cpcDelta !== null && cpcDelta >= 25 && (ctrDelta === null || ctrDelta > -10)) {
    return "CPC at " + fmtR(cpcY) + " is " + cpcDelta.toFixed(0) + "% above own 7d while CTR held at " + ctrY.toFixed(2) + "%. The creative is still landing, the auction is just more expensive. Reaction depends on remaining budget runway, hold for 48h to confirm sustained drift before rebidding.";
  }

  // Healthy result-objective campaign with material delivery.
  if (isResultObj && resY > 0 && cprY !== null) {
    var resWord = rmY.kind.replace(/s$/, "").toLowerCase();
    return fmtNum(resY) + " " + rmY.kind.toLowerCase() + " at " + fmtR(cprY) + " per " + resWord + ", driven by " + fmtNum(clicksY) + " clicks at " + ctrY.toFixed(2) + "% CTR and " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC. Funnel is converting at " + (clicksY > 0 ? (resY / clicksY * 100).toFixed(2) : "0.00") + "% click-to-" + resWord + ", hold position and audit weekly.";
  }

  // Click-based objective, steady delivery.
  if (clicksY > 0 && ctrY > 0) {
    return ctrY.toFixed(2) + "% CTR on " + fmtNum(clicksY) + " clicks at " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC. Signals sit within band of own 7-day average — no creative or bid change indicated today.";
  }

  return "Limited delivery yesterday, sample too thin to derive a confident read. Re-evaluate when the next 24-48 hours of impressions land.";
}

// Anomaly detector. Runs a battery of yesterday-vs-7d-average checks
// covering the exact watch-list a senior media team would triage at
// 08:00 every morning: rapid spend movement, click/CTR collapse,
// conversion disappearance, CPL inflation, lead-volume drops on
// lead-gen-objective campaigns (Willowbrook, MTN MoMo POS), plus the
// supporting signals an analyst would catch as leading indicators
// (frequency cliff, CPM spike, impressions cliff).
//
// Returns an array of anomaly objects; each carries a `type` key
// (used to group identical anomalies across campaigns in the email),
// a severity tier (critical → high → medium), the colour token, and
// the one-line message body shown on the campaign's line.
var ANOMALY_DEFS = {
  conversions_disappeared: { word: "Conversions Disappeared", color: "red",    severity: 3, caption: "Campaigns producing zero results today on R100+ spend, when the 7-day baseline had material delivery. Conversion path may be broken." },
  spend_spike:             { word: "Spend Spike",             color: "orange", severity: 2, caption: "Daily spend is 2.5x or more of the 7-day daily average. Verify daily budget caps and bid strategies haven't shifted." },
  spend_collapse:          { word: "Spend Collapse",          color: "orange", severity: 2, caption: "Daily spend is under 30% of the 7-day daily average on a campaign that normally spends. Possible pause, budget cap hit, payment issue, or ad disapproval." },
  lead_volume_drop:        { word: "Lead Volume Drop",        color: "orange", severity: 2, caption: "Daily lead volume is 50%+ below the 7-day daily average on a lead-gen objective. Pipeline impact — investigate immediately." },
  cpr_spike:               { word: "Cost-Per-Result Spike",   color: "orange", severity: 2, caption: "Cost per Lead, Install, or Follow is 50%+ above the 7-day average. Each result is materially more expensive than yesterday's economics suggest it should be." },
  ctr_collapse:            { word: "CTR Collapse",            color: "orange", severity: 2, caption: "Click-through rate is 40%+ below the 7-day average. Engagement layer is breaking — audience is scrolling past the creative." },
  click_collapse:          { word: "Click Volume Collapse",   color: "orange", severity: 2, caption: "Click count is 50%+ below the 7-day daily average while spend held. Auction is paying for impressions that aren't converting to clicks — auction shift or creative fatigue." },
  frequency_cliff:         { word: "Frequency Cliff",         color: "yellow", severity: 1, caption: "Frequency jumped to 3.5x or higher and is 50%+ above the 7-day average. Audience pool exhausting — saturation onset." },
  cpm_spike:               { word: "CPM Spike",               color: "yellow", severity: 1, caption: "Cost per 1,000 impressions is 40%+ above the 7-day average. Either auction crowded today or relevance/quality score dropped." },
  impressions_cliff:       { word: "Impressions Cliff",       color: "yellow", severity: 1, caption: "Impressions delivery is 40%+ below the 7-day average while spend held. Delivery throttled — check bid cap, audience size, frequency cap, or ad rejection." }
};

function detectAnomalies(yesterday, baseline, rmY) {
  if (!baseline) return [];
  var out = [];

  var spendY = parseFloat(yesterday.spend || 0);
  var spendB = parseFloat(baseline.spend || 0);
  var spendDaily = spendB / 7;

  var clicksY = parseInt(yesterday.clicks || 0);
  var clicksB = parseInt(baseline.clicks || 0);
  var clicksDaily = clicksB / 7;

  var impsY = parseInt(yesterday.impressions || 0);
  var impsB = parseInt(baseline.impressions || 0);
  var impsDaily = impsB / 7;

  var ctrY = parseFloat(yesterday.ctr || 0);
  var ctrB = parseFloat(baseline.ctr || 0);

  var cpmY = impsY > 0 ? (spendY / impsY) * 1000 : null;
  var cpmB = impsB > 0 ? (spendB / impsB) * 1000 : null;

  var freqY = parseFloat(yesterday.frequency || 0);
  var freqB = parseFloat(baseline.frequency || 0);

  var resY = rmY.value;
  var rmB = resultMetricFor(baseline);
  var resB = rmB.value;
  var resDaily = resB / 7;
  var cprY = resY > 0 ? spendY / resY : null;
  var cprB = resB > 0 ? spendB / resB : null;
  var isResultObj = rmY.kind === "Leads" || rmY.kind === "Clicks to App Store" || rmY.kind === "Follows + Likes";

  // 1. CONVERSIONS DISAPPEARED — campaign with 7d daily avg >=3 conversions
  //    today produces 0 on R100+ spend. The single most important alert.
  if (isResultObj && resDaily >= 3 && resY === 0 && spendY >= 100) {
    out.push({
      type: "conversions_disappeared",
      message: "Zero " + rmY.kind.toLowerCase() + " on " + fmtR(spendY) + " spend (7d avg " + resDaily.toFixed(1) + "/day). Audit form, landing page, app-store listing, or tracking pixel."
    });
  }

  // 2. SPEND SPIKE — runaway daily spend (>=2.5x daily avg)
  if (spendDaily >= 50 && spendY > spendDaily * 2.5) {
    var spendLift = ((spendY - spendDaily) / spendDaily * 100);
    out.push({
      type: "spend_spike",
      message: fmtR(spendY) + " today vs " + fmtR(spendDaily) + " 7d daily average (up " + spendLift.toFixed(0) + "%). Confirm budget cap was intentional."
    });
  }

  // 3. SPEND COLLAPSE — campaign that normally spends went near-silent
  if (spendDaily >= 100 && spendY < spendDaily * 0.3) {
    var spendDrop = ((spendDaily - spendY) / spendDaily * 100);
    out.push({
      type: "spend_collapse",
      message: fmtR(spendY) + " today vs " + fmtR(spendDaily) + " 7d daily average (down " + spendDrop.toFixed(0) + "%). Check for unintended pause, budget cap exhaustion, billing issue, or ad disapproval."
    });
  }

  // 4. LEAD VOLUME DROP — Leads objective specifically (Willowbrook, MTN POS)
  if (rmY.kind === "Leads" && resDaily >= 5 && resY > 0 && resY < resDaily * 0.5) {
    var leadDrop = ((resDaily - resY) / resDaily * 100);
    out.push({
      type: "lead_volume_drop",
      message: resY + " leads today vs " + resDaily.toFixed(1) + "/day 7d average (down " + leadDrop.toFixed(0) + "%). Lead-gen pipeline impact — review form completion, lead quality, audience fatigue."
    });
  }

  // 5. CPL / CPI / CPF SPIKE — cost per result up 50%+ on material sample
  if (isResultObj && resY > 0 && resB >= 5 && cprY !== null && cprB !== null && cprB > 0 && cprY > cprB * 1.5) {
    var cprLift = ((cprY - cprB) / cprB * 100);
    out.push({
      type: "cpr_spike",
      message: rmY.costLabel + " " + fmtR(cprY) + " today vs " + fmtR(cprB) + " 7d average (up " + cprLift.toFixed(0) + "%). Each " + rmY.kind.replace(/s$/, "").toLowerCase() + " is materially more expensive."
    });
  }

  // 6. CTR COLLAPSE — engagement layer failing fast
  if (ctrB >= 0.3 && ctrY > 0 && ctrY < ctrB * 0.6) {
    var ctrDrop = ((ctrB - ctrY) / ctrB * 100);
    out.push({
      type: "ctr_collapse",
      message: "CTR " + ctrY.toFixed(2) + "% today vs " + ctrB.toFixed(2) + "% 7d average (down " + ctrDrop.toFixed(0) + "%). Audience is scrolling past — creative refresh needed in next 24-48h."
    });
  }

  // 7. CLICK VOLUME COLLAPSE — clicks crashed while spend held
  if (clicksDaily >= 20 && clicksY < clicksDaily * 0.5 && spendY >= spendDaily * 0.7) {
    var clickDrop = ((clicksDaily - clicksY) / clicksDaily * 100);
    out.push({
      type: "click_collapse",
      message: fmtNum(clicksY) + " clicks today vs " + fmtNum(Math.round(clicksDaily)) + "/day 7d average (down " + clickDrop.toFixed(0) + "%) while spend held at " + fmtR(spendY) + ". CPC is climbing fast."
    });
  }

  // 8. FREQUENCY CLIFF — saturation onset
  if (freqY >= 3.5 && freqB > 0 && freqY > freqB * 1.5) {
    var freqLift = ((freqY - freqB) / freqB * 100);
    out.push({
      type: "frequency_cliff",
      message: "Frequency " + freqY.toFixed(2) + "x today vs " + freqB.toFixed(2) + "x 7d average (up " + freqLift.toFixed(0) + "%). Audience pool exhausting — expand targeting or rotate creative before CTR crumbles."
    });
  }

  // 9. CPM SPIKE — auction crowded or quality dropped
  if (cpmY !== null && cpmB !== null && cpmB > 5 && cpmY > cpmB * 1.4) {
    var cpmLift = ((cpmY - cpmB) / cpmB * 100);
    out.push({
      type: "cpm_spike",
      message: "CPM " + fmtR(cpmY) + " today vs " + fmtR(cpmB) + " 7d average (up " + cpmLift.toFixed(0) + "%). Compare against placement mix and audience overlap with other active campaigns."
    });
  }

  // 10. IMPRESSIONS CLIFF — delivery throttled while spend roughly held
  if (impsDaily >= 1000 && impsY < impsDaily * 0.6 && spendY >= spendDaily * 0.7) {
    var impDrop = ((impsDaily - impsY) / impsDaily * 100);
    out.push({
      type: "impressions_cliff",
      message: fmtNum(impsY) + " impressions today vs " + fmtNum(Math.round(impsDaily)) + "/day 7d average (down " + impDrop.toFixed(0) + "%) while spend held. Check bid cap, audience size, frequency cap, or ad approval status."
    });
  }

  return out;
}

// Aggregate yesterday + baseline into a per-campaign disposition row.
// Match on rawCampaignId where possible; fall back to campaignName for
// platforms (TikTok/Google) where the dashboard suffixes id with platform.
function buildCampaignRows(yesterdayCampaigns, baselineCampaigns, adsByCampaign) {
  var baseByKey = {};
  baselineCampaigns.forEach(function(c) {
    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    if (k) baseByKey[k] = c;
  });

  var baselineDays = 7;
  var rows = [];
  yesterdayCampaigns.forEach(function(c) {
    var spend = parseFloat(c.spend || 0);
    if (spend <= 0) return; // silent campaigns aren't actionable today

    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    var b = baseByKey[k] || null;
    var age = ageDaysFor(c);
    var disp = dispositionFor(c, b, b ? baselineDays : 0, age);
    var rm = resultMetricFor(c);
    var note = analystNote(c, b, rm, age);
    var anomalies = detectAnomalies(c, b, rm);

    // Pick representative ad for this campaign — the top-spending ad
    // yesterday. Falls back to nothing if the ad fetch failed or this
    // campaign has no resolvable creative.
    var topAd = (adsByCampaign && adsByCampaign[String(c.rawCampaignId || "")]) || null;

    var clicksY = parseInt(c.clicks || 0);
    var cpcY = clicksY > 0 ? spend / clicksY : null;

    rows.push({
      campaignName: c.campaignName,
      platform: c.platform,
      objective: c.objective,
      spend: spend,
      results: rm.value,
      resultsKind: rm.kind,
      cprLabel: rm.costLabel,
      cpr: rm.value > 0 ? spend / rm.value : null,
      frequency: parseFloat(c.frequency || 0),
      ctr: parseFloat(c.ctr || 0),
      cpc: cpcY,
      clicks: clicksY,
      disposition: disp,
      analystNote: note,
      anomalies: anomalies,
      thumbnail: topAd ? topAd.thumbnail : "",
      previewUrl: topAd ? topAd.previewUrl : ""
    });
  });
  return rows;
}

function groupByClient(rows) {
  var buckets = {};
  rows.forEach(function(r) {
    var key = clientKeyOf(r.campaignName);
    if (!buckets[key]) {
      var lf = labelFor(key);
      buckets[key] = { key: key, label: lf.label, known: lf.known, rows: [] };
    }
    buckets[key].rows.push(r);
  });

  // Sort campaigns within each bucket by disposition severity then by spend
  Object.keys(buckets).forEach(function(k) {
    buckets[k].rows.sort(function(a, b) {
      var sa = COLOR_RANK[a.disposition.color] || 0;
      var sb = COLOR_RANK[b.disposition.color] || 0;
      if (sb !== sa) return sb - sa;
      return b.spend - a.spend;
    });
  });

  // Sort buckets by worst disposition then by spend
  return Object.keys(buckets).map(function(k) { return buckets[k]; }).sort(function(a, b) {
    var sa = a.rows[0] ? COLOR_RANK[a.rows[0].disposition.color] : -1;
    var sb = b.rows[0] ? COLOR_RANK[b.rows[0].disposition.color] : -1;
    if (sb !== sa) return sb - sa;
    var spendA = a.rows.reduce(function(x, r) { return x + r.spend; }, 0);
    var spendB = b.rows.reduce(function(x, r) { return x + r.spend; }, 0);
    return spendB - spendA;
  });
}

// Dashboard palette tokens, mirrored from App.jsx P.* so the email reads
// as a continuation of the dashboard surface — same gradient header, same
// glass cards, same disposition colours.
var P = {
  bg: "#06020e",
  panel: "#0d0618",
  panel2: "#1a0b2e",
  txt: "#FFFBF8",
  label: "rgba(255,251,248,0.70)",
  caption: "rgba(255,251,248,0.58)",
  rule: "rgba(168,85,247,0.18)",
  ember: "#F96203",
  solar: "#FF6B00",
  lava: "#FF3D00",
  mint: "#34D399",
  cyan: "#22D3EE",
  rose: "#FB7185",
  amber: "#FBBF24",
  orchid: "#A855F7",
  fb: "#1877F2",
  ig: "#E1306C",
  tt: "#14B8A6",
  gd: "#22C55E"
};

var DISP_COLORS = {
  red:    { fill: "#FF3D00", soft: "rgba(255,61,0,0.10)",   border: "rgba(255,61,0,0.35)",  dot: "&#9679;", word: "ACTION" },
  orange: { fill: "#F96203", soft: "rgba(249,98,3,0.10)",   border: "rgba(249,98,3,0.35)",  dot: "&#9679;", word: "WARNING" },
  yellow: { fill: "#FBBF24", soft: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.30)", dot: "&#9679;", word: "WATCH" },
  green:  { fill: "#34D399", soft: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", dot: "&#9679;", word: "HEALTHY" }
};

function dispChip(disp) {
  var c = DISP_COLORS[disp.color] || DISP_COLORS.green;
  var word = disp.tag || c.word;
  return '<span style="display:inline-block;background:' + c.soft + ';border:1px solid ' + c.border + ';color:' + c.fill + ';font-size:9px;font-weight:900;padding:3px 9px;border-radius:6px;letter-spacing:1.5px;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(word) + '</span>';
}

function buildHtml(opts) {
  var dateLabel = opts.dateLabel;
  var clients = opts.clients; // grouped buckets
  var totals = opts.totals;
  var unlabelled = opts.unlabelled || [];
  var logoUrl = ORIGIN + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";

  // Disposition counts across the agency
  var totalAction = 0, totalWarning = 0, totalWatch = 0, totalHealthy = 0;
  clients.forEach(function(b) {
    b.rows.forEach(function(r) {
      if (r.disposition.color === "red") totalAction++;
      else if (r.disposition.color === "orange") totalWarning++;
      else if (r.disposition.color === "yellow") totalWatch++;
      else totalHealthy++;
    });
  });

  function clientBlock(b) {
    var spend = b.rows.reduce(function(a, r) { return a + r.spend; }, 0);
    var results = b.rows.reduce(function(a, r) { return a + r.results; }, 0);

    // Per-client disposition tally
    var t = { red:0, orange:0, yellow:0, green:0 };
    b.rows.forEach(function(r) { t[r.disposition.color]++; });

    var pillsHtml = ["red","orange","yellow","green"].filter(function(k){return t[k]>0;}).map(function(k) {
      var c = DISP_COLORS[k];
      return '<span style="display:inline-block;background:' + c.soft + ';border:1px solid ' + c.border + ';color:' + c.fill + ';font-size:10px;font-weight:800;padding:3px 9px;border-radius:6px;margin-right:6px;font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">' + t[k] + ' ' + c.word + '</span>';
    }).join("");

    var rowsHtml = b.rows.map(function(r) {
      var c = DISP_COLORS[r.disposition.color] || DISP_COLORS.green;
      var flags = (r.disposition.flags || []);
      var wins = (r.disposition.wins || []);
      var context = (r.disposition.context || []);

      // Thumbnail tile — 64x64 rounded square. Wraps in an <a> to the ad's
      // public-platform permalink when one is available so EXCO can click
      // through to the live creative on Facebook / Instagram. Falls back
      // to a gradient placeholder cell when the ad has no creative URL
      // resolved (e.g. brand-new ad, Meta CDN miss).
      var thumbHtml = "";
      if (r.thumbnail) {
        var imgTag = '<img src="' + escapeHtml(r.thumbnail) + '" alt="ad creative" width="64" height="64" style="width:64px;height:64px;display:block;border-radius:10px;object-fit:cover;border:1px solid ' + P.rule + ';"/>';
        thumbHtml = r.previewUrl ? '<a href="' + escapeHtml(r.previewUrl) + '" target="_blank" rel="noopener" style="display:block;text-decoration:none;">' + imgTag + '</a>' : imgTag;
      } else {
        thumbHtml = '<div style="width:64px;height:64px;display:block;border-radius:10px;background:linear-gradient(135deg,' + P.ember + '40,' + P.lava + '40);border:1px solid ' + P.rule + ';"></div>';
      }
      var viewLink = r.previewUrl
        ? '<a href="' + escapeHtml(r.previewUrl) + '" target="_blank" rel="noopener" style="font-size:9px;color:' + P.cyan + ';text-decoration:none;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">View live &rarr;</a>'
        : '';

      // Reason lines — flags rendered red (the cause of the disposition),
      // wins rendered green (improvements vs baseline), context rendered
      // muted (informational notes like thin baseline). Each on its own
      // line so the eye reads "what's wrong" before "what's good", which
      // matches how a media buyer triages a flagged campaign.
      var flagsHtml = flags.length === 0 ? "" :
        '<div style="font-size:11px;color:' + DISP_COLORS.red.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;">' +
        flags.map(function(f) { return '<span style="margin-right:6px;">&#9888;</span>' + escapeHtml(f); }).join('<br/>') +
        '</div>';
      var winsHtml = wins.length === 0 ? "" :
        '<div style="font-size:11px;color:' + DISP_COLORS.green.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;">' +
        wins.map(function(w) { return '<span style="margin-right:6px;">&#10003;</span>' + escapeHtml(w); }).join('<br/>') +
        '</div>';
      var contextHtml = context.length === 0 ? "" :
        '<div style="font-size:10px;color:' + P.caption + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-style:italic;">' +
        context.map(escapeHtml).join(' &middot; ') +
        '</div>';
      var noSignalHtml = (flags.length === 0 && wins.length === 0 && context.length === 0)
        ? '<div style="font-size:11px;color:' + DISP_COLORS.green.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;"><span style="margin-right:6px;">&#10003;</span>All signals within band</div>'
        : "";

      // Analyst note — the senior-media-buyer read of yesterday in one or
      // two sentences. Sits between the campaign name and the flag/win
      // lines, styled as a soft callout so it reads as commentary rather
      // than data.
      var analystHtml = r.analystNote ?
        '<div style="margin-top:8px;padding:9px 11px;background:rgba(255,255,255,0.04);border-left:3px solid ' + P.amber + ';border-radius:0 8px 8px 0;font-size:11px;color:' + P.label + ';line-height:1.6;font-family:Manrope,Helvetica,Arial,sans-serif;font-style:italic;">' +
        escapeHtml(r.analystNote) +
        '</div>' : '';

      // Metric strip — Spend / CTR / CPC / Result (count + CPR underneath).
      // Four right-aligned columns keep the email readable on a phone while
      // surfacing the four numbers the user wants to triage every morning.
      var ctrTxt = r.ctr > 0 ? r.ctr.toFixed(2) + "%" : '<span style="color:' + P.caption + ';">-</span>';
      var cpcTxt = r.cpc !== null ? escapeHtml(fmtR(r.cpc)) : '<span style="color:' + P.caption + ';">-</span>';
      var cprStack = r.cpr !== null
        ? '<div style="font-size:9px;color:' + P.mint + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:4px;font-weight:800;">' + escapeHtml(fmtR(r.cpr)) + ' ' + escapeHtml(r.cprLabel) + '</div>'
        : '';

      return '<tr>' +
        // Thumbnail column
        '<td style="padding:12px 0 12px 14px;border-bottom:1px solid ' + P.rule + ';border-left:3px solid ' + c.fill + ';background:' + c.soft + ';width:78px;vertical-align:top;">' +
          thumbHtml +
        '</td>' +
        // Description column — chip, platform, name, analyst note, flags/wins/context, view link
        '<td style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';background:' + c.soft + ';vertical-align:top;">' +
          '<div style="margin-bottom:4px;line-height:1.6;">' +
            dispChip(r.disposition) +
            '<span style="display:inline-block;margin-left:10px;padding:2px 0;font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">' + escapeHtml(r.platform || "") + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.35;word-break:break-word;">' + escapeHtml(r.campaignName) + '</div>' +
          analystHtml +
          flagsHtml + winsHtml + contextHtml + noSignalHtml +
          (viewLink ? '<div style="margin-top:8px;">' + viewLink + '</div>' : '') +
        '</td>' +
        // Spend
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.ember + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtR(r.spend)) + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">spend</div>' +
        '</td>' +
        // CTR
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + ctrTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CTR</div>' +
        '</td>' +
        // CPC
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.amber + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + cpcTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CPC</div>' +
        '</td>' +
        // Objective result (count + CPR underneath)
        '<td style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.cyan + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtNum(r.results)) + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">' + escapeHtml(r.resultsKind) + '</div>' +
          cprStack +
        '</td>' +
      '</tr>';
    }).join("");

    return '<tr><td style="padding:24px 36px 0;">' +
      '<div style="display:block;margin-bottom:14px;">' +
        '<div style="font-size:18px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">' + escapeHtml(b.label) + '</div>' +
        '<div style="margin-top:6px;font-size:11px;color:' + P.label + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
          '<strong style="color:' + P.txt + ';">' + escapeHtml(fmtR(spend)) + '</strong> spend &middot; ' +
          '<strong style="color:' + P.cyan + ';">' + escapeHtml(fmtNum(results)) + '</strong> results &middot; ' +
          b.rows.length + ' active campaign' + (b.rows.length === 1 ? "" : "s") +
        '</div>' +
        '<div style="margin-top:8px;">' + pillsHtml + '</div>' +
      '</div>' +
      '<div style="border:1px solid ' + P.rule + ';border-radius:12px;overflow:hidden;background:rgba(0,0,0,0.20);">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' +
          rowsHtml +
        '</table>' +
      '</div>' +
    '</td></tr>';
  }

  var clientBlocks = clients.map(clientBlock).join("");

  // Anomalies section — aggregated across every flagged campaign, grouped
  // by anomaly type so the media team can scan a single "what's on fire
  // today" list before drilling into per-client blocks. Each group surfaces
  // the count, a short description of the rule, and the affected campaigns
  // with their one-line message. Section skips entirely when zero anomalies
  // fired (a clean morning).
  var anomaliesByType = {};
  clients.forEach(function(b) {
    b.rows.forEach(function(r) {
      (r.anomalies || []).forEach(function(an) {
        if (!anomaliesByType[an.type]) anomaliesByType[an.type] = [];
        anomaliesByType[an.type].push({
          campaignName: r.campaignName,
          platform: r.platform,
          message: an.message
        });
      });
    });
  });
  var totalAnomalies = Object.keys(anomaliesByType).reduce(function(a, k) { return a + anomaliesByType[k].length; }, 0);
  var anomaliesBlock = "";
  if (totalAnomalies > 0) {
    // Order groups by definition severity (3 → 1) then by count desc.
    var groupKeys = Object.keys(anomaliesByType).sort(function(a, b) {
      var sa = (ANOMALY_DEFS[a] && ANOMALY_DEFS[a].severity) || 0;
      var sb = (ANOMALY_DEFS[b] && ANOMALY_DEFS[b].severity) || 0;
      if (sb !== sa) return sb - sa;
      return anomaliesByType[b].length - anomaliesByType[a].length;
    });
    var groupsHtml = groupKeys.map(function(k) {
      var def = ANOMALY_DEFS[k] || { word: k, color: "yellow", caption: "" };
      var col = DISP_COLORS[def.color] || DISP_COLORS.yellow;
      var items = anomaliesByType[k];
      var itemsHtml = items.map(function(it) {
        return '<div style="padding:10px 14px;border-top:1px solid ' + P.rule + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
          '<div style="font-size:11px;font-weight:800;color:' + P.txt + ';line-height:1.4;word-break:break-word;">' + escapeHtml(it.campaignName) +
            ' <span style="font-size:9px;color:' + P.caption + ';font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-left:6px;">' + escapeHtml(it.platform || "") + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:' + P.label + ';margin-top:4px;line-height:1.55;">' + escapeHtml(it.message) + '</div>' +
        '</div>';
      }).join("");
      return '<div style="margin-top:12px;border:1px solid ' + col.border + ';border-left:4px solid ' + col.fill + ';border-radius:10px;overflow:hidden;background:' + col.soft + ';">' +
        '<div style="padding:12px 14px;display:block;">' +
          '<div style="display:block;line-height:1.4;">' +
            '<span style="display:inline-block;font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:' + col.fill + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(def.word) + '</span>' +
            '<span style="display:inline-block;margin-left:8px;padding:2px 8px;background:' + col.fill + ';color:#0a0418;font-size:10px;font-weight:900;border-radius:5px;font-family:Manrope,Helvetica,Arial,sans-serif;">' + items.length + '</span>' +
          '</div>' +
          '<div style="font-size:10px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:6px;line-height:1.5;">' + escapeHtml(def.caption) + '</div>' +
        '</div>' +
        itemsHtml +
      '</div>';
    }).join("");
    anomaliesBlock = '<tr><td style="padding:24px 36px 0;">' +
      '<div style="display:block;margin-bottom:4px;">' +
        '<div style="display:inline-block;background:' + DISP_COLORS.red.soft + ';border:1px solid ' + DISP_COLORS.red.border + ';color:' + DISP_COLORS.red.fill + ';font-size:9px;font-weight:900;padding:4px 10px;border-radius:6px;letter-spacing:2px;font-family:Manrope,Helvetica,Arial,sans-serif;">ANOMALIES TO WATCH</div>' +
        '<span style="display:inline-block;margin-left:10px;font-size:10px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">' + totalAnomalies + ' signal' + (totalAnomalies === 1 ? "" : "s") + ' flagged for immediate review</span>' +
      '</div>' +
      '<div style="font-size:11px;color:' + P.label + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:8px;line-height:1.6;">Yesterday-vs-7d-average departures large enough to warrant a media-team eyeball before the day starts. Each anomaly is per campaign, against that campaign\'s own baseline.</div>' +
      groupsHtml +
    '</td></tr>';
  }

  // Agency totals strip — 4 KPI tiles
  var totalsStrip =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
      '<td width="25%" style="padding:0 4px 0 0;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Spend yesterday</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.ember + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtR(totals.spend)) + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Campaigns</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totals.activeCampaigns + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Action required</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (totalAction > 0 ? P.lava : P.mint) + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totalAction + '</div></div></td>' +
      '<td width="25%" style="padding:0 0 0 4px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Healthy</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.mint + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totalHealthy + '</div></div></td>' +
    '</tr></table>';

  // Methodology footnote — explains the colour rules so Gary can interrogate
  // any chip without having to ask the team. Compressed but exhaustive.
  var methodology =
    '<div style="font-size:10px;color:' + P.caption + ';line-height:1.7;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<div style="font-size:10px;color:' + P.label + ';font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">How dispositions are derived</div>' +
      '<div style="margin-bottom:4px;">Every campaign is read on four signals: <strong>spend</strong>, <strong>CTR</strong>, <strong>CPC</strong>, and the <strong>objective-aligned result</strong> (Leads, Clicks to App Store, Follows + Likes, or Clicks for traffic-style campaigns). Each is compared to the same campaign&#39;s own rolling 7-day baseline, never to a global benchmark.</div>' +
      '<div style="margin-bottom:4px;margin-top:8px;"><span style="color:' + DISP_COLORS.red.fill + ';font-weight:900;">ACTION</span> &middot; zero results on R100+ spend (Leads, Clicks to App Store, Follows + Likes), or CPR up 50%+ vs 7d, or CPC up 50%+ vs 7d, or frequency &gt;4.0x, or CTR down 40%+</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.orange.fill + ';font-weight:900;">WARNING</span> &middot; CPR up 25-50%, or CPC up 25-50%, or frequency 3.5-4.0x, or CTR down 20-40%</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.yellow.fill + ';font-weight:900;">WATCH</span> &middot; smaller deviations (10-25% CPR/CPC drift, frequency 3.0-3.5x, CTR down 10-20%), thin baseline (&lt;50 events in 7d), or campaign younger than 7 days (BASELINING)</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.green.fill + ';font-weight:900;">HEALTHY</span> &middot; all signals within &plusmn;10% of own 7-day baseline, frequency under 3.0x</div>' +
      '<div style="margin-top:10px;color:' + P.caption + ';">The italic note under each campaign is the analyst read — a senior media buyer&#39;s one-line interpretation of how spend, CTR, CPC, and result delivery interact today. <span style="color:' + DISP_COLORS.red.fill + ';">&#9888;</span> red lines surface the specific metric driving the disposition. <span style="color:' + DISP_COLORS.green.fill + ';">&#10003;</span> green lines are wins vs the 7-day baseline.</div>' +
      '<div style="margin-top:6px;color:' + P.caption + ';">Each campaign is judged against its own rolling 7-day average, so MTN MoMo and Willowbrook are evaluated on their own terms, not each other&#39;s.</div>' +
    '</div>';

  // CSS keyframes for the logo glow. Apple Mail honours these; Gmail web
  // partially honours them; Outlook strips them but still renders the
  // strong static box-shadow set inline on the <img>, so the logo always
  // shows with a visible glow regardless of client.
  var glowStyles =
    '<style>' +
    '@keyframes gasGlow {' +
      '0%, 100% { box-shadow: 0 0 18px rgba(249,98,3,0.35), 0 0 38px rgba(255,61,0,0.22); }' +
      '50% { box-shadow: 0 0 28px rgba(249,98,3,0.55), 0 0 60px rgba(255,61,0,0.35); }' +
    '}' +
    '.gas-logo-glow { animation: gasGlow 2.6s ease-in-out infinite; }' +
    '</style>';

  var logoBlock =
    '<div style="text-align:center;margin-bottom:18px;">' +
      '<img class="gas-logo-glow" src="' + logoUrl + '" alt="GAS Marketing" width="84" height="84" border="0" style="width:84px;height:84px;display:inline-block;border-radius:50%;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;box-shadow:0 0 24px rgba(249,98,3,0.45),0 0 50px rgba(255,61,0,0.28);"/>' +
    '</div>';

  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Pulse</title>' +
    glowStyles +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + P.bg + ';font-family:Manrope,\'Helvetica Neue\',Helvetica,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + P.bg + ';padding:36px 14px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;background:linear-gradient(170deg,' + P.panel + ' 0%,' + P.panel2 + ' 100%);border-radius:22px;overflow:hidden;border:1px solid ' + P.rule + ';">' +

      // Header — logo with animated glow + title + date
      '<tr><td style="padding:32px 36px 24px;text-align:center;">' +
      logoBlock +
      '<div style="font-size:11px;color:' + P.ember + ';letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">GAS Daily Pulse</div>' +
      '<div style="font-size:26px;font-weight:900;letter-spacing:4px;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
        '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:11px;color:' + P.caption + ';letter-spacing:3px;margin-top:8px;text-transform:uppercase;font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(dateLabel) + '</div>' +
      '</td></tr>' +

      // Gradient divider
      '<tr><td style="padding:0 36px;"><div style="height:1px;background:linear-gradient(90deg,transparent,' + P.ember + ',transparent);"></div></td></tr>' +

      // Totals strip
      '<tr><td style="padding:24px 36px 6px;">' + totalsStrip + '</td></tr>' +

      // Anomalies — sits above per-client blocks so the media team sees
      // "what's on fire today" before drilling into individual campaigns.
      // Empty string when no anomalies fired (clean morning).
      anomaliesBlock +

      // Per-client blocks
      clientBlocks +

      // Methodology
      '<tr><td style="padding:32px 36px 8px;">' +
      '<div style="background:rgba(0,0,0,0.22);border:1px solid ' + P.rule + ';border-left:4px solid ' + P.amber + ';border-radius:0 12px 12px 0;padding:18px 22px;">' +
        methodology +
      '</div></td></tr>' +

      // CTA
      '<tr><td style="padding:24px 36px 8px;" align="center">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="background:linear-gradient(135deg,' + P.lava + ',' + P.solar + ');border-radius:12px;">' +
      '<a href="' + ORIGIN + '" style="display:inline-block;padding:14px 38px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">Open Dashboard</a>' +
      '</td></tr></table></td></tr>' +

      // Signoff — the report is published by SAMI, the AI agent in the
      // Media department. Surfacing the signature anchors the email to a
      // named author rather than a faceless cron.
      '<tr><td style="padding:28px 36px 4px;">' +
      '<div style="font-size:13px;color:' + P.txt + ';font-weight:800;font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">SAMI</div>' +
      '<div style="font-size:11px;color:' + P.ember + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1.5px;text-transform:uppercase;">AI Expert Agent</div>' +
      '<div style="font-size:10px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;">Media Department</div>' +
      '</td></tr>' +

      // Footer
      '<tr><td style="padding:24px 36px 8px;"><div style="height:1px;background:' + P.rule + ';"></div></td></tr>' +
      '<tr><td style="padding:18px 36px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
      '<tr><td valign="middle" style="width:54px;padding-right:14px;">' +
      '<img src="' + logoUrl + '" alt="GAS Marketing" width="46" height="46" border="0" style="width:46px;height:46px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>' +
      '</td><td valign="middle">' +
      '<div style="font-size:12px;color:' + P.txt + ';font-weight:800;letter-spacing:3px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:10px;color:' + P.caption + ';letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;font-family:Manrope,Helvetica,Arial,sans-serif;">Daily Pulse, 08:00 SAST</div>' +
      '<div style="font-size:11px;color:' + P.caption + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<a href="mailto:grow@gasmarketing.co.za" style="color:' + P.caption + ';text-decoration:none;">grow@gasmarketing.co.za</a></div>' +
      '</td></tr></table></td></tr>' +

    '</table></td></tr></table></body></html>';
}

// Internal /api/campaigns fetch using the dashboard API key. Bypasses cache
// (?fresh=1) so the report always reflects the most current upstream truth
// rather than whatever a dashboard user happened to load earlier in the day.
async function fetchCampaigns(from, to, apiKey) {
  var u = ORIGIN + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&fresh=1";
  var r = await fetch(u, { headers: { "x-api-key": apiKey || "" } });
  if (!r.ok) throw new Error("campaigns fetch failed " + r.status);
  return await r.json();
}

// Pull yesterday's per-ad insights so the email can show a thumbnail + a
// "View live" link straight to the public Facebook / Instagram permalink.
// The thumbnails are CDN URLs (Meta-hosted, signed but auth-free) so any
// email client can render them inline.
async function fetchAdsByCampaign(from, to, apiKey) {
  try {
    var u = ORIGIN + "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    var r = await fetch(u, { headers: { "x-api-key": apiKey || "" } });
    if (!r.ok) return {};
    var data = await r.json();
    var ads = (data && data.ads) || [];
    // Pick the top-spending ad per Meta campaignId. /api/ads exposes the
    // raw Meta campaign id (no _facebook suffix), which matches the
    // rawCampaignId field on /api/campaigns rows.
    var byCamp = {};
    ads.forEach(function(a) {
      var cid = String(a.campaignId || "");
      if (!cid) return;
      var sp = parseFloat(a.spend || 0);
      var cur = byCamp[cid];
      if (!cur || sp > cur.spend) {
        byCamp[cid] = { spend: sp, thumbnail: a.thumbnail || "", previewUrl: a.previewUrl || "" };
      }
    });
    return byCamp;
  } catch (_) {
    // Thumbnails are nice-to-have. Never break the email over them.
    return {};
  }
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = !!(cronSecret && timingSafeStrEqual(authHeader, "Bearer " + cronSecret));

  if (!isCron) {
    // Rate limit is generous because the only callers here are admin
    // operators driving dry-run previews + manual re-sends. Real auth
    // gating below (DASHBOARD_API_KEY exact match) is what blocks abuse;
    // the limiter is just defense-in-depth.
    if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  var dryRun = req.query.dryRun === "1" || req.query.dry === "1";

  // SAST = UTC+2. Compute "yesterday" in SAST by shifting now by +2h then
  // taking date - 1. This keeps the report aligned to the team's calendar
  // even though the cron itself fires at 06:15 UTC.
  var sastNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  var yesterday = new Date(sastNow.getTime() - 24 * 60 * 60 * 1000);
  var baselineEnd = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
  var baselineStart = new Date(baselineEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

  var yFrom = ymd(yesterday), yTo = ymd(yesterday);
  var bFrom = ymd(baselineStart), bTo = ymd(baselineEnd);
  var dateLabel = fmtDate(yesterday);

  var dashKey = process.env.DASHBOARD_API_KEY || "";
  if (!dashKey) {
    res.status(500).json({ error: "DASHBOARD_API_KEY not configured" });
    return;
  }

  var yesterdayData, baselineData, adsByCampaign;
  try {
    var triple = await Promise.all([
      fetchCampaigns(yFrom, yTo, dashKey),
      fetchCampaigns(bFrom, bTo, dashKey),
      fetchAdsByCampaign(yFrom, yTo, dashKey)
    ]);
    yesterdayData = triple[0];
    baselineData = triple[1];
    adsByCampaign = triple[2] || {};
  } catch (err) {
    console.error("daily-report fetch failed", err);
    res.status(500).json({ error: "Upstream campaign fetch failed", message: String(err && err.message || err) });
    return;
  }

  var rows = buildCampaignRows(yesterdayData.campaigns || [], baselineData.campaigns || [], adsByCampaign);
  var clients = groupByClient(rows);
  var totals = {
    spend: rows.reduce(function(a, r) { return a + r.spend; }, 0),
    activeCampaigns: rows.length
  };
  // Empty-day guard. If everything is paused, still send so silence isn't
  // ambiguous, but with a one-line "no spend yesterday" body.
  if (rows.length === 0) {
    var emptyHtml = buildHtml({
      dateLabel: dateLabel + " (no active spend yesterday)",
      clients: [],
      totals: totals
    });
    if (dryRun) { res.status(200).json({ ok: true, dryRun: true, dateLabel: dateLabel, rows: 0, html: emptyHtml }); return; }
    return await sendEmail(res, dateLabel, emptyHtml, isCron);
  }

  var html = buildHtml({ dateLabel: dateLabel, clients: clients, totals: totals });

  if (dryRun) {
    res.status(200).json({
      ok: true, dryRun: true, dateLabel: dateLabel,
      yFrom: yFrom, yTo: yTo, bFrom: bFrom, bTo: bTo,
      campaigns: rows.length,
      clients: clients.map(function(b) { return { key: b.key, label: b.label, count: b.rows.length }; }),
      html: html
    });
    return;
  }

  return await sendEmail(res, dateLabel, html, isCron);
}

async function sendEmail(res, dateLabel, html, isCron) {
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(200).json({ ok: false, reason: "GMAIL credentials not configured" });
    return;
  }

  // Cron-only idempotency. A double-fire from Vercel cron retries would
  // otherwise send Gary two identical reports. Manual triggers (?dryRun=1
  // or x-api-key admin) bypass the guard so an operator can re-send.
  if (isCron) {
    // SETNX key keyed by SAST date so a 06:15 UTC double-fire collapses.
    var sastNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
    var keyDate = ymd(new Date(sastNow.getTime() - 24 * 60 * 60 * 1000));
    var dedupKey = "daily-report:sent:" + keyDate;
    var firstFire = await redisSetIfAbsent(dedupKey, 36 * 60 * 60);
    if (firstFire === false) {
      res.status(200).json({ ok: true, deduped: true, key: dedupKey });
      return;
    }
  }

  var transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  });

  try {
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: TO_EMAIL,
      subject: "Daily Pulse | " + dateLabel,
      text: "GAS Daily Pulse for " + dateLabel + ". Open the dashboard: " + ORIGIN,
      html: html
    });
    res.status(200).json({ ok: true, sent: true, to: TO_EMAIL, dateLabel: dateLabel });
  } catch (err) {
    console.error("Daily report send failed", err);
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
}
