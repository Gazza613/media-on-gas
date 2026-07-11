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

// Aggregate metrics across a list of campaigns into a global + per-
// platform breakdown, plus per-funnel-stage totals.
function aggregateBook(campaigns) {
  var empty = function() {
    return { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, follows: 0, pageLikes: 0, appInstalls: 0, landingPageViews: 0, campaignCount: 0 };
  };
  var book = { global: empty(), byPlatform: {}, byStage: { tofu: empty(), mofu: empty(), bofu: empty() } };
  book.byPlatformStage = { tofu: {}, mofu: {}, bofu: {} };
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
      b.appInstalls += parseFloat(c.appStoreClicks || c.appInstalls || 0);
      b.landingPageViews += parseFloat(c.landingPageViews || 0);
      b.campaignCount += 1;
    });
  });
  return book;
}

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
  if (fY === tY) return MONTHS[fM] + " " + fD + " – " + MONTHS[tM] + " " + tD + ", " + fY;
  return MONTHS[fM] + " " + fD + ", " + fY + " – " + MONTHS[tM] + " " + tD + ", " + tY;
}

// Ad thumbnail resolver. Uses /api/ad-image proxy for Meta + TikTok
// so signed CDN URL expiry (~1hr for Meta, unpredictable for TikTok)
// doesn't produce broken images when the PDF is opened. Requires a
// shareToken; without one, falls back to raw thumbnail (which may
// break for TikTok but still displays for Meta if URL is fresh).
function resolveThumb(ad, origin, shareToken, size) {
  var w = size || 120;
  var pl = String((ad && ad.platform) || "").toLowerCase();
  var pk = (pl.indexOf("facebook") >= 0 || pl.indexOf("instagram") >= 0) ? "meta" : (pl.indexOf("tiktok") >= 0 ? "tiktok" : "");
  if (pk && ad && ad.adId && origin && shareToken) {
    var cid = String(ad.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    var win = (String(ad.format || "").toUpperCase() === "MIXED" || ad.multiCreative) ? "&winner=1" : "";
    return origin + "/api/ad-image?platform=" + pk + "&adId=" + encodeURIComponent(ad.adId) + (cid ? ("&campaignId=" + encodeURIComponent(cid)) : "") + win + "&raw=1&token=" + shareToken;
  }
  if (ad && ad.thumbnail && String(ad.thumbnail).indexOf("http") === 0) return ad.thumbnail;
  return "";
}

// ═══════════════════════════════════════════════════════════════════
// KPI TILE + PLATFORM TABLE PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

function renderKpiRow(kpis) {
  var kHtml = kpis.map(function(k) {
    return `<div class="rp-kpi ${k.primary ? "rp-kpi-primary" : ""}">
      <div class="rp-kpi-label">${escapeHtmlLocal(k.label)}</div>
      <div class="rp-kpi-value">${escapeHtmlLocal(k.value)}</div>
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
      var v = c.compute ? c.compute(b) : (b[c.key] || 0);
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
        <div class="rp-cover-rule"></div>
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
    { label: "Frequency", value: fmtNumDec(frequencyOf(g), 2) + "×", sub: "per user" },
    { label: "Blended CPM", value: fmtR(cpmOf(g)), sub: "cost per 1,000" }
  ];
  var columns = [
    { key: "platform", label: "Platform", align: "left" },
    { key: "impressions", label: "Impressions", format: "int" },
    { key: "reach", label: "Reach", format: "int" },
    { key: "freq", label: "Frequency", format: "freq", compute: frequencyOf },
    { key: "cpm", label: "CPM", format: "R", compute: cpmOf },
    { key: "spend", label: "Spend", format: "R" },
    { key: "cpad", label: "Cost / 1K Ads Served", format: "R", compute: cpmOf }
  ];
  // Auto-insight
  var insight = "";
  var platforms = Object.keys(book.byPlatform).sort(function(a, b) { return book.byPlatform[b].spend - book.byPlatform[a].spend; });
  if (platforms.length) {
    var lead = platforms[0];
    var leadImps = book.byPlatform[lead].impressions;
    var leadReach = book.byPlatform[lead].reach;
    var globalFreq = frequencyOf(g);
    var freqNote = globalFreq > 4 ? " Global frequency at " + fmtNumDec(globalFreq, 2) + "× has crossed the 4× fatigue ceiling; audience expansion is recommended before the next window." : globalFreq > 3 ? " Global frequency of " + fmtNumDec(globalFreq, 2) + "× sits in the healthy recall band, balancing memory building with efficient reach." : globalFreq > 0 ? " Global frequency at " + fmtNumDec(globalFreq, 2) + "× suggests headroom in the audience — expanded reach investment can compound recognition without saturation." : "";
    insight = `${escapeHtmlLocal(lead)} carried the largest share of ad delivery this period with ${fmtNum(leadImps)} impressions reaching ${fmtNum(leadReach)} unique users at ${fmtR(cpmOf(book.byPlatform[lead]))} CPM.${freqNote}`;
  }
  return `<section class="rp-page">
    ${renderSectionHeader("01", "Top of the Funnel", "Ads Served", "Awareness delivery. This is the layer that plants the brand in the audience's memory ahead of a decision moment. Success is measured in efficient reach and controlled frequency, not clicks.")}
    <div class="rp-block">
      <div class="rp-block-title">Global Delivery Headlines</div>
      ${renderKpiRow(globalKpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Per Platform Delivery Breakdown</div>
      ${renderPlatformTable(book.byPlatform, columns)}
    </div>
    ${renderInsight("Delivery Read", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: MIDDLE OF FUNNEL — CLICKS
// ═══════════════════════════════════════════════════════════════════

function renderMofuSection(opts) {
  var book = opts.book;
  var g = book.global;
  var globalKpis = [
    { label: "Total Clicks", value: fmtNum(g.clicks), primary: true },
    { label: "Blended CTR", value: fmtPct(ctrOf(g)) },
    { label: "Blended CPC", value: fmtR(cpcOf(g)) },
    { label: "Total Spend", value: fmtR(g.spend), sub: "invested in clicks" }
  ];
  var columns = [
    { key: "platform", label: "Platform", align: "left" },
    { key: "impressions", label: "Impressions", format: "int" },
    { key: "clicks", label: "Clicks", format: "int" },
    { key: "ctr", label: "CTR", format: "%", compute: ctrOf },
    { key: "cpc", label: "CPC", format: "R", compute: cpcOf },
    { key: "freq", label: "Frequency", format: "freq", compute: frequencyOf },
    { key: "spend", label: "Spend", format: "R" }
  ];
  // Auto-insight
  var insight = "";
  var platforms = Object.keys(book.byPlatform).sort(function(a, b) { return ctrOf(book.byPlatform[b]) - ctrOf(book.byPlatform[a]); });
  var best = platforms[0];
  if (best) {
    var bestCtr = ctrOf(book.byPlatform[best]);
    var gCtr = ctrOf(g);
    var readCtr = gCtr >= 1.2 ? "strong" : gCtr >= 0.8 ? "healthy" : "below the 0.8% consideration benchmark, suggesting creative refresh is warranted";
    insight = `Blended click-through rate of ${fmtPct(gCtr)} reads as ${readCtr}. ${escapeHtmlLocal(best)} led the platforms at ${fmtPct(bestCtr)} CTR, indicating strongest creative-audience resonance in this window.`;
  }
  return `<section class="rp-page">
    ${renderSectionHeader("02", "Middle of the Funnel", "Clicks &amp; Consideration", "The intent-capture layer. This stage takes audiences who now recognise the brand and gives them a low-friction next action: a click through to a landing page, a video watched to completion, an interaction with a post.")}
    <div class="rp-block">
      <div class="rp-block-title">Global Click Headlines</div>
      ${renderKpiRow(globalKpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Per Platform Click Breakdown</div>
      ${renderPlatformTable(book.byPlatform, columns)}
    </div>
    ${renderInsight("Consideration Read", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: BOTTOM OF FUNNEL — OBJECTIVE-DRIVEN
// ═══════════════════════════════════════════════════════════════════

// Each objective subsection: global tiles + per-platform table.
function renderBofuSubsection(title, description, book, valueFn, columnLabel, resultKey, symbol) {
  var g = book.global;
  var total = valueFn(g);
  if (!total) return "";
  var platforms = Object.keys(book.byPlatform).sort(function(a, b) { return valueFn(book.byPlatform[b]) - valueFn(book.byPlatform[a]); });
  var perPlatformHtml = platforms.map(function(p) {
    var v = valueFn(book.byPlatform[p]);
    if (!v && v !== 0) return "";
    var accent = platformAccent(p);
    var spend = book.byPlatform[p].spend;
    var costPer = v > 0 ? spend / v : 0;
    return `<tr>
      <td class="rp-td-name"><span class="rp-plat-chip" style="background:${accent};">${escapeHtmlLocal(p)}</span></td>
      <td class="rp-td-num">${(symbol || "") + fmtNum(v)}</td>
      <td class="rp-td-num">${fmtR(spend)}</td>
      <td class="rp-td-num rp-td-sub">${v > 0 ? fmtR(costPer) : "-"}</td>
    </tr>`;
  }).join("");
  var overallCost = book.global.spend > 0 && total > 0 ? book.global.spend / total : 0;
  return `<div class="rp-bofu-sub">
    <div class="rp-bofu-sub-head">
      <div class="rp-bofu-sub-title">${escapeHtmlLocal(title)}</div>
      <div class="rp-bofu-sub-total">${(symbol || "") + fmtNum(total)}</div>
    </div>
    <div class="rp-bofu-sub-desc">${escapeHtmlLocal(description)}</div>
    <div class="rp-bofu-sub-costline">Overall cost per ${escapeHtmlLocal(resultKey)}: <strong>${overallCost > 0 ? fmtR(overallCost) : "-"}</strong></div>
    <table class="rp-table">
      <thead><tr>
        <th class="rp-th-name">Platform</th>
        <th class="rp-th-num">${escapeHtmlLocal(columnLabel)}</th>
        <th class="rp-th-num">Spend</th>
        <th class="rp-th-num">Cost / ${escapeHtmlLocal(resultKey)}</th>
      </tr></thead>
      <tbody>${perPlatformHtml}</tbody>
    </table>
  </div>`;
}

function renderBofuSection(opts) {
  var book = opts.book;
  var subs = [];
  // Leads / conversions
  subs.push(renderBofuSubsection(
    "Leads Captured",
    "Direct-response leads captured from in-platform forms or landing-page submissions during the reporting period.",
    book,
    function(r) { return r.leads || 0; },
    "Leads",
    "lead"
  ));
  // Clicks to landing page (traffic objective)
  subs.push(renderBofuSubsection(
    "Clicks to Landing Page",
    "Users who accepted the offer to visit an owned landing page or website destination. The warmest traffic layer of the funnel.",
    book,
    function(r) { return r.landingPageViews || 0; },
    "LP Clicks",
    "click"
  ));
  // App store clicks
  subs.push(renderBofuSubsection(
    "Clicks to App Store",
    "Users routed from the ad to their platform's app store to download the app. The measurable last-mile touchpoint before install.",
    book,
    function(r) { return r.appInstalls || 0; },
    "Store Clicks",
    "click"
  ));
  // Community: followers + likes
  var communityFn = function(r) { return (r.follows || 0) + (r.pageLikes || 0); };
  subs.push(renderBofuSubsection(
    "Followers &amp; Likes",
    "New followers and page likes earned across paid and cross-attributed organic delivery. Each new community member is a permanent organic distribution channel.",
    book,
    communityFn,
    "New Members",
    "member",
    "+"
  ));
  // Community reach (awareness objective / ToFu-adjacent, kept in BoFu per user spec — client narrative reads reach as an outcome to celebrate)
  subs.push(renderBofuSubsection(
    "Community Reach",
    "Unique users reached through community reach objectives — awareness delivery treated as an outcome in its own right for brand-building windows.",
    book,
    function(r) { return r.reach || 0; },
    "Reach",
    "person"
  ));
  var subsHtml = subs.filter(Boolean).join("");
  if (!subsHtml) {
    subsHtml = `<div class="rp-empty">No bottom-of-funnel objectives ran during this window.</div>`;
  }
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
  // Insight
  var bofuG = book.byStage.bofu;
  var insight = "";
  if (bofuG && bofuG.spend > 0) {
    var costPerLead = bofuG.leads > 0 ? bofuG.spend / bofuG.leads : 0;
    var community = (bofuG.follows || 0) + (bofuG.pageLikes || 0);
    var pts = [];
    if (bofuG.leads > 0) pts.push(fmtNum(bofuG.leads) + " lead" + (bofuG.leads === 1 ? "" : "s") + " at " + fmtR(costPerLead) + " per lead");
    if (community > 0) pts.push("+" + fmtNum(community) + " new community members");
    if (bofuG.appInstalls > 0) pts.push(fmtNum(bofuG.appInstalls) + " app store clicks");
    if (pts.length) insight = "The bottom-of-funnel layer delivered " + pts.join(", ") + " on " + fmtR(bofuG.spend) + " of investment. Each of these outcomes represents a measurable commercial action attributable directly to the campaign structure above.";
  }
  return `<section class="rp-page">
    ${renderSectionHeader("03", "Bottom of the Funnel", "Result Objectives", "The action layer. This is where warm audiences convert into measurable business outcomes: leads, clicks to a landing page, app downloads, new community members, and reach into the audiences the brand wants to grow.")}
    ${subsHtml}
    ${ecoBlock}
    ${renderInsight("Conversion Read", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: AUDIENCE (DEMOGRAPHICS)
// ═══════════════════════════════════════════════════════════════════

function aggregateAgeGender(rows) {
  var byPlat = {};
  var ageBuckets = {};
  var genderBuckets = { male: 0, female: 0, unknown: 0 };
  (rows || []).forEach(function(r) {
    var p = r.platform || "Other";
    if (!byPlat[p]) byPlat[p] = { age: {}, gender: { male: 0, female: 0, unknown: 0 }, impressions: 0, clicks: 0, spend: 0, results: 0 };
    var bp = byPlat[p];
    var imps = parseInt(r.impressions || 0, 10);
    var age = String(r.age || "unknown");
    var gender = String(r.gender || "unknown").toLowerCase();
    var g = gender === "male" || gender === "m" ? "male" : gender === "female" || gender === "f" ? "female" : "unknown";
    ageBuckets[age] = (ageBuckets[age] || 0) + imps;
    genderBuckets[g] += imps;
    bp.age[age] = (bp.age[age] || 0) + imps;
    bp.gender[g] += imps;
    bp.impressions += imps;
    bp.clicks += parseInt(r.clicks || 0, 10);
    bp.spend += parseFloat(r.spend || 0);
    // Results object → sum leads + follows + landingPageViews + appInstalls + pageLikes
    var res = r.results || {};
    bp.results += parseFloat(res.leads || 0) + parseFloat(res.follows || 0) + parseFloat(res.landingPageViews || 0) + parseFloat(res.appInstalls || 0) + parseFloat(res.pageLikes || 0);
  });
  return { byPlatform: byPlat, ageBuckets: ageBuckets, genderBuckets: genderBuckets };
}

function aggregateRegion(rows) {
  var byRegion = {};
  (rows || []).forEach(function(r) {
    var reg = String(r.region || "Unknown");
    if (!byRegion[reg]) byRegion[reg] = { impressions: 0, clicks: 0, spend: 0, results: 0 };
    byRegion[reg].impressions += parseInt(r.impressions || 0, 10);
    byRegion[reg].clicks += parseInt(r.clicks || 0, 10);
    byRegion[reg].spend += parseFloat(r.spend || 0);
    var res = r.results || {};
    byRegion[reg].results += parseFloat(res.leads || 0) + parseFloat(res.follows || 0) + parseFloat(res.landingPageViews || 0) + parseFloat(res.appInstalls || 0) + parseFloat(res.pageLikes || 0);
  });
  return byRegion;
}

// Render the audience/demographics section.
function renderAudienceSection(opts) {
  var demo = opts.demographics;
  if (!demo || (!Array.isArray(demo.ageGender) && !Array.isArray(demo.region))) return "";
  var agAgg = aggregateAgeGender(demo.ageGender || []);
  var regAgg = aggregateRegion(demo.region || []);

  // Persona per platform
  var platforms = Object.keys(agAgg.byPlatform).filter(function(p) { return agAgg.byPlatform[p].impressions > 0; });
  var personaCards = platforms.map(function(p) {
    var pb = agAgg.byPlatform[p];
    // Top age
    var topAgeKey = "", topAgeVal = 0;
    Object.keys(pb.age).forEach(function(k) { if (pb.age[k] > topAgeVal) { topAgeVal = pb.age[k]; topAgeKey = k; } });
    var totalAge = Object.keys(pb.age).reduce(function(s, k) { return s + pb.age[k]; }, 0);
    var agePct = totalAge > 0 ? (topAgeVal / totalAge * 100) : 0;
    // Dominant gender
    var g = pb.gender;
    var gTotal = g.male + g.female + g.unknown;
    var dominantGender = g.female > g.male && g.female > g.unknown ? "female" : g.male > g.female && g.male > g.unknown ? "male" : "mixed";
    var dominantPct = gTotal > 0 ? Math.max(g.male, g.female, g.unknown) / gTotal * 100 : 0;
    var accent = platformAccent(p);
    return `<div class="rp-persona">
      <div class="rp-persona-plat" style="background:${accent};">${escapeHtmlLocal(p)}</div>
      <div class="rp-persona-body">
        <div class="rp-persona-line"><span class="rp-persona-label">Dominant Age Group</span> <span class="rp-persona-value">${escapeHtmlLocal(topAgeKey || "-")} <span class="rp-persona-pct">${agePct.toFixed(1)}%</span></span></div>
        <div class="rp-persona-line"><span class="rp-persona-label">Gender Skew</span> <span class="rp-persona-value">${escapeHtmlLocal(dominantGender)} <span class="rp-persona-pct">${dominantPct.toFixed(1)}%</span></span></div>
        <div class="rp-persona-line"><span class="rp-persona-label">Impressions Served</span> <span class="rp-persona-value">${fmtNum(pb.impressions)}</span></div>
        <div class="rp-persona-line"><span class="rp-persona-label">Results Attributed</span> <span class="rp-persona-value">${fmtNum(pb.results)}</span></div>
      </div>
    </div>`;
  }).join("");

  // Age breakdown (global)
  var ageOrder = ["13-17","18-24","25-34","35-44","45-54","55-64","65+","unknown"];
  var ageTotal = Object.keys(agAgg.ageBuckets).reduce(function(s, k) { return s + agAgg.ageBuckets[k]; }, 0);
  var ageBars = ageOrder.filter(function(k) { return (agAgg.ageBuckets[k] || 0) > 0; }).map(function(k) {
    var v = agAgg.ageBuckets[k] || 0;
    var pct = ageTotal > 0 ? (v / ageTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#F96203,#FF3D00);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(1)}%</span></div>
    </div>`;
  }).join("");

  // Region breakdown (top 8)
  var regionKeys = Object.keys(regAgg).sort(function(a, b) { return regAgg[b].impressions - regAgg[a].impressions; }).slice(0, 8);
  var regionTotal = regionKeys.reduce(function(s, k) { return s + regAgg[k].impressions; }, 0);
  var regionBars = regionKeys.map(function(k) {
    var v = regAgg[k].impressions;
    var pct = regionTotal > 0 ? (v / regionTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#4599FF,#00F2EA);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(1)}%</span></div>
    </div>`;
  }).join("");

  var insight = "";
  if (regionKeys.length && ageOrder.some(function(k) { return agAgg.ageBuckets[k] > 0; })) {
    var topRegion = regionKeys[0];
    var topRegionPct = regionTotal > 0 ? (regAgg[topRegion].impressions / regionTotal * 100) : 0;
    var topAgeKeyG = "", topAgeValG = 0;
    Object.keys(agAgg.ageBuckets).forEach(function(k) { if (agAgg.ageBuckets[k] > topAgeValG) { topAgeValG = agAgg.ageBuckets[k]; topAgeKeyG = k; } });
    insight = "The perfect target audience for this window is anchored in " + escapeHtmlLocal(topRegion) + " (" + topRegionPct.toFixed(1) + "% of impressions) with the " + escapeHtmlLocal(topAgeKeyG) + " age band the most-served demographic. Refining lookalikes and interest layers to reinforce this signal is likely to compound efficiency in the next window.";
  }

  return `<section class="rp-page">
    ${renderSectionHeader("04", "Perfect Target Audience", "Demographics &amp; Persona", "Who the campaigns actually reached, mapped per platform. The demographic signature below is the profile the algorithm has learned to serve — use it to sharpen creative, refine audience layers, and identify look-alike growth pools.")}
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

function renderTopAdsSection(opts) {
  var top = opts.topAds;
  if (!Array.isArray(top) || !top.length) return "";
  var origin = opts.origin;
  var shareToken = opts.shareToken;
  var pBlocks = top.filter(function(pl) { return pl && Array.isArray(pl.ads) && pl.ads.length; }).map(function(pl) {
    var p = pl.platform || "-";
    var accent = platformAccent(platformFamily(p));
    var cards = pl.ads.slice(0, 8).map(function(a, i) {
      var thumb = resolveThumb(a, origin, shareToken, 120);
      var results = parseFloat(a.results || 0);
      var spend = parseFloat(a.spend || 0);
      var ctr = parseFloat(a.ctr || 0);
      var resLabel = a.resultType === "leads" ? "leads" : a.resultType === "follows" ? "follows" : a.resultType === "installs" ? "app clicks" : a.resultType === "impressions" ? "imps" : a.resultType === "reach" ? "reach" : "clicks";
      return `<div class="rp-creative-card">
        <div class="rp-creative-thumb" style="background:linear-gradient(135deg,${accent}55,${accent}15);">
          ${thumb ? `<img src="${escapeHtmlLocal(thumb)}" alt="" onerror="this.style.display='none'"/>` : `<div class="rp-creative-fallback">${escapeHtmlLocal(p)}</div>`}
          <div class="rp-creative-rank" style="background:${accent};">#${i + 1}</div>
        </div>
        <div class="rp-creative-body">
          <div class="rp-creative-name">${escapeHtmlLocal(a.adName || "Untitled")}</div>
          <div class="rp-creative-metrics">
            <div><strong>${fmtR(spend)}</strong> spent</div>
            <div><strong>${results > 0 ? fmtNum(results) : "-"}</strong> ${escapeHtmlLocal(resLabel)}</div>
            <div><strong>${fmtPct(ctr)}</strong> CTR</div>
          </div>
        </div>
      </div>`;
    }).join("");
    return `<div class="rp-platform-block">
      <div class="rp-platform-head" style="border-left-color:${accent};color:${accent};">${escapeHtmlLocal(p)}</div>
      <div class="rp-creative-grid">${cards}</div>
    </div>`;
  }).join("");
  return `<section class="rp-page">
    ${renderSectionHeader("05", "Creative Read", "Best Performing Ads", "The top 8 ads per platform this window, ranked by their objective-appropriate outcome. Awareness ads are ranked on reach and CPM efficiency; direct-response ads on results and cost per outcome.")}
    ${pBlocks}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: EXECUTIVE SUMMARY (moved to end, comprehensive)
// ═══════════════════════════════════════════════════════════════════

function renderExecutiveSummary(opts) {
  var book = opts.book;
  var g = book.global;
  var totalFollows = (g.follows || 0) + (g.pageLikes || 0);
  var totalSpend = book.byStage.tofu.spend + book.byStage.mofu.spend + book.byStage.bofu.spend;
  var stagePcts = {
    tofu: totalSpend > 0 ? (book.byStage.tofu.spend / totalSpend * 100) : 0,
    mofu: totalSpend > 0 ? (book.byStage.mofu.spend / totalSpend * 100) : 0,
    bofu: totalSpend > 0 ? (book.byStage.bofu.spend / totalSpend * 100) : 0
  };
  var kpis = [
    { label: "Total Investment", value: fmtR(g.spend), primary: true },
    { label: "Impressions", value: fmtNum(g.impressions), sub: fmtNumDec(frequencyOf(g), 2) + "× frequency" },
    { label: "Reach", value: fmtNum(g.reach), sub: "unique users" },
    { label: "Blended CTR", value: fmtPct(ctrOf(g)) }
  ];
  var narrative = [];
  narrative.push("Across " + fmtNum(g.campaignCount) + " campaign" + (g.campaignCount === 1 ? "" : "s") + ", " + fmtR(g.spend) + " was invested during " + escapeHtmlLocal(opts.periodDisplay) + ", generating " + fmtNum(g.impressions) + " impressions and " + fmtNum(g.reach) + " unique users reached at a blended " + fmtR(cpmOf(g)) + " CPM.");
  if (parseFloat(g.leads || 0) > 0) narrative.push(fmtNum(g.leads) + " qualified lead" + (g.leads === 1 ? "" : "s") + " were captured at " + fmtR(g.spend > 0 && g.leads > 0 ? g.spend / g.leads : 0) + " per lead.");
  if (totalFollows > 0) narrative.push("The community earned " + fmtNum(totalFollows) + " new follower" + (totalFollows === 1 ? "" : "s") + " and page like" + (totalFollows === 1 ? "" : "s") + ", each representing a permanent organic distribution channel that compounds beyond the paid window.");
  if (parseFloat(g.appStoreClicks || g.appInstalls || 0) > 0) narrative.push(fmtNum(g.appInstalls) + " users clicked through to their app store to download the app.");
  if (parseFloat(g.landingPageViews || 0) > 0) narrative.push(fmtNum(g.landingPageViews) + " users landed on the destination page after clicking a traffic ad.");
  if (totalSpend > 0) narrative.push("The funnel investment split ran " + stagePcts.tofu.toFixed(1) + "% top of funnel (awareness), " + stagePcts.mofu.toFixed(1) + "% middle (consideration), and " + stagePcts.bofu.toFixed(1) + "% bottom (conversion).");
  return `<section class="rp-page">
    ${renderSectionHeader("06", "Executive Summary", "Period In Review", "A comprehensive read of the reporting window, the investment split across the funnel, and the measurable outcomes each stage delivered.")}
    <div class="rp-block">
      <div class="rp-block-title">Headline Metrics</div>
      ${renderKpiRow(kpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Funnel Investment Split</div>
      <div class="rp-funnel-splits">
        <div class="rp-funnel-splits-row">
          <div class="rp-funnel-splits-label">Top of Funnel (Awareness)</div>
          <div class="rp-funnel-splits-track"><div class="rp-funnel-splits-fill" style="width:${stagePcts.tofu.toFixed(1)}%;background:linear-gradient(90deg,#F96203,#FF6B00);"></div></div>
          <div class="rp-funnel-splits-value">${stagePcts.tofu.toFixed(1)}% <span class="rp-funnel-splits-sub">${fmtR(book.byStage.tofu.spend)}</span></div>
        </div>
        <div class="rp-funnel-splits-row">
          <div class="rp-funnel-splits-label">Middle of Funnel (Clicks)</div>
          <div class="rp-funnel-splits-track"><div class="rp-funnel-splits-fill" style="width:${stagePcts.mofu.toFixed(1)}%;background:linear-gradient(90deg,#FF6B00,#FF3D00);"></div></div>
          <div class="rp-funnel-splits-value">${stagePcts.mofu.toFixed(1)}% <span class="rp-funnel-splits-sub">${fmtR(book.byStage.mofu.spend)}</span></div>
        </div>
        <div class="rp-funnel-splits-row">
          <div class="rp-funnel-splits-label">Bottom of Funnel (Results)</div>
          <div class="rp-funnel-splits-track"><div class="rp-funnel-splits-fill" style="width:${stagePcts.bofu.toFixed(1)}%;background:linear-gradient(90deg,#FF3D00,#F96203);"></div></div>
          <div class="rp-funnel-splits-value">${stagePcts.bofu.toFixed(1)}% <span class="rp-funnel-splits-sub">${fmtR(book.byStage.bofu.spend)}</span></div>
        </div>
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
  var senderName = escapeHtmlLocal(opts.senderName || "");
  var senderTitle = escapeHtmlLocal(opts.senderTitle || "");
  var origin = opts.origin || "https://media.gasmarketing.co.za";
  var agencyLogo = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var period = escapeHtmlLocal(opts.periodDisplay || "");
  var book = opts.book;
  var g = book.global;
  var totalFollows = (g.follows || 0) + (g.pageLikes || 0);
  var quickRecap = [];
  if (parseFloat(g.leads || 0) > 0) quickRecap.push(fmtNum(g.leads) + " leads");
  if (totalFollows > 0) quickRecap.push("+" + fmtNum(totalFollows) + " community");
  if (parseFloat(g.appInstalls || 0) > 0) quickRecap.push(fmtNum(g.appInstalls) + " app store clicks");
  if (parseFloat(g.landingPageViews || 0) > 0) quickRecap.push(fmtNum(g.landingPageViews) + " landing page views");
  if (!quickRecap.length) quickRecap.push(fmtNum(g.impressions) + " impressions");
  return `<section class="rp-page rp-signoff">
    <div class="rp-signoff-frame">
      <div class="rp-signoff-top">
        <img src="${agencyLogo}" alt="GAS Marketing" class="rp-signoff-emblem-logo"/>
        <div class="rp-signoff-eyebrow">A Note From Our Team</div>
      </div>
      <div class="rp-signoff-heart">
        <div class="rp-signoff-title">Thank You, ${clientName}</div>
        <p class="rp-signoff-body">This report reflects the data captured directly from the ad platforms at the moment it was generated. During <strong>${period}</strong>, together we delivered <strong>${quickRecap.join(", ")}</strong> on <strong>${fmtR(g.spend)}</strong> of media investment.</p>
        <p class="rp-signoff-body">Every metric in these pages is a signal — of what worked, where the audience leaned in, and where the next window can compound. If you would like to explore any section deeper, the full interactive dashboard remains available to your team, or reach out directly and we will walk you through the read together.</p>
      </div>
      <div class="rp-signoff-foot">
        <div class="rp-signoff-sender-block">
          <div class="rp-signoff-sender">${senderName || "The GAS Team"}</div>
          ${senderTitle ? `<div class="rp-signoff-sender-title">${senderTitle}</div>` : ""}
          <div class="rp-signoff-agency">GAS Marketing Automation</div>
        </div>
        <div class="rp-signoff-contact">
          <div>grow@gasmarketing.co.za</div>
          <div>${escapeHtmlLocal(origin.replace(/^https?:\/\//, ""))}</div>
          <div class="rp-signoff-emblem">Media On GAS · Metrics That Matter</div>
        </div>
      </div>
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

  // Precompute the aggregation once — every section reads from `book`.
  var book = aggregateBook((opts.summary && opts.summary.campaigns) || []);

  var contentOpts = Object.assign({}, opts, {
    clientName: clientName,
    periodDisplay: periodDisplay,
    book: book
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
  --rp-fg-dim: rgba(255,251,248,0.74);
  --rp-fg-mute: rgba(255,251,248,0.52);
  --rp-accent: #F96203;
  --rp-accent2: #FF3D00;
  --rp-accent3: #FF6B00;
  --rp-line: rgba(255,255,255,0.09);
  --rp-line-strong: rgba(249,98,3,0.42);
  --rp-card: rgba(255,255,255,0.03);
  --rp-card-strong: rgba(0,0,0,0.28);
  --rp-serif: "Georgia", "Times New Roman", serif;
}
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: var(--rp-bg); color: var(--rp-fg); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-font-smoothing: antialiased; }
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
.rp-cover-fallback-name { font-family: var(--rp-serif); font-size: 28pt; letter-spacing: -0.5px; font-weight: 700; color: var(--rp-fg); margin-bottom: 8mm; }
.rp-cover-rule { width: 24mm; height: 2px; background: linear-gradient(90deg, var(--rp-accent), var(--rp-accent2)); border-radius: 1px; }
.rp-cover-heart { margin-top: auto; margin-bottom: auto; padding: 20mm 0; }
.rp-cover-eyebrow { font-size: 9pt; letter-spacing: 6px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 8mm; }
.rp-cover-title { font-family: var(--rp-serif); font-size: 52pt; font-weight: 700; letter-spacing: -1.5px; line-height: 1; color: var(--rp-fg); margin-bottom: 4mm; word-break: break-word; }
.rp-cover-title-sub { font-family: var(--rp-serif); font-size: 20pt; font-weight: 400; font-style: italic; letter-spacing: 0; color: var(--rp-fg-dim); margin-bottom: 14mm; }
.rp-cover-period { font-size: 12pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 500; }
.rp-cover-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 12mm; border-top: 1px solid var(--rp-line); }
.rp-cover-foot-left, .rp-cover-foot-right { display: flex; flex-direction: column; gap: 2mm; }
.rp-cover-foot-right { align-items: flex-end; text-align: right; }
.rp-cover-agency-logo { width: 14mm; height: 14mm; border-radius: 50%; box-shadow: 0 0 8mm rgba(249,98,3,0.28); margin-bottom: 3mm; }
.rp-cover-label { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; }
.rp-cover-sender { font-size: 13pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-serif); }
.rp-cover-sender-title { font-size: 10pt; color: var(--rp-fg-dim); font-style: italic; }
.rp-cover-agency-label { font-size: 12pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-serif); }
.rp-cover-agency-sub { font-size: 8pt; letter-spacing: 3px; color: var(--rp-accent); font-weight: 800; text-transform: uppercase; }

/* ─────────────── SECTION HEADER ─────────────── */
.rp-section-head { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 8mm; padding-bottom: 6mm; border-bottom: 1px solid var(--rp-line); }
.rp-section-num { font-family: var(--rp-serif); font-size: 32pt; font-weight: 700; color: var(--rp-accent); line-height: 1; letter-spacing: -1px; min-width: 20mm; }
.rp-section-headline { flex: 1; }
.rp-section-eyebrow { font-size: 8pt; letter-spacing: 4px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-h1 { font-family: var(--rp-serif); font-size: 26pt; font-weight: 700; letter-spacing: -0.8px; line-height: 1.1; color: var(--rp-fg); margin: 0 0 4mm 0; }
.rp-lede { font-size: 10.5pt; color: var(--rp-fg-dim); line-height: 1.6; max-width: 155mm; font-style: italic; }

/* ─────────────── BLOCKS ─────────────── */
.rp-block { margin-bottom: 8mm; page-break-inside: avoid; }
.rp-block-title { font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 4mm; }
.rp-block-double { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 8mm; }

/* ─────────────── KPI GRID ─────────────── */
.rp-kpi-grid { display: grid; gap: 3mm; margin-bottom: 4mm; }
.rp-kpi { padding: 5mm 5mm; background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; }
.rp-kpi-primary { border-color: var(--rp-line-strong); background: linear-gradient(140deg, rgba(249,98,3,0.14), var(--rp-card-strong)); }
.rp-kpi-label { font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; margin-bottom: 3mm; }
.rp-kpi-value { font-family: var(--rp-serif); font-size: 22pt; font-weight: 700; color: var(--rp-fg); line-height: 1; letter-spacing: -0.6px; font-variant-numeric: tabular-nums; }
.rp-kpi-primary .rp-kpi-value { color: var(--rp-accent); }
.rp-kpi-sub { font-size: 8pt; color: var(--rp-fg-mute); margin-top: 3mm; letter-spacing: 0.5px; }

/* ─────────────── INSIGHT / NARRATIVE ─────────────── */
.rp-insight { margin-top: 6mm; padding: 5mm 6mm; background: linear-gradient(140deg, rgba(249,98,3,0.06), var(--rp-card)); border-left: 3px solid var(--rp-accent); border-radius: 0 3mm 3mm 0; page-break-inside: avoid; }
.rp-insight-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-narrative { margin-top: 6mm; padding: 5mm 6mm; background: var(--rp-card-strong); border-radius: 3mm; border-left: 3px solid var(--rp-accent); page-break-inside: avoid; }
.rp-narrative-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-body { font-size: 10pt; color: var(--rp-fg-dim); line-height: 1.7; margin: 0; }

/* ─────────────── TABLES ─────────────── */
.rp-table { width: 100%; border-collapse: collapse; background: var(--rp-card-strong); border-radius: 3mm; overflow: hidden; font-size: 9.5pt; }
.rp-table-wide { font-size: 9pt; }
.rp-table th { padding: 3mm 3mm; text-align: left; font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 800; border-bottom: 1px solid rgba(249,98,3,0.2); background: rgba(249,98,3,0.06); }
.rp-th-num { text-align: right; }
.rp-th-rank { text-align: center; width: 8mm; }
.rp-table td { padding: 3mm 3mm; border-bottom: 1px solid rgba(255,255,255,0.06); color: var(--rp-fg); vertical-align: middle; font-variant-numeric: tabular-nums; }
.rp-table tbody tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.rp-td-num { text-align: right; }
.rp-td-name { color: var(--rp-fg); }
.rp-td-sub { color: var(--rp-fg-mute); font-size: 8.5pt; }
.rp-plat-chip { display: inline-block; padding: 1mm 3mm; font-size: 7.5pt; font-weight: 900; color: #fff; border-radius: 2px; letter-spacing: 1px; margin-right: 2mm; vertical-align: middle; }
.rp-empty { padding: 5mm; text-align: center; color: var(--rp-fg-mute); font-style: italic; background: var(--rp-card); border-radius: 3mm; font-size: 10pt; }

/* ─────────────── BOFU SUBSECTIONS ─────────────── */
.rp-bofu-sub { margin-bottom: 8mm; padding: 5mm 6mm; background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; }
.rp-bofu-sub-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; }
.rp-bofu-sub-title { font-family: var(--rp-serif); font-size: 14pt; font-weight: 700; color: var(--rp-fg); letter-spacing: -0.3px; }
.rp-bofu-sub-total { font-family: var(--rp-serif); font-size: 22pt; font-weight: 700; color: var(--rp-accent); letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.rp-bofu-sub-desc { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 3mm; font-style: italic; }
.rp-bofu-sub-costline { font-size: 9pt; color: var(--rp-fg-mute); margin-bottom: 4mm; letter-spacing: 0.5px; }
.rp-bofu-sub-costline strong { color: var(--rp-fg); font-weight: 800; }
.rp-bofu-eco { border-left: 3px solid var(--rp-accent2); }
.rp-eco-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin-top: 3mm; }
.rp-eco-tile { padding: 3mm; background: rgba(0,0,0,0.28); border-radius: 2mm; text-align: center; }
.rp-eco-label { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; margin-bottom: 2mm; }
.rp-eco-value { font-family: var(--rp-serif); font-size: 15pt; font-weight: 700; color: var(--rp-fg); font-variant-numeric: tabular-nums; }

/* ─────────────── PERSONA (audience) ─────────────── */
.rp-persona-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
.rp-persona { border: 1px solid var(--rp-line); background: var(--rp-card-strong); border-radius: 3mm; overflow: hidden; page-break-inside: avoid; }
.rp-persona-plat { padding: 3mm 4mm; font-size: 10pt; font-weight: 900; color: #fff; letter-spacing: 2px; text-transform: uppercase; }
.rp-persona-body { padding: 4mm; display: flex; flex-direction: column; gap: 2.5mm; }
.rp-persona-line { display: flex; justify-content: space-between; align-items: baseline; padding-bottom: 2mm; border-bottom: 1px dotted var(--rp-line); font-size: 9pt; }
.rp-persona-line:last-child { border-bottom: 0; padding-bottom: 0; }
.rp-persona-label { color: var(--rp-fg-mute); letter-spacing: 0.5px; }
.rp-persona-value { color: var(--rp-fg); font-weight: 700; text-transform: capitalize; font-variant-numeric: tabular-nums; }
.rp-persona-pct { color: var(--rp-accent); font-size: 8.5pt; margin-left: 2mm; }

/* Bars (age / region) */
.rp-bars { display: flex; flex-direction: column; gap: 2.5mm; }
.rp-bar-row { display: grid; grid-template-columns: 28mm 1fr 32mm; align-items: center; gap: 3mm; font-size: 9pt; }
.rp-bar-label { color: var(--rp-fg); font-weight: 700; letter-spacing: 0.3px; }
.rp-bar-track { height: 4mm; background: rgba(0,0,0,0.35); border-radius: 2mm; overflow: hidden; }
.rp-bar-fill { height: 100%; border-radius: 2mm; }
.rp-bar-value { text-align: right; color: var(--rp-fg-dim); font-variant-numeric: tabular-nums; font-size: 8.5pt; }
.rp-bar-pct { color: var(--rp-accent); font-weight: 700; margin-left: 1mm; }

/* ─────────────── CREATIVE ─────────────── */
.rp-platform-block { margin-bottom: 8mm; page-break-inside: avoid; }
.rp-platform-head { border-left: 3px solid; padding-left: 4mm; font-size: 11pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4mm; }
.rp-creative-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; }
.rp-creative-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; overflow: hidden; }
.rp-creative-thumb { position: relative; width: 100%; padding-top: 100%; }
.rp-creative-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rp-creative-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 8pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
.rp-creative-rank { position: absolute; top: 2mm; left: 2mm; padding: 1mm 2mm; color: #fff; font-size: 7pt; font-weight: 900; border-radius: 2mm; letter-spacing: 0.5px; }
.rp-creative-body { padding: 3mm; }
.rp-creative-name { font-size: 8.5pt; font-weight: 800; color: var(--rp-fg); margin-bottom: 2mm; line-height: 1.35; word-break: break-word; max-height: 10mm; overflow: hidden; }
.rp-creative-metrics { display: flex; flex-direction: column; gap: 0.8mm; font-size: 7.5pt; color: var(--rp-fg-dim); }
.rp-creative-metrics strong { color: var(--rp-accent); font-weight: 900; font-variant-numeric: tabular-nums; }

/* ─────────────── FUNNEL SPLITS (executive summary) ─────────────── */
.rp-funnel-splits { display: flex; flex-direction: column; gap: 3mm; }
.rp-funnel-splits-row { display: grid; grid-template-columns: 55mm 1fr 45mm; gap: 3mm; align-items: center; }
.rp-funnel-splits-label { font-size: 10pt; color: var(--rp-fg); font-weight: 700; }
.rp-funnel-splits-track { height: 6mm; background: rgba(0,0,0,0.35); border-radius: 3mm; overflow: hidden; }
.rp-funnel-splits-fill { height: 100%; border-radius: 3mm; }
.rp-funnel-splits-value { text-align: right; font-family: var(--rp-serif); font-size: 14pt; font-weight: 700; color: var(--rp-accent); font-variant-numeric: tabular-nums; }
.rp-funnel-splits-sub { display: block; font-family: "Helvetica Neue", Helvetica, sans-serif; font-size: 8pt; color: var(--rp-fg-mute); font-weight: 500; letter-spacing: 0.5px; }

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
.rp-signoff-title { font-family: var(--rp-serif); font-size: 38pt; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--rp-fg); margin-bottom: 10mm; }
.rp-signoff-body { font-size: 11.5pt; color: var(--rp-fg-dim); line-height: 1.8; margin-bottom: 6mm; }
.rp-signoff-body strong { color: var(--rp-fg); font-weight: 700; }
.rp-signoff-foot { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10mm; border-top: 1px solid var(--rp-line); margin-top: auto; }
.rp-signoff-sender-block { display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-sender { font-family: var(--rp-serif); font-size: 15pt; font-weight: 700; color: var(--rp-fg); }
.rp-signoff-sender-title { font-size: 10pt; color: var(--rp-fg-dim); font-style: italic; }
.rp-signoff-agency { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }
.rp-signoff-contact { text-align: right; font-size: 9pt; color: var(--rp-fg-mute); display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-emblem { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }

/* Print rules */
@media print {
  html, body { background: var(--rp-bg) !important; }
  .rp-page { margin: 0; box-shadow: none; }
}
</style>
</head>
<body>
${pages}
</body>
</html>`;
}
