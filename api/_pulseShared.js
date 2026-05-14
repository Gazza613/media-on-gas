// Shared utilities for the GAS automated performance emails:
//   - Weekly Pulse  (api/weekly-pulse.js)  , Monday 08:00 SAST, prior 7d vs 7d before
//   - Daily Anomalies (api/daily-report.js), Daily 08:15 SAST, anomalies-only watchlist
//
// Both emails ship to the same 9-person GAS leadership + media team list,
// both source from /api/campaigns + /api/ads, both share the dashboard
// palette so they read as a continuation of the dashboard surface, and
// both surface clickable links into the platform-native ads manager so a
// reader can jump straight from the email into Meta / TikTok / Google.

export var ORIGIN = "https://media-on-gas.vercel.app";

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
  if (obj.indexOf("appinstall") >= 0 || obj.indexOf("app_install") >= 0 || obj.indexOf("app_promotion") >= 0 || name.indexOf("appinstal") >= 0) {
    return { kind: "Clicks to App Store", value: parseInt(c.clicks || 0), costLabel: "CPC" };
  }
  if (obj === "lead_generation" || obj === "outcome_leads" || obj.indexOf("lead") >= 0) {
    return { kind: "Leads", value: parseInt(c.leads || 0), costLabel: "CPL" };
  }
  if (obj.indexOf("page_likes") >= 0 || obj.indexOf("post_engagement") >= 0 || obj.indexOf("outcome_engagement") >= 0 || obj.indexOf("follower") >= 0 || name.indexOf("like") >= 0 || name.indexOf("follow") >= 0) {
    var f = parseInt(c.follows || 0) + parseInt(c.likes || 0) + parseInt(c.pageLikes || 0) + parseInt(c.pageFollows || 0);
    return { kind: "Follows + Likes", value: f, costLabel: "CPF" };
  }
  return { kind: "Clicks", value: parseInt(c.clicks || 0), costLabel: "CPC" };
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
    caption: "Daily spend is 2.5x or more of the 7-day daily average. Verify daily-budget caps and bid strategies haven't shifted unintentionally.",
    procedure: [
      "Open the campaign and confirm the daily budget cap matches the brief.",
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

export function detectAnomalies(yesterday, baseline, rmY) {
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

  if (isResultObj && resDaily >= 3 && resY === 0 && spendY >= 100) {
    out.push({
      type: "conversions_disappeared",
      message: "Zero " + rmY.kind.toLowerCase() + " on " + fmtR(spendY) + " spend (7d avg " + resDaily.toFixed(1) + "/day)."
    });
  }

  if (spendDaily >= 50 && spendY > spendDaily * 2.5) {
    var spendLift = ((spendY - spendDaily) / spendDaily * 100);
    out.push({
      type: "spend_spike",
      message: fmtR(spendY) + " yesterday vs " + fmtR(spendDaily) + " 7d daily average (up " + spendLift.toFixed(0) + "%)."
    });
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

  if (ctrB >= 0.3 && ctrY > 0 && ctrY < ctrB * 0.6) {
    var ctrDrop = ((ctrB - ctrY) / ctrB * 100);
    out.push({
      type: "ctr_collapse",
      message: "CTR " + ctrY.toFixed(2) + "% yesterday vs " + ctrB.toFixed(2) + "% 7d average (down " + ctrDrop.toFixed(0) + "%)."
    });
  }

  if (clicksDaily >= 20 && clicksY < clicksDaily * 0.5 && spendY >= spendDaily * 0.7) {
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

  return out;
}

// ============================================================================
// Internal API fetch helpers. Both emails pull from the same /api/campaigns
// and /api/ads endpoints the dashboard uses, with ?fresh=1 so the report
// always reflects the most current upstream truth.
// ============================================================================
export async function fetchCampaigns(from, to, apiKey) {
  var u = ORIGIN + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&fresh=1";
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
    return {};
  }
}
