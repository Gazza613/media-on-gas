// Shared utilities for the GAS automated performance emails:
//   - Weekly Pulse  (api/weekly-pulse.js)  , Monday 08:00 SAST, prior 7d vs 7d before
//   - Daily Anomalies (api/daily-report.js), Daily 08:15 SAST, anomalies-only watchlist
//
// Both emails ship to the same 9-person GAS leadership + media team list,
// both source from /api/campaigns + /api/ads, both share the dashboard
// palette so they read as a continuation of the dashboard surface, and
// both surface clickable links into the platform-native ads manager so a
// reader can jump straight from the email into Meta / TikTok / Google.

// User-facing domain for every CTA / logo / proxy URL we embed in
// an outgoing email. The vercel.app fallback was confusing
// recipients clicking through to the dashboard, the custom domain
// matches the registered URL.
export var ORIGIN = "https://media.gasmarketing.co.za";

// Distribution list. Both pulse emails go to every named address as
// primary recipients (TO line, no CC distinction). brunettenkuna@gmail.com
// is an external personal address, kept here at the user's explicit
// request, so the pulse send path intentionally does not enforce a
// @gasmarketing.co.za domain restriction (unlike the SLA nudge, which
// is internal-team-only by design).
export var RECIPIENTS = [
  "gary@gasmarketing.co.za",
  "sam@gasmarketing.co.za",
  "busi@gasmarketing.co.za",
  "claire@gasmarketing.co.za",
  "donovan@gasmarketing.co.za",
  "georgia@gasmarketing.co.za",
  "brunettenkuna@gmail.com",
  "rourke@gasmarketing.co.za",
  "aphelele@gasmarketing.co.za"
];
export var RECIPIENT_LIST = RECIPIENTS.join(", ");

// ============================================================================
// Meta action_type detection — single source of truth so every aggregator
// (campaigns, campaigns-daily, ads, ad-assets, adsets, timeseries,
// placements, demographics, reconcile, daily-report) classifies the same
// raw Meta action_type the same way. Meta routinely ships new
// action_types for new lead form variants and attribution windows
// (e.g. `offsite_complete_registration_add_meta_leads` showed up in
// 2025-ish, `onsite_conversion.flow_complete` newer still). Hardcoded
// lists rot quietly — a brand-new MoMo POS-style lead campaign would
// silently read zero leads everywhere until someone notices and edits
// each file. These helpers use a hardcoded canonical list PLUS a
// catch-all heuristic (contains "lead" but not the words that
// indicate post engagement / video / impression) so future variants
// are picked up automatically.
//
// Use them by NAME — every aggregator should call `isLeadAction(t)`
// rather than maintaining its own list. When Meta ships a new ambiguous
// type that this heuristic mishandles, fix it here once and every
// surface picks it up.
export function isLeadAction(actionType) {
  var t = String(actionType || "").toLowerCase();
  if (!t) return false;
  // Exact canonical types Meta currently emits for lead conversions.
  var EXACT = {
    "lead": 1,
    "onsite_web_lead": 1,
    "leadgen.other": 1,
    "leadgen_grouped": 1,
    "offsite_conversion.fb_pixel_lead": 1,
    "onsite_conversion.lead_grouped": 1,
    "onsite_conversion.flow_complete": 1,
    "offsite_complete_registration_add_meta_leads": 1,
    "offsite_conversion.fb_pixel_complete_registration": 1,
    "complete_registration": 1
  };
  if (EXACT[t]) return true;
  // Catch-all: any action_type containing "lead" UNLESS the name
  // includes a non-lead family ("post" for post engagement, "video"
  // for thruplays, "install" for app installs). Mirrors the heuristic
  // already in api/ads.js.
  if (t.indexOf("lead") < 0) return false;
  if (t.indexOf("install") >= 0) return false;
  if (t.indexOf("video") >= 0) return false;
  if (t.indexOf("post") >= 0) return false;
  return true;
}
export function isAppInstallAction(actionType) {
  var t = String(actionType || "").toLowerCase();
  if (!t) return false;
  if (t === "app_install" || t === "mobile_app_install" || t === "omni_app_install") return true;
  if (t === "app_custom_event.fb_mobile_first_app_launch") return true;
  if (t === "app_custom_event.fb_mobile_activate_app") return true;
  if (t === "onsite_conversion.app_install") return true;
  if (t.indexOf("app_install") >= 0) return true;
  if (t.indexOf("mobile_app_install") >= 0) return true;
  return false;
}
export function isPageLikeAction(actionType) {
  var t = String(actionType || "").toLowerCase();
  return t === "page_like" || t === "onsite_conversion.page_like";
}
export function isLandingPageViewAction(actionType) {
  var t = String(actionType || "").toLowerCase();
  return t === "landing_page_view" || t === "omni_landing_page_view";
}
// Per-row extraction: Math.max across alias matches so a single
// conversion surfaced under multiple types is not double-counted.
// Returns the per-row totals. Callers that aggregate across rows
// should then += these per-row values (per-row max → cross-row sum).
export function extractMetaCounts(actions) {
  var leads = 0, installs = 0, pageLikes = 0, landingPageViews = 0, reactionLikes = 0, postReactions = 0;
  (actions || []).forEach(function(a) {
    var t = String(a && a.action_type || "").toLowerCase();
    var v = parseInt(a && a.value || 0, 10) || 0;
    if (isLeadAction(t)) leads = Math.max(leads, v);
    else if (isAppInstallAction(t)) installs = Math.max(installs, v);
    else if (isPageLikeAction(t)) pageLikes = Math.max(pageLikes, v);
    else if (isLandingPageViewAction(t)) landingPageViews = Math.max(landingPageViews, v);
    else if (t === "like") reactionLikes = Math.max(reactionLikes, v);
    else if (t === "post_reaction") postReactions = Math.max(postReactions, v);
  });
  return {
    leads: leads,
    installs: installs,
    pageLikes: pageLikes,
    landingPageViews: landingPageViews,
    reactionLikes: reactionLikes,
    postReactions: postReactions
  };
}

