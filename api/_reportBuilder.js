// Deep-insights PDF report builder. Multi-page A4 document with a
// corporate/elegant aesthetic, structured around the ToFu / MoFu /
// BoFu media model. Called from api/email-share.js when body.mode
// === "report" (Share modal DOWNLOAD PDF button). Distinct from the
// scroll-friendly buildEmailHtml inbox layout.
//
// Structure:
//   1. Cover
//   2. Top of Funnel — Ads Served
//   3. Middle of Funnel — Clicks
//   4. Bottom of Funnel — Result Objectives (one subsection per
//      objective that has data)
//   5. Perfect Target Audience — Demographics
//   6. Best Performing Ads — Top 8 per platform
//   7. Executive Summary (comprehensive, moved to end)
//   8. A Note From Our Team — closing page
//
// All content is inline-styled so it survives the browser Save-as-PDF
// conversion without a bundler.

function escapeHtmlLocal(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(n) {
  var v = parseFloat(n);
  if (isNaN(v)) return "0";
  return Math.round(v).toLocaleString("en-ZA");
}

function fmtNumDec(n, dp) {
  var v = parseFloat(n);
  if (isNaN(v)) return (0).toFixed(dp || 2);
  return v.toLocaleString("en-ZA", { minimumFractionDigits: dp || 2, maximumFractionDigits: dp || 2 });
}

function fmtR(n) {
  var v = parseFloat(n);
  if (isNaN(v)) return "R0.00";
  return "R" + v.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n) {
  var v = parseFloat(n);
  if (isNaN(v)) return "0.00%";
  return v.toFixed(2) + "%";
}

// Canonical platform grouping. Google sub-channels collapse to one
// "Google Ads" bucket so per-platform breakdowns don't fragment.
function platformFamily(p) {
  var pl = String(p || "").toLowerCase();
  if (pl.indexOf("facebook") >= 0) return "Facebook";
  if (pl.indexOf("instagram") >= 0) return "Instagram";
  if (pl.indexOf("tiktok") >= 0) return "TikTok";
  if (pl.indexOf("google") >= 0 || pl.indexOf("youtube") >= 0 || pl.indexOf("search") >= 0 || pl.indexOf("perf") >= 0 || pl.indexOf("demand") >= 0 || pl.indexOf("display") >= 0) return "Google Ads";
  return p || "Other";
}

function platformAccent(p) {
  switch (p) {
    case "Facebook":  return "#4599FF";
    case "Instagram": return "#E1306C";
    case "TikTok":    return "#00F2EA";
    case "Google Ads": return "#34A853";
    default: return "#F96203";
  }
}

// ToFu / MoFu / BoFu classification via canonical objective key
// (name-detection is authoritative per project_objective_classification).
function funnelStageFor(camp) {
  var obj = String((camp && camp.objective) || "").toLowerCase();
  var name = String((camp && camp.campaignName) || "").toLowerCase();
  if (obj === "awareness" || obj === "community_reach") return "tofu";
  if (obj === "landingpage" || obj === "followers") return "mofu";
  if (obj === "leads" || obj === "appinstall") return "bofu";
  if (/(^|[_\s|\-])reach([_\s|\-]|$)/.test(name) || name.indexOf("aware") >= 0) return "tofu";
  if (name.indexOf("traffic") >= 0 || name.indexOf("engage") >= 0 || name.indexOf("follow") >= 0) return "mofu";
  if (name.indexOf("lead") >= 0 || name.indexOf("install") >= 0 || name.indexOf("purchase") >= 0) return "bofu";
  return "mofu";
}

// Objective classification. Ported VERBATIM from the dashboard's
// getObj() function (dashboard/src/App.jsx ~9407). Name detection is
// authoritative per project_objective_classification; the priority
// order MUST match the dashboard so the report reconciles exactly.
// Returns one of the dashboard's display objective labels or "Traffic"
// as a fallback. Report rendering routes by these display labels.
function getObj(camp) {
  var canon = String((camp && camp.objective) || "").toLowerCase();
  var n = String((camp && camp.campaignName) || "").toLowerCase();
  if (n.indexOf("follow/like-audience") >= 0 || /(^|[_\s|\-])reach([_\s|\-]|$)/.test(n)) return "Community Reach";
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) return "Clicks to App Store";
  if (n.indexOf("follower") >= 0 || n.indexOf("page like") >= 0 || n.indexOf("pagelikes") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "Followers & Likes";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "Leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "Landing Page Clicks";
  if (canon === "appinstall") return "Clicks to App Store";
  if (canon === "leads") return "Leads";
  if (canon === "followers") return "Followers & Likes";
  if (canon === "community_reach") return "Community Reach";
  if (canon === "landingpage") return "Landing Page Clicks";
  return "Traffic";
}

// Page matching + IG growth fallback. Ported from dashboard's
// autoMatchPage / findBestPage / findIgGrowth so the report can
// substitute IG page-snapshot growth into the Followers & Likes total
// when Meta returned zero follows attribution on IG. Matches the
// dashboard's project_followers_truth rule exactly.
function autoMatchPage(campaignName, pageName) {
  var cn = String(campaignName || "").toLowerCase().replace(/[|_\-]/g, " ");
  var pn = String(pageName || "").toLowerCase().replace(/[|_\-]/g, " ");
  var stop = ["gas","the","and","for","from","apr","mar","may","jun","jul","aug","sep","oct","nov","dec","jan","feb","2026","2025","paid","social","facebook","instagram","tiktok","campaign","funnel","cycle","leads","lead","follower","like","appinstall","traffic","cold","warm","display","search"];
  var cWords = cn.split(/\s+/).filter(function(w) { return w.length > 2 && stop.indexOf(w) < 0; });
  var score = 0;
  for (var wi = 0; wi < cWords.length; wi++) if (pn.indexOf(cWords[wi]) >= 0) score++;
  return score;
}
function findIgGrowth(campaignName, pagesArr) {
  var best = null, bestScore = 0;
  (pagesArr || []).forEach(function(pg) {
    var s = autoMatchPage(campaignName, pg.name);
    if (s > bestScore) { bestScore = s; best = pg; }
  });
  if (best && best.instagram_business_account) return parseFloat(best.instagram_business_account.follower_growth || 0);
  return 0;
}

// Objective-appropriate result count. Ported from dashboard's
// getResult(). Followers & Likes falls back to IG snapshot growth for
// IG-platform campaigns when Meta returned zero follows attribution
// (per project_meta_like_action + project_followers_truth).
function getResult(camp, obj, pages) {
  if (obj === "Leads") return parseFloat(camp.leads || 0);
  if (obj === "Followers & Likes") {
    var fl = parseFloat(camp.follows || 0) + parseFloat(camp.pageLikes || 0);
    if (fl === 0 && camp.platform === "Instagram") {
      var igFL = findIgGrowth(camp.campaignName, pages);
      if (igFL > 0) fl = igFL;
    }
    return fl;
  }
  if (obj === "Community Reach") return parseFloat(camp.reach || 0);
  return parseFloat(camp.clicks || 0);
}

// Whole-account earnedTotal for Followers & Likes. Dashboard's rule
// (App.jsx ~9456-9469): matched FB pages contribute follower_growth
// when the daily snapshot has data, else fall back to per-campaign
// pageLikes on follower-objective FB campaigns; add IG BA
// follower_growth on every matched page; add TikTok per-campaign
// follows. Overrides tFollows on Summary — mirror here so report and
// Summary agree.
function computeEarnedTotal(campaigns, pages) {
  var matchedPages = [];
  var matchedIds = {};
  (campaigns || []).forEach(function(camp) {
    var best = null, bestScore = 0;
    (pages || []).forEach(function(pg) {
      var s = autoMatchPage(camp.campaignName, pg.name);
      if (s > bestScore) { bestScore = s; best = pg; }
    });
    if (best && bestScore >= 2 && !matchedIds[best.id]) { matchedPages.push(best); matchedIds[best.id] = true; }
  });
  var fbGrowth = 0, igGrowth = 0;
  matchedPages.forEach(function(mp) {
    if (typeof mp.follower_growth === "number") fbGrowth += mp.follower_growth;
    if (mp.instagram_business_account) igGrowth += parseFloat(mp.instagram_business_account.follower_growth || 0);
  });
  var ttE = 0;
  (campaigns || []).forEach(function(c) { if (c.platform === "TikTok") ttE += parseFloat(c.follows || 0); });
  var fbGrowthKnown = matchedPages.some(function(mp) { return typeof mp.follower_growth === "number"; });
  var fbPaidPL = 0;
  (campaigns || []).forEach(function(camp) {
    if (camp.platform !== "Facebook") return;
    var obj = String(camp.objective || "").toLowerCase();
    var nm = String(camp.campaignName || "").toLowerCase();
    var isFol = obj === "followers" || nm.indexOf("follower") >= 0 || nm.indexOf("like&follow") >= 0 || nm.indexOf("like_follow") >= 0 || nm.indexOf("_like_") >= 0 || nm.indexOf("_follow_") >= 0;
    if (isFol) fbPaidPL += parseFloat(camp.pageLikes || 0);
  });
  var fbEarnedResolved = (fbGrowthKnown && fbGrowth > 0) ? fbGrowth : fbPaidPL;
  return fbEarnedResolved + igGrowth + ttE;
}

// Awareness-campaign classifier. Ported verbatim from dashboard's
// isAwarenessCamp (App.jsx ~4964). Awareness / Community Reach
// campaigns buy cheap impressions at sub-1% CTR by design and would
// drag the blended CTR / CPC toward zero if aggregated with the rest,
// so the dashboard aggregates a parallel engagement-only view for
// the CTR / CPC tiles. Report must mirror this or Blended CTR reads
// wildly different from the Summary page.
function isAwarenessCamp(c) {
  var obj = String((c && c.objective) || "").toLowerCase();
  if (obj === "community_reach" || obj === "reach" || obj === "awareness") return true;
  var name = String((c && c.campaignName) || "").toLowerCase();
  if (/(^|[_\s|\-])reach([_\s|\-]|$)|awareness/.test(name)) return true;
  return false;
}

// Aggregate metrics. `pages` is threaded through so the objective
// bucket uses getResult() with the dashboard's IG-snapshot fallback.
// byObjective keys use the DASHBOARD display labels ("Leads",
// "Followers & Likes", "Clicks to App Store", "Landing Page Clicks",
// "Community Reach") so BoFu subsections render straight from them.
// Also builds engagement-only aggregates (excludes awareness/community
// reach campaigns) for the Blended CTR / CPC headlines to match the
// dashboard's Summary tab exactly.
function aggregateBook(campaigns, pages) {
  var empty = function() {
    return { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, follows: 0, pageLikes: 0, appInstalls: 0, landingPageViews: 0, result: 0, campaignCount: 0 };
  };
  var engEmpty = function() { return { spend: 0, impressions: 0, clicks: 0 }; };
  var book = { global: empty(), byPlatform: {}, byStage: { tofu: empty(), mofu: empty(), bofu: empty() } };
  book.byPlatformStage = { tofu: {}, mofu: {}, bofu: {} };
  book.byObjective = {};
  book.engagement = engEmpty();
  book.engagementByPlatform = {};
  (campaigns || []).forEach(function(c) {
    var p = platformFamily(c.platform);
    var stage = funnelStageFor(c);
    if (!book.byPlatform[p]) book.byPlatform[p] = empty();
    if (!book.byPlatformStage[stage][p]) book.byPlatformStage[stage][p] = empty();
    var acc = [book.global, book.byPlatform[p], book.byStage[stage], book.byPlatformStage[stage][p]];
    acc.forEach(function(b) {
      b.spend += parseFloat(c.spend || 0);
      b.impressions += parseFloat(c.impressions || 0);
      b.clicks += parseFloat(c.clicks || 0);
      b.reach += parseFloat(c.reach || 0);
      b.leads += parseFloat(c.leads || 0);
      b.follows += parseFloat(c.follows || 0);
      b.pageLikes += parseFloat(c.pageLikes || 0);
      b.appInstalls += parseFloat(c.appInstalls || 0);
      b.landingPageViews += parseFloat(c.landingPageViews || 0);
      b.campaignCount += 1;
    });
    if (!isAwarenessCamp(c)) {
      book.engagement.spend += parseFloat(c.spend || 0);
      book.engagement.impressions += parseFloat(c.impressions || 0);
      book.engagement.clicks += parseFloat(c.clicks || 0);
      if (!book.engagementByPlatform[p]) book.engagementByPlatform[p] = engEmpty();
      book.engagementByPlatform[p].spend += parseFloat(c.spend || 0);
      book.engagementByPlatform[p].impressions += parseFloat(c.impressions || 0);
      book.engagementByPlatform[p].clicks += parseFloat(c.clicks || 0);
    }
    var obj = getObj(c);
    var result = getResult(c, obj, pages);
    if (!book.byObjective[obj]) book.byObjective[obj] = { global: empty(), byPlatform: {} };
    if (!book.byObjective[obj].byPlatform[p]) book.byObjective[obj].byPlatform[p] = empty();
    [book.byObjective[obj].global, book.byObjective[obj].byPlatform[p]].forEach(function(b) {
      b.spend += parseFloat(c.spend || 0);
      b.impressions += parseFloat(c.impressions || 0);
      b.clicks += parseFloat(c.clicks || 0);
      b.reach += parseFloat(c.reach || 0);
      b.result += result;
      b.campaignCount += 1;
    });
  });
  return book;
}

// Engagement-only CTR / CPC helpers. Match dashboard's blendedEngagementCtr
// / blendedEngagementCpc (App.jsx ~4993).
function engagementCtrOf(engRow) { return engRow && engRow.impressions > 0 ? (engRow.clicks / engRow.impressions * 100) : 0; }
function engagementCpcOf(engRow) { return engRow && engRow.clicks > 0 ? (engRow.spend / engRow.clicks) : 0; }

// Derived per-row metrics.
function ctrOf(row) { return row.impressions > 0 ? (row.clicks / row.impressions * 100) : 0; }
function cpmOf(row) { return row.impressions > 0 ? (row.spend / row.impressions * 1000) : 0; }
function cpcOf(row) { return row.clicks > 0 ? (row.spend / row.clicks) : 0; }
function frequencyOf(row) { return row.reach > 0 ? (row.impressions / row.reach) : 0; }
function cpaOf(row, res) { return res > 0 ? (row.spend / res) : 0; }

// Format a period string. Elegant display for cover / closing pages.
function formatPeriod(from, to) {
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ""))) {
    return (from || "") + " to " + (to || "");
  }
  var fY = parseInt(from.slice(0, 4), 10);
  var fM = parseInt(from.slice(5, 7), 10) - 1;
  var fD = parseInt(from.slice(8, 10), 10);
  var tY = parseInt(to.slice(0, 4), 10);
  var tM = parseInt(to.slice(5, 7), 10) - 1;
  var tD = parseInt(to.slice(8, 10), 10);
  if (fY === tY && fM === tM) return MONTHS[fM] + " " + fY;
  if (fY === tY) return MONTHS[fM] + " " + fD + " to " + MONTHS[tM] + " " + tD + ", " + fY;
  return MONTHS[fM] + " " + fD + ", " + fY + " to " + MONTHS[tM] + " " + tD + ", " + tY;
}