// ============================================================================
// HTML + formatting primitives
// ============================================================================
export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
export function pad2(n) { return n < 10 ? "0" + n : "" + n; }
export function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
export function fmtR(v) {
  var n = parseFloat(v) || 0;
  if (Math.abs(n) >= 1000) return "R" + Math.round(n).toLocaleString("en-ZA");
  return "R" + n.toFixed(2);
}
export function fmtNum(v) {
  var n = parseInt(v) || 0;
  return n.toLocaleString("en-ZA");
}
export function fmtDate(d) {
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function fmtShortDate(d) {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

// Parse campaign end date consistently across automation flows.
// Bare YYYY-MM-DD means the campaign is active through that full day.
export function parseCampaignEndMs(raw) {
  var s = String(raw || "").trim();
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(s + "T23:59:59.999Z") || 0;
  }
  return Date.parse(s) || 0;
}

// SAST = UTC+2. Shifts a date by +2 hours before formatting so the
// reported "today" / "yesterday" aligns with the team's calendar even
// though the cron itself fires in UTC.
export function sastNow() { return new Date(Date.now() + 2 * 60 * 60 * 1000); }

// ============================================================================
// Redis (idempotency for cron sends)
// ============================================================================
export function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
export async function redisSetIfAbsent(key, ttlSeconds) {
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

// Generic JSON cache get/set against Upstash. Fail-open on any error so
// the calling endpoint can fall back to recomputing. Used for response
// caches that benefit from sharing across function instances (e.g. the
// Command Centre cold-pull, which otherwise blows past the 60s timeout
// every time the per-instance cache is cold).
export async function redisGetJson(key) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", key])
    });
    if (!r.ok) return null;
    var d = await r.json();
    if (!d || typeof d.result !== "string") return null;
    try { return JSON.parse(d.result); } catch (_) { return null; }
  } catch (_) { return null; }
}
export async function redisSetJson(key, value, ttlSeconds) {
  var creds = getRedisCreds();
  if (!creds) return false;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["SET", key, JSON.stringify(value), "EX", String(ttlSeconds)])
    });
    if (!r.ok) return false;
    var d = await r.json();
    return d && d.result === "OK";
  } catch (_) { return false; }
}