// Ad thumbnail resolver. Mirrors dashboard/src/App.jsx thumbFor() so
// what the operator sees on the Summary tab is what the PDF renders.
// The dashboard's fast path is: if ad.thumbnail is present AND the ad
// isn't a Meta MIXED DCO ad, use the raw signed CDN URL directly. The
// proxy runs only for MIXED (needs winner re-selection) or when the
// ads payload had no thumbnail (proxy resolves from image_hash /
// video_id server-side). Previous "always proxy" approach on the PDF
// stalled or 404'd on the same tiles the dashboard shows fine.
// Signed Meta / TikTok CDN URLs live ~1 hour so a freshly generated
// PDF viewed within the window renders every raw thumbnail identical
// to the dashboard. Older PDFs may miss thumbnails that expired since
// the proxy also cannot recover a truly gone signed URL.
function resolveThumb(ad, origin, shareToken, size) {
  if (!ad) return "";
  var pl = String(ad.platform || "").toLowerCase();
  var pk = (pl.indexOf("facebook") >= 0 || pl.indexOf("instagram") >= 0) ? "meta" : (pl.indexOf("tiktok") >= 0 ? "tiktok" : "");
  // Non-Meta/TikTok (Google Ads variants). Only the raw URL is
  // available; proxy doesn't handle them.
  if (!pk || !ad.adId) return ad.thumbnail || "";
  var isMixed = pk === "meta" && (String(ad.format || "").toUpperCase() === "MIXED" || ad.multiCreative);
  // Fast path: fresh raw thumbnail, no winner re-selection needed.
  // Matches dashboard thumbFor line ~4228.
  if (ad.thumbnail && !isMixed) return ad.thumbnail;
  // Proxy fallback. Requires shareToken to authenticate at open time.
  if (!origin || !shareToken) return ad.thumbnail || "";
  var cid = String(ad.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
  var win = isMixed ? "&winner=1" : "";
  return origin + "/api/ad-image?platform=" + pk + "&adId=" + encodeURIComponent(ad.adId) + (cid ? ("&campaignId=" + encodeURIComponent(cid)) : "") + win + "&raw=1&token=" + shareToken;
}

// ═══════════════════════════════════════════════════════════════════
// KPI TILE + PLATFORM TABLE PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

function renderKpiRow(kpis) {
  var kHtml = kpis.map(function(k) {
    return `<div class="rp-kpi ${k.primary ? "rp-kpi-primary" : ""}">
      <div class="rp-kpi-label">${escapeHtmlLocal(k.label)}</div>
      <div class="rp-kpi-value" style="white-space:nowrap;word-break:keep-all;overflow-wrap:normal;overflow:hidden;max-width:100%;">${escapeHtmlLocal(k.value)}</div>
      ${k.sub ? `<div class="rp-kpi-sub">${escapeHtmlLocal(k.sub)}</div>` : ""}
    </div>`;
  }).join("");
  var cols = Math.min(kpis.length, 4);
  return `<div class="rp-kpi-grid" style="grid-template-columns:repeat(${cols},1fr);">${kHtml}</div>`;
}

// Per-platform table. `columns` is an array of { key, label, format }.
function renderPlatformTable(byPlatform, columns) {
  var platforms = Object.keys(byPlatform).sort(function(a, b) { return byPlatform[b].spend - byPlatform[a].spend; });
  if (!platforms.length) return `<div class="rp-empty">No platform delivery data for the selected period.</div>`;
  var head = columns.map(function(c) { return `<th class="${c.align === "left" ? "rp-th-name" : "rp-th-num"}">${escapeHtmlLocal(c.label)}</th>`; }).join("");
  var rows = platforms.map(function(p) {
    var b = byPlatform[p];
    var cells = columns.map(function(c) {
      if (c.key === "platform") {
        var accent = platformAccent(p);
        return `<td class="rp-td-name"><span class="rp-plat-chip" style="background:${accent};">${escapeHtmlLocal(p)}</span></td>`;
      }
      var v = c.compute ? c.compute(b, p) : (b[c.key] || 0);
      var display = c.format === "R" ? fmtR(v) : c.format === "%" ? fmtPct(v) : c.format === "freq" ? fmtNumDec(v, 2) + "×" : c.format === "int" ? fmtNum(v) : String(v);
      return `<td class="rp-td-num">${escapeHtmlLocal(display)}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table class="rp-table rp-table-wide"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInsight(title, text) {
  if (!text) return "";
  return `<div class="rp-insight">
    <div class="rp-insight-eyebrow">${escapeHtmlLocal(title || "Insight")}</div>
    <p class="rp-body">${text}</p>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════════════════════════════

function renderCoverPage(opts) {
  var clientLogo = opts.clientLogo || "";
  var clientName = escapeHtmlLocal(opts.clientName || "Client");
  var period = escapeHtmlLocal(opts.periodDisplay || "");
  var senderName = escapeHtmlLocal(opts.senderName || "");
  var senderTitle = escapeHtmlLocal(opts.senderTitle || "");
  var origin = opts.origin || "https://media.gasmarketing.co.za";
  var agencyLogo = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  return `<section class="rp-page rp-cover">
    <div class="rp-cover-frame">
      <div class="rp-cover-top">
        ${clientLogo
          ? `<img src="${escapeHtmlLocal(clientLogo)}" alt="${clientName}" class="rp-cover-logo"/>`
          : `<div class="rp-cover-fallback-name">${clientName}</div>`}
      </div>
      <div class="rp-cover-heart">
        <div class="rp-cover-eyebrow">Performance Insights</div>
        <div class="rp-cover-title">${clientName}</div>
        <div class="rp-cover-title-sub">Media Report</div>
        <div class="rp-cover-period">${period}</div>
      </div>
      <div class="rp-cover-foot">
        <div class="rp-cover-foot-left">
          <div class="rp-cover-label">Prepared by</div>
          <div class="rp-cover-sender">${senderName || "GAS Marketing"}</div>
          ${senderTitle ? `<div class="rp-cover-sender-title">${senderTitle}</div>` : ""}
        </div>
        <div class="rp-cover-foot-right">
          <img src="${agencyLogo}" alt="GAS Marketing" class="rp-cover-agency-logo"/>
          <div class="rp-cover-agency-label">GAS Marketing</div>
          <div class="rp-cover-agency-sub">Metrics That Matter</div>
        </div>
      </div>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION HEADER
// ═══════════════════════════════════════════════════════════════════

function renderSectionHeader(number, eyebrow, title, subtitle) {
  return `<div class="rp-section-head">
    <div class="rp-section-num">${escapeHtmlLocal(number)}</div>
    <div class="rp-section-headline">
      <div class="rp-section-eyebrow">${escapeHtmlLocal(eyebrow)}</div>
      <h1 class="rp-h1">${title}</h1>
      ${subtitle ? `<div class="rp-lede">${subtitle}</div>` : ""}
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: TOP OF FUNNEL — ADS SERVED
// ═══════════════════════════════════════════════════════════════════

function renderTofuSection(opts) {
  var book = opts.book;
  var g = book.global;
  var globalKpis = [
    { label: "Total Impressions", value: fmtNum(g.impressions), primary: true },
    { label: "Total Reach", value: fmtNum(g.reach), sub: "unique users" },
    { label: "Frequency", value: fmtNumDec(frequencyOf(g), 2) + "x", sub: "per user" },
    { label: "Blended CPM", value: fmtR(cpmOf(g)), sub: "cost per 1,000" }
  ];
  // 6 columns is the max that fits inside A4 content width without the
  // header overflowing. CPM already IS cost per 1,000 ads served so
  // the earlier "Cost / 1K Served" column was pure duplication.
  var columns = [
    { key: "platform", label: "Platform", align: "left" },
    { key: "impressions", label: "Impressions", format: "int" },
    { key: "reach", label: "Reach", format: "int" },
    { key: "freq", label: "Frequency", format: "freq", compute: frequencyOf },
    { key: "cpm", label: "CPM", format: "R", compute: cpmOf },
    { key: "spend", label: "Spend", format: "R" }
  ];
  // Two-paragraph Performance Insights.
  var platforms = Object.keys(book.byPlatform).sort(function(a, b) { return book.byPlatform[b].spend - book.byPlatform[a].spend; });
  var p1 = "", p2 = "";
  if (platforms.length) {
    var lead = platforms[0];
    var lb = book.byPlatform[lead];
    var globalFreq = frequencyOf(g);
    var globalCPM = cpmOf(g);
    var leadShare = g.spend > 0 ? (lb.spend / g.spend * 100) : 0;
    p1 = "During this window " + fmtNum(g.impressions) + " impressions were served across " + platforms.length + " platform" + (platforms.length === 1 ? "" : "s") + ", reaching " + fmtNum(g.reach) + " unique users at a blended CPM of " + fmtR(globalCPM) + ". " + escapeHtmlLocal(lead) + " carried the largest share of delivery at " + leadShare.toFixed(1) + "% of the media investment, serving " + fmtNum(lb.impressions) + " impressions to " + fmtNum(lb.reach) + " unique users at a " + fmtR(cpmOf(lb)) + " CPM. This distribution reflects a considered choice about where the audience is spending their attention and how efficiently each platform can put the brand in front of them.";
    var freqRead;
    if (globalFreq > 4) freqRead = "Global frequency at " + fmtNumDec(globalFreq, 2) + "x has crossed the 4x fatigue ceiling. Above this threshold, diminishing returns accelerate sharply and the additional impressions actively contribute to audience saturation rather than deepening recognition. Audience expansion, lookalike layer additions, or a fresh creative rotation are recommended before the next window to reset delivery efficiency.";
    else if (globalFreq >= 2.5) freqRead = "Global frequency of " + fmtNumDec(globalFreq, 2) + "x sits comfortably inside the healthy recall band. This is the range where brand memory strengthens with each additional exposure without triggering audience fatigue. Continued investment at this cadence compounds memory structures for future decision moments.";
    else if (globalFreq > 0) freqRead = "Global frequency at " + fmtNumDec(globalFreq, 2) + "x indicates significant headroom in the audience. The current impression pool has been reached fewer times per person than the memory-building band recommends, suggesting expanded budget or extended flight duration would compound recognition without saturation risk.";
    else freqRead = "Reach metrics were unavailable for this window across most placements, so frequency cannot be computed reliably. Impressions and spend efficiency remain the key readable signals here.";
    p2 = freqRead + " Efficient delivery at this stage compounds every subsequent layer of the funnel, warm audiences convert faster and cheaper because the awareness work has already been done.";
  }
  var insight = p1 ? (p1 + "</p><p class=\"rp-body\">" + p2) : p2;
  // Investment & Pacing block. Uses the dashboard's exact pacing math
  // (App.jsx ~5196-5205): totalDays / elapsed / pctElapsed /
  // dailySpendRate / projectedSpend, "today" in Africa/Johannesburg
  // so the % elapsed doesn't shift at UTC roll-over. When the
  // reporting window is entirely in the past (to < today), pacing
  // reads 100% elapsed with a "period closed" caption so the tiles
  // don't read as mid-flight when they aren't.
  var pacingHtml = "";
  if (opts.from && opts.to) {
    var daysBetween = function(a, b) {
      var d = Math.round((new Date(b) - new Date(a)) / 86400000) + 1;
      return d < 1 ? 1 : d;
    };
    var todayLocal = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
    var totalDays = daysBetween(opts.from, opts.to);
    var elapsedRaw = daysBetween(opts.from, todayLocal < opts.to ? todayLocal : opts.to);
    var elapsed = elapsedRaw > totalDays ? totalDays : elapsedRaw;
    var pctElapsed = Math.min(100, elapsed / totalDays * 100);
    var dailyRate = elapsed > 0 ? g.spend / elapsed : 0;
    var projectedSpend = dailyRate * totalDays;
    var periodClosed = todayLocal >= opts.to;
    var elapsedCaption = periodClosed
      ? "Period closed"
      : "Day " + elapsed + " of " + totalDays;
    var projectionCaption = periodClosed
      ? "Final total"
      : "At current daily rate";
    var pacingKpis = [
      { label: "Media Spend to Date", value: fmtR(g.spend), primary: true, sub: fmtR(dailyRate) + " per day" },
      { label: "Pacing to Month End", value: fmtR(projectedSpend), sub: projectionCaption },
      { label: "% of Period Elapsed", value: pctElapsed.toFixed(1) + "%", sub: elapsedCaption }
    ];
    pacingHtml = `<div class="rp-block">
      <div class="rp-block-title">Investment &amp; Pacing</div>
      <div class="rp-block-caption">Where the budget sits today and where the current daily spend rate is projected to land by period end.</div>
      ${renderKpiRow(pacingKpis)}
    </div>`;
  }
  return `<section class="rp-page">
    ${renderSectionHeader("01", "Top of the Funnel", "Ads Served", "Awareness delivery. This is the layer that plants the brand in the audience's memory ahead of a decision moment. Success is measured in efficient reach and controlled frequency, not clicks.")}
    <div class="rp-block">
      <div class="rp-block-title">Global Delivery Headlines</div>
      ${renderKpiRow(globalKpis)}
    </div>
    ${pacingHtml}
    <div class="rp-block">
      <div class="rp-block-title">Per Platform Delivery Breakdown</div>
      ${renderPlatformTable(book.byPlatform, columns)}
    </div>
    ${renderInsight("Performance Insights", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: MIDDLE OF FUNNEL — CLICKS
// ═══════════════════════════════════════════════════════════════════

function renderMofuSection(opts) {
  var book = opts.book;
  var g = book.global;
  // Blended CTR + CPC use ENGAGEMENT-ONLY totals (exclude Awareness /
  // Community Reach campaigns) to match the dashboard's Summary tab
  // exactly. Total Clicks and Total Spend stay as the full grand.
  var eng = book.engagement || { impressions: 0, clicks: 0, spend: 0 };
  var globalKpis = [
    { label: "Total Clicks", value: fmtNum(eng.clicks || g.clicks), primary: true, sub: "engagement campaigns" },
    { label: "Blended CTR", value: fmtPct(engagementCtrOf(eng)), sub: "awareness excluded" },
    { label: "Blended CPC", value: fmtR(engagementCpcOf(eng)), sub: "awareness excluded" },
    { label: "Total Spend", value: fmtR(g.spend), sub: "all campaigns" }
  ];
  // Per-platform table reads engagement-only clicks / CTR / CPC to
  // match the dashboard's Engagement bars chart (App.jsx ~9376).
  // Impressions + frequency + spend stay full-mix.
  var engBP = book.engagementByPlatform || {};
  var columns = [
    { key: "platform", label: "Platform", align: "left" },
    { key: "impressions", label: "Impressions", format: "int" },
    { key: "clicks", label: "Clicks", format: "int", compute: function(row, key) { var e = engBP[key] || {}; return e.clicks || 0; } },
    { key: "ctr", label: "CTR", format: "%", compute: function(row, key) { return engagementCtrOf(engBP[key]); } },
    { key: "cpc", label: "CPC", format: "R", compute: function(row, key) { return engagementCpcOf(engBP[key]); } },
    { key: "freq", label: "Frequency", format: "freq", compute: frequencyOf },
    { key: "spend", label: "Spend", format: "R" }
  ];
  // Rewritten lede per owner spec: name the objective-appropriate
  // action types the ads are asking the audience to take rather than
  // generic engagement description.
  var lede = "The intent-capture layer. This stage takes audiences who now recognise the brand and asks them to take the action their campaign objective calls for, whether that is a click through to a landing page, a click to the app store to download the app, a like or follow of the brand's social pages, or a click through to a lead form.";
  // Two-paragraph Performance Insights. Engagement-only reads so the
  // narrative matches the tile above (awareness excluded).
  var platforms = Object.keys(engBP).sort(function(a, b) { return engagementCtrOf(engBP[b]) - engagementCtrOf(engBP[a]); });
  var gCtr = engagementCtrOf(eng);
  var gCpc = engagementCpcOf(eng);
  var p1 = "", p2 = "";
  if (platforms.length) {
    var best = platforms[0];
    var bestCtr = engagementCtrOf(engBP[best]);
    var bestCpc = engagementCpcOf(engBP[best]);
    var readCtr = gCtr >= 1.2 ? "strong click-through performance" : gCtr >= 0.8 ? "healthy click-through performance sitting inside the 0.8% to 1.2% consideration benchmark" : "click-through performance below the 0.8% consideration benchmark, indicating creative fatigue or a message-audience mismatch is worth investigating";
    p1 = fmtNum(g.clicks) + " clicks were captured across the reporting window at a blended click-through rate of " + fmtPct(gCtr) + " and a blended cost-per-click of " + fmtR(gCpc) + ". That reads as " + readCtr + ". " + escapeHtmlLocal(best) + " led the platforms at " + fmtPct(bestCtr) + " CTR and " + fmtR(bestCpc) + " CPC, indicating the strongest creative-audience resonance for this window's message and audience combination.";
    var cheapest = platforms.slice().sort(function(a, b) {
      var ca = engagementCpcOf(engBP[a]) || Infinity;
      var cb = engagementCpcOf(engBP[b]) || Infinity;
      return ca - cb;
    })[0];
    var cheapestNote = cheapest && cheapest !== best ? escapeHtmlLocal(cheapest) + " delivered the lowest cost-per-click at " + fmtR(engagementCpcOf(engBP[cheapest])) + ", a candidate for scale in the next window if the audience quality holds. " : "";
    p2 = cheapestNote + "CTR by itself is a diagnostic metric, not a business outcome. It tells the story of whether the audience is leaning in when they see the ad, which is the necessary precursor to the conversion outcomes measured in Section 03. A window with strong CTR at the middle of the funnel typically converts more efficiently at the bottom, since intent has already been captured. Weak middle-of-funnel CTR is the earliest signal that the awareness above needs a creative or audience adjustment before it can reliably convert.";
  }
  var insight = p1 ? (p1 + "</p><p class=\"rp-body\">" + p2) : p2;
  return `<section class="rp-page">
    ${renderSectionHeader("02", "Middle of the Funnel", "Clicks &amp; Consideration", lede)}
    <div class="rp-block">
      <div class="rp-block-title">Global Click Headlines</div>
      ${renderKpiRow(globalKpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Per Platform Click Breakdown</div>
      ${renderPlatformTable(book.byPlatform, columns)}
    </div>
    ${renderInsight("Performance Insights", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: BOTTOM OF FUNNEL — OBJECTIVE-DRIVEN
// ═══════════════════════════════════════════════════════════════════

// Objective-scoped subsection. Reads from book.byObjective[dashboardLabel]
// which was aggregated by the ported getObj() so classification is
// identical to the Summary tab. bucket.global.result IS the sum of
// getResult(camp, obj) across every campaign matching that objective,
// so the total number matches Summary's tLeads / tFollows / tApp /
// tLp / tCommReach line-for-line. `earnedOverride` is used only for
// Followers & Likes, to substitute the whole-account earnedTotal when
// the dashboard would (project_followers_truth).
function renderBofuObjective(bucket, cfg, earnedOverride) {
  if (!bucket) return "";
  var total = earnedOverride != null ? earnedOverride : bucket.global.result;
  if (!total) return "";
  var platforms = Object.keys(bucket.byPlatform).filter(function(p) {
    var b = bucket.byPlatform[p];
    return b.spend > 0 || b.result > 0;
  }).sort(function(a, b) { return bucket.byPlatform[b].result - bucket.byPlatform[a].result; });
  var perPlatformHtml = platforms.map(function(p) {
    var b = bucket.byPlatform[p];
    var accent = platformAccent(p);
    var spend = b.spend;
    // Community Reach uses CPM (dashboard rule at App.jsx ~9445), every
    // other objective uses spend/result.
    var isReach = cfg.key === "Community Reach";
    var costPer = b.result > 0 ? (isReach ? spend / b.result * 1000 : spend / b.result) : 0;
    return `<tr>
      <td class="rp-td-name"><span class="rp-plat-chip" style="background:${accent};">${escapeHtmlLocal(p)}</span></td>
      <td class="rp-td-num rp-td-center">${(cfg.symbol || "") + fmtNum(b.result)}</td>
      <td class="rp-td-num rp-td-center">${fmtR(spend)}</td>
      <td class="rp-td-num rp-td-center rp-td-sub">${b.result > 0 ? fmtR(costPer) : "n/a"}</td>
    </tr>`;
  }).join("");
  var isReach = cfg.key === "Community Reach";
  var overallCost = bucket.global.spend > 0 && total > 0 ? (isReach ? bucket.global.spend / total * 1000 : bucket.global.spend / total) : 0;
  var costLabel = isReach ? "CPM" : ("Cost per " + cfg.resultKey);
  return `<div class="rp-bofu-sub">
    <div class="rp-bofu-sub-head">
      <div class="rp-bofu-sub-title">${cfg.title}</div>
      <div class="rp-bofu-sub-total">${(cfg.symbol || "") + fmtNum(total)}</div>
    </div>
    <div class="rp-bofu-sub-desc">${cfg.description}</div>
    <div class="rp-bofu-sub-costline">${costLabel}: <strong>${overallCost > 0 ? fmtR(overallCost) : "n/a"}</strong> &middot; Spend on this objective: <strong>${fmtR(bucket.global.spend)}</strong>${earnedOverride != null ? " &middot; <em>Whole-account community total (matches Summary)</em>" : ""}</div>
    <table class="rp-table">
      <thead><tr>
        <th class="rp-th-name">Platform</th>
        <th class="rp-th-num rp-th-center">${cfg.columnLabel}</th>
        <th class="rp-th-num rp-th-center">Spend</th>
        <th class="rp-th-num rp-th-center">${isReach ? "CPM" : ("Cost / " + cfg.resultKey)}</th>
      </tr></thead>
      <tbody>${perPlatformHtml}</tbody>
    </table>
  </div>`;
}

function renderBofuSection(opts) {
  var book = opts.book;
  var byObj = book.byObjective || {};
  var earnedTotal = opts.earnedTotal || 0;
  var subs = [];
  subs.push(renderBofuObjective(byObj["Clicks to App Store"], {
    key: "Clicks to App Store",
    title: "Clicks to App Store",
    description: "Users routed from the ad through to their platform's app store to download the app. The measurable last-mile touchpoint before install.",
    columnLabel: "Store Clicks",
    resultKey: "click"
  }));
  subs.push(renderBofuObjective(byObj["Landing Page Clicks"], {
    key: "Landing Page Clicks",
    title: "Clicks to Landing Page",
    description: "Users who accepted the offer to visit an owned landing page or website destination, the warmest traffic layer of the funnel.",
    columnLabel: "LP Clicks",
    resultKey: "click"
  }));
  subs.push(renderBofuObjective(byObj["Leads"], {
    key: "Leads",
    title: "Leads Captured",
    description: "Direct-response leads captured from in-platform forms or landing-page submissions during the reporting period.",
    columnLabel: "Leads",
    resultKey: "lead"
  }));
  // Followers & Likes uses the whole-account earnedTotal override
  // (mirrors dashboard line ~9563). Per-platform rows continue to
  // show campaign-attributable result, but the headline total is the
  // reconciled community number.
  subs.push(renderBofuObjective(byObj["Followers & Likes"], {
    key: "Followers & Likes",
    title: "Followers &amp; Likes",
    description: "New followers and page likes earned during the reporting window. Each new community member is a permanent organic distribution channel that continues to compound after the paid budget stops.",
    columnLabel: "New Members",
    resultKey: "member",
    symbol: "+"
  }, earnedTotal > 0 ? earnedTotal : null));
  subs.push(renderBofuObjective(byObj["Community Reach"], {
    key: "Community Reach",
    title: "Community Reach",
    description: "Unique users reached through community reach objectives. Awareness delivery treated as an outcome in its own right for brand-building windows.",
    columnLabel: "Reach",
    resultKey: "person"
  }));
  var subsHtml = subs.filter(Boolean).join("");
  if (!subsHtml) subsHtml = `<div class="rp-empty">No result-objective campaigns ran during this window.</div>`;
  // Ecommerce block (if applicable)
  var eco = opts.ecommerce && opts.ecommerce.ecommerce;
  var ecoBlock = "";
  if (eco) {
    var rev = parseFloat(eco.revenue || 0);
    var tx = parseFloat(eco.transactions || 0);
    ecoBlock = `<div class="rp-bofu-sub rp-bofu-eco">
      <div class="rp-bofu-sub-head">
        <div class="rp-bofu-sub-title">Site Ecommerce</div>
        <div class="rp-bofu-sub-total">${fmtR(rev)}</div>
      </div>
      <div class="rp-bofu-sub-desc">Total-site revenue reflects the entire commercial picture, not only paid-social contribution. It is included as the ultimate outcome the funnel is optimising toward.</div>
      <div class="rp-eco-row">
        <div class="rp-eco-tile"><div class="rp-eco-label">Transactions</div><div class="rp-eco-value">${fmtNum(tx)}</div></div>
        <div class="rp-eco-tile"><div class="rp-eco-label">Average Order</div><div class="rp-eco-value">${fmtR(tx > 0 ? rev / tx : 0)}</div></div>
        ${eco.sessions ? `<div class="rp-eco-tile"><div class="rp-eco-label">Sessions</div><div class="rp-eco-value">${fmtNum(eco.sessions)}</div></div>` : ""}
      </div>
    </div>`;
  }
  // Insight — two paragraphs, drawn from the objective buckets (which
  // are now keyed by the dashboard's display labels) so figures
  // reconcile exactly with the Summary tab.
  var earnedTotal = opts.earnedTotal || 0;
  var oL = byObj["Leads"] && byObj["Leads"].global;
  var oF = byObj["Followers & Likes"] && byObj["Followers & Likes"].global;
  var oA = byObj["Clicks to App Store"] && byObj["Clicks to App Store"].global;
  var oT = byObj["Landing Page Clicks"] && byObj["Landing Page Clicks"].global;
  var oR = byObj["Community Reach"] && byObj["Community Reach"].global;
  var p1Parts = [];
  if (oL && oL.result > 0) p1Parts.push(fmtNum(oL.result) + " qualified lead" + (oL.result === 1 ? "" : "s") + " at " + fmtR(oL.spend / oL.result) + " per lead");
  var fResult = earnedTotal > 0 ? earnedTotal : (oF ? oF.result : 0);
  if (fResult > 0 && oF) p1Parts.push("+" + fmtNum(fResult) + " new community members at " + fmtR(oF.spend > 0 ? oF.spend / fResult : 0) + " per member");
  if (oA && oA.result > 0) p1Parts.push(fmtNum(oA.result) + " clicks to the app store at " + fmtR(oA.spend / oA.result) + " per click");
  if (oT && oT.result > 0) p1Parts.push(fmtNum(oT.result) + " landing page clicks at " + fmtR(oT.spend / oT.result) + " per click");
  if (oR && oR.result > 0) p1Parts.push(fmtNum(oR.result) + " unique users reached at " + fmtR(oR.spend / oR.result * 1000) + " CPM");
  var p1 = p1Parts.length ? "The bottom of funnel layer delivered " + p1Parts.join(", ") + ", each attributable directly to the objective its campaigns were built to achieve. These are the outcomes the funnel was structured around, and the numbers here match the Summary tab of the live dashboard exactly." : "";
  var p2 = "Bottom of funnel spend is the honest test of the awareness and consideration layers above. Warm audiences convert efficiently only when the funnel has first done the work of building recognition and intent. A cost per outcome trending stable or downward window over window confirms the strategy is compounding rather than depleting the audience pool.";
  var insight = p1 ? (p1 + "</p><p class=\"rp-body\">" + p2) : p2;
  return `<section class="rp-page">
    ${renderSectionHeader("03", "Bottom of the Funnel", "Result Objectives", "The action layer. This is where warm audiences convert into measurable business outcomes, clicks to a landing page, followers, likes, app store visits, community reach, and qualified leads. Each subsection below reads only from campaigns whose objective matches that outcome, so per-platform rows never include a platform that never ran that objective.")}
    ${subsHtml}
    ${ecoBlock}
    ${renderInsight("Performance Insights", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: AUDIENCE (DEMOGRAPHICS)
// ═══════════════════════════════════════════════════════════════════

// 13-17 always excluded per owner spec — no client report surfaces
// the under-18 band. Applied at ingest time so no downstream reader
// has to remember to filter.
var EXCLUDED_AGES = { "13-17": true };
var ALLOWED_AGES = ["18-24","25-34","35-44","45-54","55-64","65+"];

// Click-weighted age/gender aggregation, mirrors the dashboard's
// buildPersona (App.jsx ~6295): every metric is weighted by clicks
// rather than impressions so the persona reads as "who leaned in",
// not "who was shown ads". Fixes TikTok reading "Results Attributed:
// 0" — clicks is the reliable click-through weight even on platforms
// where the demographics endpoint doesn't split results by age/gender.
function aggregateAgeGender(rows) {
  var byPlat = {};
  var ageBuckets = {};
  var genderBuckets = { male: 0, female: 0, unknown: 0 };
  (rows || []).forEach(function(r) {
    var age = String(r.age || "unknown");
    if (EXCLUDED_AGES[age]) return; // hard-drop 13-17 at ingest
    var p = platformFamily(r.platform || "Other");
    if (!byPlat[p]) byPlat[p] = { age: {}, gender: { male: 0, female: 0, unknown: 0 }, segMap: {}, impressions: 0, clicks: 0, spend: 0 };
    var bp = byPlat[p];
    var clicks = parseInt(r.clicks || 0, 10);
    var imps = parseInt(r.impressions || 0, 10);
    var rawGender = String(r.gender || "unknown").toLowerCase();
    var g = rawGender === "male" || rawGender === "m" ? "male" : rawGender === "female" || rawGender === "f" ? "female" : "unknown";
    ageBuckets[age] = (ageBuckets[age] || 0) + clicks;
    genderBuckets[g] += clicks;
    bp.age[age] = (bp.age[age] || 0) + clicks;
    bp.gender[g] += clicks;
    bp.impressions += imps;
    bp.clicks += clicks;
    bp.spend += parseFloat(r.spend || 0);
    // Age x Gender segment map for the "Best Personas" list. Only
    // classified cells (real age + real gender) contribute.
    if (ALLOWED_AGES.indexOf(age) >= 0 && (g === "male" || g === "female")) {
      var k = age + "|" + g;
      bp.segMap[k] = (bp.segMap[k] || 0) + clicks;
    }
  });
  return { byPlatform: byPlat, ageBuckets: ageBuckets, genderBuckets: genderBuckets };
}

function aggregateRegion(rows) {
  var byRegion = {};
  var byPlatformRegion = {};
  (rows || []).forEach(function(r) {
    var reg = String(r.region || "").trim();
    if (!reg || reg.toLowerCase() === "unknown") return;
    var p = platformFamily(r.platform || "Other");
    var clicks = parseInt(r.clicks || 0, 10);
    var imps = parseInt(r.impressions || 0, 10);
    if (!byRegion[reg]) byRegion[reg] = { impressions: 0, clicks: 0, spend: 0 };
    byRegion[reg].impressions += imps;
    byRegion[reg].clicks += clicks;
    byRegion[reg].spend += parseFloat(r.spend || 0);
    if (!byPlatformRegion[p]) byPlatformRegion[p] = {};
    byPlatformRegion[p][reg] = (byPlatformRegion[p][reg] || 0) + clicks;
  });
  return { byRegion: byRegion, byPlatformRegion: byPlatformRegion };
}

// Render the audience/demographics section. Persona cards mirror the
// dashboard's TargetingPersonaCard (App.jsx ~723): click-weighted
// dominant age + share, gender lead + share, top regions, top 3 age
// x gender segments. Every calculation excludes 13-17 (owner rule).
function renderAudienceSection(opts) {
  var demo = opts.demographics;
  if (!demo || (!Array.isArray(demo.ageGender) && !Array.isArray(demo.region))) return "";
  var agAgg = aggregateAgeGender(demo.ageGender || []);
  var regAgg = aggregateRegion(demo.region || []);

  // Persona per platform. Match dashboard's persona keys: only render
  // Facebook, Instagram, TikTok, Google Ads (in that order) and skip
  // any platform with zero click signal so a data-sparse platform
  // doesn't produce a hollow card.
  var personaOrder = ["Facebook", "Instagram", "TikTok", "Google Ads"];
  var personaCards = personaOrder.filter(function(p) {
    return agAgg.byPlatform[p] && agAgg.byPlatform[p].clicks > 0;
  }).map(function(p) {
    var pb = agAgg.byPlatform[p];
    var accent = platformAccent(p);
    // Dominant age (click-weighted). Already 13-17 free at ingest.
    var topAgeKey = "", topAgeVal = 0;
    Object.keys(pb.age).forEach(function(k) { if (pb.age[k] > topAgeVal) { topAgeVal = pb.age[k]; topAgeKey = k; } });
    var ageDenom = Object.keys(pb.age).reduce(function(s, k) { return s + pb.age[k]; }, 0);
    var topAgeShare = ageDenom > 0 ? (topAgeVal / ageDenom * 100) : 0;
    // Gender lead: female vs male share of classified gender.
    var gSum = pb.gender.male + pb.gender.female;
    var femaleShare = gSum > 0 ? (pb.gender.female / gSum * 100) : 0;
    var maleShare = gSum > 0 ? (pb.gender.male / gSum * 100) : 0;
    var genderLead = femaleShare > maleShare ? "Female" : (maleShare > 0 ? "Male" : "");
    var genderShare = Math.max(femaleShare, maleShare);
    // Top 2 regions for this platform.
    var pRegs = (regAgg.byPlatformRegion && regAgg.byPlatformRegion[p]) || {};
    var pRegKeys = Object.keys(pRegs).sort(function(a, b) { return pRegs[b] - pRegs[a]; }).slice(0, 3);
    var pRegDenom = Object.keys(pRegs).reduce(function(s, k) { return s + pRegs[k]; }, 0);
    var regionRows = pRegKeys.map(function(rk) {
      var share = pRegDenom > 0 ? (pRegs[rk] / pRegDenom * 100) : 0;
      return `<div class="rp-persona-region"><span class="rp-persona-region-name">${escapeHtmlLocal(rk)}</span><span class="rp-persona-region-share">${share.toFixed(2)}%</span></div>`;
    }).join("");
    // Top 3 age x gender segments (Best Personas).
    var segTotal = Object.keys(pb.segMap).reduce(function(s, k) { return s + pb.segMap[k]; }, 0);
    var segments = Object.keys(pb.segMap).map(function(k) {
      var parts = k.split("|");
      return { age: parts[0], gen: parts[1], val: pb.segMap[k], share: segTotal > 0 ? (pb.segMap[k] / segTotal * 100) : 0 };
    }).sort(function(a, b) { return b.val - a.val; }).slice(0, 3);
    var segRows = segments.map(function(s, i) {
      var label = s.age + " " + (s.gen === "female" ? "Female" : "Male");
      return `<div class="rp-persona-seg"><span class="rp-persona-seg-rank">${i + 1}</span><span class="rp-persona-seg-label">${escapeHtmlLocal(label)}</span><span class="rp-persona-seg-share">${s.share.toFixed(2)}%</span></div>`;
    }).join("");
    return `<div class="rp-persona" style="border-color:${accent}55;">
      <div class="rp-persona-plat" style="background:${accent};">${escapeHtmlLocal(p)}</div>
      <div class="rp-persona-hero">
        <div class="rp-persona-hero-age" style="color:${accent};">${escapeHtmlLocal(topAgeKey || "—")}</div>
        <div class="rp-persona-hero-caption">Dominant Age${topAgeKey ? " &middot; " + topAgeShare.toFixed(2) + "%" : ""}</div>
      </div>
      <div class="rp-persona-strip">
        <div class="rp-persona-strip-tile">
          <div class="rp-persona-strip-label">Gender Lead</div>
          <div class="rp-persona-strip-value">${escapeHtmlLocal(genderLead || "—")}</div>
          <div class="rp-persona-strip-sub" style="color:${accent};">${genderLead ? genderShare.toFixed(2) + "%" : ""}</div>
        </div>
        <div class="rp-persona-strip-tile">
          <div class="rp-persona-strip-label">Total Clicks</div>
          <div class="rp-persona-strip-value">${fmtNum(pb.clicks)}</div>
          <div class="rp-persona-strip-sub">click-weighted</div>
        </div>
      </div>
      ${regionRows ? `<div class="rp-persona-block-title">Top Regions</div><div class="rp-persona-regions">${regionRows}</div>` : ""}
      ${segRows ? `<div class="rp-persona-block-title" style="color:${accent};">Best Personas</div><div class="rp-persona-segs">${segRows}</div>` : ""}
    </div>`;
  }).join("");

  // Global age breakdown. Click-weighted, 13-17 excluded at ingest so
  // ageOrder here is display-only.
  var ageOrder = ["18-24","25-34","35-44","45-54","55-64","65+"];
  var ageTotal = ageOrder.reduce(function(s, k) { return s + (agAgg.ageBuckets[k] || 0); }, 0);
  var ageBars = ageOrder.filter(function(k) { return (agAgg.ageBuckets[k] || 0) > 0; }).map(function(k) {
    var v = agAgg.ageBuckets[k] || 0;
    var pct = ageTotal > 0 ? (v / ageTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#F96203,#FF3D00);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");

  // Region breakdown (top 8). Click-weighted.
  var regionKeys = Object.keys(regAgg.byRegion).sort(function(a, b) { return regAgg.byRegion[b].clicks - regAgg.byRegion[a].clicks; }).slice(0, 8);
  var regionTotal = regionKeys.reduce(function(s, k) { return s + regAgg.byRegion[k].clicks; }, 0);
  var regionBars = regionKeys.map(function(k) {
    var v = regAgg.byRegion[k].clicks;
    var pct = regionTotal > 0 ? (v / regionTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#4599FF,#00F2EA);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");

  var insight = "";
  if (regionKeys.length && ageOrder.some(function(k) { return agAgg.ageBuckets[k] > 0; })) {
    var topRegion = regionKeys[0];
    var topRegionPct = regionTotal > 0 ? (regAgg.byRegion[topRegion].clicks / regionTotal * 100) : 0;
    var topAgeKeyG = "", topAgeValG = 0;
    ageOrder.forEach(function(k) { if ((agAgg.ageBuckets[k] || 0) > topAgeValG) { topAgeValG = agAgg.ageBuckets[k]; topAgeKeyG = k; } });
    insight = "The perfect target audience for this window is anchored in " + escapeHtmlLocal(topRegion) + " (" + topRegionPct.toFixed(2) + "% of clicks) with the " + escapeHtmlLocal(topAgeKeyG) + " age band the most engaged demographic. Refining lookalikes and interest layers to reinforce this signal is likely to compound efficiency in the next window.";
  }

  return `<section class="rp-page">
    ${renderSectionHeader("04", "Perfect Target Audience", "Demographics &amp; Persona", "Who the campaigns actually reached, mapped per platform. The demographic signature below is the profile the algorithm has learned to serve, use it to sharpen creative, refine audience layers, and identify look-alike growth pools.")}
    <div class="rp-block">
      <div class="rp-block-title">Persona Per Platform</div>
      <div class="rp-persona-grid">${personaCards || `<div class="rp-empty">No per-platform demographic data returned for this window.</div>`}</div>
    </div>
    <div class="rp-block-double">
      <div class="rp-block">
        <div class="rp-block-title">Age Breakdown</div>
        <div class="rp-bars">${ageBars || `<div class="rp-empty">No age data available.</div>`}</div>
      </div>
      <div class="rp-block">
        <div class="rp-block-title">Region Breakdown (Top 8)</div>
        <div class="rp-bars">${regionBars || `<div class="rp-empty">No region data available.</div>`}</div>
      </div>
    </div>
    ${renderInsight("Audience Read", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: BEST PERFORMING ADS
// ═══════════════════════════════════════════════════════════════════

// Best Performing Ads — Top 5 per objective. Reads the raw (pre-
// platform-group) ad list attached by fetchTopAds(raw:true) so ads
// group by outcome (Leads / Clicks to App Store / Landing Page
// Clicks / Followers & Likes / Community Reach) rather than by
// platform. Matches the dashboard's Creative tab which lists best
// ads by objective, not by platform.
function renderTopAdsSection(opts) {
  var top = opts.topAds;
  // Prefer the raw list; fall back to flattening the legacy platform-
  // grouped shape if raw wasn't attached.
  var raw = (top && Array.isArray(top.raw) && top.raw.length) ? top.raw
    : (Array.isArray(top) ? top.reduce(function(acc, pl) { return acc.concat((pl && pl.ads) || []); }, []) : []);
  if (!raw.length) return "";
  var origin = opts.origin;
  var shareToken = opts.shareToken;
  // Group by DASHBOARD display objective (Leads / Followers & Likes /
  // Clicks to App Store / Landing Page Clicks / Community Reach)
  // using the same getObj() classifier the report uses everywhere.
  var buckets = {};
  raw.forEach(function(a) {
    var obj = getObj(a);
    if (!buckets[obj]) buckets[obj] = [];
    buckets[obj].push(a);
  });
  // Objective-appropriate result for ranking an ad. Community Reach
  // ranks on reach (unique users), Followers on follows+pageLikes,
  // App Store / LP on link clicks, Leads on lead count. Matches
  // getResult() semantics but at the ad level.
  var adResult = function(a, obj) {
    if (obj === "Leads") return parseFloat(a.leads || a.results || 0);
    if (obj === "Followers & Likes") return parseFloat(a.follows || 0) + parseFloat(a.pageLikes || 0);
    if (obj === "Community Reach") return parseFloat(a.reach || a.impressions || 0);
    return parseFloat(a.clicks || 0);
  };
  var resLabel = function(obj) {
    if (obj === "Leads") return "leads";
    if (obj === "Followers & Likes") return "follows";
    if (obj === "Community Reach") return "reached";
    if (obj === "Clicks to App Store") return "store clicks";
    if (obj === "Landing Page Clicks") return "LP clicks";
    return "clicks";
  };
  // Order objectives client-friendly: Leads > App Store > LP > Followers > Community Reach > Traffic (fallback).
  var displayOrder = ["Leads", "Clicks to App Store", "Landing Page Clicks", "Followers & Likes", "Community Reach", "Traffic"];
  var objBlocks = displayOrder.filter(function(obj) { return buckets[obj] && buckets[obj].length; }).map(function(obj) {
    var accent = obj === "Leads" ? "#F43F5E" : obj === "Clicks to App Store" ? "#4599FF" : obj === "Landing Page Clicks" ? "#00F2EA" : obj === "Followers & Likes" ? "#34D399" : obj === "Community Reach" ? "#FFAA00" : "#F96203";
    var ads = buckets[obj].slice().sort(function(a, b) {
      var ar = adResult(a, obj), br = adResult(b, obj);
      if (br !== ar) return br - ar;
      return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
    }).slice(0, 5);
    var cards = ads.map(function(a, i) {
      var thumb = resolveThumb(a, origin, shareToken, 120);
      var pAccent = platformAccent(platformFamily(a.platform));
      var result = adResult(a, obj);
      var spend = parseFloat(a.spend || 0);
      var ctr = parseFloat(a.ctr || 0);
      return `<div class="rp-creative-card">
        <div class="rp-creative-thumb" style="background:linear-gradient(135deg,${pAccent}55,${pAccent}15);">
          ${thumb ? `<img src="${escapeHtmlLocal(thumb)}" alt="" onerror="this.style.display='none'"/>` : `<div class="rp-creative-fallback">${escapeHtmlLocal(a.platform || "AD")}</div>`}
          <div class="rp-creative-rank" style="background:${accent};">#${i + 1}</div>
          <div class="rp-creative-plat" style="background:${pAccent};">${escapeHtmlLocal(a.platform || "")}</div>
        </div>
        <div class="rp-creative-body">
          <div class="rp-creative-name">${escapeHtmlLocal(a.adName || "Untitled")}</div>
          <div class="rp-creative-metrics">
            <div><strong>${fmtR(spend)}</strong> spent</div>
            <div><strong>${result > 0 ? fmtNum(result) : "-"}</strong> ${escapeHtmlLocal(resLabel(obj))}</div>
            <div><strong>${fmtPct(ctr)}</strong> CTR</div>
          </div>
        </div>
      </div>`;
    }).join("");
    return `<div class="rp-platform-block">
      <div class="rp-platform-head" style="border-left-color:${accent};color:${accent};">${escapeHtmlLocal(obj)}</div>
      <div class="rp-creative-grid">${cards}</div>
    </div>`;
  }).join("");
  return `<section class="rp-page">
    ${renderSectionHeader("05", "Creative Read", "Best Performing Ads", "The top 5 ads per campaign objective this window, ranked by their objective-appropriate outcome. Grouping by outcome rather than by platform surfaces the ads that actually moved each business metric.")}
    ${objBlocks}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: EXECUTIVE SUMMARY (moved to end, comprehensive)
// ═══════════════════════════════════════════════════════════════════

function renderExecutiveSummary(opts) {
  var book = opts.book;
  var g = book.global;
  var byObj = book.byObjective || {};
  var earnedTotal = opts.earnedTotal || 0;
  var totalFollows = earnedTotal > 0 ? earnedTotal : (byObj["Followers & Likes"] ? byObj["Followers & Likes"].global.result : 0);
  var totalLeads = byObj["Leads"] ? byObj["Leads"].global.result : 0;
  var totalApp = byObj["Clicks to App Store"] ? byObj["Clicks to App Store"].global.result : 0;
  var totalLp = byObj["Landing Page Clicks"] ? byObj["Landing Page Clicks"].global.result : 0;
  var totalSpend = book.byStage.tofu.spend + book.byStage.mofu.spend + book.byStage.bofu.spend;
  var stagePcts = {
    tofu: totalSpend > 0 ? (book.byStage.tofu.spend / totalSpend * 100) : 0,
    mofu: totalSpend > 0 ? (book.byStage.mofu.spend / totalSpend * 100) : 0,
    bofu: totalSpend > 0 ? (book.byStage.bofu.spend / totalSpend * 100) : 0
  };
  // Blended CTR mirrors dashboard's Summary tile (engagement-only,
  // awareness / community reach excluded per project semantics).
  var eng = book.engagement || { impressions: 0, clicks: 0, spend: 0 };
  var kpis = [
    { label: "Total Investment", value: fmtR(g.spend), primary: true },
    { label: "Impressions", value: fmtNum(g.impressions), sub: fmtNumDec(frequencyOf(g), 2) + "x frequency" },
    { label: "Reach", value: fmtNum(g.reach), sub: "unique users" },
    { label: "Blended CTR", value: fmtPct(engagementCtrOf(eng)), sub: "awareness excluded" }
  ];
  var narrative = [];
  narrative.push("Across " + fmtNum(g.campaignCount) + " campaign" + (g.campaignCount === 1 ? "" : "s") + ", " + fmtR(g.spend) + " was invested during " + escapeHtmlLocal(opts.periodDisplay) + ", generating " + fmtNum(g.impressions) + " impressions and " + fmtNum(g.reach) + " unique users reached at a blended " + fmtR(cpmOf(g)) + " CPM.");
  if (totalLeads > 0) narrative.push(fmtNum(totalLeads) + " qualified lead" + (totalLeads === 1 ? "" : "s") + " were captured at " + fmtR(g.spend > 0 ? g.spend / totalLeads : 0) + " per lead.");
  if (totalFollows > 0) narrative.push("The community earned " + fmtNum(totalFollows) + " new follower" + (totalFollows === 1 ? "" : "s") + " and page like" + (totalFollows === 1 ? "" : "s") + ", each representing a permanent organic distribution channel that compounds beyond the paid window.");
  if (totalApp > 0) narrative.push(fmtNum(totalApp) + " users clicked through to their app store to download the app.");
  if (totalLp > 0) narrative.push(fmtNum(totalLp) + " users clicked through to the destination landing page from traffic campaigns.");
  if (totalSpend > 0) narrative.push("The funnel investment split ran " + stagePcts.tofu.toFixed(1) + "% top of funnel (awareness), " + stagePcts.mofu.toFixed(1) + "% middle (consideration), and " + stagePcts.bofu.toFixed(1) + "% bottom (conversion).");
  return `<section class="rp-page">
    ${renderSectionHeader("06", "Executive Summary", "Period In Review", "A comprehensive read of the reporting window, the investment split across the funnel, and the measurable outcomes each stage delivered.")}
    <div class="rp-block">
      <div class="rp-block-title">Headline Metrics</div>
      ${renderKpiRow(kpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Funnel Investment Split</div>
      <div class="rp-block-caption">Where the budget was invested across the three stages of the customer journey and what each stage was structured to deliver.</div>
      <div class="rp-funnel-cards">
        <div class="rp-funnel-card" style="border-color:#F96203;">
          <div class="rp-funnel-card-eyebrow" style="color:#F96203;">Stage 01 &middot; Top of Funnel</div>
          <div class="rp-funnel-card-title">Awareness &amp; Reach</div>
          <div class="rp-funnel-card-role">Puts the brand in front of new eyes. Measured in impressions, reach, and cost of getting seen.</div>
          <div class="rp-funnel-card-num"><span class="rp-funnel-card-pct" style="color:#F96203;">${stagePcts.tofu.toFixed(1)}%</span><span class="rp-funnel-card-of">of budget</span></div>
          <div class="rp-funnel-card-spend">${fmtR(book.byStage.tofu.spend)}</div>
          <div class="rp-funnel-card-track"><div class="rp-funnel-card-fill" style="width:${stagePcts.tofu.toFixed(1)}%;background:linear-gradient(90deg,#F96203,#FF6B00);"></div></div>
          <div class="rp-funnel-card-result">Delivered <strong>${fmtNum(book.byStage.tofu.impressions)}</strong> impressions${book.byStage.tofu.reach > 0 ? " to " + fmtNum(book.byStage.tofu.reach) + " unique users" : ""}.</div>
        </div>
        <div class="rp-funnel-card" style="border-color:#FF6B00;">
          <div class="rp-funnel-card-eyebrow" style="color:#FF6B00;">Stage 02 &middot; Middle of Funnel</div>
          <div class="rp-funnel-card-title">Clicks &amp; Consideration</div>
          <div class="rp-funnel-card-role">Turns awareness into intent. Measured in click through rate, cost per click, and content engagement.</div>
          <div class="rp-funnel-card-num"><span class="rp-funnel-card-pct" style="color:#FF6B00;">${stagePcts.mofu.toFixed(1)}%</span><span class="rp-funnel-card-of">of budget</span></div>
          <div class="rp-funnel-card-spend">${fmtR(book.byStage.mofu.spend)}</div>
          <div class="rp-funnel-card-track"><div class="rp-funnel-card-fill" style="width:${stagePcts.mofu.toFixed(1)}%;background:linear-gradient(90deg,#FF6B00,#FF3D00);"></div></div>
          <div class="rp-funnel-card-result">Delivered <strong>${fmtNum(book.byStage.mofu.clicks)}</strong> clicks${book.byStage.mofu.impressions > 0 ? " at " + fmtPct(book.byStage.mofu.clicks / book.byStage.mofu.impressions * 100) + " CTR" : ""}.</div>
        </div>
        <div class="rp-funnel-card" style="border-color:#FF3D00;">
          <div class="rp-funnel-card-eyebrow" style="color:#FF3D00;">Stage 03 &middot; Bottom of Funnel</div>
          <div class="rp-funnel-card-title">Conversions &amp; Growth</div>
          <div class="rp-funnel-card-role">Turns intent into measurable business outcomes. Leads captured, app store clicks, followers gained, community reached.</div>
          <div class="rp-funnel-card-num"><span class="rp-funnel-card-pct" style="color:#FF3D00;">${stagePcts.bofu.toFixed(1)}%</span><span class="rp-funnel-card-of">of budget</span></div>
          <div class="rp-funnel-card-spend">${fmtR(book.byStage.bofu.spend)}</div>
          <div class="rp-funnel-card-track"><div class="rp-funnel-card-fill" style="width:${stagePcts.bofu.toFixed(1)}%;background:linear-gradient(90deg,#FF3D00,#F96203);"></div></div>
          <div class="rp-funnel-card-result">${(function(){var parts=[];if(totalLeads>0)parts.push(fmtNum(totalLeads)+" leads");if(totalFollows>0)parts.push("+"+fmtNum(totalFollows)+" community");if(totalApp>0)parts.push(fmtNum(totalApp)+" app store clicks");if(totalLp>0)parts.push(fmtNum(totalLp)+" landing page clicks");return parts.length?("Delivered <strong>"+parts.join("</strong>, <strong>")+"</strong>."):"No conversion outcomes recorded this window.";})()}</div>
        </div>
      </div>
      <div class="rp-funnel-callout">
        <div class="rp-funnel-callout-eyebrow">How To Read This</div>
        <p class="rp-body">A well balanced funnel keeps every stage healthy. Overweight the top and there is nowhere for the audience to convert. Overweight the bottom and the pool exhausts because there is no fresh awareness feeding it. The percentages above are the strategic ratio of the reporting window. The rand amounts and outcomes below each bar show what that ratio actually delivered on the ground.</p>
      </div>
    </div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Period Read</div>
      <p class="rp-body">${narrative.join(" ")}</p>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// CLOSING PAGE: A NOTE FROM OUR TEAM
// ═══════════════════════════════════════════════════════════════════

function renderClosingNote(opts) {
  var clientName = escapeHtmlLocal(opts.clientName || "Client");
  var senderNameRaw = String(opts.senderName || "").trim();
  var senderName = escapeHtmlLocal(senderNameRaw);
  var senderTitle = escapeHtmlLocal(opts.senderTitle || "");
  var origin = opts.origin || "https://media.gasmarketing.co.za";
  var agencyLogo = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var period = escapeHtmlLocal(opts.periodDisplay || "");
  // Sender-derived contact email so the client sees the person who
  // actually prepared the report, not the generic grow@ mailbox.
  // Firstname-lowercased-alphanumeric @ gasmarketing.co.za matches
  // the internal email convention. Falls back to grow@ when no
  // sender name is provided.
  var senderEmail = "grow@gasmarketing.co.za";
  if (senderNameRaw) {
    var firstToken = senderNameRaw.split(/\s+/)[0] || "";
    var handle = firstToken.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (handle.length >= 2) senderEmail = handle + "@gasmarketing.co.za";
  }
  var book = opts.book;
  var g = book.global;
  var earnedTotal = opts.earnedTotal || 0;
  var totalFollows = earnedTotal > 0 ? earnedTotal : (g.follows || 0) + (g.pageLikes || 0);
  var quickRecap = [];
  if (parseFloat(g.leads || 0) > 0) quickRecap.push(fmtNum(g.leads) + " leads");
  if (totalFollows > 0) quickRecap.push("+" + fmtNum(totalFollows) + " community");
  // Use raw clicks as the app-store metric to match Summary tApp.
  var appClicks = (book.byObjective && book.byObjective["Clicks to App Store"] && book.byObjective["Clicks to App Store"].global.result) || 0;
  if (appClicks > 0) quickRecap.push(fmtNum(appClicks) + " app store clicks");
  var lpClicks = (book.byObjective && book.byObjective["Landing Page Clicks"] && book.byObjective["Landing Page Clicks"].global.result) || 0;
  if (lpClicks > 0) quickRecap.push(fmtNum(lpClicks) + " landing page clicks");
  if (!quickRecap.length) quickRecap.push(fmtNum(g.impressions) + " impressions");
  // "Proceed to your Dashboard" CTA. Subtle button with 90-day token.
  // Only renders when a dashboard URL is available.
  var dashboardUrl = String(opts.dashboardUrl || "");
  var ctaBlock = dashboardUrl ? `<div class="rp-cta-block">
    <a class="rp-cta-btn" href="${escapeHtmlLocal(dashboardUrl)}">Proceed to Your Live Dashboard</a>
    <div class="rp-cta-note">Secure link, no login required. Active for 90 days.</div>
  </div>` : "";
  return `<section class="rp-page rp-signoff">
    <div class="rp-signoff-frame">
      <div class="rp-signoff-top">
        <img src="${agencyLogo}" alt="GAS Marketing" class="rp-signoff-emblem-logo"/>
        <div class="rp-signoff-eyebrow">A Note From Our Team</div>
      </div>
      <div class="rp-signoff-heart">
        <div class="rp-signoff-title">Thank You, ${clientName}</div>
        <p class="rp-signoff-body">This report reflects the data captured directly from the ad platforms at the moment it was generated. During <strong>${period}</strong>, together we delivered <strong>${quickRecap.join(", ")}</strong> on <strong>${fmtR(g.spend)}</strong> of media investment.</p>
        <p class="rp-signoff-body">Every metric in these pages is a signal of what worked, where the audience leaned in, and where the next window can compound. If you would like to explore any section deeper, the full interactive dashboard remains available to your team, or reach out directly and we will walk you through the read together.</p>
        ${ctaBlock}
      </div>
      <div class="rp-signoff-foot">
        <div class="rp-signoff-sender-block">
          <div class="rp-signoff-sender">${senderName || "The GAS Team"}</div>
          ${senderTitle ? `<div class="rp-signoff-sender-title">${senderTitle}</div>` : ""}
          <div class="rp-signoff-agency">GAS Marketing Automation</div>
        </div>
        <div class="rp-signoff-contact">
          <div>${escapeHtmlLocal(senderEmail)}</div>
          <div>${escapeHtmlLocal(origin.replace(/^https?:\/\//, ""))}</div>
        </div>
      </div>
      <div class="rp-signoff-bottom-band">Media On GAS &middot; Metrics That Matter</div>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY: buildReportHtml
// ═══════════════════════════════════════════════════════════════════

export function buildReportHtml(opts) {
  var clientName = String(opts.clientName || "Client");
  var periodDisplay = formatPeriod(opts.from, opts.to);
  var filenameSafeClient = clientName.replace(/[^A-Za-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "Client";
  var filenameSafePeriod = periodDisplay.replace(/[^A-Za-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  var docTitle = filenameSafeClient + "_" + filenameSafePeriod + "_Report";

  // Precompute the aggregation once. Pages threaded through so the
  // Followers & Likes bucket uses the dashboard's IG-snapshot fallback
  // for zero-attribution IG campaigns.
  var campaignsList = (opts.summary && opts.summary.campaigns) || [];
  var pagesList = opts.pages || [];
  var book = aggregateBook(campaignsList, pagesList);
  // Whole-account earnedTotal for the Followers & Likes headline.
  // Matches dashboard's ovEarnedTotal override so Summary and Report
  // agree on the community number.
  var earnedTotal = computeEarnedTotal(campaignsList, pagesList);

  var contentOpts = Object.assign({}, opts, {
    clientName: clientName,
    periodDisplay: periodDisplay,
    book: book,
    earnedTotal: earnedTotal
  });

  var pages = [
    renderCoverPage(contentOpts),
    renderTofuSection(contentOpts),
    renderMofuSection(contentOpts),
    renderBofuSection(contentOpts),
    renderAudienceSection(contentOpts),
    renderTopAdsSection(contentOpts),
    renderExecutiveSummary(contentOpts),
    renderClosingNote(contentOpts)
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtmlLocal(docTitle)}</title>
<style>
:root {
  --rp-bg: #0B121C;
  --rp-bg2: #101C2A;
  --rp-fg: #FFFBF8;
  --rp-fg-dim: rgba(255,251,248,0.78);
  --rp-fg-mute: rgba(255,251,248,0.55);
  --rp-accent: #F96203;
  --rp-accent2: #FF3D00;
  --rp-accent3: #FF6B00;
  --rp-line: rgba(255,255,255,0.09);
  --rp-line-strong: rgba(249,98,3,0.42);
  --rp-card: rgba(255,255,255,0.03);
  --rp-card-strong: rgba(0,0,0,0.28);
  /* Font stack — Arial with Helvetica fallback for cross-OS rendering.
     Deliberately NO serif anywhere per owner brief: corporate look and
     feel comes from weighting alone (400 body, 700 emphasis, 900 for
     display headings). */
  --rp-font: Arial, "Helvetica Neue", Helvetica, sans-serif;
}
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: var(--rp-bg); color: var(--rp-fg); font-family: var(--rp-font); -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-font-smoothing: antialiased; font-weight: 400; }
* { box-sizing: border-box; }
img { max-width: 100%; display: block; }

.rp-page {
  width: 210mm;
  min-height: 297mm;
  padding: 20mm 20mm;
  background: linear-gradient(170deg, var(--rp-bg) 0%, var(--rp-bg2) 100%);
  page-break-after: always;
  break-after: page;
  position: relative;
  overflow: hidden;
}
.rp-page:last-child { page-break-after: auto; break-after: auto; }

/* ─────────────── COVER ─────────────── */
.rp-cover {
  padding: 0;
  background: linear-gradient(155deg, #06020e 0%, #0B121C 45%, #131a2c 100%);
  min-height: 297mm;
  position: relative;
}
.rp-cover::before {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 60%; height: 60%;
  background: radial-gradient(circle at top right, rgba(249,98,3,0.16), transparent 65%);
  pointer-events: none;
}
.rp-cover::after {
  content: "";
  position: absolute;
  bottom: 0; left: 0;
  width: 50%; height: 45%;
  background: radial-gradient(circle at bottom left, rgba(255,61,0,0.10), transparent 60%);
  pointer-events: none;
}
.rp-cover-frame {
  position: relative;
  z-index: 1;
  padding: 26mm 24mm;
  display: flex;
  flex-direction: column;
  height: 297mm;
}
.rp-cover-top { display: flex; flex-direction: column; align-items: flex-start; }
.rp-cover-logo { max-width: 50mm; max-height: 28mm; object-fit: contain; margin-bottom: 8mm; }
.rp-cover-fallback-name { font-family: var(--rp-font); font-size: 28pt; letter-spacing: -0.5px; font-weight: 900; color: var(--rp-fg); margin-bottom: 8mm; }
/* Orange rule under the logo intentionally removed per owner feedback,
   the composition reads cleaner without it. */
.rp-cover-heart { margin-top: auto; margin-bottom: auto; padding: 20mm 0; }
.rp-cover-eyebrow { font-size: 14pt; letter-spacing: 7px; text-transform: uppercase; color: var(--rp-accent); font-weight: 900; margin-bottom: 10mm; }
.rp-cover-title { font-family: var(--rp-font); font-size: 52pt; font-weight: 900; letter-spacing: -1.5px; line-height: 1; color: var(--rp-fg); margin-bottom: 4mm; word-break: break-word; }
.rp-cover-title-sub { font-family: var(--rp-font); font-size: 18pt; font-weight: 400; letter-spacing: 1px; color: var(--rp-fg-dim); margin-bottom: 14mm; }
.rp-cover-period { font-size: 12pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; }
.rp-cover-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 12mm; border-top: 1px solid var(--rp-line); }
.rp-cover-foot-left, .rp-cover-foot-right { display: flex; flex-direction: column; gap: 2mm; }
.rp-cover-foot-right { align-items: flex-end; text-align: right; }
.rp-cover-agency-logo { width: 14mm; height: 14mm; border-radius: 50%; box-shadow: 0 0 8mm rgba(249,98,3,0.28); margin-bottom: 3mm; }
.rp-cover-label { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; }
.rp-cover-sender { font-size: 13pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-font); }
.rp-cover-sender-title { font-size: 10pt; color: var(--rp-fg-dim); font-style: italic; }
.rp-cover-agency-label { font-size: 12pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-font); }
.rp-cover-agency-sub { font-size: 8pt; letter-spacing: 3px; color: var(--rp-accent); font-weight: 800; text-transform: uppercase; }

/* ─────────────── SECTION HEADER ─────────────── */
.rp-section-head { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 8mm; padding-bottom: 6mm; border-bottom: 1px solid var(--rp-line); }
.rp-section-num { font-family: var(--rp-font); font-size: 32pt; font-weight: 700; color: var(--rp-accent); line-height: 1; letter-spacing: -1px; min-width: 20mm; }
.rp-section-headline { flex: 1; }
.rp-section-eyebrow { font-size: 8pt; letter-spacing: 4px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-h1 { font-family: var(--rp-font); font-size: 26pt; font-weight: 700; letter-spacing: -0.8px; line-height: 1.1; color: var(--rp-fg); margin: 0 0 4mm 0; }
.rp-lede { font-size: 10.5pt; color: var(--rp-fg-dim); line-height: 1.6; max-width: 155mm; font-style: italic; }

/* ─────────────── BLOCKS ─────────────── */
.rp-block { margin-bottom: 8mm; page-break-inside: avoid; }
.rp-block-title { font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 4mm; }
.rp-block-double { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm; }

/* ─────────────── KPI GRID ─────────────── */
.rp-kpi-grid { display: grid; gap: 3mm; margin-bottom: 4mm; page-break-inside: avoid; }
.rp-kpi { padding: 5mm 3mm; background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; min-width: 0; overflow: hidden; }
.rp-kpi-primary { border-color: var(--rp-line-strong); background: linear-gradient(140deg, rgba(249,98,3,0.14), var(--rp-card-strong)); }
.rp-kpi-label { font-size: 7.5pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 900; margin-bottom: 3mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Values MUST stay on a single line. Owner has had it wrap TWICE now
   ("6 349 5\n91" and "R62 54\n0,85"). Belt-and-braces here — nowrap
   with !important so no cascade or inline style can override, shrink
   font to 13pt so worst-case currency like "R1 234 567,89" fits the
   32mm tile content width, negative letter-spacing pulls glyphs
   closer, and container overflow hidden means the tile boundary
   truly acts as a clip so no rogue character can push the layout. */
.rp-kpi-value { font-family: var(--rp-font); font-size: 12pt; font-weight: 900; color: var(--rp-fg); line-height: 1.15; letter-spacing: -0.4px; font-variant-numeric: tabular-nums; white-space: nowrap !important; word-break: keep-all !important; overflow-wrap: normal !important; overflow: hidden; text-overflow: clip; max-width: 100%; display: block; }
.rp-kpi-primary .rp-kpi-value { color: var(--rp-accent); }
.rp-kpi-sub { font-size: 8.5pt; color: var(--rp-fg-mute); margin-top: 3mm; letter-spacing: 0.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ─────────────── INSIGHT / NARRATIVE ─────────────── */
.rp-insight { margin-top: 6mm; padding: 5mm 6mm; background: linear-gradient(140deg, rgba(249,98,3,0.06), var(--rp-card)); border-left: 3px solid var(--rp-accent); border-radius: 0 3mm 3mm 0; page-break-inside: avoid; }
.rp-insight-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-narrative { margin-top: 6mm; padding: 5mm 6mm; background: var(--rp-card-strong); border-radius: 3mm; border-left: 3px solid var(--rp-accent); page-break-inside: avoid; }
.rp-narrative-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-body { font-size: 10pt; color: var(--rp-fg-dim); line-height: 1.7; margin: 0; }

/* ─────────────── TABLES ─────────────── */
/* table-layout: fixed guarantees the table can NEVER exceed 100%
   of the page width, so a long header cannot push a column off the
   page (Section 01 "COST / 1K SERV" bug). Header cells wrap to two
   lines rather than clipping when they truly cannot fit. */
.rp-table { width: 100%; max-width: 100%; border-collapse: collapse; background: var(--rp-card-strong); border-radius: 3mm; overflow: hidden; font-size: 10.5pt; table-layout: fixed; }
.rp-table-wide { font-size: 10pt; }
.rp-table th { padding: 3.2mm 2mm; text-align: center; font-size: 8pt; letter-spacing: 1px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 900; border-bottom: 1px solid rgba(249,98,3,0.24); background: rgba(249,98,3,0.08); vertical-align: middle; white-space: normal; word-break: break-word; }
/* Column 1 (platform / campaign) is left-aligned; every other column
   centre-aligns per owner style spec so the table reads corporate.
   With table-layout: fixed above, the platform column gets an explicit
   26mm width so it fits the pill without being forced to equal-share
   with the numeric columns. */
.rp-table th.rp-th-name { text-align: left; width: 26mm; }
.rp-th-num, .rp-th-center { text-align: center; }
.rp-th-rank { text-align: center; width: 8mm; }
.rp-table td { padding: 3.5mm 3mm; border-bottom: 1px solid rgba(255,255,255,0.06); color: var(--rp-fg); vertical-align: middle; font-variant-numeric: tabular-nums; text-align: center; font-weight: 500; }
.rp-table td.rp-td-name { text-align: left; font-weight: 500; }
.rp-table tbody tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.rp-td-num, .rp-td-center { text-align: center; }
.rp-td-sub { color: var(--rp-fg-mute); font-size: 9pt; }
/* Pills stay compact per owner brief — table font grew a notch but
   the platform chip must keep the same visual weight. nowrap keeps
   "Google Ads" on a single line inside the pill. */
.rp-plat-chip { display: inline-block; padding: 1.4mm 3.5mm; font-size: 7.5pt; font-weight: 900; color: #fff; border-radius: 2px; letter-spacing: 1px; vertical-align: middle; white-space: nowrap; }
.rp-empty { padding: 5mm; text-align: center; color: var(--rp-fg-mute); font-style: italic; background: var(--rp-card); border-radius: 3mm; font-size: 10pt; }

/* ─────────────── BOFU SUBSECTIONS ─────────────── */
.rp-bofu-sub { margin-bottom: 8mm; padding: 5mm 6mm; background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; }
.rp-bofu-sub-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; }
.rp-bofu-sub-title { font-family: var(--rp-font); font-size: 14pt; font-weight: 700; color: var(--rp-fg); letter-spacing: -0.3px; }
.rp-bofu-sub-total { font-family: var(--rp-font); font-size: 22pt; font-weight: 700; color: var(--rp-accent); letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.rp-bofu-sub-desc { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 3mm; font-style: italic; }
.rp-bofu-sub-costline { font-size: 9pt; color: var(--rp-fg-mute); margin-bottom: 4mm; letter-spacing: 0.5px; }
.rp-bofu-sub-costline strong { color: var(--rp-fg); font-weight: 800; }
.rp-bofu-eco { border-left: 3px solid var(--rp-accent2); }
.rp-eco-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 3mm; }
.rp-eco-tile { padding: 3mm; background: rgba(0,0,0,0.28); border-radius: 2mm; text-align: center; }
.rp-eco-label { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; margin-bottom: 2mm; }
.rp-eco-value { font-family: var(--rp-font); font-size: 15pt; font-weight: 700; color: var(--rp-fg); font-variant-numeric: tabular-nums; }

/* ─────────────── PERSONA (audience) ─────────────── */
/* Rewritten to mirror dashboard TargetingPersonaCard: hero dominant
   age, gender + click-share strip, top regions list, best age x
   gender segments. 2-column grid so up to 4 platforms fit the page. */
.rp-persona-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
.rp-persona { border: 1px solid var(--rp-line); background: var(--rp-card-strong); border-radius: 3mm; overflow: hidden; page-break-inside: avoid; display: flex; flex-direction: column; }
.rp-persona-plat { padding: 2.5mm 4mm; font-size: 10pt; font-weight: 900; color: #fff; letter-spacing: 2px; text-transform: uppercase; }
.rp-persona-hero { padding: 4mm 4mm 3mm; text-align: center; border-bottom: 1px solid var(--rp-line); }
.rp-persona-hero-age { font-size: 30pt; font-weight: 900; letter-spacing: -1px; line-height: 1; font-variant-numeric: tabular-nums; }
.rp-persona-hero-caption { font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 800; margin-top: 3mm; }
.rp-persona-strip { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; padding: 3mm 4mm 3mm; border-bottom: 1px solid var(--rp-line); }
.rp-persona-strip-tile { background: rgba(0,0,0,0.25); border-radius: 2mm; padding: 3mm; text-align: center; }
.rp-persona-strip-label { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 800; margin-bottom: 2mm; }
.rp-persona-strip-value { font-size: 11pt; font-weight: 900; color: var(--rp-fg); font-variant-numeric: tabular-nums; }
.rp-persona-strip-sub { font-size: 8pt; margin-top: 1mm; color: var(--rp-fg-mute); font-weight: 700; }
.rp-persona-block-title { padding: 3mm 4mm 2mm; font-size: 7.5pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 900; }
.rp-persona-regions { padding: 0 4mm 2mm; }
.rp-persona-region { display: flex; justify-content: space-between; align-items: baseline; padding: 1.6mm 0; border-bottom: 1px dotted var(--rp-line); font-size: 9pt; }
.rp-persona-region:last-child { border-bottom: 0; }
.rp-persona-region-name { color: var(--rp-fg); font-weight: 700; }
.rp-persona-region-share { color: var(--rp-accent); font-weight: 900; font-variant-numeric: tabular-nums; }
.rp-persona-segs { padding: 0 4mm 4mm; margin-top: auto; }
.rp-persona-seg { display: grid; grid-template-columns: 6mm 1fr auto; gap: 2mm; align-items: baseline; padding: 1.6mm 0; border-bottom: 1px dotted var(--rp-line); font-size: 9pt; }
.rp-persona-seg:last-child { border-bottom: 0; }
.rp-persona-seg-rank { width: 5mm; height: 5mm; border-radius: 50%; background: rgba(249,98,3,0.20); color: var(--rp-fg); font-size: 7.5pt; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; }
.rp-persona-seg-label { color: var(--rp-fg); font-weight: 700; }
.rp-persona-seg-share { color: var(--rp-accent); font-weight: 900; font-variant-numeric: tabular-nums; }

/* Bars (age / region) */
.rp-bars { display: flex; flex-direction: column; gap: 2.5mm; }
.rp-bar-row { display: grid; grid-template-columns: 28mm 1fr 32mm; align-items: center; gap: 3mm; font-size: 9pt; }
.rp-bar-label { color: var(--rp-fg); font-weight: 700; letter-spacing: 0.3px; }
.rp-bar-track { height: 4mm; background: rgba(0,0,0,0.35); border-radius: 2mm; overflow: hidden; }
.rp-bar-fill { height: 100%; border-radius: 2mm; }
.rp-bar-value { text-align: right; color: var(--rp-fg-dim); font-variant-numeric: tabular-nums; font-size: 8.5pt; }
.rp-bar-pct { color: var(--rp-accent); font-weight: 700; margin-left: 1mm; }

/* ─────────────── CREATIVE ─────────────── */
.rp-platform-block { margin-bottom: 10mm; page-break-inside: avoid; }
.rp-platform-head { border-left: 3px solid; padding-left: 4mm; font-size: 12pt; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase; margin-bottom: 5mm; }
.rp-creative-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; }
.rp-creative-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; }
.rp-creative-thumb { position: relative; width: 100%; padding-top: 100%; }
.rp-creative-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rp-creative-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 8pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
.rp-creative-rank { position: absolute; top: 2mm; left: 2mm; padding: 1mm 2.5mm; color: #fff; font-size: 7.5pt; font-weight: 900; border-radius: 2mm; letter-spacing: 0.5px; }
/* Platform badge, top-right of thumbnail. Objective grouping shows
   ads from any platform in the same block, so per-card platform
   label makes it obvious at a glance. */
.rp-creative-plat { position: absolute; top: 2mm; right: 2mm; padding: 1mm 2.5mm; color: #fff; font-size: 6.5pt; font-weight: 900; border-radius: 2mm; letter-spacing: 1px; text-transform: uppercase; }
/* Card body must give the ad name enough room to render on two lines
   without being clipped, plus the metrics stack below with breathing
   room. Earlier the max-height on the name squashed the ad-title on
   longer names. */
.rp-creative-body { padding: 3.5mm 3.5mm 3.5mm; display: flex; flex-direction: column; gap: 3mm; min-height: 24mm; }
.rp-creative-name { font-size: 9pt; font-weight: 800; color: var(--rp-fg); line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; }
.rp-creative-metrics { display: flex; flex-direction: column; gap: 1.4mm; font-size: 8pt; color: var(--rp-fg-dim); margin-top: auto; }
.rp-creative-metrics strong { color: var(--rp-accent); font-weight: 900; font-variant-numeric: tabular-nums; }

/* ─────────────── FUNNEL CARDS (executive summary) ─────────────── */
/* Replaces the old inline row bars. Three side-by-side cards, one
   per funnel stage, with role explanation, percentage of budget,
   rand spend, mini fill bar, and what that stage actually delivered.
   Reads clearly for a marketing team without pre-context. */
.rp-block-caption { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 5mm; font-style: italic; }
.rp-funnel-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; page-break-inside: avoid; }
.rp-funnel-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-left: 3px solid; border-radius: 3mm; padding: 4mm; display: flex; flex-direction: column; gap: 2.5mm; page-break-inside: avoid; }
.rp-funnel-card-eyebrow { font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; font-weight: 900; }
.rp-funnel-card-title { font-size: 11pt; font-weight: 900; color: var(--rp-fg); line-height: 1.2; }
.rp-funnel-card-role { font-size: 8.5pt; color: var(--rp-fg-dim); line-height: 1.5; font-style: italic; min-height: 15mm; }
.rp-funnel-card-num { display: flex; align-items: baseline; gap: 2mm; padding-top: 2mm; border-top: 1px solid var(--rp-line); }
.rp-funnel-card-pct { font-size: 20pt; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; letter-spacing: -0.5px; }
.rp-funnel-card-of { font-size: 8pt; color: var(--rp-fg-mute); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
.rp-funnel-card-spend { font-size: 11pt; color: var(--rp-fg); font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.2px; }
.rp-funnel-card-track { height: 3mm; background: rgba(0,0,0,0.35); border-radius: 1.5mm; overflow: hidden; }
.rp-funnel-card-fill { height: 100%; border-radius: 1.5mm; }
.rp-funnel-card-result { font-size: 9pt; color: var(--rp-fg-dim); line-height: 1.55; }
.rp-funnel-card-result strong { color: var(--rp-fg); font-weight: 800; }
.rp-funnel-callout { margin-top: 5mm; padding: 4mm 5mm; background: rgba(249,98,3,0.05); border-left: 3px solid var(--rp-accent); border-radius: 0 3mm 3mm 0; }
.rp-funnel-callout-eyebrow { font-size: 8pt; letter-spacing: 2.5px; text-transform: uppercase; color: var(--rp-accent); font-weight: 900; margin-bottom: 2.5mm; }

/* Legacy funnel-splits selectors kept in case older cached HTML pages
   are still served — harmless to include. */
/* Widths tightened so long money strings like "R1,234,567.89" fit
   inside the value column without spilling into the page margin
   (previously the value overflowed the pill on the executive summary
   page and read as "goes over the page"). */
.rp-funnel-splits { display: flex; flex-direction: column; gap: 3mm; page-break-inside: avoid; }
.rp-funnel-splits-row { display: grid; grid-template-columns: 62mm 1fr 42mm; gap: 3mm; align-items: center; }
.rp-funnel-splits-label { font-size: 10pt; color: var(--rp-fg); font-weight: 700; }
.rp-funnel-splits-track { height: 6mm; background: rgba(0,0,0,0.35); border-radius: 3mm; overflow: hidden; }
.rp-funnel-splits-fill { height: 100%; border-radius: 3mm; }
.rp-funnel-splits-value { text-align: right; font-family: var(--rp-font); font-size: 13pt; font-weight: 900; color: var(--rp-accent); font-variant-numeric: tabular-nums; line-height: 1.1; word-break: break-word; }
.rp-funnel-splits-sub { display: block; font-family: var(--rp-font); font-size: 8pt; color: var(--rp-fg-mute); font-weight: 500; letter-spacing: 0.5px; margin-top: 1mm; }

/* ─────────────── SIGN-OFF ─────────────── */
.rp-signoff {
  padding: 0;
  background: linear-gradient(155deg, #06020e 0%, #0B121C 45%, #131a2c 100%);
  min-height: 297mm;
  position: relative;
}
.rp-signoff::before {
  content: "";
  position: absolute;
  top: 0; left: 0;
  width: 60%; height: 60%;
  background: radial-gradient(circle at top left, rgba(249,98,3,0.16), transparent 65%);
  pointer-events: none;
}
.rp-signoff::after {
  content: "";
  position: absolute;
  bottom: 0; right: 0;
  width: 50%; height: 45%;
  background: radial-gradient(circle at bottom right, rgba(255,61,0,0.10), transparent 60%);
  pointer-events: none;
}
.rp-signoff-frame { position: relative; z-index: 1; padding: 28mm 28mm; display: flex; flex-direction: column; height: 297mm; }
.rp-signoff-top { display: flex; flex-direction: column; align-items: flex-start; gap: 6mm; }
.rp-signoff-emblem-logo { width: 18mm; height: 18mm; border-radius: 50%; box-shadow: 0 0 10mm rgba(249,98,3,0.35); }
.rp-signoff-eyebrow { font-size: 9pt; letter-spacing: 6px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; }
.rp-signoff-heart { margin-top: auto; margin-bottom: auto; padding: 20mm 0; max-width: 150mm; }
.rp-signoff-title { font-family: var(--rp-font); font-size: 38pt; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--rp-fg); margin-bottom: 10mm; }
.rp-signoff-body { font-size: 11.5pt; color: var(--rp-fg-dim); line-height: 1.8; margin-bottom: 6mm; }
.rp-signoff-body strong { color: var(--rp-fg); font-weight: 700; }
.rp-signoff-foot { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10mm; border-top: 1px solid var(--rp-line); margin-top: auto; }
.rp-signoff-sender-block { display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-sender { font-family: var(--rp-font); font-size: 15pt; font-weight: 700; color: var(--rp-fg); }
.rp-signoff-sender-title { font-size: 10pt; color: var(--rp-fg-dim); font-style: italic; }
.rp-signoff-agency { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }
.rp-signoff-contact { text-align: right; font-size: 9pt; color: var(--rp-fg-mute); display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-emblem { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }
/* Closing-page emblem band. Pulled out of the contact column and pinned
   near the physical bottom of the page, larger + more presence per
   owner spec. Sits below the sender/contact foot with breathing room. */
.rp-signoff-bottom-band { margin-top: 10mm; padding: 6mm 0 0; border-top: 1px solid var(--rp-line); font-size: 14pt; letter-spacing: 8px; text-transform: uppercase; color: var(--rp-accent); font-weight: 900; text-align: center; }

/* Closing-page CTA. Subtle glass button with a warm accent border and
   an underline-style caption so it reads corporate, not marketing. */
.rp-cta-block { margin-top: 10mm; padding: 8mm 0 0; border-top: 1px solid var(--rp-line); }
.rp-cta-btn { display: inline-block; padding: 4mm 10mm; background: linear-gradient(135deg, rgba(249,98,3,0.14), rgba(255,61,0,0.06)); border: 1px solid var(--rp-line-strong); border-radius: 2mm; color: var(--rp-fg); font-size: 11pt; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; text-decoration: none; box-shadow: 0 4mm 12mm rgba(249,98,3,0.10); }
.rp-cta-btn:hover { background: linear-gradient(135deg, rgba(249,98,3,0.22), rgba(255,61,0,0.10)); }
.rp-cta-note { margin-top: 4mm; font-size: 9pt; color: var(--rp-fg-mute); letter-spacing: 1px; font-weight: 500; }

/* Print rules */
@media print {
  html, body { background: var(--rp-bg) !important; }
  .rp-page { margin: 0; box-shadow: none; }
}
</style>
</head>
<body>
${pages}
<script>
// Print trigger lives INSIDE the child window so it fires
// independently of the parent — earlier we scheduled window.print()
// from the parent's setTimeout, and if the operator navigated the
// dashboard tab away or closed the modal before the 900ms delay
// elapsed, the timer was cancelled and the popup sat unprinted
// (which read as "bombed out"). Now the popup is self-sufficient.
// waitForImages: we resolve when every <img> has loaded OR errored
// so a slow ad-image proxy doesn't hold the print dialog hostage.
(function(){
  var printed = false;
  function doPrint(){
    if (printed) return;
    printed = true;
    try { window.focus(); window.print(); } catch(_) {}
  }
  function whenImagesReady(cb, timeoutMs){
    var imgs = Array.prototype.slice.call(document.images || []);
    if (!imgs.length) { cb(); return; }
    var remaining = imgs.length;
    var done = false;
    function tick(){ if (--remaining <= 0 && !done) { done = true; cb(); } }
    imgs.forEach(function(img){
      if (img.complete) { tick(); return; }
      img.addEventListener("load", tick, { once: true });
      img.addEventListener("error", tick, { once: true });
    });
    // Hard ceiling: even if a thumbnail never resolves, print anyway.
    setTimeout(function(){ if (!done) { done = true; cb(); } }, timeoutMs || 4000);
  }
  function start(){
    // Small settle delay for layout + font metrics before the print
    // dialog snapshots the document.
    whenImagesReady(function(){ setTimeout(doPrint, 300); }, 4000);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
</script>
</body>
</html>`;
}