// ============================================================================
// Palette (mirrors dashboard's P.* tokens so emails feel continuous)
// ============================================================================
export var P = {
  bg: "#070E16",
  panel: "#0F1820",
  panel2: "#13202C",
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

export var DISP_COLORS = {
  red:    { fill: "#FF3D00", soft: "rgba(255,61,0,0.10)",   border: "rgba(255,61,0,0.35)",  dot: "&#9679;", word: "ACTION" },
  orange: { fill: "#F96203", soft: "rgba(249,98,3,0.10)",   border: "rgba(249,98,3,0.35)",  dot: "&#9679;", word: "WARNING" },
  yellow: { fill: "#FBBF24", soft: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.30)", dot: "&#9679;", word: "WATCH" },
  green:  { fill: "#34D399", soft: "rgba(52,211,153,0.10)", border: "rgba(52,211,153,0.30)", dot: "&#9679;", word: "HEALTHY" }
};
export var COLOR_RANK = { green: 0, yellow: 1, orange: 2, red: 3 };
export function worse(a, b) { return COLOR_RANK[a] >= COLOR_RANK[b] ? a : b; }

// ============================================================================
// Objective + metric mapping
// ============================================================================
export function resultMetricFor(c) {
  var obj = String(c.objective || "").toLowerCase();
  var name = String(c.campaignName || "").toLowerCase();
  var platform = String(c.platform || "").toLowerCase();
  // Awareness / reach-led campaigns (Psycho Bunny store-opening, brand
  // awareness, anything tagged _Awareness_ / _Reach_ / brand) read on
  // Reach + CPM, not on click metrics. Detected via objective field or
  // name regex (matches isAwarenessObjective). The pulse cost label is
  // CPM, computed against impressions in buildCampaignRows below.
  if (isAwarenessObjective(c)) {
    return { kind: "Reach", value: parseInt(c.reach || 0), costLabel: "CPM", awareness: true };
  }
  var isLanding = obj === "landingpage" || obj === "landing_page" || obj === "outcome_traffic" || obj.indexOf("traffic") >= 0 || name.indexOf("landing") >= 0;
  if (obj.indexOf("appinstall") >= 0 || obj.indexOf("app_install") >= 0 || obj.indexOf("app_promotion") >= 0 || name.indexOf("appinstal") >= 0) {
    return { kind: "Clicks to App Store", value: parseInt(c.clicks || 0), costLabel: "CPC" };
  }
  if (obj === "lead_generation" || obj === "outcome_leads" || obj.indexOf("lead") >= 0) {
    return { kind: "Leads", value: parseInt(c.leads || 0), costLabel: "CPL" };
  }
  if (isLanding) {
    return { kind: "Clicks to Landing Page", value: parseInt(c.clicks || 0), costLabel: "CPC" };
  }
  if (obj.indexOf("page_likes") >= 0 || obj.indexOf("post_engagement") >= 0 || obj.indexOf("outcome_engagement") >= 0 || obj.indexOf("follower") >= 0 || name.indexOf("like") >= 0 || name.indexOf("follow") >= 0) {
    // Instagram follower campaigns: Meta does not attribute the
    // follow action to individual ads, so reading "Follows + Likes"
    // gives 0 and the email shows a thin-baseline warning every time.
    // Profile visits (clicks) is the dashboard's canonical IG-follow
    // proxy and what the team actually watches. See project_followers_truth.
    if (platform.indexOf("instagram") >= 0) {
      return { kind: "Profile Visits", value: parseInt(c.clicks || 0), costLabel: "Cost / Profile Visit" };
    }
    // Follower result = page likes + follows ONLY. c.pageLikes is
    // already the optimization_goal-gated page-follow result from
    // /api/campaigns (folds "like" only for PAGE_LIKES-optimised
    // campaigns). Do NOT add c.likes (post reactions / TikTok video
    // hearts) or c.pageFollows (page_engagement, any page interaction),
    // both massively over-counted the client weekly-email / Command
    // Centre follower number. See project_meta_like_action.
    var f = parseInt(c.pageLikes || 0) + parseInt(c.follows || 0);
    return { kind: "Follows + Likes", value: f, costLabel: "CPF" };
  }
  return { kind: "Clicks", value: parseInt(c.clicks || 0), costLabel: "CPC" };
}

// An awareness / reach campaign is optimised by Meta for cheapest
// unique reach, so it is DELIBERATELY served to people unlikely to
// click. Judging it on CTR against direct-response thresholds is
// apples-to-oranges and produces false "CTR collapse" alarms. This
// detects awareness from the objective field or the name tag. A
// client KPI profile with benchmarkBand === "awareness" also forces
// this (handled at the call site).
export function isAwarenessObjective(c) {
  var obj = String(c && c.objective || "").toLowerCase();
  var name = String(c && c.campaignName || "").toLowerCase();
  if (obj.indexOf("awareness") >= 0 || obj.indexOf("reach") >= 0 || obj.indexOf("brand") >= 0) return true;
  // Name-tag convention: "_AWR_", " Awareness ", "Reach" segment.
  if (/(^|[_\s|-])(awr|awareness|reach)([_\s|-]|$)/i.test(name)) return true;
  return false;
}

export function clientKeyOf(name) {
  var first = String(name || "").split("_")[0] || "";
  return first || "Unsorted";
}

export function ageDaysFor(c) {
  var raw = c.startDate || c.startTime || "";
  if (!raw) return null;
  var s = Date.parse(raw);
  if (!s) return null;
  var d = (Date.now() - s) / (24 * 60 * 60 * 1000);
  return d < 0 ? 0 : Math.floor(d);
}

// ============================================================================
// Ads-manager deep link per platform. Builds a URL that lands the reader
// directly on the campaign inside the native platform ads UI.
//
//   Meta  (Facebook + Instagram): business.facebook.com/adsmanager with
//         act={accountId minus "act_"} + selected_campaign_ids={cid}.
//   TikTok: ads.tiktok.com filtered by advertiser + campaign id (TikTok
//          doesn't expose a stable deep-link to a single campaign, so we
//          land the user on the campaigns list filtered to this id).
//   Google: ads.google.com filtered by customer id + campaign id (Google
//          requires the customer context, otherwise it bounces to the
//          account selector).
// ============================================================================
export function adsManagerUrl(c) {
  if (!c) return "";
  var platform = String(c.platform || c.metaPlatform || "").toLowerCase();
  var rawCid = String(c.rawCampaignId || c.campaignId || "");
  // The campaignId field is sometimes suffixed (_facebook / _instagram /
  // google_ prefix), strip these to recover the raw platform id.
  var cid = rawCid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
  var acct = String(c.accountId || "").replace(/^act_/, "");

  if (!cid) return "";

  if (platform.indexOf("facebook") >= 0 || platform.indexOf("instagram") >= 0 || platform.indexOf("meta") >= 0) {
    if (!acct) return "https://business.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=" + encodeURIComponent(cid);
    return "https://business.facebook.com/adsmanager/manage/campaigns?act=" + encodeURIComponent(acct) + "&selected_campaign_ids=" + encodeURIComponent(cid);
  }
  if (platform.indexOf("tiktok") >= 0) {
    if (!acct) return "https://ads.tiktok.com/i18n/perf/campaign";
    return "https://ads.tiktok.com/i18n/perf/campaign?aadvid=" + encodeURIComponent(acct) + "&keyword=" + encodeURIComponent(cid);
  }
  if (platform.indexOf("google") >= 0) {
    if (!acct) return "https://ads.google.com/aw/campaigns";
    return "https://ads.google.com/aw/campaigns?__c=" + encodeURIComponent(acct) + "&campaignId=" + encodeURIComponent(cid);
  }
  return "";
}

// ============================================================================
// Anomaly definitions + detector. Used by the Daily Anomalies email; both
// the section copy and the corrective procedure list ship with the email
// so the media team can execute the fix without having to look up the SOP.
//
// Severity tiers drive both the colour and the render order:
//   3 = critical (red), conversion path may be broken, immediate eyeball
//   2 = high (orange) , efficiency or volume crash, fix today
//   1 = medium (yellow), leading-indicator, schedule a closer look
// ============================================================================
export var ANOMALY_DEFS = {
  conversions_disappeared: {
    word: "Conversions Disappeared",
    color: "red",
    severity: 3,
    caption: "Campaign producing zero results yesterday on R100+ spend, when the 7-day baseline had material delivery. The funnel from impression to result is broken somewhere.",
    procedure: [
      "Open the campaign in the platform ads manager and confirm ad-set DELIVERY status (active, not paused or rejected).",
      "Click through the ad's primary CTA yourself, verify the landing page, lead form, or app-store listing loads and is on the right URL.",
      "Submit a test lead / install / sign-up to confirm the conversion flow completes end-to-end.",
      "Check the pixel / SDK / GA4 in Events Manager, is the conversion event still firing? If yes, issue is post-conversion attribution; if no, tracking is broken.",
      "If broken and not resolved within 4 hours, pause spend on the affected ad-set to stop bleeding budget into a dead funnel."
    ]
  },
  spend_spike: {
    word: "Spend Spike",
    color: "orange",
    severity: 2,
    caption: "Daily spend is 2.5x or more of the 7-day daily average. Often a real anomaly (budget cap raised, bid strategy changed), but can also be a lifetime-budget campaign in the final days where Meta accelerates to complete the budget, which is rational pacing, not a problem. Verify the cause before acting.",
    procedure: [
      "FIRST, check whether this is a lifetime-budget campaign (Willowbrook etc.) in its final days. Meta deliberately spends faster as the end date approaches to complete the remaining lifetime budget. If yes, this is normal pacing, no action needed.",
      "If daily-budget or far from the end date: open the campaign and confirm the daily budget cap matches the brief.",
      "Check whether the bid strategy was changed (e.g. Lowest Cost vs Bid Cap vs Cost Cap).",
      "Verify Advantage+ campaign budget settings haven't been toggled on if not intended.",
      "Cross-reference with the client's monthly budget runway, if today's spend pace projects an over-spend, lower the cap or pause until reset."
    ]
  },
  spend_collapse: {
    word: "Spend Collapse",
    color: "orange",
    severity: 2,
    caption: "Spend is under 30% of the 7-day daily average on a campaign that normally spends. Possible pause, budget cap exhaustion, billing issue, or ad disapproval.",
    procedure: [
      "Open the campaign, check status (active vs paused) and look for delivery limited warnings.",
      "Verify the account's payment method is current (Billing → Payment settings).",
      "Check Account Quality / Ads Manager for any disapprovals or restricted ad notifications.",
      "If lifetime budget, check whether the budget cap was hit; if daily, check whether dayparting was changed.",
      "Restore delivery same-day if the brief calls for continuous spend."
    ]
  },
  lead_volume_drop: {
    word: "Lead Volume Drop",
    color: "orange",
    severity: 2,
    caption: "Daily lead volume is 50%+ below the 7-day average on a lead-gen objective. Direct pipeline impact for the client.",
    procedure: [
      "Open the campaign and audit the lead form, has it been edited recently? Are there new required fields, validation rules, or pre-fill changes?",
      "Test-submit a lead yourself to confirm the form completes and CRM/sheet receives it.",
      "Check audience targeting, has any condition been changed (geo, age, interests)?",
      "Pull yesterday's leads in the CRM and check lead quality (real names, valid phone numbers), a quality drop may explain a volume drop if the client filtered for quality.",
      "Notify the account manager so the client isn't blindsided when they check their pipeline."
    ]
  },
  cpr_spike: {
    word: "Cost-Per-Result Spike",
    color: "orange",
    severity: 2,
    caption: "Cost per Lead, Install, or Follow is 50%+ above the 7-day average. Each conversion is materially more expensive than yesterday.",
    procedure: [
      "Open the campaign and check CTR direction, if CTR also dropped, this is creative fatigue (rotate assets); if CTR held, this is a conversion-rate problem (audit landing page).",
      "Check ad-set frequency, if >3.5x, audience is saturated and CPC inflation is dragging up CPR.",
      "Look at placements, is any single placement driving up the cost? Pause or split-test it out.",
      "Cross-reference against bidding strategy, if Lowest Cost, the auction is more expensive today; consider a Bid Cap to enforce ceiling."
    ]
  },
  ctr_collapse: {
    word: "CTR Collapse",
    color: "orange",
    severity: 2,
    caption: "Click-through rate is 40%+ below the 7-day average. The engagement layer is failing, audience is scrolling past the creative.",
    procedure: [
      "Open the campaign, confirm creative wasn't auto-rotated by Meta's Dynamic Creative or Advantage+.",
      "Pull frequency, if >3x, fatigue is the cause; rotate creative within 24-48 hours.",
      "Check placements, Reels and Stories CTRs differ wildly from Feed; one bad placement can drag the blended number.",
      "Audit creative quality, has anything dated (logo, offer, headline, CTA) since launch?",
      "If brief allows, queue 2-3 fresh creative variants to test against the current control."
    ]
  },
  click_collapse: {
    word: "Click Volume Collapse",
    color: "orange",
    severity: 2,
    caption: "Click count is 50%+ below the 7-day daily average while spend held. Auction is paying for impressions that aren't converting to clicks.",
    procedure: [
      "Open the campaign, confirm CPC trajectory. Climbing CPC + falling clicks = auction got harder.",
      "Audit creative for date relevance, broken links, or platform policy issues.",
      "Check audience overlap, are multiple campaigns competing for the same users?",
      "Consider broader targeting or a switch to Advantage+ audience if creative is intact."
    ]
  },
  frequency_cliff: {
    word: "Frequency Cliff",
    color: "yellow",
    severity: 1,
    caption: "Frequency jumped to 3.5x or higher and is 50%+ above the 7-day average. Audience pool is exhausting, saturation onset.",
    procedure: [
      "Open the campaign and check audience size estimate.",
      "Expand targeting (broader age, geo, interests) or switch to Advantage+ to widen the pool.",
      "Rotate in fresh creative so the same audience sees a new asset rather than the same one repeated.",
      "Consider duplicating to a lookalike audience to extend reach beyond the current pool."
    ]
  },
  cpm_spike: {
    word: "CPM Spike",
    color: "yellow",
    severity: 1,
    caption: "Cost per 1,000 impressions is 40%+ above the 7-day average. Either yesterday's auction was more crowded or relevance/quality score dropped.",
    procedure: [
      "Open the campaign and check Quality Ranking, Engagement Rate Ranking, and Conversion Rate Ranking, any Below Average rating drives CPM up.",
      "Cross-reference with industry calendar (e.g. month-end, Black Friday, election noise) for known auction-pressure events.",
      "Consider Bid Cap to enforce a CPM ceiling, or pause the highest-CPM placement.",
      "Compare against other active campaigns sharing the audience, overlap drives the auction price up."
    ]
  },
  impressions_cliff: {
    word: "Impressions Cliff",
    color: "yellow",
    severity: 1,
    caption: "Impression delivery is 40%+ below the 7-day average while spend held. Delivery is throttled somewhere.",
    procedure: [
      "Open the campaign, check Delivery column for limited learning or low learning flags.",
      "Verify bid cap isn't strangling delivery (raise by 10-15% to test).",
      "Check audience size, if shrunk below ~50K, expand targeting.",
      "Check ad approval status, a disapproved variant in a Dynamic Creative set can starve the whole set.",
      "Frequency cap, if a per-user cap was tightened, delivery will throttle."
    ]
  }
};

// ============================================================================
// Data-resolved corrective procedures
// ============================================================================
// The ANOMALY_DEFS.procedure arrays above are the static, platform-agnostic
// fallback. buildProcedure() generates a PER-CAMPAIGN procedure that is
// (a) platform-aware (Meta vs Google vs TikTok use different creative-
// rotation, placement and audience concepts, so a Google Display CTR
// collapse must never recommend Meta's "Advantage+ / Reels / Stories")
// and (b) data-resolved CONSERVATIVELY: we only assert a cause when the
// data is unambiguous (e.g. frequency clearly above or below the 3x
// fatigue line). When the data is missing or borderline, we fall back to
// the neutral "investigate X" phrasing so the email never states a cause
// it cannot evidence.
//
// House style: commas, never em-dashes.
function platformFamily(c) {
  var p = String(c && c.platform || "").toLowerCase();
  if (p.indexOf("google") >= 0 || p.indexOf("youtube") >= 0 || p.indexOf("display") >= 0 || p.indexOf("demand gen") >= 0 || p.indexOf("performance max") >= 0 || p.indexOf("pmax") >= 0) return "google";
  if (p.indexOf("tiktok") >= 0) return "tiktok";
  return "meta"; // facebook / instagram / meta / audience network / messenger
}
// Platform-specific phrasing for the three concepts that differ most
// across ad platforms: where you confirm auto-rotation of creative,
// what a placement-quality check looks like, and how you widen a
// saturated audience.
function creativeRotationStep(fam) {
  if (fam === "google") return "Open the campaign in Google Ads and review Responsive Display / Demand Gen asset performance, a weak auto-assembled asset combination can win the auction and drag the blended number down.";
  if (fam === "tiktok") return "Open the campaign in TikTok Ads Manager and check whether Smart Creative or Automatic Creative Optimization swapped in a weaker variant since launch.";
  return "Open the campaign and confirm the creative was not auto-rotated by Dynamic Creative or Advantage+ since launch.";
}
function placementStep(fam) {
  if (fam === "google") return "Review placement and topic exclusions, the Display network can drift onto low-quality auto-placements that barely engage, exclude the weak ones and recheck.";
  if (fam === "tiktok") return "Review placements, the Pangle audience network usually performs well below the in-feed For You placement, exclude it and re-measure.";
  return "Check placements, Feed, Reels and Stories perform very differently, one weak placement can drag the blended number, exclude or split-test it out.";
}
function widenAudienceStep(fam) {
  if (fam === "google") return "Widen the audience, add similar / in-market segments or loosen the targeting so the campaign is not re-serving the same shrinking pool.";
  if (fam === "tiktok") return "Widen the audience, broaden age and interest targeting or enable Automatic Targeting so the campaign reaches beyond the current pool.";
  return "Widen the audience, broaden age, geo or interests, or switch to an Advantage+ audience to extend reach beyond the saturated pool.";
}
// Returns a number formatted to 2dp, or null sentinel handling left to caller.
function fx2(n) { return (parseFloat(n) || 0).toFixed(2); }

// buildProcedure(type, yesterday, baseline, rmY) -> [step strings].
// Falls back to the static ANOMALY_DEFS[type].procedure if the type is
// unknown, so a new anomaly type never renders an empty procedure block.
export function buildProcedure(type, y, b, rmY) {
  var fam = platformFamily(y);
  var def = ANOMALY_DEFS[type] || null;
  var fallback = (def && def.procedure) ? def.procedure.slice() : [];

  var freqY = parseFloat((y && y.frequency) || 0);
  var ctrY = parseFloat((y && y.ctr) || 0);
  var ctrB = parseFloat((b && b.ctr) || 0);
  var clicksY = parseInt((y && y.clicks) || 0, 10);
  var spendY = parseFloat((y && y.spend) || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var clicksB = parseInt((b && b.clicks) || 0, 10);
  var spendB = parseFloat((b && b.spend) || 0);
  var cpcB = clicksB > 0 ? spendB / clicksB : null;
  var budgetMode = String((y && y.budgetMode) || "").toLowerCase();

  // Conservative frequency verdict. Only assert fatigue / not-fatigue when
  // we actually have a frequency reading; otherwise leave it neutral.
  // Skipped for Google: api/campaigns.js sets a hardcoded 2x frequency
  // estimate (Google Ads does not expose a per-campaign frequency on
  // most surfaces), so a "frequency is 2.00x" line is just the estimate
  // echoed back, not a real reading. Better silence than a fake number.
  var freqStep;
  if (fam === "google") {
    freqStep = null;
  } else if (freqY >= 3) {
    freqStep = "Frequency is " + fx2(freqY) + "x, above the 3x fatigue line, so audience saturation is the likely cause, rotate fresh creative within 24 to 48 hours.";
  } else if (freqY > 0) {
    freqStep = "Frequency is " + fx2(freqY) + "x, below the 3x fatigue line, so saturation is unlikely to be the cause, look at creative relevance and auction pressure instead.";
  } else {
    freqStep = "Pull the frequency, a reading above 3x points to audience fatigue and a creative rotation.";
  }

  // Conservative CTR-direction verdict for cost-per-result spikes:
  // CTR down with cost up = creative problem; CTR holding with cost up =
  // a downstream conversion-rate problem. Only assert when both CTRs are
  // material; otherwise stay neutral.
  var ctrDirectionStep;
  if (ctrB >= 0.3 && ctrY > 0) {
    if (ctrY < ctrB * 0.9) {
      ctrDirectionStep = "CTR also fell (" + fx2(ctrY) + "% yesterday vs " + fx2(ctrB) + "% 7d average), so this is creative side, rotate or refresh the assets rather than touching the landing page.";
    } else if (ctrY > ctrB * 1.1) {
      ctrDirectionStep = "CTR actually rose (" + fx2(ctrY) + "% vs " + fx2(ctrB) + "%), so the click layer is healthy and the cost rise is downstream, audit the landing page, form or checkout, not the creative.";
    } else {
      ctrDirectionStep = "CTR held roughly steady (" + fx2(ctrY) + "% vs " + fx2(ctrB) + "%), so the click layer is fine, the extra cost is downstream, audit the landing page, form or checkout conversion rate.";
    }
  } else {
    ctrDirectionStep = "Compare CTR direction, if CTR dropped this is creative fatigue, if CTR held the cost rise is a downstream conversion-rate problem.";
  }

  // CPC-direction step for click collapses.
  var cpcDirectionStep;
  if (cpcB !== null && cpcY !== null && cpcB > 0) {
    if (cpcY > cpcB * 1.1) {
      cpcDirectionStep = "CPC climbed to " + fmtR(cpcY) + " from " + fmtR(cpcB) + ", the auction got more expensive, the campaign is paying more per click while delivering fewer, check audience overlap and bid strategy.";
    } else {
      cpcDirectionStep = "CPC held near " + fmtR(cpcY) + " (was " + fmtR(cpcB) + "), so the auction price is stable, the click drop is a creative or relevance issue rather than auction pressure.";
    }
  } else {
    cpcDirectionStep = "Confirm the CPC trajectory, a climbing CPC with falling clicks means the auction got harder.";
  }

  // Local helper: drop any null/empty step (lets freqStep = null for
  // Google quietly disappear without each case having to know).
  var clean = function(arr) { return arr.filter(function(s) { return !!s; }); };

  switch (type) {
    case "ctr_collapse":
      return clean([
        creativeRotationStep(fam),
        freqStep,
        placementStep(fam),
        "Audit the creative for anything dated since launch (offer, headline, CTA, logo) that may have stopped resonating.",
        "If the brief allows, queue 2 to 3 fresh creative variants to test against the current control."
      ]);
    case "cpr_spike":
      return clean([
        ctrDirectionStep,
        freqStep,
        placementStep(fam),
        (fam === "meta"
          ? "Cross-reference the bid strategy, if it is Lowest Cost the auction is simply more expensive today, consider a Cost Cap or Bid Cap to enforce a ceiling."
          : "Cross-reference the bid strategy, if it is maximise-conversions / lowest-cost the auction is more expensive today, set a target CPA or bid cap to enforce a ceiling.")
      ]);
    case "frequency_cliff":
      return [
        "Frequency is " + fx2(freqY) + "x" + (freqY > 0 ? ", the audience pool is exhausting" : "") + ", open the campaign and check the audience size estimate.",
        widenAudienceStep(fam),
        "Rotate in fresh creative so the same people see a new asset rather than the same one repeated.",
        (fam === "meta"
          ? "Consider duplicating to a lookalike audience to extend reach beyond the current pool."
          : "Consider adding a fresh similar / lookalike segment to extend reach beyond the current pool.")
      ];
    case "click_collapse":
      return clean([
        cpcDirectionStep,
        "Audit the creative for date relevance, broken links or a platform policy issue that may have throttled delivery.",
        (fam === "meta"
          ? "Check audience overlap, multiple campaigns competing for the same users inflate cost and starve clicks."
          : "Check for audience or keyword overlap with your other live campaigns competing for the same users."),
        freqStep
      ]);
    case "cpm_spike":
      return clean([
        (fam === "meta"
          ? "Open the campaign and check Quality, Engagement Rate and Conversion Rate Rankings, any Below Average rating drives CPM up."
          : fam === "tiktok"
            ? "Open the campaign and review the creative's engagement signals, low early engagement raises delivery cost on TikTok."
            : "Open the campaign and review ad strength / asset ratings, weak assets raise the effective CPM in the auction."),
        "Cross-reference the calendar for known auction-pressure events (month-end, paydays, Black Friday, election noise) before assuming a campaign fault.",
        freqStep,
        (fam === "meta"
          ? "Consider a Cost Cap to enforce a CPM ceiling, or pause the single highest-CPM placement."
          : "Consider a bid cap to enforce a ceiling, or exclude the highest-cost placement.")
      ]);
    case "impressions_cliff":
      return [
        (fam === "google"
          ? "Open the campaign and check for Limited or Eligible (limited) status and any disapproved assets, one disapproved asset can throttle the whole ad group."
          : fam === "tiktok"
            ? "Open the campaign and check delivery status and the in-review / rejected flags, a rejected creative can throttle the whole ad group."
            : "Open the campaign and check the Delivery column for Limited or Learning Limited flags."),
        "Verify the bid cap is not strangling delivery, raise it 10 to 15% as a test if it looks tight.",
        widenAudienceStep(fam),
        (fam === "meta"
          ? "Check for a disapproved variant in a Dynamic Creative set, it can starve the whole set, and confirm no per-user frequency cap was tightened."
          : "Confirm no disapproved asset and no recently tightened delivery cap is throttling the campaign.")
      ];
    case "spend_spike":
      return [
        (budgetMode === "lifetime"
          ? "This is a lifetime-budget campaign, Meta accelerates spend near the end date to complete the remaining budget, confirm the end date is close, if so this is normal pacing and needs no action."
          : "This is a daily-budget campaign, open it and confirm the daily budget cap matches the brief, an accidental cap raise is the most common cause."),
        "Check whether the bid strategy changed (Lowest Cost vs Cost Cap vs Bid Cap), a strategy change can release pent-up spend.",
        (fam === "meta"
          ? "Verify Advantage+ campaign budget was not toggled on if that was not intended."
          : "Verify campaign-level budget settings and any automated rules did not raise the cap."),
        "Cross-reference the client's monthly runway, if today's pace projects an over-spend, lower the cap or pause until reset."
      ];
    case "spend_collapse":
      return [
        "Open the campaign and check status (active vs paused) and any delivery-limited warnings.",
        "Verify the account payment method is current, a declined card silently halts delivery.",
        (fam === "meta"
          ? "Check Account Quality for disapprovals or restricted-ad notifications."
          : fam === "google"
            ? "Check the account for policy disapprovals or a billing / payment hold."
            : "Check the account for rejected ads or a billing hold."),
        (budgetMode === "lifetime"
          ? "This is a lifetime-budget campaign, confirm the budget was not already exhausted for the flight."
          : "Confirm dayparting or a budget cap was not changed, then restore delivery same-day if the brief calls for continuous spend.")
      ];
    case "conversions_disappeared":
      return [
        "Open the campaign and confirm the ad-set delivery status is active, not paused or rejected.",
        "Click the ad's primary CTA yourself, confirm the landing page, lead form or app-store listing loads on the correct URL.",
        "Submit a test " + String((rmY && rmY.kind) || "conversion").toLowerCase() + " to confirm the flow completes end to end.",
        (fam === "meta"
          ? "Check the pixel / Conversions API in Events Manager, if the event still fires the issue is attribution, if not the tracking is broken."
          : fam === "google"
            ? "Check conversion tracking in Google Ads / GA4, if the event still fires the issue is attribution, if not the tag is broken."
            : "Check the TikTok pixel / Events API, if the event still fires the issue is attribution, if not the tracking is broken."),
        "If broken and not resolved within 4 hours, pause spend on the affected ad-set to stop funding a dead funnel."
      ];
    case "lead_volume_drop":
      return [
        "Open the campaign and audit the lead form, check for newly added required fields, validation rules or pre-fill changes.",
        "Test-submit a lead yourself to confirm the form completes and the CRM or sheet receives it.",
        "Check the audience targeting for any recent change to geo, age or interests that shrank the eligible pool.",
        "Pull yesterday's leads and check lead quality, a deliberate quality filter can explain a volume drop, then notify the account manager so the client is not blindsided."
      ];
    default:
      return fallback;
  }
}

export function detectAnomalies(yesterday, baseline, rmY, opts) {
  if (!baseline) return [];
  // Campaign already ended: zero / collapsed delivery is the campaign
  // finishing on schedule, not an anomaly. Without this an ended
  // campaign (e.g. Willowbrook) with a still-warm 7-day baseline gets
  // a false "spend collapse / zero results" flag in the daily email.
  // There is nothing actionable about a finished campaign, so skip it.
  var _endRaw = yesterday && yesterday.endDate ? String(yesterday.endDate) : "";
  if (_endRaw) {
    var _endMs = parseCampaignEndMs(_endRaw);
    if (isFinite(_endMs) && _endMs < Date.now()) return [];
  }
  var out = [];
  // Awareness/reach campaigns are not graded on CTR or click volume,
  // Meta optimises them for cheap reach so low/declining CTR is
  // expected and not an anomaly. Forced on when the client's KPI
  // profile sets benchmarkBand "awareness" (passed via opts), else
  // auto-detected from the objective / name tag.
  var awareness = (opts && opts.awareness) || isAwarenessObjective(yesterday);

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

  if (isResultObj && resDaily >= 3 && resY === 0 && spendY >= 100) {
    out.push({
      type: "conversions_disappeared",
      message: "Zero " + rmY.kind.toLowerCase() + " on " + fmtR(spendY) + " spend (7d avg " + resDaily.toFixed(1) + "/day)."
    });
  }

  if (spendDaily >= 50 && spendY > spendDaily * 2.5) {
    // Lifetime-budget end-of-flight acceleration is rational, not an
    // anomaly. Meta deliberately spends harder in the final days to
    // complete the lifetime budget. We suppress the spike when:
    //   - budgetMode is lifetime
    //   - and we're inside the final 25% of the flight, OR the campaign
    //     has 7 or fewer days remaining
    // Pick the more conservative of the two so short campaigns (3-week
    // flights) and longer ones (3-month flights) both get covered.
    var isLifetimeAcceleration = false;
    var budgetMode = String(yesterday.budgetMode || "").toLowerCase();
    var startRaw = yesterday.startDate || "";
    var endRaw = yesterday.endDate || "";
    if (budgetMode === "lifetime" && startRaw && endRaw) {
      var startMs = Date.parse(startRaw);
      var endMs = parseCampaignEndMs(endRaw);
      var nowMs = Date.now();
      if (isFinite(startMs) && isFinite(endMs) && endMs > startMs) {
        var totalMs = endMs - startMs;
        var remainingMs = endMs - nowMs;
        var DAY = 24 * 60 * 60 * 1000;
        var daysRemaining = remainingMs / DAY;
        var pctRemaining = remainingMs / totalMs;
        if (daysRemaining > 0 && (daysRemaining <= 7 || pctRemaining <= 0.25)) {
          isLifetimeAcceleration = true;
        }
      }
    }
    if (!isLifetimeAcceleration) {
      var spendLift = ((spendY - spendDaily) / spendDaily * 100);
      out.push({
        type: "spend_spike",
        message: fmtR(spendY) + " yesterday vs " + fmtR(spendDaily) + " 7d daily average (up " + spendLift.toFixed(0) + "%)."
      });
    }
  }

  if (spendDaily >= 100 && spendY < spendDaily * 0.3) {
    var spendDrop = ((spendDaily - spendY) / spendDaily * 100);
    out.push({
      type: "spend_collapse",
      message: fmtR(spendY) + " yesterday vs " + fmtR(spendDaily) + " 7d daily average (down " + spendDrop.toFixed(0) + "%)."
    });
  }

  if (rmY.kind === "Leads" && resDaily >= 5 && resY > 0 && resY < resDaily * 0.5) {
    var leadDrop = ((resDaily - resY) / resDaily * 100);
    out.push({
      type: "lead_volume_drop",
      message: resY + " leads yesterday vs " + resDaily.toFixed(1) + "/day 7d average (down " + leadDrop.toFixed(0) + "%)."
    });
  }

  if (isResultObj && resY > 0 && resB >= 5 && cprY !== null && cprB !== null && cprB > 0 && cprY > cprB * 1.5) {
    var cprLift = ((cprY - cprB) / cprB * 100);
    out.push({
      type: "cpr_spike",
      message: rmY.costLabel + " " + fmtR(cprY) + " yesterday vs " + fmtR(cprB) + " 7d average (up " + cprLift.toFixed(0) + "%)."
    });
  }

  if (!awareness && ctrB >= 0.3 && ctrY > 0 && ctrY < ctrB * 0.6) {
    var ctrDrop = ((ctrB - ctrY) / ctrB * 100);
    out.push({
      type: "ctr_collapse",
      message: "CTR " + ctrY.toFixed(2) + "% yesterday vs " + ctrB.toFixed(2) + "% 7d average (down " + ctrDrop.toFixed(0) + "%)."
    });
  }

  if (!awareness && clicksDaily >= 20 && clicksY < clicksDaily * 0.5 && spendY >= spendDaily * 0.7) {
    var clickDrop = ((clicksDaily - clicksY) / clicksDaily * 100);
    out.push({
      type: "click_collapse",
      message: fmtNum(clicksY) + " clicks yesterday vs " + fmtNum(Math.round(clicksDaily)) + "/day 7d average (down " + clickDrop.toFixed(0) + "%) while spend held at " + fmtR(spendY) + "."
    });
  }

  if (freqY >= 3.5 && freqB > 0 && freqY > freqB * 1.5) {
    var freqLift = ((freqY - freqB) / freqB * 100);
    out.push({
      type: "frequency_cliff",
      message: "Frequency " + freqY.toFixed(2) + "x yesterday vs " + freqB.toFixed(2) + "x 7d average (up " + freqLift.toFixed(0) + "%)."
    });
  }

  if (cpmY !== null && cpmB !== null && cpmB > 5 && cpmY > cpmB * 1.4) {
    var cpmLift = ((cpmY - cpmB) / cpmB * 100);
    out.push({
      type: "cpm_spike",
      message: "CPM " + fmtR(cpmY) + " yesterday vs " + fmtR(cpmB) + " 7d average (up " + cpmLift.toFixed(0) + "%)."
    });
  }

  if (impsDaily >= 1000 && impsY < impsDaily * 0.6 && spendY >= spendDaily * 0.7) {
    var impDrop = ((impsDaily - impsY) / impsDaily * 100);
    out.push({
      type: "impressions_cliff",
      message: fmtNum(impsY) + " impressions yesterday vs " + fmtNum(Math.round(impsDaily)) + "/day 7d average (down " + impDrop.toFixed(0) + "%) while spend held."
    });
  }

  // Attach a platform-aware, data-resolved corrective procedure to every
  // anomaly so the email can render exact steps per campaign instead of a
  // single static list per anomaly type. Failures fall back to the
  // static ANOMALY_DEFS procedure inside buildProcedure.
  out.forEach(function(an) {
    try { an.procedure = buildProcedure(an.type, yesterday, baseline, rmY); }
    catch (_) { an.procedure = (ANOMALY_DEFS[an.type] && ANOMALY_DEFS[an.type].procedure) || []; }
  });

  return out;
}

// ============================================================================
// Internal API fetch helpers. Both emails pull from the same /api/campaigns
// and /api/ads endpoints the dashboard uses, with ?fresh=1 so the report
// always reflects the most current upstream truth.
// ============================================================================
export async function fetchCampaigns(from, to, apiKey, opts) {
  // `opts.fresh` defaults to true for back-compat: existing email /
  // snapshot callers want the most current upstream truth. The Command
  // Centre passes { fresh: false } so it can reuse the dashboard's
  // 5-min response cache and stay under the function timeout on cold
  // multi-platform pulls. The Command Centre runs N times an hour, the
  // cache is exactly what's wanted there.
  var fresh = !opts || opts.fresh !== false;
  var u = ORIGIN + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + (fresh ? "&fresh=1" : "");
  var r = await fetch(u, { headers: { "x-api-key": apiKey || "" } });
  if (!r.ok) throw new Error("campaigns fetch failed " + r.status);
  return await r.json();
}
export async function fetchAdsByCampaign(from, to, apiKey) {
  try {
    var u = ORIGIN + "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
    var r = await fetch(u, { headers: { "x-api-key": apiKey || "" } });
    if (!r.ok) return {};
    var data = await r.json();
    var ads = (data && data.ads) || [];
    var byCamp = {};
    // Two-pass selection: prefer the highest-spend ad WITH a thumbnail
    // first, then fall back to the highest-spend ad overall when no ad
    // in the campaign returned a thumbnail. The old single-pass logic
    // would silently drop the thumbnail when the top-spending Meta ad
    // happened to have no image_hash-derived URL (DCO sets sometimes,
    // raw-link posts often), even though lower-spend ads in the same
    // campaign had perfectly good signed URLs. Surfaced as missing FB
    // / IG thumbnails on the Command Centre while TikTok / Google
    // worked because their per-ad thumbnail resolution is denser.
    ads.forEach(function(a) {
      var cid = String(a.campaignId || "");
      if (!cid) return;
      var sp = parseFloat(a.spend || 0);
      var thumb = a.thumbnail || "";
      // adId + platform are kept on each entry so downstream
      // renderers can rebuild a /api/ad-image proxy URL instead of
      // shipping the raw CDN URL or a base64-inlined payload. The
      // Daily Pulse uses this to keep email size under Gmail's
      // 102 KB clipping threshold.
      var aid = String(a.adId || "");
      var pPlat = String(a.platform || "").toLowerCase();
      var cur = byCamp[cid];
      if (!cur) {
        byCamp[cid] = { spend: sp, thumbnail: thumb, previewUrl: a.previewUrl || "", adId: aid, platform: pPlat, _hasThumb: !!thumb };
        return;
      }
      // Priority: keep an entry with a thumbnail over one without,
      // regardless of spend. Within the same has-thumbnail class,
      // higher spend wins.
      if (thumb && !cur._hasThumb) {
        byCamp[cid] = { spend: sp, thumbnail: thumb, previewUrl: a.previewUrl || "", adId: aid, platform: pPlat, _hasThumb: true };
      } else if (cur._hasThumb === !!thumb && sp > cur.spend) {
        byCamp[cid] = { spend: sp, thumbnail: thumb || cur.thumbnail, previewUrl: a.previewUrl || cur.previewUrl, adId: aid || cur.adId, platform: pPlat || cur.platform, _hasThumb: cur._hasThumb };
      }
    });
    // Strip the internal sentinel before returning so callers see the
    // same {thumbnail, previewUrl, spend} shape as before.
    Object.keys(byCamp).forEach(function(k) { delete byCamp[k]._hasThumb; });
    return byCamp;
  } catch (_) {
    return {};
  }
}

// Inline every ad thumbnail in an adsByCampaign map as a base64 data
// URL. Daily Pulse + Weekly Pulse + any other email previewing ad
// creative consumes adsByCampaign directly, so this single sweep at
// build time guarantees the renderer never embeds a brittle CDN URL
// (Meta signed _nc_oc= URLs expire in 24-48h, TikTok x-expires= URLs
// in <24h, Google is stable but inconsistent timing breaks all three
// when an email client opens the body 3 days later). Inlining bytes
// means the image lives inside the email forever, no auth, no proxy
// hop, no expiry, no broken-link boxes.
//
// Bounded concurrency (4 parallel fetches) + 4s per-fetch timeout +
// best-effort failure handling: a slow or dead CDN never blocks the
// cron beyond a few seconds, and a failed fetch leaves the thumbnail
// empty so the renderer's gradient placeholder takes over instead of
// crashing. Idempotent: URLs already in data: form are skipped.
export async function inlineAdThumbnails(adsByCampaign) {
  if (!adsByCampaign) return;
  var work = [];
  Object.keys(adsByCampaign).forEach(function(k) {
    var entry = adsByCampaign[k];
    if (!entry || !entry.thumbnail) return;
    var url = String(entry.thumbnail);
    if (url.indexOf("data:") === 0) return;
    if (url.indexOf("http") !== 0) return;
    work.push(entry);
  });
  if (work.length === 0) return;
  var CONCURRENCY = 4;
  var idx = 0;
  async function fetchOne(entry) {
    try {
      var ctrl = new AbortController();
      var to = setTimeout(function() { ctrl.abort(); }, 4000);
      var r = await fetch(entry.thumbnail, { signal: ctrl.signal });
      clearTimeout(to);
      if (!r.ok) { entry.thumbnail = ""; return; }
      var buf = await r.arrayBuffer();
      var b64 = Buffer.from(buf).toString("base64");
      var ct = r.headers.get("content-type") || "image/jpeg";
      entry.thumbnail = "data:" + ct + ";base64," + b64;
    } catch (_) {
      entry.thumbnail = "";
    }
  }
  async function worker() {
    while (idx < work.length) {
      var i = idx++;
      await fetchOne(work[i]);
    }
  }
  var workers = [];
  for (var w = 0; w < CONCURRENCY; w++) workers.push(worker());
  await Promise.all(workers);
}

// Lighter-weight alternative to inlineAdThumbnails for emails that
// risk Gmail's 102 KB clipping ceiling. Instead of fetching every
// thumbnail and embedding the bytes as a base64 data: URL, rewrite
// each entry.thumbnail to point at our /api/ad-image proxy with a
// supplied admin-scoped token. When the recipient opens the email,
// Gmail's image fetcher hits the proxy from Google's IPs; the proxy
// honours the token (verifyToken at the rate-limit layer), resolves
// the freshest signed CDN URL, and streams the bytes back. The email
// payload itself stays tiny because each thumbnail is now a ~120-byte
// URL instead of a ~50-100 KB inlined image.
//
// Trade-off: Gmail's image proxy caches the response, so a recipient
// who archives the email and opens it weeks later still sees the
// image AS LONG AS the proxy resolution still works. inlineAdThumbnails
// embeds the bytes permanently and survives token rotation; this
// helper depends on the proxy being reachable when the email is
// viewed. For internal team emails (Daily Pulse) this is acceptable;
// for client-facing emails inlineAdThumbnails remains the safer pick.
//
// Idempotent: URLs already pointing at the proxy are skipped.
export function rewriteThumbsToProxy(adsByCampaign, origin, token) {
  if (!adsByCampaign) return;
  if (!origin || !token) return;
  var proxyPath = "/api/ad-image";
  Object.keys(adsByCampaign).forEach(function(k) {
    var entry = adsByCampaign[k];
    if (!entry) return;
    if (!entry.adId || !entry.platform) return;
    if (entry.platform !== "meta" && entry.platform !== "tiktok") return;
    // Already a proxy URL, leave it alone.
    if (entry.thumbnail && entry.thumbnail.indexOf(proxyPath) >= 0) return;
    entry.thumbnail = origin + proxyPath +
      "?platform=" + encodeURIComponent(entry.platform) +
      "&adId=" + encodeURIComponent(entry.adId) +
      "&raw=1" +
      "&token=" + encodeURIComponent(token);
  });
}
