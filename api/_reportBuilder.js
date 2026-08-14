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
  // WhatsApp / messaging campaigns route to their own bucket BEFORE the
  // generic "lead" name match, so a campaign like
  // GAS_Learnalot_META_Leads_WApp_... no longer contaminates the
  // Leads bucket's spend (its Meta-attributed c.leads is 0, its
  // qualified-lead result comes through Custom Outcomes / book.whatsapp
  // instead). Mirrors the dashboard's App.jsx classifier.
  if (n.indexOf("_wapp_") >= 0 || n.indexOf("wapp_") >= 0 || n.indexOf("_whatsapp_") >= 0 || n.indexOf(" whatsapp ") >= 0 || n.indexOf("_wa_") >= 0) return "WhatsApp Conversations";
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
    // Fold "Traffic" fallback rows into the "Landing Page Clicks"
    // bucket to match dashboard's tLp filter (App.jsx ~9566 keeps
    // both objective === "Landing Page Clicks" and === "Traffic"
    // in the same sum). Any campaign whose getObj hits the Traffic
    // default was previously silently missing from LP totals in the
    // report.
    var bookKey = obj === "Traffic" ? "Landing Page Clicks" : obj;
    if (!book.byObjective[bookKey]) book.byObjective[bookKey] = { global: empty(), byPlatform: {} };
    if (!book.byObjective[bookKey].byPlatform[p]) book.byObjective[bookKey].byPlatform[p] = empty();
    [book.byObjective[bookKey].global, book.byObjective[bookKey].byPlatform[p]].forEach(function(b) {
      b.spend += parseFloat(c.spend || 0);
      b.impressions += parseFloat(c.impressions || 0);
      b.clicks += parseFloat(c.clicks || 0);
      b.reach += parseFloat(c.reach || 0);
      b.result += result;
      b.campaignCount += 1;
    });
  });

  // WhatsApp aggregate for the Learnalot-specific section. Same shape
  // as book.byPlatform entries but keyed by "WhatsApp" via campaign
  // name (_wapp_ / _whatsapp_ tokens). Conversations come from Meta
  // CAPI onsite_conversion.messaging_conversation_started_7d on the
  // campaign's actions array (same 7d window Meta uses in Ads
  // Manager). Consumed by renderBofuSection to emit the WhatsApp PSI
  // Leads sub when the report is for Learnalot.
  var whatsapp = { spend: 0, impressions: 0, clicks: 0, reach: 0, conversations: 0, firstReplies: 0, engaged3: 0, engaged2: 0, depth5Thresholds: 0, connections: 0, replied7d: 0, campaignCount: 0 };
  var _isWApp = function(name) {
    var s = String(name || "").toLowerCase();
    return s.indexOf("_wapp_") >= 0 || s.indexOf("wapp_") >= 0 || s.indexOf("_whatsapp_") >= 0 || s.indexOf(" whatsapp ") >= 0 || s.indexOf("_wa_") >= 0;
  };
  var _maxActionByType = function(actions, type) {
    var best = 0;
    var t = String(type).toLowerCase();
    (actions || []).forEach(function(a) {
      if (String(a.action_type || "").toLowerCase() === t) {
        var v = parseFloat(a.value || 0);
        if (v > best) best = v;
      }
    });
    return best;
  };
  (campaigns || []).forEach(function(c) {
    if (!_isWApp(c.campaignName)) return;
    whatsapp.spend += parseFloat(c.spend || 0);
    whatsapp.impressions += parseFloat(c.impressions || 0);
    whatsapp.clicks += parseFloat(c.clicks || 0);
    whatsapp.reach += parseFloat(c.reach || 0);
    whatsapp.conversations += _maxActionByType(c.actions, "onsite_conversion.messaging_conversation_started_7d");
    whatsapp.firstReplies += _maxActionByType(c.actions, "onsite_conversion.messaging_first_reply");
    whatsapp.engaged3 += _maxActionByType(c.actions, "onsite_conversion.messaging_user_depth_3_message_send");
    whatsapp.engaged2 += _maxActionByType(c.actions, "onsite_conversion.messaging_user_depth_2_message_send");
    whatsapp.depth5Thresholds += _maxActionByType(c.actions, "onsite_conversion.messaging_user_depth_5_message_send");
    whatsapp.connections += _maxActionByType(c.actions, "onsite_conversion.total_messaging_connection");
    whatsapp.replied7d += _maxActionByType(c.actions, "onsite_conversion.messaging_conversation_replied_7d");
    whatsapp.campaignCount += 1;
  });
  book.whatsapp = whatsapp;

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
  var isGoogle = pl.indexOf("google") >= 0 || pl.indexOf("youtube") >= 0 || pl.indexOf("pmax") >= 0 || pl.indexOf("demand") >= 0;
  var pk = (pl.indexOf("facebook") >= 0 || pl.indexOf("instagram") >= 0) ? "meta" : (pl.indexOf("tiktok") >= 0 ? "tiktok" : isGoogle ? "google" : "");
  // Data URL overrides (captured video frames, uploaded screenshots)
  // ship inline in ad.thumbnail. Render directly, no proxy needed.
  if (ad.thumbnail && /^data:image\//i.test(ad.thumbnail)) return ad.thumbnail;
  // Google path: route the raw tpc.googlesyndication.com URL through
  // /api/ad-image?platform=google&url=... so the PDF popup fetches
  // it same-origin. Google's ad-serving CDN blocks cross-origin <img>
  // loads with a 200-but-blank / 403 response, same failure mode the
  // dashboard hit before commit 5225539. Without this the Google
  // Display cards in Section 05 render dark thumbnails just like the
  // dashboard did pre-fix. YouTube thumbs (img.youtube.com) also
  // route through the same proxy for consistency.
  if (pk === "google" && ad.thumbnail && origin) {
    var gAuth = shareToken ? ("&token=" + shareToken) : "";
    return origin + "/api/ad-image?platform=google&adId=" + encodeURIComponent(ad.adId || "anon") + "&url=" + encodeURIComponent(ad.thumbnail) + gAuth;
  }
  if (!pk || !ad.adId) return ad.thumbnail || "";
  var isMixed = pk === "meta" && (String(ad.format || "").toUpperCase() === "MIXED" || ad.multiCreative);
  // Fast path: raw thumbnail is present and the ad is not a MIXED
  // DCO ad — use the raw signed CDN URL directly, matches dashboard's
  // thumbFor line ~4228.
  if (ad.thumbnail && !isMixed) return ad.thumbnail;
  if (!origin || !shareToken) return ad.thumbnail || "";
  var cid = String(ad.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
  var win = isMixed ? "&winner=1" : "";
  return origin + "/api/ad-image?platform=" + pk + "&adId=" + encodeURIComponent(ad.adId) + (cid ? ("&campaignId=" + encodeURIComponent(cid)) : "") + win + "&token=" + shareToken;
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
    { label: "Ads Served", value: fmtNum(g.impressions), primary: true },
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
  // Blended CTR + CPC use ALL-CAMPAIGNS math so the tile reconciles
  // with what Meta / TikTok / Google report on their own platforms
  // and with the dashboard's Summary Blended CTR tile (2026-07-30 fix,
  // App.jsx blCtr = totalClicks / totalImps). Previously used
  // engagement-only totals (awareness campaigns stripped from the
  // denominator) which inflated TikTok's CTR to 53% when the platform
  // itself reports ~30%, a client-trust problem in the PDF.
  var globalKpis = [
    { label: "Total Clicks", value: fmtNum(g.clicks), primary: true, sub: "all campaigns" },
    { label: "Blended CTR", value: fmtPct(ctrOf(g)), sub: "all campaigns" },
    { label: "Blended CPC", value: fmtR(cpcOf(g)), sub: "all campaigns" },
    { label: "Total Spend", value: fmtR(g.spend), sub: "all campaigns" }
  ];
  // Per-platform table reads ALL-CAMPAIGNS clicks / CTR / CPC too so
  // the row values reconcile with what each platform's UI reports.
  // Impressions + frequency + spend already came from the full-mix
  // book.byPlatform bucket, so switching clicks + CTR + CPC to the
  // same source keeps every row's numbers consistent by construction.
  var columns = [
    { key: "platform", label: "Platform", align: "left" },
    { key: "impressions", label: "Impressions", format: "int" },
    { key: "clicks", label: "Clicks", format: "int" },
    { key: "ctr", label: "CTR", format: "%", compute: function(row) { return ctrOf(row); } },
    { key: "cpc", label: "CPC", format: "R", compute: function(row) { return cpcOf(row); } },
    { key: "freq", label: "Frequency", format: "freq", compute: frequencyOf },
    { key: "spend", label: "Spend", format: "R" }
  ];
  // Rewritten lede per owner spec: name the objective-appropriate
  // action types the ads are asking the audience to take rather than
  // generic engagement description.
  var lede = "The intent-capture layer. This stage takes audiences who now recognise the brand and asks them to take the action their campaign objective calls for, whether that is a click through to a landing page, a click to the app store to download the app, a like or follow of the brand's social pages, or a click through to a lead form.";
  // Two-paragraph Performance Insights. All-campaigns reads so the
  // narrative matches the tile above and the per-platform table.
  var bp = book.byPlatform || {};
  var platforms = Object.keys(bp).sort(function(a, b) { return ctrOf(bp[b]) - ctrOf(bp[a]); });
  var gCtr = ctrOf(g);
  var gCpc = cpcOf(g);
  var p1 = "", p2 = "";
  if (platforms.length) {
    var best = platforms[0];
    var bestCtr = ctrOf(bp[best]);
    var bestCpc = cpcOf(bp[best]);
    var readCtr = gCtr >= 1.2 ? "strong click-through performance" : gCtr >= 0.8 ? "healthy click-through performance sitting inside the 0.8% to 1.2% consideration benchmark" : "click-through performance below the 0.8% consideration benchmark, indicating creative fatigue or a message-audience mismatch is worth investigating";
    p1 = fmtNum(g.clicks) + " clicks were captured across the reporting window at a blended click-through rate of " + fmtPct(gCtr) + " and a blended cost-per-click of " + fmtR(gCpc) + ". That reads as " + readCtr + ". " + escapeHtmlLocal(best) + " led the platforms at " + fmtPct(bestCtr) + " CTR and " + fmtR(bestCpc) + " CPC, indicating the strongest creative-audience resonance for this window's message and audience combination.";
    var cheapest = platforms.slice().sort(function(a, b) {
      var ca = cpcOf(bp[a]) || Infinity;
      var cb = cpcOf(bp[b]) || Infinity;
      return ca - cb;
    })[0];
    var cheapestNote = cheapest && cheapest !== best ? escapeHtmlLocal(cheapest) + " delivered the lowest cost-per-click at " + fmtR(cpcOf(bp[cheapest])) + ", a candidate for scale in the next window if the audience quality holds. " : "";
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
  // Two-path leads layout: 8-tile octet + standRow + lead-first narrative +
  // bar chart, so the report reads identically to the dashboard Summary.
  // Triggered whenever the client shows any two-path lead signal, either
  // Meta CAPI WhatsApp QualifiedLeads recorded in customOutcomes, live
  // WhatsApp Conversations activity from Meta's messaging actions, or a
  // Learnalot slug (backwards-compat: keeps the octet rendering for their
  // reports even in periods where all counts happen to be zero, so the
  // layout stays consistent). Every other single-path client keeps the
  // standard renderBofuObjective sub for Leads.
  var _isLearnalot = String(opts.clientSlug || "").toLowerCase().indexOf("learnalot") >= 0;
  var wa = book.whatsapp;
  var coList = Array.isArray(opts.customOutcomes) ? opts.customOutcomes : [];
  var _monthsInRange = {};
  if (opts.from && opts.to) {
    var _d = new Date(opts.from + "T00:00:00Z");
    var _e = new Date(opts.to + "T00:00:00Z");
    if (!isNaN(_d.getTime()) && !isNaN(_e.getTime())) {
      while (_d <= _e) {
        var _y = _d.getUTCFullYear();
        var _m = _d.getUTCMonth() + 1;
        _monthsInRange[_y + "-" + (_m < 10 ? "0" : "") + _m] = 1;
        _d.setUTCMonth(_d.getUTCMonth() + 1);
      }
    }
  }
  var activeCo = coList.filter(function(o) { return _monthsInRange[o.month]; });
  var waLeadTotal = 0;
  var waUniqueUsers = 0;
  activeCo.forEach(function(o) {
    var isWA = /whatsapp|wapp|(^| )wa /i.test(String(o.label || ""));
    if (isWA) {
      waLeadTotal += parseInt(o.count || 0, 10);
      if (o.uniqueUsers != null) waUniqueUsers += parseInt(o.uniqueUsers || 0, 10);
    }
  });
  // Pre-computed override from the dashboard's Summary calc (2026-08
  // architectural fix). When the dashboard ships waLeadTotal +
  // waUniqueUsers directly, use those values verbatim rather than
  // relying on server-side aggregation to reproduce the browser's
  // math. Guarantees PDF matches dashboard by construction, no
  // month-filter or label-regex mismatch to debug.
  if (opts.learnalotBofuOverride && opts.learnalotBofuOverride.waLeadTotal > 0) {
    waLeadTotal = parseInt(opts.learnalotBofuOverride.waLeadTotal, 10) || 0;
    if (opts.learnalotBofuOverride.waUniqueUsers != null) {
      waUniqueUsers = parseInt(opts.learnalotBofuOverride.waUniqueUsers, 10) || 0;
    }
    try { console.log("[report] BoFu override applied", { waLeadTotal: waLeadTotal, waUniqueUsers: waUniqueUsers }); } catch (_) {}
  }
  var formLeadsBucket = byObj["Leads"] && byObj["Leads"].global ? byObj["Leads"].global : null;
  var formLeadsCount = formLeadsBucket ? (formLeadsBucket.result || 0) : 0;
  var formLeadsSpend = formLeadsBucket ? (formLeadsBucket.spend || 0) : 0;
  // Octet triggers when the client is Learnalot (backwards-compat) or
  // when customOutcomes contain WhatsApp QualifiedLeads for the report
  // period. Previously also fired on any wa activity (spend / conversations
  // / engaged3) but that lit up the octet for any client running WhatsApp
  // campaigns, which is not what the two-path model represents.
  var showLearnalotOctet = _isLearnalot || waLeadTotal > 0;
  try {
    console.log("[report] Two-path BoFu render", {
      slug: opts.clientSlug, from: opts.from, to: opts.to,
      formLeadsCount: formLeadsCount, formLeadsSpend: formLeadsSpend,
      waLeadTotal: waLeadTotal, coListLen: coList.length, activeCoLen: activeCo.length,
      waConversations: (wa && wa.conversations) || 0,
      waEngaged3: (wa && wa.engaged3) || 0,
      waSpend: (wa && wa.spend) || 0,
      isLearnalot: _isLearnalot, hasWaActivity: _hasWaActivity,
      showOctet: showLearnalotOctet
    });
  } catch (_) { /* logging is best-effort */ }

  if (showLearnalotOctet) {
    // ── DIAGNOSTIC BANNER ────────────────────────────────────────
    // If the octet is rendering (Learnalot slug detected) but
    // waLeadTotal is 0, show a visible warning at the top of the
    // section so the operator immediately sees WHY WhatsApp Leads
    // reads 0 and blended CPL is inflated. Common causes: custom
    // outcomes not entered for the report month, entry label doesn't
    // match the WhatsApp regex, or customOutcomes body was empty on
    // the request. The banner is invisible when everything is fine.
    var _diagBanner = "";
    if (_isLearnalot && waLeadTotal === 0) {
      var _reason;
      if (coList.length === 0) _reason = "No custom outcomes reached the report generator. The dashboard may not have loaded the outcomes state before Download PDF was clicked, or the client slug lookup fell through.";
      else if (activeCo.length === 0) _reason = "Custom outcomes exist (" + coList.length + " total) but none match the report window months. Add or update the outcome for the correct month in Settings, Custom Outcomes.";
      else _reason = "Custom outcomes match the window (" + activeCo.length + " active) but none carry a WhatsApp label. The label must contain \"whatsapp\", \"wapp\", or \" wa \" for the aggregator to pick it up.";
      _diagBanner = '<div style="background:rgba(244,63,94,0.08);border:1px solid #F43F5E55;border-left:3px solid #F43F5E;border-radius:2mm;padding:3mm 4mm;margin-bottom:4mm;font-size:8.5pt;color:var(--rp-fg);line-height:1.5;">' +
        '<strong style="color:#F43F5E;letter-spacing:1px;">Data mismatch:</strong> WhatsApp Leads reads 0 for this report. ' + escapeHtmlLocal(_reason) +
      '</div>';
    }
    // ── OCTET (2×4 tiles) ──────────────────────────────────────────
    var _formCpl = formLeadsCount > 0 ? (formLeadsSpend / formLeadsCount) : 0;
    var _waSpend = wa ? (wa.spend || 0) : 0;
    var _waConv = wa ? (wa.conversations || 0) : 0;
    var _waEng3 = wa ? (wa.engaged3 || 0) : 0;
    var _waCpl = waLeadTotal > 0 && _waSpend > 0 ? (_waSpend / waLeadTotal) : 0;
    var _totalLeads = formLeadsCount + waLeadTotal;
    var _totalSpend = formLeadsSpend + _waSpend;
    var _blendedCpl = _totalLeads > 0 ? (_totalSpend / _totalLeads) : 0;
    var _convToLead = _waConv > 0 && waLeadTotal > 0 ? (waLeadTotal / _waConv * 100) : 0;
    var _eng3Rate = _waConv > 0 ? (_waEng3 / _waConv * 100) : 0;
    var _tile = function(label, value, sub, accent) {
      return `<div class="rp-outcome-tile" style="border-left:3px solid ${accent};padding:4mm 4mm;">
        <div class="rp-outcome-label" style="color:${accent};white-space:normal;font-size:6.5pt;letter-spacing:1px;line-height:1.2;margin-bottom:2mm;min-height:5mm;">${label}</div>
        <div class="rp-outcome-value" style="color:${accent};font-size:15pt;">${value}</div>
        <div class="rp-outcome-sub" style="font-size:7.5pt;line-height:1.35;">${sub}</div>
      </div>`;
    };
    var COL = {
      rose: "#F43F5E", orchid: "#A855F7", solar: "#FFAA00",
      mint: "#34D399", cyan: "#0891B2", ember: "#F96203"
    };
    // Mirror the dashboard's 2026-08 Learnalot BOFU redesign:
    //   1. Blended leads summary (4 tiles, headline)
    //   2. WhatsApp Message Funnel (staged horizontal bars)
    //   3. Efficiency tiles (Cost per Conv, Cost per Engaged 3+,
    //      Engagement Rate)
    // Qualified Leads deliberately live OUTSIDE the funnel because
    // CAPI events (custom outcomes) aren't strictly a subset of Meta's
    // 7-day messaging_conversation_started_7d counter — they use a
    // different attribution window and a different data source, so
    // showing them as a funnel stage produced misleading >100% rates.
    var _waReach = wa ? (wa.reach || 0) : 0;
    var _waFirstReplies = wa ? (wa.firstReplies || 0) : 0;
    var _waCostPerConv = _waConv > 0 && _waSpend > 0 ? (_waSpend / _waConv) : 0;
    var _waCostPerEng = _waEng3 > 0 && _waSpend > 0 ? (_waSpend / _waEng3) : 0;

    // ── Row 1: Blended leads summary (4 tiles) ──────────────────
    var _octet = _diagBanner + '<div class="rp-outcomes-grid" style="grid-template-columns:repeat(4,1fr);">'
      + _tile("Total Leads (Blended)",fmtNum(_totalLeads),                  fmtNum(formLeadsCount) + " form + " + fmtNum(waLeadTotal) + " WhatsApp", COL.solar)
      + _tile("Blended CPL",          _blendedCpl > 0 ? fmtR(_blendedCpl) : "&mdash;", "combined spend / total leads",          COL.solar)
      + _tile("PSI Form Leads",       fmtNum(formLeadsCount),               _formCpl > 0 ? fmtR(_formCpl) + " per form lead" : "Meta lead-form captures", COL.rose)
      + _tile("WhatsApp Leads",       fmtNum(waLeadTotal),                  (waUniqueUsers > 0 ? fmtNum(waUniqueUsers) + " unique users" : "CAPI QualifiedLead events") + (_waCpl > 0 ? " &middot; " + fmtR(_waCpl) + " per lead" : ""), COL.orchid)
      + '</div>';

    // ── Row 2: WhatsApp Message Funnel (staged bars) ────────────
    // Reach -> Conversations -> First Reply -> Engaged 3+. Skips
    // stages with zero data so the funnel doesn't show ghost columns.
    // All four stages come from Meta's internally-consistent messaging
    // attribution so the % cascade never exceeds 100.
    var _funnelStages = [];
    if (_waReach > 0) _funnelStages.push({ label: "Reach",                 val: _waReach,       sub: "unique people who saw the ad" });
    _funnelStages.push({                     label: "Conversations Opened",val: _waConv,        sub: "tapped WhatsApp to start a chat" });
    if (_waFirstReplies > 0) _funnelStages.push({ label: "First Reply Sent",val: _waFirstReplies,sub: "got past the initial greeting" });
    _funnelStages.push({                     label: "Engaged 3+ Messages", val: _waEng3,        sub: "three or more messages exchanged" });
    var _fTop = _funnelStages.length ? _funnelStages[0].val : 0;
    var _funnelBlock = "";
    if (_funnelStages.length >= 2 && _fTop > 0) {
      var _fRows = _funnelStages.map(function(st, i) {
        var pctOfTop = _fTop > 0 ? (st.val / _fTop * 100) : 0;
        var prevVal = i > 0 ? _funnelStages[i - 1].val : 0;
        var pctOfPrev = prevVal > 0 ? (st.val / prevVal * 100) : null;
        var prevColor = pctOfPrev === null ? COL.mint : (pctOfPrev >= 50 ? COL.mint : (pctOfPrev >= 25 ? COL.solar : COL.rose));
        var prevLabel = pctOfPrev === null ? "starting point" : (pctOfPrev.toFixed(2) + "% of previous");
        return `<div style="display:grid;grid-template-columns:50mm 22mm 1fr 45mm;align-items:center;gap:4mm;margin-bottom:2.5mm;">
          <div style="font-size:9pt;font-weight:800;color:var(--rp-fg);letter-spacing:0.3px;">${escapeHtmlLocal(st.label)}</div>
          <div style="font-size:11pt;font-weight:900;color:${COL.mint};font-variant-numeric:tabular-nums;text-align:right;">${fmtNum(st.val)}</div>
          <div style="position:relative;height:4mm;background:rgba(255,255,255,0.05);border-radius:1mm;overflow:hidden;">
            <div style="position:absolute;inset:0 auto 0 0;width:${Math.max(pctOfTop, 1).toFixed(1)}%;background:linear-gradient(90deg,${COL.mint},${COL.mint}70);border-radius:1mm;"></div>
          </div>
          <div style="font-size:7.5pt;color:var(--rp-fg-dim);text-align:right;line-height:1.35;">
            <div style="color:${prevColor};font-weight:800;font-size:8pt;">${prevLabel}</div>
            <div style="margin-top:0.5mm;">${escapeHtmlLocal(st.sub)}</div>
          </div>
        </div>`;
      }).join("");
      _funnelBlock = `<div class="rp-bofu-sub" style="page-break-inside:avoid;margin-top:4mm;">
        <div class="rp-bofu-sub-head" style="display:flex;justify-content:space-between;align-items:baseline;">
          <div class="rp-bofu-sub-title" style="color:${COL.mint};">WhatsApp Message Funnel</div>
          <div style="font-size:8pt;color:var(--rp-fg-dim);">drop-off between stages, engagement quality signal</div>
        </div>
        <div style="margin-top:3mm;">${_fRows}</div>
      </div>`;
    }

    // ── Row 3: WhatsApp efficiency tiles (3) ────────────────────
    var _efficiencyBlock = "";
    if (_waConv > 0 || _waEng3 > 0) {
      _efficiencyBlock = '<div class="rp-outcomes-grid" style="grid-template-columns:repeat(3,1fr);margin-top:3mm;">'
        + _tile("Cost per Conversation", _waCostPerConv > 0 ? fmtR(_waCostPerConv) : "&mdash;", "WhatsApp spend / conversations opened", COL.mint)
        + _tile("Cost per Engaged 3+",   _waCostPerEng > 0 ? fmtR(_waCostPerEng) : "&mdash;", "spend / conversations reaching 3+ messages", COL.mint)
        + _tile("Engagement Rate",       _eng3Rate > 0 ? _eng3Rate.toFixed(2) + "%" : "&mdash;", fmtNum(_waEng3) + " of " + fmtNum(_waConv) + " reached 3+ messages", COL.cyan)
        + '</div>';
    }

    // ── Row 4: Meta Messaging Raw Counters ─────────────────────
    // Full transparency table (2026-08 addition) mirroring the
    // dashboard's raw-counters panel. Surfaces every messaging
    // counter Meta returns so the reader can reconcile the CAPI
    // Qualified Leads count against Meta's messaging depth data.
    var _rawCounters = [
      { label: "Total Messaging Connections", val: (wa && wa.connections)      || 0, note: "New user-business connections, no window cap" },
      { label: "Conversations Started (7d)",  val: _waConv,                          note: "Conversations attributed within 7 days of ad click" },
      { label: "First Reply Sent",            val: (wa && wa.firstReplies)     || 0, note: "User sent first response to the bot" },
      { label: "2+ Messages Exchanged",       val: (wa && wa.engaged2)         || 0, note: "Users who reached the 2-message depth threshold" },
      { label: "3+ Messages Exchanged",       val: _waEng3,                          note: "Users who reached the 3-message depth threshold" },
      { label: "5+ Message Thresholds Hit",   val: (wa && wa.depth5Thresholds) || 0, note: "Counts each 5-message threshold cross, NOT unique users" }
    ];
    var _hasAnyRaw = _rawCounters.some(function(r) { return r.val > 0; });
    var _rawBlock = "";
    if (_hasAnyRaw) {
      var _rawRows = _rawCounters.map(function(r) {
        return `<tr>
          <td style="padding:3mm 3mm 3mm 0;font-size:8.5pt;color:var(--rp-fg);font-weight:700;border-top:1px dotted var(--rp-line);">${escapeHtmlLocal(r.label)}</td>
          <td style="padding:3mm 3mm;font-size:9pt;color:${r.val > 0 ? "var(--rp-fg)" : "var(--rp-fg-mute)"};font-weight:900;font-variant-numeric:tabular-nums;text-align:right;border-top:1px dotted var(--rp-line);white-space:nowrap;">${fmtNum(r.val)}</td>
          <td style="padding:3mm 0 3mm 3mm;font-size:7.5pt;color:var(--rp-fg-mute);line-height:1.4;border-top:1px dotted var(--rp-line);">${escapeHtmlLocal(r.note)}</td>
        </tr>`;
      }).join("");
      _rawBlock = `<div class="rp-bofu-sub" style="page-break-inside:avoid;margin-top:4mm;">
        <div class="rp-bofu-sub-head" style="display:flex;justify-content:space-between;align-items:baseline;">
          <div class="rp-bofu-sub-title" style="color:${COL.cyan};">Meta Messaging Raw Counters</div>
          <div style="font-size:8pt;color:var(--rp-fg-dim);">every messaging metric Meta returns, for reconciliation</div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:2mm;">
          <thead><tr>
            <th style="text-align:left;font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--rp-fg-mute);font-weight:900;padding:0 3mm 2mm 0;border-bottom:1px solid var(--rp-line);">Metric</th>
            <th style="text-align:right;font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--rp-fg-mute);font-weight:900;padding:0 3mm 2mm 3mm;border-bottom:1px solid var(--rp-line);">Value</th>
            <th style="text-align:left;font-size:7pt;letter-spacing:1.5px;text-transform:uppercase;color:var(--rp-fg-mute);font-weight:900;padding:0 0 2mm 3mm;border-bottom:1px solid var(--rp-line);">Note</th>
          </tr></thead>
          <tbody>${_rawRows}</tbody>
        </table>
        <div style="margin-top:3mm;padding-top:2.5mm;border-top:1px solid var(--rp-line);font-size:7.5pt;color:var(--rp-fg-mute);line-height:1.5;">
          <strong style="color:var(--rp-fg);font-weight:800;">Reconciliation note:</strong> The 5+ counter fires on every 5-message threshold cross (5, 10, 15, ...) so its value is inflated versus unique users. CAPI Qualified Leads above are captured independently by the bot and reconcile against the "Unique Users" column in Meta Events Manager, not against these depth counters.
        </div>
      </div>`;
    }
    _octet = _octet + _funnelBlock + _efficiencyBlock + _rawBlock;

    // ── COST PER LEAD BY PATH — mini horizontal bar comparison ────
    var _barCap = Math.max(_formCpl, _waCpl) || 1;
    var _bar = function(label, cpl, accent) {
      var pct = cpl > 0 ? (cpl / _barCap * 100) : 0;
      return `<div style="display:flex;align-items:center;gap:4mm;margin-bottom:2mm;font-size:9pt;color:var(--rp-fg);">
        <div style="width:36mm;color:var(--rp-fg-dim);">${label}</div>
        <div style="flex:1;background:rgba(255,255,255,0.06);border-radius:1mm;height:5mm;position:relative;">
          <div style="background:${accent};width:${pct.toFixed(1)}%;height:100%;border-radius:1mm;"></div>
        </div>
        <div style="width:24mm;text-align:right;font-weight:800;color:${accent};">${cpl > 0 ? fmtR(cpl) : "n/a"}</div>
      </div>`;
    };
    var _barBlock = (_formCpl > 0 || _waCpl > 0) ? `<div class="rp-bofu-sub" style="page-break-inside:avoid;">
      <div class="rp-bofu-sub-head"><div class="rp-bofu-sub-title">Cost Per Lead by Path</div></div>
      <div class="rp-bofu-sub-desc">Head-to-head efficiency read across Learnalot's two lead paths.</div>
      <div style="margin-top:3mm;">
        ${_bar("PSI Form Leads",  _formCpl, COL.rose)}
        ${_bar("WhatsApp Leads",  _waCpl,   COL.orchid)}
      </div>
    </div>` : "";

    // ── STAND ROW ─────────────────────────────────────────────────
    var _topVol = formLeadsCount >= waLeadTotal ? ["PSI Form Leads", formLeadsCount, COL.rose] : ["WhatsApp PSI Leads", waLeadTotal, COL.orchid];
    var _effPool = [];
    if (_formCpl > 0) _effPool.push({ k: "PSI Form Leads", v: _formCpl, c: COL.rose });
    if (_waCpl  > 0) _effPool.push({ k: "WhatsApp PSI Leads", v: _waCpl,  c: COL.orchid });
    _effPool.sort(function(a, b) { return a.v - b.v; });
    var _bestEff = _effPool[0] || null;
    var _standTile = function(label, value, accent) {
      return `<div class="rp-outcome-tile" style="border-left:3px solid ${accent};padding:4mm 4mm;">
        <div class="rp-outcome-label" style="color:${accent};white-space:normal;font-size:6.5pt;letter-spacing:1px;line-height:1.2;margin-bottom:2mm;min-height:5mm;">${label}</div>
        <div class="rp-outcome-value" style="font-size:11pt;color:var(--rp-fg);white-space:normal;line-height:1.25;">${value}</div>
      </div>`;
    };
    var _standRow = `<div class="rp-outcomes-grid" style="grid-template-columns:repeat(4,1fr);margin-top:3mm;">
      ${_standTile("Highest Volume", _topVol[0] + ", " + fmtNum(_topVol[1]), _topVol[2])}
      ${_bestEff ? _standTile("Best Efficiency", _bestEff.k + ", " + fmtR(_bestEff.v) + "/lead", _bestEff.c) : ""}
      ${_blendedCpl > 0 ? _standTile("Blended CPL", fmtR(_blendedCpl), COL.solar) : ""}
      ${_standTile("Total Leads", fmtNum(_totalLeads), COL.ember)}
    </div>`;

    // ── LEAD-FIRST OBJECTIVE INSIGHTS NARRATIVE ───────────────────
    var _narLines = [];
    _narLines.push(fmtNum(_totalLeads) + " qualified leads were captured across the two paths from " + fmtR(_totalSpend) + " invested" + (_blendedCpl > 0 ? " at a blended " + fmtR(_blendedCpl) + " cost per lead" : "") + ", " + fmtNum(formLeadsCount) + " through PSI lead forms and " + fmtNum(waLeadTotal) + " as WhatsApp qualified leads.");
    if (formLeadsCount > 0 && waLeadTotal > 0) {
      var _pathVol = formLeadsCount >= waLeadTotal ? "PSI Form Leads" : "WhatsApp PSI Leads";
      var _pathEff = _formCpl > 0 && _waCpl > 0 ? (_formCpl <= _waCpl ? "PSI Form Leads" : "WhatsApp PSI Leads") : (_formCpl > 0 ? "PSI Form Leads" : "WhatsApp PSI Leads");
      _narLines.push(_pathVol + " led on volume" + (_pathEff === _pathVol ? " and on efficiency, the stronger path on both dimensions" : "; " + _pathEff + " led on efficiency at " + fmtR(_pathEff === "PSI Form Leads" ? _formCpl : _waCpl) + " per lead vs " + fmtR(_pathVol === "PSI Form Leads" ? _formCpl : _waCpl) + " on " + _pathVol) + ".");
    }
    if (_waConv > 0) {
      var _cpc = _waConv > 0 ? (_waSpend / _waConv) : 0;
      var _funnelBits = [];
      _funnelBits.push(fmtNum(_waConv) + " paid conversations opened at " + fmtR(_cpc) + " per conversation");
      if (_waEng3 > 0) _funnelBits.push(fmtNum(_waEng3) + " engaged 3+ messages");
      if (_convToLead > 0) _funnelBits.push(_convToLead.toFixed(2) + "% of conversations became a qualified lead");
      _narLines.push("WhatsApp mid-funnel context, " + _funnelBits.join(", ") + ", the volume the WhatsApp lead conversions came out of.");
    }
    var _narrative = `<div class="rp-bofu-sub" style="page-break-inside:avoid;">
      <div class="rp-bofu-sub-head"><div class="rp-bofu-sub-title">Objective Insights</div></div>
      <div class="rp-bofu-sub-desc" style="line-height:1.6;">${_narLines.join(" ")}</div>
    </div>`;

    // Push each piece as its own sub — a single wrapper with the
    // whole Learnalot layout was too tall for `.rp-bofu-sub`'s
    // `page-break-inside: avoid` and the browser pushed it off-page,
    // leaving section 03 blank. Separated pieces page-break naturally
    // between them.
    subs.push(`<div class="rp-bofu-sub" style="page-break-inside:avoid;">
      <div class="rp-bofu-sub-head"><div class="rp-bofu-sub-title">Leads Captured</div><div class="rp-bofu-sub-total">${fmtNum(_totalLeads)}</div></div>
      <div class="rp-bofu-sub-desc">Learnalot runs two lead paths in parallel: PSI Form Leads via Meta lead forms (full platform attribution) and WhatsApp PSI Leads via CAPI QualifiedLead events on the client&rsquo;s Meta dataset (event-scoped, no per-lead demographic attribution). The tiles below show each path independently plus a blended total that matches the dashboard Total Leads (blended) card.</div>
      ${_octet}
    </div>`);
    if (_barBlock) subs.push(_barBlock);
    subs.push(`<div class="rp-bofu-sub" style="page-break-inside:avoid;">
      <div class="rp-bofu-sub-head"><div class="rp-bofu-sub-title">Leads Standouts</div></div>
      ${_standRow}
    </div>`);
    subs.push(_narrative);
  } else {
    // Non-Learnalot: keep the existing Leads Captured sub layout.
    subs.push(renderBofuObjective(byObj["Leads"], {
      key: "Leads",
      title: "Leads Captured",
      description: "Direct-response leads captured from in-platform forms or landing-page submissions during the reporting period.",
      columnLabel: "Leads",
      resultKey: "lead"
    }));

    // WhatsApp Conversations sub for non-Learnalot clients whose
    // selection includes WhatsApp campaigns (rare, but supported).
    if (wa && wa.conversations > 0) {
      var waCPC = wa.conversations > 0 ? (wa.spend / wa.conversations) : 0;
      var waFrRate = wa.conversations > 0 ? (wa.firstReplies / wa.conversations * 100) : 0;
      var waEngRate = wa.conversations > 0 ? (wa.engaged3 / wa.conversations * 100) : 0;
      var waFunnelBits = [];
      if (wa.firstReplies > 0) waFunnelBits.push(fmtNum(wa.firstReplies) + " first replies (" + waFrRate.toFixed(2) + "%)");
      if (wa.engaged3 > 0) waFunnelBits.push(fmtNum(wa.engaged3) + " engaged 3+ messages (" + waEngRate.toFixed(2) + "%)");
      var waFunnelLine = waFunnelBits.length ? '<div class="rp-bofu-sub-desc" style="margin-top:6px;">' + waFunnelBits.join(" &middot; ") + '</div>' : "";
      subs.push(`<div class="rp-bofu-sub">
        <div class="rp-bofu-sub-head">
          <div class="rp-bofu-sub-title">WhatsApp Conversations</div>
          <div class="rp-bofu-sub-total">${fmtNum(wa.conversations)}</div>
        </div>
        <div class="rp-bofu-sub-desc">New paid-media-driven WhatsApp conversations opened during the reporting period. Same 7-day attribution window Meta uses in Ads Manager.</div>
        <div class="rp-bofu-sub-costline">Cost per conversation: <strong>${waCPC > 0 ? fmtR(waCPC) : "n/a"}</strong> &middot; Spend on this objective: <strong>${fmtR(wa.spend)}</strong></div>
        ${waFunnelLine}
      </div>`);
    }
  }

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

// Dashboard's classifyObjective (App.jsx ~5397) — ported verbatim.
// Returns "Leads" | "Followers" | "CommunityReach" | "Traffic". Used
// to weight demographic rows by the objective-appropriate metric so
// AGE BREAKDOWN / REGION BREAKDOWN reconcile with the dashboard's
// Demographics tab OBJECTIVE stage block, not raw clicks.
function classifyObjectiveDb(camp) {
  var canon = String((camp && camp.objective) || "").toLowerCase();
  var n = String((camp && camp.campaignName) || "").toLowerCase();
  if (n.indexOf("follow/like-audience") >= 0 || /(^|[_\s|\-])reach([_\s|\-]|$)/.test(n)) return "CommunityReach";
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0 || n.indexOf("app_install") >= 0) return "Traffic";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("_like ") >= 0 || n.indexOf("paidsocial_like") >= 0 || n.indexOf("like_facebook") >= 0 || n.indexOf("like_instagram") >= 0) return "Followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "Leads";
  if (canon === "leads") return "Leads";
  if (canon === "followers") return "Followers";
  if (canon === "community_reach") return "CommunityReach";
  if (canon === "appinstall" || canon === "landingpage") return "Traffic";
  return "Traffic";
}

// Build the campaign-id → objective-type lookup used by the objective
// weighter. Registers both the suffixed and raw form (Meta strips the
// _facebook / _instagram suffix on its breakdown rows so a demographic
// row's campaignId may or may not carry the suffix). Mirrors dashboard
// App.jsx ~5437.
function buildCampaignObjType(campaigns) {
  var map = {};
  (campaigns || []).forEach(function(c) {
    var type = classifyObjectiveDb(c);
    var cid = String(c.campaignId || "");
    if (cid) map[cid] = type;
    var raw = c.rawCampaignId || cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    if (raw) map[raw] = type;
  });
  return map;
}

// Row weight for the OBJECTIVE stage (App.jsx ~5455 stageDef.objective.field).
// Leads → r.results.leads, Followers → follows+pageLikes, everything
// else → r.clicks. Used by both aggregateAgeGender and aggregateRegion
// so age / region breakdowns weight the same way the dashboard's
// Demographics OBJECTIVE stage does.
function objectiveWeight(row, campaignObjType) {
  var cid = String((row && row.campaignId) || "");
  var type = campaignObjType[cid]
    || campaignObjType[cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "")]
    || "Traffic";
  var rs = (row && row.results) || {};
  if (type === "Leads") return parseFloat(rs.leads || 0);
  if (type === "Followers") return parseFloat(rs.follows || 0) + parseFloat(rs.pageLikes || 0);
  return parseFloat((row && row.clicks) || 0);
}

// Objective-weighted age/gender aggregation. Mirrors the dashboard's
// Demographics OBJECTIVE stage (App.jsx ~5455). Each row is weighted
// by its campaign's objective-appropriate metric (Leads → lead count,
// Followers → follows+pageLikes, else → clicks) so the AGE BREAKDOWN
// and REGION BREAKDOWN reconcile with the dashboard's Objective
// stage block. Age tally seeds ONLY with ALLOWED_AGES so the dominant
// age can never be "unknown" (Google GAQL returns UNKNOWN for
// privacy-blocked users). Gender tally seeds with only female/male.
// Aggregates two views in a single pass: click-weighted and
// objective-weighted. Persona cards (mirror dashboard
// TargetingPersonaCard which uses stageDef.engagement = clicks per
// owner methodology) read from ageClicksPersona / genderClicks /
// segMapClicks. Age & Region bar charts (mirror the dashboard
// Demographics OBJECTIVE stage) read from ageObj / genderObj /
// segMapObj / byRegionObj.
function aggregateAgeGender(rows, campaignObjType) {
  var byPlat = {};
  var ageClicksAll = {}, ageObjAll = {};
  var genderClicksAll = { male: 0, female: 0 };
  var genderObjAll = { male: 0, female: 0 };
  var initAllowedMap = function() { var m = {}; ALLOWED_AGES.forEach(function(a) { m[a] = 0; }); return m; };
  ALLOWED_AGES.forEach(function(a) { ageClicksAll[a] = 0; ageObjAll[a] = 0; });
  (rows || []).forEach(function(r) {
    var age = String(r.age || "");
    if (EXCLUDED_AGES[age]) return; // 13-17 hard-drop, owner rule
    var p = platformFamily(r.platform || "Other");
    if (!byPlat[p]) byPlat[p] = {
      // Persona-scope age tallies — INCLUDE any non-13-17 age string
      // ("unknown", "13-17"-excluded, everything else) so dominant age
      // matches dashboard buildPersona (App.jsx ~7095) exactly. Empty
      // maps not seeded here; keys added on first hit. Impression
      // tally kept alongside clicks because TikTok's persona reads
      // ageImpressionsPersona (per-platform data-quality decision
      // taken 2026-08-13, commit 3ed265f — TikTok's `clicks` metric
      // from AUDIENCE reports is broad taps not link clicks, so
      // impressions is the honest reach view for that platform).
      // Every other platform's persona still reads ageClicksPersona.
      ageClicksPersona: {}, ageObjPersona: {}, ageImpressionsPersona: {},
      // Age-breakdown-scope tallies — CLASSIFIED bands only. Matches
      // dashboard's Demographics OBJECTIVE stage which iterates
      // ageOrder only (App.jsx ~5831 topAgeFor).
      ageClicks: initAllowedMap(), ageObj: initAllowedMap(),
      genderClicks: { male: 0, female: 0 }, genderObj: { male: 0, female: 0 }, genderImpressions: { male: 0, female: 0 },
      segMapClicks: {}, segMapObj: {}, segMapImpressions: {},
      impressions: 0, clicks: 0, spend: 0, weight: 0
    };
    var bp = byPlat[p];
    var clicks = parseInt(r.clicks || 0, 10);
    var imps = parseInt(r.impressions || 0, 10);
    var w = campaignObjType ? objectiveWeight(r, campaignObjType) : clicks;
    var rawGender = String(r.gender || "").toLowerCase();
    var g = rawGender === "male" || rawGender === "m" ? "male" : rawGender === "female" || rawGender === "f" ? "female" : "";
    // Persona tally — dashboard buildPersona logic: include ALL ages
    // except the 13-17 exclusion already applied above. Skip empty
    // string (uncoded).
    if (age) {
      bp.ageClicksPersona[age] = (bp.ageClicksPersona[age] || 0) + clicks;
      bp.ageObjPersona[age] = (bp.ageObjPersona[age] || 0) + w;
      bp.ageImpressionsPersona[age] = (bp.ageImpressionsPersona[age] || 0) + imps;
    }
    // Breakdown tally — classified bands only.
    if (ALLOWED_AGES.indexOf(age) >= 0) {
      ageClicksAll[age] += clicks;
      ageObjAll[age] += w;
      bp.ageClicks[age] += clicks;
      bp.ageObj[age] += w;
    }
    if (g === "male" || g === "female") {
      genderClicksAll[g] += clicks;
      genderObjAll[g] += w;
      bp.genderClicks[g] += clicks;
      bp.genderObj[g] += w;
      bp.genderImpressions[g] += imps;
    }
    bp.impressions += imps;
    bp.clicks += clicks;
    bp.spend += parseFloat(r.spend || 0);
    bp.weight += w;
    if (ALLOWED_AGES.indexOf(age) >= 0 && (g === "male" || g === "female")) {
      var k = age + "|" + g;
      bp.segMapClicks[k] = (bp.segMapClicks[k] || 0) + clicks;
      bp.segMapObj[k] = (bp.segMapObj[k] || 0) + w;
      bp.segMapImpressions[k] = (bp.segMapImpressions[k] || 0) + imps;
    }
  });
  return {
    byPlatform: byPlat,
    ageClicksAll: ageClicksAll, ageObjAll: ageObjAll,
    genderClicksAll: genderClicksAll, genderObjAll: genderObjAll
  };
}

// Click-weighted (persona/targeting) and objective-weighted (Demographics
// OBJECTIVE stage) region rollups in one pass. Meta/IG persona cards
// read byPlatformRegionClicks; TikTok persona reads
// byPlatformRegionImpressions per the per-platform data-quality
// decision (see aggregateAgeGender docblock above).
function aggregateRegion(rows, campaignObjType) {
  var byRegion = {};
  var byPlatformRegionClicks = {}, byPlatformRegionObj = {}, byPlatformRegionImpressions = {};
  (rows || []).forEach(function(r) {
    var reg = String(r.region || "").trim();
    if (!reg || reg.toLowerCase() === "unknown") return;
    var p = platformFamily(r.platform || "Other");
    var clicks = parseInt(r.clicks || 0, 10);
    var imps = parseInt(r.impressions || 0, 10);
    var w = campaignObjType ? objectiveWeight(r, campaignObjType) : clicks;
    if (!byRegion[reg]) byRegion[reg] = { impressions: 0, clicks: 0, spend: 0, weight: 0 };
    byRegion[reg].impressions += imps;
    byRegion[reg].clicks += clicks;
    byRegion[reg].spend += parseFloat(r.spend || 0);
    byRegion[reg].weight += w;
    if (!byPlatformRegionClicks[p]) byPlatformRegionClicks[p] = {};
    if (!byPlatformRegionObj[p]) byPlatformRegionObj[p] = {};
    if (!byPlatformRegionImpressions[p]) byPlatformRegionImpressions[p] = {};
    byPlatformRegionClicks[p][reg] = (byPlatformRegionClicks[p][reg] || 0) + clicks;
    byPlatformRegionObj[p][reg] = (byPlatformRegionObj[p][reg] || 0) + w;
    byPlatformRegionImpressions[p][reg] = (byPlatformRegionImpressions[p][reg] || 0) + imps;
  });
  return {
    byRegion: byRegion,
    byPlatformRegionClicks: byPlatformRegionClicks,
    byPlatformRegionObj: byPlatformRegionObj,
    byPlatformRegionImpressions: byPlatformRegionImpressions
  };
}

// Render the audience/demographics section. Persona cards mirror the
// dashboard's TargetingPersonaCard (App.jsx ~850): all four platforms
// (Facebook / Instagram / TikTok / Google Ads) are click-weighted per
// team standard. Team reverted a brief per-platform impression-
// weighting attempt for TikTok on 2026-08-14 (was 3ed265f / e96abb5)
// — they prefer TikTok's honest broad-tap engagement demographic on
// the card even acknowledging its metric-definition asymmetry with
// Meta's link clicks. Every calculation excludes 13-17 (owner rule).
function renderAudienceSection(opts) {
  var demo = opts.demographics;
  if (!demo || (!Array.isArray(demo.ageGender) && !Array.isArray(demo.region))) return "";
  // /api/demographics only applies its campaignIds scope filter when
  // the caller is client-role. This report fetches with an admin
  // api-key so we receive the FULL account demographics, then we
  // filter here to the selected campaigns exactly the way the
  // dashboard does (App.jsx ~5293-5294 inSel). Without this filter
  // the persona reads dominated by campaigns the client's report is
  // NOT actually reporting on (e.g. wrong account or non-selected
  // campaign that heavy-indexes on 65+).
  var campaignsList = (opts.summary && opts.summary.campaigns) || [];
  var selSet = {};
  campaignsList.forEach(function(c) {
    var cid = String(c.campaignId || "");
    if (cid) selSet[cid] = true;
    var raw = c.rawCampaignId || cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    if (raw) selSet[raw] = true;
  });
  var inSel = function(r) {
    var cid = String((r && r.campaignId) || "");
    if (selSet[cid]) return true;
    var raw = cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    return !!selSet[raw];
  };
  // Client-side scope filter mirrors dashboard exactly. If nothing
  // selected we bail rather than aggregate the whole account.
  if (!Object.keys(selSet).length) return "";
  var ageRows = (demo.ageGender || []).filter(inSel);
  var regRows = (demo.region || []).filter(inSel);
  var cot = opts.campaignObjType || {};
  var agAgg = aggregateAgeGender(ageRows, cot);
  var regAgg = aggregateRegion(regRows, cot);

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
    // Click-weighted for every platform (Meta / Instagram / TikTok /
    // Google Ads) — team standard, matches dashboard buildPersona.
    var personaMap = pb.ageClicksPersona || {};
    var topAgeKey = "", topAgeVal = 0;
    Object.keys(personaMap).forEach(function(k) { if (personaMap[k] > topAgeVal) { topAgeVal = personaMap[k]; topAgeKey = k; } });
    var ageDenom = Object.keys(personaMap).reduce(function(s, k) { return s + personaMap[k]; }, 0);
    var topAgeShare = ageDenom > 0 ? (topAgeVal / ageDenom * 100) : 0;
    // If the dominant band is "unknown" or any non-standard key, fall
    // through to the strongest classified band so the client-facing
    // hero doesn't read "unknown 45%". % stays relative to the same
    // denominator (persona map) so it stays comparable to what the
    // dashboard would show.
    if (topAgeKey && ALLOWED_AGES.indexOf(topAgeKey) < 0) {
      var altKey = "", altVal = 0;
      ALLOWED_AGES.forEach(function(k) { if ((personaMap[k] || 0) > altVal) { altVal = personaMap[k]; altKey = k; } });
      if (altKey) { topAgeKey = altKey; topAgeVal = altVal; topAgeShare = ageDenom > 0 ? (altVal / ageDenom * 100) : 0; }
    }
    var gSum = pb.genderClicks.male + pb.genderClicks.female;
    var femaleShare = gSum > 0 ? (pb.genderClicks.female / gSum * 100) : 0;
    var maleShare = gSum > 0 ? (pb.genderClicks.male / gSum * 100) : 0;
    var genderLead = femaleShare > maleShare ? "Female" : (maleShare > 0 ? "Male" : "");
    var genderShare = Math.max(femaleShare, maleShare);
    // Region rollup for this platform, click-weighted.
    var pRegs = (regAgg.byPlatformRegionClicks && regAgg.byPlatformRegionClicks[p]) || {};
    var pRegKeys = Object.keys(pRegs).sort(function(a, b) { return pRegs[b] - pRegs[a]; }).slice(0, 3);
    var pRegDenom = Object.keys(pRegs).reduce(function(s, k) { return s + pRegs[k]; }, 0);
    var regionRows = pRegKeys.map(function(rk) {
      var share = pRegDenom > 0 ? (pRegs[rk] / pRegDenom * 100) : 0;
      return `<div class="rp-persona-region"><span class="rp-persona-region-name">${escapeHtmlLocal(rk)}</span><span class="rp-persona-region-share">${share.toFixed(2)}%</span></div>`;
    }).join("");
    // Best Personas — top 3 age × gender segments, click-weighted.
    var segTotal = Object.keys(pb.segMapClicks).reduce(function(s, k) { return s + pb.segMapClicks[k]; }, 0);
    var segments = Object.keys(pb.segMapClicks).map(function(k) {
      var parts = k.split("|");
      return { age: parts[0], gen: parts[1], val: pb.segMapClicks[k], share: segTotal > 0 ? (pb.segMapClicks[k] / segTotal * 100) : 0 };
    }).sort(function(a, b) { return b.val - a.val; }).slice(0, 3);
    var segRows = segments.map(function(s, i) {
      var label = s.age + " " + (s.gen === "female" ? "Female" : "Male");
      return `<div class="rp-persona-seg"><span class="rp-persona-seg-rank">${i + 1}</span><span class="rp-persona-seg-label">${escapeHtmlLocal(label)}</span><span class="rp-persona-seg-share">${s.share.toFixed(2)}%</span></div>`;
    }).join("");
    return `<div class="rp-persona" style="border-color:${accent}55;">
      <div class="rp-persona-plat" style="background:${accent};">${escapeHtmlLocal(p)}</div>
      <div class="rp-persona-hero">
        <div class="rp-persona-hero-age" style="color:${accent};">${escapeHtmlLocal(topAgeKey || "-")}</div>
        <div class="rp-persona-hero-caption">Dominant Age${topAgeKey ? " &middot; " + topAgeShare.toFixed(2) + "%" : ""}</div>
      </div>
      <div class="rp-persona-strip">
        <div class="rp-persona-strip-tile">
          <div class="rp-persona-strip-label">Gender Lead</div>
          <div class="rp-persona-strip-value">${escapeHtmlLocal(genderLead || "-")}</div>
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

  // Global age breakdown reads the OBJECTIVE-weighted rollup so the
  // bars match the dashboard's Demographics OBJECTIVE stage. 13-17
  // is excluded at ingest so ageOrder here is display-only.
  var ageOrder = ["18-24","25-34","35-44","45-54","55-64","65+"];
  var ageMap = agAgg.ageObjAll || agAgg.ageClicksAll || {};
  var ageTotal = ageOrder.reduce(function(s, k) { return s + (ageMap[k] || 0); }, 0);
  var ageBars = ageOrder.filter(function(k) { return (ageMap[k] || 0) > 0; }).map(function(k) {
    var v = ageMap[k] || 0;
    var pct = ageTotal > 0 ? (v / ageTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#F96203,#FF3D00);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");

  // Region breakdown (top 8). Objective-weighted to match the
  // dashboard's Demographics OBJECTIVE stage.
  var regionKeys = Object.keys(regAgg.byRegion).sort(function(a, b) { return (regAgg.byRegion[b].weight || 0) - (regAgg.byRegion[a].weight || 0); }).slice(0, 8);
  var regionTotal = regionKeys.reduce(function(s, k) { return s + (regAgg.byRegion[k].weight || 0); }, 0);
  var regionBars = regionKeys.map(function(k) {
    var v = regAgg.byRegion[k].weight || 0;
    var pct = regionTotal > 0 ? (v / regionTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${escapeHtmlLocal(k)}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,#4599FF,#00F2EA);"></div></div>
      <div class="rp-bar-value">${fmtNum(v)} <span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");

  var insight = "";
  if (regionKeys.length && ageOrder.some(function(k) { return (ageMap[k] || 0) > 0; })) {
    var topRegion = regionKeys[0];
    var topRegionPct = regionTotal > 0 ? ((regAgg.byRegion[topRegion].weight || 0) / regionTotal * 100) : 0;
    var topAgeKeyG = "", topAgeValG = 0;
    ageOrder.forEach(function(k) { if ((ageMap[k] || 0) > topAgeValG) { topAgeValG = ageMap[k]; topAgeKeyG = k; } });
    insight = "The perfect target audience for this window is anchored in " + escapeHtmlLocal(topRegion) + " (" + topRegionPct.toFixed(2) + "% of objective results) with the " + escapeHtmlLocal(topAgeKeyG) + " age band the most engaged demographic. Refining lookalikes and interest layers to reinforce this signal is likely to compound efficiency in the next window.";
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
    ${renderInsight("Performance Insights", insight)}
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: LEARNALOT — WHATSAPP AUDIENCE (LEARNALOT-ONLY)
// ═══════════════════════════════════════════════════════════════════

// Mirrors the dashboard's WhatsApp Audience panel line-for-line. The
// CAPI QualifiedLead events can't be broken down individually, so the
// panel shows the age / gender split of the WhatsApp conversations
// that produced them (the closest available proxy). Only renders when
// the report is for Learnalot AND demographics carry
// messagingConversations from at least one WhatsApp campaign.
function renderLearnalotWhatsAppAudience(opts) {
  var isLearnalot = String(opts.clientSlug || "").toLowerCase().indexOf("learnalot") >= 0;
  if (!isLearnalot) return "";
  var demo = opts.demographics;
  if (!demo || !Array.isArray(demo.ageGender)) return "";

  var campaignsList = (opts.summary && opts.summary.campaigns) || [];
  var selSet = {};
  campaignsList.forEach(function(c) {
    var cid = String(c.campaignId || "");
    if (cid) selSet[cid] = true;
    var raw = c.rawCampaignId || cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    if (raw) selSet[raw] = true;
  });
  var inSel = function(r) {
    var cid = String((r && r.campaignId) || "");
    if (selSet[cid]) return true;
    var raw = cid.replace(/_facebook$/, "").replace(/_instagram$/, "").replace(/^google_/, "");
    return !!selSet[raw];
  };
  var isWAppName = function(name) {
    var s = String(name || "").toLowerCase();
    return s.indexOf("_wapp_") >= 0 || s.indexOf("wapp_") >= 0 || s.indexOf("_whatsapp_") >= 0 || s.indexOf(" whatsapp ") >= 0;
  };
  var wappRows = demo.ageGender.filter(function(r) { return inSel(r) && isWAppName(r.campaignName); });
  var bucketTotal = 0, byAge = {}, byGender = {};
  wappRows.forEach(function(r) {
    var mc = (r.results && r.results.messagingConversations) || 0;
    if (mc <= 0) return;
    bucketTotal += mc;
    var age = r.age || "unknown";
    var gen = String(r.gender || "unknown").toLowerCase();
    byAge[age] = (byAge[age] || 0) + mc;
    byGender[gen] = (byGender[gen] || 0) + mc;
  });
  if (bucketTotal <= 0) return "";

  // Anchor the headline count on the max-across-placements campaign
  // total (the same number the Objective Highlights tile shows) so
  // the narrative reads consistent with the tile above.
  var maxOfType = function(actions, type) {
    var best = 0;
    (actions || []).forEach(function(a) {
      if (String(a.action_type || "").toLowerCase() === type && parseFloat(a.value || 0) > best) best = parseFloat(a.value || 0);
    });
    return best;
  };
  var headlineConv = 0;
  campaignsList.forEach(function(c) {
    if (!isWAppName(c.campaignName)) return;
    headlineConv += maxOfType(c.actions, "onsite_conversion.messaging_conversation_started_7d");
  });
  if (headlineConv <= 0) headlineConv = bucketTotal;

  var byObj = (opts.book && opts.book.byObjective) || {};
  var formLeadsCount = (byObj["Leads"] && byObj["Leads"].global && byObj["Leads"].global.result) || 0;
  var waLeadTotal = 0;
  var coList = Array.isArray(opts.customOutcomes) ? opts.customOutcomes : [];
  var monthsInRange = {};
  if (opts.from && opts.to) {
    var dR = new Date(opts.from + "T00:00:00Z");
    var eR = new Date(opts.to + "T00:00:00Z");
    if (!isNaN(dR.getTime()) && !isNaN(eR.getTime())) {
      while (dR <= eR) {
        var yR = dR.getUTCFullYear();
        var mR = dR.getUTCMonth() + 1;
        monthsInRange[yR + "-" + (mR < 10 ? "0" : "") + mR] = 1;
        dR.setUTCMonth(dR.getUTCMonth() + 1);
      }
    }
  }
  coList.forEach(function(o) {
    if (!monthsInRange[o.month]) return;
    if (/whatsapp|wapp|(^| )wa /i.test(String(o.label || ""))) waLeadTotal += parseInt(o.count || 0, 10);
  });
  var convRate = headlineConv > 0 && waLeadTotal > 0 ? (waLeadTotal / headlineConv * 100) : 0;

  var ageOrderWA = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "unknown"];
  var ageBarsWA = ageOrderWA.filter(function(a) { return byAge[a]; }).map(function(a) {
    var pct = bucketTotal > 0 ? (byAge[a] / bucketTotal * 100) : 0;
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${a}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:#34D399;"></div></div>
      <div class="rp-bar-value"><span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");
  var genderOrderWA = ["female", "male", "unknown"];
  var genderBarsWA = genderOrderWA.filter(function(g) { return byGender[g]; }).map(function(g) {
    var pct = bucketTotal > 0 ? (byGender[g] / bucketTotal * 100) : 0;
    var label = g.charAt(0).toUpperCase() + g.slice(1);
    return `<div class="rp-bar-row">
      <div class="rp-bar-label">${label}</div>
      <div class="rp-bar-track"><div class="rp-bar-fill" style="width:${pct.toFixed(1)}%;background:#34D399;"></div></div>
      <div class="rp-bar-value"><span class="rp-bar-pct">${pct.toFixed(2)}%</span></div>
    </div>`;
  }).join("");

  var caption = (formLeadsCount > 0 ? fmtNum(formLeadsCount) + " PSI Form leads have full demographic attribution. " : "")
    + "The " + fmtNum(waLeadTotal) + " WhatsApp qualified leads can't be broken down individually, this is the audience of the "
    + fmtNum(headlineConv) + " conversations that produced them"
    + (convRate > 0 ? ", ~" + convRate.toFixed(2) + "% of which converted" : "")
    + ". Age and gender shares below are proportional (each chart sums to 100% of the tagged conversations Meta returned per bucket).";

  return `<section class="rp-page">
    ${renderSectionHeader("04b", "Perfect Target Audience", "WhatsApp Audience", caption)}
    <div class="rp-block-double">
      <div class="rp-block">
        <div class="rp-block-title">By Age Group</div>
        <div class="rp-bars">${ageBarsWA || `<div class="rp-empty">No age data available.</div>`}</div>
      </div>
      <div class="rp-block">
        <div class="rp-block-title">Gender Split</div>
        <div class="rp-bars">${genderBarsWA || `<div class="rp-empty">No gender data available.</div>`}</div>
      </div>
    </div>
  </section>`;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION: BEST PERFORMING ADS
// ═══════════════════════════════════════════════════════════════════

// Best Performing Ads — Section 05 of the client PDF. Mirrors the
// dashboard's TOP ADS PER OBJECTIVE (By Platform) buckets: one
// subsection per KPI, one platform strip per subsection, top 5 ads
// per platform ranked by the KPI-specific metric. Each subsection
// breaks to its own page (or continues to the next page when the
// cards don't fit) so no card gets clipped by a mid-page break.
//
// Ranking rules (from the MTN MoMo PDF requirements doc, 2026-08):
//   Clicks to App Store  → app store clicks (FB, IG, TikTok)
//   Followers            → followers / page likes gained (FB, IG, TikTok)
//   Landing Page         → landing page clicks (FB, IG, Google Display)
//   Community Reach      → unique community reach (FB, IG, TikTok)
//   Lead Generation      → leads captured (retained for Learnalot etc,
//                          auto-drops when the client has no lead ads)
//
// The card visual is INFO-EQUIVALENT to the dashboard card (same data
// points, PDF-optimised layout) rather than a pixel replica: big
// result overlay on the thumbnail, format pill, SCALE/TOP badge,
// full ad name, impressions + cost-per-result grid, spend + CTR,
// avg watch on videos.
function renderTopAdsSection(opts) {
  var top = opts.topAds;
  var raw = (top && Array.isArray(top.raw) && top.raw.length) ? top.raw
    : (Array.isArray(top) ? top.reduce(function(acc, pl) { return acc.concat((pl && pl.ads) || []); }, []) : []);
  if (!raw.length) return "";
  var origin = opts.origin;
  var shareToken = opts.shareToken;

  // KPI-specific sorts. Each ranks by the primary result metric
  // specified in the requirements doc: never by generic clicks for
  // Followers / LP / Community Reach.
  var leadSort = function(a, b) {
    if (b.results !== a.results) return b.results - a.results;
    var ac = a.results > 0 ? a.spend / a.results : Infinity;
    var bc = b.results > 0 ? b.spend / b.results : Infinity;
    if (ac !== bc) return ac - bc;
    return b.impressions - a.impressions;
  };
  // App Store sort: prioritise ads that actually drove store clicks.
  // Uses a.results (store_clicks or install conversion count set by
  // api/ads.js for objective=appinstall), NOT generic total clicks.
  // Previously used engagementSort which sorted by all clicks + CTR
  // with a 5K impression floor — that ranked ads with high raw click
  // volume even when few of those clicks reached the app store.
  var appInstallSort = leadSort;
  var followerSort = leadSort;
  var landingPageSort = function(a, b) {
    var aLp = parseFloat(a.results || a.landingPageClicks || a.clicks || 0);
    var bLp = parseFloat(b.results || b.landingPageClicks || b.clicks || 0);
    if (bLp !== aLp) return bLp - aLp;
    return parseFloat(b.ctr || 0) - parseFloat(a.ctr || 0);
  };
  var communityReachSort = function(a, b) {
    var aR = parseFloat(a.results || a.reach || 0), bR = parseFloat(b.results || b.reach || 0);
    if (bR !== aR) return bR - aR;
    var acpm = a.impressions > 0 ? (a.spend / a.impressions * 1000) : Infinity;
    var bcpm = b.impressions > 0 ? (b.spend / b.impressions * 1000) : Infinity;
    return acpm - bcpm;
  };

  // Section config keyed by CANONICAL objective (a.objective set by
  // api/ads.js). `platforms` lists the EXACT ad.platform values allowed
  // per section — this is how "Google Display" gets filtered out of
  // App Store / Followers / Community Reach and only appears under
  // Landing Page (the doc's spec). Uses ad.platform strings directly,
  // not the platformFamily fold, so YouTube / Search / Pmax rows do
  // NOT leak into the Landing Page Google slot.
  // Platform allowlists now include Google Display on every KPI (2026-08
  // team update: "do not forget Google as an objective result on these
  // ad previews"). Google Display platform blocks auto-drop when the
  // client had no Google Display ads for that KPI, so this doesn't
  // pollute clients that only run Meta + TikTok. YouTube included where
  // it's a natural fit (awareness / reach objectives). Google Search is
  // deliberately omitted since search ads are text-only and have no
  // creative thumbnail.
  var objSections = [
    { key: "leads",           title: "Lead Generation",     accent: "#F43F5E", sort: leadSort,          resultLabel: "leads",           costLabel: "per lead",           criterion: "Ranked by leads captured and cost per lead.",                       platforms: ["Facebook", "Instagram", "TikTok", "Google Display"] },
    { key: "appinstall",      title: "Clicks to App Store", accent: "#4599FF", sort: appInstallSort,    resultLabel: "store clicks",    costLabel: "per store click",    criterion: "Ranked by app store clicks and cost per store click.",              platforms: ["Facebook", "Instagram", "TikTok", "Google Display"] },
    { key: "followers",       title: "Followers",           accent: "#34D399", sort: followerSort,      resultLabel: "follows",         costLabel: "per follow",         criterion: "Ranked by followers and page likes gained. Not by general clicks.", platforms: ["Facebook", "Instagram", "TikTok", "Google Display"] },
    { key: "landingpage",     title: "Landing Page",        accent: "#00F2EA", sort: landingPageSort,   resultLabel: "LP clicks",       costLabel: "per LP click",       criterion: "Ranked by landing page clicks. Landing-page destination campaigns only.", platforms: ["Facebook", "Instagram", "TikTok", "Google Display", "YouTube"] },
    { key: "community_reach", title: "Community Reach",     accent: "#FFAA00", sort: communityReachSort, resultLabel: "reached",        costLabel: "per 1,000 reached",  criterion: "Ranked by unique community reach at the most efficient CPM.",       platforms: ["Facebook", "Instagram", "TikTok", "Google Display", "YouTube"] }
  ];
  var platMeta = {
    "Facebook":       { label: "Facebook",       accent: "#4599FF", cta: "View Facebook Ad" },
    "Instagram":      { label: "Instagram",      accent: "#E1306C", cta: "View Instagram Ad" },
    "TikTok":         { label: "TikTok",         accent: "#00F2EA", cta: "View TikTok Ad" },
    "Google Display": { label: "Google Display", accent: "#34A853", cta: "View Google Ad" },
    "YouTube":        { label: "YouTube",        accent: "#FF0000", cta: "View YouTube Ad" }
  };

  var adResult = function(a, section) {
    var res = parseFloat(a.results || 0);
    if (res > 0) return res;
    if (section.key === "leads")           return parseFloat(a.leads || 0);
    if (section.key === "followers")       return parseFloat(a.follows || 0) + parseFloat(a.pageLikes || 0);
    if (section.key === "community_reach") return parseFloat(a.reach || 0);
    return parseFloat(a.clicks || 0);
  };
  var costPerResult = function(a, section, result) {
    if (section.key === "community_reach") {
      return parseFloat(a.impressions || 0) > 0 ? (parseFloat(a.spend || 0) / parseFloat(a.impressions || 0) * 1000) : 0;
    }
    return result > 0 ? (parseFloat(a.spend || 0) / result) : 0;
  };
  var formatLabel = function(a) {
    var f = String(a.format || "").toUpperCase();
    if (f === "MP4" || f === "VIDEO") return "VIDEO";
    if (f === "STATIC" || f === "IMAGE") return "STATIC";
    if (f === "CAROUSEL") return "CAROUSEL";
    if (f === "MIXED" || a.multiCreative) return "MIXED";
    if (f === "RESPONSIVE") return "RESPONSIVE";
    if (f === "TEXT") return "TEXT";
    return f || "STATIC";
  };
  var formatColor = function(fmt) {
    switch (fmt) {
      case "VIDEO": return "#EC4899";
      case "STATIC": return "#F97316";
      case "CAROUSEL": return "#8B5CF6";
      case "MIXED": return "#A855F7";
      case "RESPONSIVE": return "#F97316";
      case "TEXT": return "#64748B";
      default: return "#64748B";
    }
  };

  var renderAdCard = function(a, rank, section, plat) {
    var thumb = resolveThumb(a, origin, shareToken, 100);
    var pMeta = platMeta[plat] || { accent: "#64748B", cta: "View Ad" };
    var result = adResult(a, section);
    var cost = costPerResult(a, section, result);
    var spend = parseFloat(a.spend || 0);
    var ctr = parseFloat(a.ctr || 0);
    var imps = parseFloat(a.impressions || 0);
    var fmt = formatLabel(a);
    var fmtCol = formatColor(fmt);
    // IG follower rows label swap — Meta doesn't attribute the follow
    // to the ad, so we display link clicks with the "profile visits"
    // label (matches dashboard behaviour).
    var resLabel = a._igFollower ? "profile visits" : section.resultLabel;
    var costLabel = a._igFollower ? "per profile visit" : section.costLabel;
    var isTop3 = rank <= 3;
    var badgeText = isTop3 ? "▲ SCALE" : "★ TOP";
    var badgeBg = isTop3 ? "#34D399" : "#FBBF24";
    var badgeFg = isTop3 ? "#062014" : "#2a1605";
    var avgWatch = parseFloat(a.videoAvgWatchSec || 0);
    var isVideo = fmt === "VIDEO";
    return `<div class="rp-topad-card">
      <div class="rp-topad-thumb" style="background:linear-gradient(135deg,${pMeta.accent}55,${pMeta.accent}15 55%,#0a0618);">
        ${thumb ? `<img src="${escapeHtmlLocal(thumb)}" alt="" onerror="this.style.display='none'"/>` : `<div class="rp-topad-fallback">${escapeHtmlLocal(plat)}</div>`}
        <div class="rp-topad-rank">#${rank}</div>
        <div class="rp-topad-fmt" style="background:${fmtCol};">${escapeHtmlLocal(fmt)}</div>
        <div class="rp-topad-badge" style="background:${badgeBg};color:${badgeFg};">${badgeText}</div>
        <div class="rp-topad-overlay">
          <div class="rp-topad-overlay-lbl">${escapeHtmlLocal(resLabel.toUpperCase())}</div>
          <div class="rp-topad-overlay-val">${result > 0 ? fmtNum(result) : "—"}</div>
          ${cost > 0 ? `<div class="rp-topad-overlay-sub">${fmtR(cost)} ${escapeHtmlLocal(costLabel)}</div>` : ""}
        </div>
      </div>
      <div class="rp-topad-body">
        <div class="rp-topad-name" title="${escapeHtmlLocal(a.adName || "Untitled")}">${escapeHtmlLocal(a.adName || "Untitled")}</div>
        <div class="rp-topad-metrics">
          <div class="rp-topad-metric"><span class="rp-topad-metric-lbl">IMPRESSIONS</span><span class="rp-topad-metric-val">${fmtNum(imps)}</span></div>
          <div class="rp-topad-metric"><span class="rp-topad-metric-lbl">${escapeHtmlLocal(costLabel.toUpperCase())}</span><span class="rp-topad-metric-val">${cost > 0 ? fmtR(cost) : "—"}</span></div>
        </div>
        <div class="rp-topad-footer"><span>${fmtR(spend)} spent</span><span>${fmtPct(ctr)} CTR</span></div>
        ${isVideo && avgWatch > 0 ? `<div class="rp-topad-watch">AVG WATCH ${avgWatch.toFixed(1)}s</div>` : ""}
      </div>
    </div>`;
  };

  // Bucket by CANONICAL objective + EXACT ad.platform (not platformFamily
  // fold). Exact platform matching means "Google Display" and "YouTube"
  // stay as separate buckets — critical for the Landing Page section
  // which must only show Google Display, not any Google Ads family
  // member. FB/IG/TT platforms are already at the leaf platform name,
  // so the exact match works for them too.
  var bucket = {};
  raw.forEach(function(a) {
    var obj = String(a.objective || "landingpage").toLowerCase();
    if (obj === "awareness") obj = "community_reach";
    var plat = String(a.platform || "");
    if (!bucket[obj]) bucket[obj] = {};
    if (!bucket[obj][plat]) bucket[obj][plat] = [];
    bucket[obj][plat].push(a);
  });
  // Followers dedupe (per-platform) — one ad can appear as multiple
  // publisher-split rows (FB + IG). Keep the row with the highest
  // impressions on each platform so a single creative doesn't take
  // multiple slots on the same platform's top-5 list.
  if (bucket.followers) {
    Object.keys(bucket.followers).forEach(function(pl) {
      var seen = {};
      bucket.followers[pl].forEach(function(a) {
        var k = a.adId || a.adName;
        if (!k) return;
        if (!seen[k] || parseFloat(a.impressions || 0) > parseFloat(seen[k].impressions || 0)) seen[k] = a;
      });
      bucket.followers[pl] = Object.keys(seen).map(function(k) { return seen[k]; });
    });
  }
  // IG follower rewrite — Meta books the follow action to the profile
  // (post-click) not the ad. Dashboard shows profile-visits (link
  // clicks) as the metric for IG follower rows. Mirror that here so
  // the sort and card display both see the corrected values.
  if (bucket.followers && bucket.followers.Instagram) {
    bucket.followers.Instagram = bucket.followers.Instagram.map(function(a) {
      var ck = parseFloat(a.clicks || 0);
      return Object.assign({}, a, { results: ck, resultType: "profile_visits", _igFollower: true });
    });
  }

  var TOP_N = 5;
  // Emit each KPI subsection as ONE rp-page with all its platform
  // blocks stacked vertically (per 2026-08 team feedback: "put all
  // platforms on the same page per object"). Cards + platform head
  // sizing is tuned tight in CSS below so up to 4 platform blocks
  // x 5 cards each fit on a single A4 portrait page. If a specific
  // subsection genuinely overflows (5 platforms all active with a
  // full 5 cards each), page-break-inside: avoid on the platform
  // block keeps the break clean at a platform boundary.
  var sectionPages = objSections.filter(function(sec) {
    if (!bucket[sec.key]) return false;
    return sec.platforms.some(function(plat) { return bucket[sec.key][plat] && bucket[sec.key][plat].length > 0; });
  }).map(function(sec) {
    var platBlocks = sec.platforms.filter(function(plat) {
      return bucket[sec.key][plat] && bucket[sec.key][plat].length > 0;
    }).map(function(plat) {
      var pMeta = platMeta[plat] || { label: plat, accent: "#64748B" };
      var ads = bucket[sec.key][plat].slice().sort(sec.sort).slice(0, TOP_N);
      var cards = ads.map(function(a, i) { return renderAdCard(a, i + 1, sec, plat); }).join("");
      return `<div class="rp-topad-plat-block">
        <div class="rp-topad-plat-head" style="background:${pMeta.accent};">${escapeHtmlLocal(pMeta.label)} <span class="rp-topad-plat-count">&middot; ${ads.length} ${ads.length === 1 ? "ad" : "ads"}</span></div>
        <div class="rp-topad-cards">${cards}</div>
      </div>`;
    }).join("");
    return `<section class="rp-page">
      ${renderSectionHeader("05", "Creative Read", sec.title, sec.criterion)}
      ${platBlocks}
    </section>`;
  });

  return sectionPages.join("\n");
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
  var formLeadsCountX = byObj["Leads"] ? byObj["Leads"].global.result : 0;
  var formLeadsSpendX = byObj["Leads"] ? byObj["Leads"].global.spend : 0;
  // Learnalot blends PSI Form Leads with WhatsApp qualified leads
  // (manually recorded Custom Outcomes fired via CAPI) so the
  // headline "Leads Captured" tile and the narrative reconcile with
  // the dashboard's Total Leads (blended) tile. Non-Learnalot clients
  // fall through with waLeadTotalX=0 → totalLeads == formLeadsCountX.
  var _isLearnalotX = String(opts.clientSlug || "").toLowerCase().indexOf("learnalot") >= 0;
  var waLeadTotalX = 0;
  var waSpendX = 0;
  if (_isLearnalotX) {
    var _wa2 = book.whatsapp || null;
    waSpendX = _wa2 ? (_wa2.spend || 0) : 0;
    var _coListX = Array.isArray(opts.customOutcomes) ? opts.customOutcomes : [];
    var _monthsInRangeX = {};
    if (opts.from && opts.to) {
      var _dX = new Date(opts.from + "T00:00:00Z");
      var _eX = new Date(opts.to + "T00:00:00Z");
      if (!isNaN(_dX.getTime()) && !isNaN(_eX.getTime())) {
        while (_dX <= _eX) {
          var _yX = _dX.getUTCFullYear();
          var _mX = _dX.getUTCMonth() + 1;
          _monthsInRangeX[_yX + "-" + (_mX < 10 ? "0" : "") + _mX] = 1;
          _dX.setUTCMonth(_dX.getUTCMonth() + 1);
        }
      }
    }
    _coListX.forEach(function(o) {
      if (!_monthsInRangeX[o.month]) return;
      var isWA = /whatsapp|wapp|(^| )wa /i.test(String(o.label || ""));
      if (isWA) waLeadTotalX += parseInt(o.count || 0, 10);
    });
  }
  var totalLeads = formLeadsCountX + waLeadTotalX;
  var totalLeadsSpendX = formLeadsSpendX + waSpendX;
  var blendedCplX = totalLeads > 0 && totalLeadsSpendX > 0 ? (totalLeadsSpendX / totalLeads) : 0;
  var isBlendedLeadsX = waLeadTotalX > 0 && formLeadsCountX > 0;
  var totalApp = byObj["Clicks to App Store"] ? byObj["Clicks to App Store"].global.result : 0;
  var totalLp = byObj["Landing Page Clicks"] ? byObj["Landing Page Clicks"].global.result : 0;
  // Blended CTR uses ALL-CAMPAIGNS math (2026-07-30 fix) so the tile
  // reconciles with dashboard Summary + MOFU Global Click Headlines
  // and matches what each platform reports on its own UI.
  var kpis = [
    { label: "Media Spend", value: fmtR(g.spend), primary: true },
    { label: "Impressions", value: fmtNum(g.impressions), sub: fmtNumDec(frequencyOf(g), 2) + "x frequency" },
    { label: "Reach", value: fmtNum(g.reach), sub: "unique users" },
    { label: "Blended CTR", value: fmtPct(ctrOf(g)), sub: "all campaigns" }
  ];
  var narrative = [];
  narrative.push("Across " + fmtNum(g.campaignCount) + " campaign" + (g.campaignCount === 1 ? "" : "s") + ", " + fmtR(g.spend) + " was invested during " + escapeHtmlLocal(opts.periodDisplay) + ", generating " + fmtNum(g.impressions) + " impressions and " + fmtNum(g.reach) + " unique users reached at a blended " + fmtR(cpmOf(g)) + " CPM.");
  if (totalLeads > 0) {
    if (isBlendedLeadsX) {
      // Learnalot: name both paths in the narrative and use the
      // blended CPL, so the sentence reconciles with the dashboard's
      // Total Leads (blended) tile line-for-line.
      narrative.push(fmtNum(totalLeads) + " qualified leads were captured (" + fmtNum(formLeadsCountX) + " PSI Form leads and " + fmtNum(waLeadTotalX) + " WhatsApp qualified leads) at a blended " + fmtR(blendedCplX) + " per lead.");
    } else {
      var _leadCpl = formLeadsSpendX > 0 && formLeadsCountX > 0 ? (formLeadsSpendX / formLeadsCountX) : (g.spend > 0 ? g.spend / totalLeads : 0);
      narrative.push(fmtNum(totalLeads) + " qualified lead" + (totalLeads === 1 ? "" : "s") + " were captured at " + fmtR(_leadCpl) + " per lead.");
    }
  }
  if (totalFollows > 0) narrative.push("The community earned " + fmtNum(totalFollows) + " new follower" + (totalFollows === 1 ? "" : "s") + " and page like" + (totalFollows === 1 ? "" : "s") + ", each representing a permanent organic distribution channel that compounds beyond the paid window.");
  if (totalApp > 0) narrative.push(fmtNum(totalApp) + " users clicked through to their app store to download the app.");
  if (totalLp > 0) narrative.push(fmtNum(totalLp) + " users clicked through to the destination landing page from traffic campaigns.");
  return `<section class="rp-page">
    ${renderSectionHeader("06", "Executive Summary", "Period In Review", "A comprehensive read of the reporting window, the investment split across the funnel, and the measurable outcomes each stage delivered.")}
    <div class="rp-block">
      <div class="rp-block-title">Headline Metrics</div>
      ${renderKpiRow(kpis)}
    </div>
    <div class="rp-block">
      <div class="rp-block-title">Outcomes Delivered</div>
      <div class="rp-block-caption">A summary of every measurable outcome the campaigns achieved in this window, alongside the media investment behind them.</div>
      <div class="rp-outcomes-grid">
        <div class="rp-outcome-tile">
          <div class="rp-outcome-label">Media Spend</div>
          <div class="rp-outcome-value" style="color:#F96203;">${fmtR(g.spend)}</div>
          <div class="rp-outcome-sub">delivering ${fmtNum(g.impressions)} impressions</div>
        </div>
        <div class="rp-outcome-tile">
          <div class="rp-outcome-label">Clicks Captured</div>
          <div class="rp-outcome-value" style="color:#FF6B00;">${fmtNum(g.clicks)}</div>
          <div class="rp-outcome-sub">at ${g.impressions > 0 ? (g.clicks / g.impressions * 100).toFixed(2) + "% blended CTR" : "n/a"}</div>
        </div>
        ${(function(){
          // Cost-per figures use PER-OBJECTIVE spend, matching Summary
          // tile formulas sLeads/tLeads etc. (App.jsx ~9582). Previous
          // version divided by g.spend, over-stating cost per outcome
          // by the awareness-share ratio.
          var sLeads = byObj["Leads"] ? byObj["Leads"].global.spend : 0;
          var sFollows = byObj["Followers & Likes"] ? byObj["Followers & Likes"].global.spend : 0;
          var sApp = byObj["Clicks to App Store"] ? byObj["Clicks to App Store"].global.spend : 0;
          var sLp = byObj["Landing Page Clicks"] ? byObj["Landing Page Clicks"].global.spend : 0;
          var out = "";
          if (totalLeads > 0) {
            // Learnalot: swap the tile to "Total Leads (blended)" so
            // it matches the dashboard octet + Total Leads card. The
            // per-lead sub is the blended CPL (form + WhatsApp spend
            // / combined lead count).
            var _tileLabel = isBlendedLeadsX ? "Total Leads (blended)" : "Leads Captured";
            var _tileSub = isBlendedLeadsX
              ? (fmtNum(formLeadsCountX) + " form + " + fmtNum(waLeadTotalX) + " WhatsApp &middot; " + (blendedCplX > 0 ? fmtR(blendedCplX) + " blended CPL" : "n/a"))
              : (fmtR(sLeads / totalLeads) + " per lead");
            out += `<div class="rp-outcome-tile">
              <div class="rp-outcome-label">${_tileLabel}</div>
              <div class="rp-outcome-value" style="color:#F43F5E;">${fmtNum(totalLeads)}</div>
              <div class="rp-outcome-sub">${_tileSub}</div>
            </div>`;
          }
          if (totalFollows > 0) out += `<div class="rp-outcome-tile">
            <div class="rp-outcome-label">Community Growth</div>
            <div class="rp-outcome-value" style="color:#34D399;">+${fmtNum(totalFollows)}</div>
            <div class="rp-outcome-sub">${sFollows > 0 ? fmtR(sFollows / totalFollows) + " per member" : "new followers & likes"}</div>
          </div>`;
          if (totalApp > 0) out += `<div class="rp-outcome-tile">
            <div class="rp-outcome-label">Clicks to App Store</div>
            <div class="rp-outcome-value" style="color:#4599FF;">${fmtNum(totalApp)}</div>
            <div class="rp-outcome-sub">${fmtR(sApp / totalApp)} per click</div>
          </div>`;
          return out;
        })()}
        ${(function(){
          if (totalLp <= 0) return "";
          var sLp = byObj["Landing Page Clicks"] ? byObj["Landing Page Clicks"].global.spend : 0;
          return `<div class="rp-outcome-tile">
            <div class="rp-outcome-label">Landing Page Clicks</div>
            <div class="rp-outcome-value" style="color:#00F2EA;">${fmtNum(totalLp)}</div>
            <div class="rp-outcome-sub">${fmtR(sLp / totalLp)} per click</div>
          </div>`;
        })()}
        ${(function(){var cr = (byObj["Community Reach"] && byObj["Community Reach"].global.result) || 0; return cr > 0 ? `<div class="rp-outcome-tile">
          <div class="rp-outcome-label">Community Reach</div>
          <div class="rp-outcome-value" style="color:#FFAA00;">${fmtNum(cr)}</div>
          <div class="rp-outcome-sub">unique members reached</div>
        </div>` : "";})()}
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
  // Fallback totalFollows matches dashboard tFollows semantics
  // (App.jsx ~9560) — sums only follower-objective bucket, not the
  // raw global follows+pageLikes which would over-count with page-
  // like reactions from non-follower campaigns.
  var followersBucket = book.byObjective && book.byObjective["Followers & Likes"] && book.byObjective["Followers & Likes"].global;
  var totalFollows = earnedTotal > 0 ? earnedTotal : (followersBucket ? followersBucket.result : 0);
  // Learnalot: recap uses the blended lead total (form + WhatsApp
  // qualified leads) so the closing page reconciles with the octet
  // and the executive summary tile. Every other client keeps
  // g.leads verbatim.
  var _isLearnalotCN = String(opts.clientSlug || "").toLowerCase().indexOf("learnalot") >= 0;
  var _formLeadsCountCN = (book.byObjective && book.byObjective["Leads"] && book.byObjective["Leads"].global.result) || 0;
  var _waLeadTotalCN = 0;
  if (_isLearnalotCN && Array.isArray(opts.customOutcomes) && opts.from && opts.to) {
    var _monthsCN = {};
    var _dCN = new Date(opts.from + "T00:00:00Z");
    var _eCN = new Date(opts.to + "T00:00:00Z");
    if (!isNaN(_dCN.getTime()) && !isNaN(_eCN.getTime())) {
      while (_dCN <= _eCN) {
        var _yCN = _dCN.getUTCFullYear();
        var _mCN = _dCN.getUTCMonth() + 1;
        _monthsCN[_yCN + "-" + (_mCN < 10 ? "0" : "") + _mCN] = 1;
        _dCN.setUTCMonth(_dCN.getUTCMonth() + 1);
      }
    }
    opts.customOutcomes.forEach(function(o) {
      if (!_monthsCN[o.month]) return;
      if (/whatsapp|wapp|(^| )wa /i.test(String(o.label || ""))) _waLeadTotalCN += parseInt(o.count || 0, 10);
    });
  }
  var _totalLeadsCN = _formLeadsCountCN + _waLeadTotalCN;
  var quickRecap = [];
  if (_isLearnalotCN && _totalLeadsCN > 0) {
    quickRecap.push(fmtNum(_totalLeadsCN) + " leads" + (_waLeadTotalCN > 0 && _formLeadsCountCN > 0 ? " (" + fmtNum(_formLeadsCountCN) + " form + " + fmtNum(_waLeadTotalCN) + " WhatsApp)" : ""));
  } else if (parseFloat(g.leads || 0) > 0) quickRecap.push(fmtNum(g.leads) + " leads");
  if (totalFollows > 0) quickRecap.push("+" + fmtNum(totalFollows) + " community");
  // Use raw clicks as the app-store metric to match Summary tApp.
  var appClicks = (book.byObjective && book.byObjective["Clicks to App Store"] && book.byObjective["Clicks to App Store"].global.result) || 0;
  if (appClicks > 0) quickRecap.push(fmtNum(appClicks) + " app store clicks");
  var lpClicks = (book.byObjective && book.byObjective["Landing Page Clicks"] && book.byObjective["Landing Page Clicks"].global.result) || 0;
  if (lpClicks > 0) quickRecap.push(fmtNum(lpClicks) + " landing page clicks");
  // Community Reach — MoMo runs paid Reach campaigns into existing
  // community audiences to accelerate app utilisation. Owner asked
  // for this outcome to be surfaced in the recap alongside the
  // conversion metrics.
  var crReach = (book.byObjective && book.byObjective["Community Reach"] && book.byObjective["Community Reach"].global.result) || 0;
  if (crReach > 0) quickRecap.push(fmtNum(crReach) + " community reach");
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
  // campaign_id → objective-type lookup for the demographics section.
  // Threaded so age / region bars weight rows the dashboard's
  // Demographics OBJECTIVE stage way (Leads → lead count, Followers →
  // follows+pageLikes, else → clicks).
  var campaignObjType = buildCampaignObjType(campaignsList);

  var contentOpts = Object.assign({}, opts, {
    clientName: clientName,
    periodDisplay: periodDisplay,
    book: book,
    earnedTotal: earnedTotal,
    campaignObjType: campaignObjType
  });

  var pages = [
    renderCoverPage(contentOpts),
    renderTofuSection(contentOpts),
    renderMofuSection(contentOpts),
    renderBofuSection(contentOpts),
    renderAudienceSection(contentOpts),
    renderLearnalotWhatsAppAudience(contentOpts),
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
html, body { margin: 0; padding: 0; background: var(--rp-bg); color: var(--rp-fg); font-family: var(--rp-font); -webkit-print-color-adjust: exact; print-color-adjust: exact; -webkit-font-smoothing: antialiased; font-weight: 400; font-synthesis: none; -webkit-font-synthesis: none; }
* { box-sizing: border-box; }
img { max-width: 100%; display: block; }

.rp-page {
  width: 210mm;
  min-height: 297mm;
  /* Tighter top/bottom padding buys ~10mm content height per page so
     Performance Insights fits on the same page as its section. */
  padding: 15mm 20mm;
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
.rp-cover-agency-logo { width: 14mm; height: 14mm; border-radius: 50%; margin-bottom: 3mm; }
.rp-cover-label { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; }
.rp-cover-sender { font-size: 13pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-font); }
.rp-cover-sender-title { font-size: 10pt; color: var(--rp-fg-dim); }
.rp-cover-agency-label { font-size: 12pt; font-weight: 700; color: var(--rp-fg); font-family: var(--rp-font); }
.rp-cover-agency-sub { font-size: 8pt; letter-spacing: 3px; color: var(--rp-accent); font-weight: 800; text-transform: uppercase; }

/* ─────────────── SECTION HEADER ─────────────── */
.rp-section-head { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 5mm; padding-bottom: 4mm; border-bottom: 1px solid var(--rp-line); }
.rp-section-num { font-family: var(--rp-font); font-size: 32pt; font-weight: 700; color: var(--rp-accent); line-height: 1; letter-spacing: -1px; min-width: 20mm; }
.rp-section-headline { flex: 1; }
.rp-section-eyebrow { font-size: 8pt; letter-spacing: 4px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-h1 { font-family: var(--rp-font); font-size: 22pt; font-weight: 900; letter-spacing: -0.6px; line-height: 1.1; color: var(--rp-fg); margin: 0 0 3mm 0; }
.rp-lede { font-size: 10pt; color: var(--rp-fg-dim); line-height: 1.5; max-width: 155mm; font-style: normal !important; font-weight: 400; font-stretch: normal; font-synthesis: none; }

/* ─────────────── BLOCKS ─────────────── */
.rp-block { margin-bottom: 6mm; page-break-inside: avoid; }
.rp-block-title { font-size: 9pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 3mm; }
.rp-block-double { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 6mm; }

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
/* Performance Insights box — page-break-before: avoid keeps it on
   the same page as the table above (was rolling to next page and
   looking odd). Tighter padding so the box footprint is smaller. */
.rp-insight { margin-top: 4mm; padding: 4mm 5mm; background: linear-gradient(140deg, rgba(249,98,3,0.06), var(--rp-card)); border-left: 3px solid var(--rp-accent); border-radius: 0 3mm 3mm 0; page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; break-before: avoid; }
.rp-insight-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 2mm; }
.rp-narrative { margin-top: 4mm; padding: 4mm 5mm; background: var(--rp-card-strong); border-radius: 3mm; border-left: 3px solid var(--rp-accent); page-break-inside: avoid; break-inside: avoid; page-break-before: avoid; break-before: avoid; }
.rp-narrative-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 2mm; }
.rp-body { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.55; margin: 0; orphans: 3; widows: 3; }

/* ─────────────── TABLES ─────────────── */
/* table-layout: fixed guarantees the table can NEVER exceed 100%
   of the page width, so a long header cannot push a column off the
   page (Section 01 "COST / 1K SERV" bug). Header cells wrap to two
   lines rather than clipping when they truly cannot fit. */
.rp-table { width: 100%; max-width: 100%; border-collapse: collapse; background: var(--rp-card-strong); border-radius: 3mm; overflow: hidden; font-size: 10.5pt; table-layout: fixed; }
.rp-table-wide { font-size: 10pt; }
/* Header font compressed slightly and letter-spacing tightened so
   "IMPRESSIONS" (the longest column label) fits on a single line in
   a five-column data grid. word-break: keep-all guarantees no mid-
   word break (previous "break-word" split it into "IMPRESSION\nS"),
   nowrap makes wrapping visible if a header genuinely can't fit so
   the layout hits a clean fail rather than a two-line mid-word wrap. */
.rp-table th { padding: 3mm 1.5mm; text-align: center; font-size: 7pt; letter-spacing: 0.6px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 900; border-bottom: 1px solid rgba(249,98,3,0.24); background: rgba(249,98,3,0.08); vertical-align: middle; white-space: nowrap; word-break: keep-all; overflow: hidden; text-overflow: clip; }
/* Column 1 (platform / campaign) is left-aligned; every other column
   centre-aligns per owner style spec so the table reads corporate.
   With table-layout: fixed above, the platform column gets an explicit
   26mm width so it fits the pill without being forced to equal-share
   with the numeric columns. */
.rp-table th.rp-th-name { text-align: left; width: 22mm; }
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
.rp-empty { padding: 5mm; text-align: center; color: var(--rp-fg-mute); background: var(--rp-card); border-radius: 3mm; font-size: 10pt; }

/* ─────────────── BOFU SUBSECTIONS ─────────────── */
.rp-bofu-sub { margin-bottom: 8mm; padding: 5mm 6mm; background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; }
.rp-bofu-sub-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2mm; }
.rp-bofu-sub-title { font-family: var(--rp-font); font-size: 14pt; font-weight: 700; color: var(--rp-fg); letter-spacing: -0.3px; }
.rp-bofu-sub-total { font-family: var(--rp-font); font-size: 22pt; font-weight: 700; color: var(--rp-accent); letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.rp-bofu-sub-desc { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 3mm; }
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
.rp-persona-hero-note { font-size: 6pt; font-style: italic; color: var(--rp-fg-mute); opacity: 0.75; margin-top: 2mm; line-height: 1.3; max-width: 46mm; margin-left: auto; margin-right: auto; }
/* ─────────────── SECTION 05: TOP ADS BY OBJECTIVE (new layout) ───────────────
   All-platforms-per-subsection layout (2026-08 team spec). Each KPI
   gets ONE page with every active platform stacked vertically as a
   labeled block, 5 cards per block. Card sizing is tight to fit up
   to 4 platform blocks x 5 cards on a single A4 portrait page. If
   a subsection genuinely has 5 active platforms + 5 cards each,
   page-break-inside: avoid on the platform block keeps the break
   clean at a platform boundary rather than mid-card. */
.rp-topad-plat-block { margin-bottom: 3mm; page-break-inside: avoid; }
.rp-topad-plat-head { color: #fff; font-size: 8.5pt; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; border-radius: 1.5mm; padding: 1.6mm 3mm; margin-bottom: 1.8mm; }
.rp-topad-plat-count { font-size: 7pt; font-weight: 700; letter-spacing: 0.6px; opacity: 0.75; text-transform: none; }
.rp-topad-cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1.6mm; }
.rp-topad-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 1.5mm; overflow: hidden; display: flex; flex-direction: column; page-break-inside: avoid; }
.rp-topad-thumb { position: relative; width: 100%; padding-top: 100%; overflow: hidden; }
.rp-topad-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rp-topad-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 6.5pt; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; }
.rp-topad-rank { position: absolute; top: 1mm; left: 1mm; background: rgba(255,255,255,0.22); color: #fff; padding: 0.4mm 1.2mm; border-radius: 0.8mm; font-size: 6pt; font-weight: 900; letter-spacing: 0.3px; }
.rp-topad-fmt { position: absolute; bottom: 1mm; left: 1mm; color: #fff; padding: 0.4mm 1.2mm; border-radius: 0.8mm; font-size: 5.5pt; font-weight: 900; letter-spacing: 0.4px; text-transform: uppercase; }
.rp-topad-badge { position: absolute; bottom: 1mm; right: 1mm; padding: 0.4mm 1.2mm; border-radius: 0.8mm; font-size: 5.5pt; font-weight: 900; letter-spacing: 0.4px; text-transform: uppercase; }
.rp-topad-overlay { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: radial-gradient(ellipse at center, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%); padding: 1.4mm 2mm; border-radius: 1.5mm; text-align: center; min-width: 18mm; }
.rp-topad-overlay-lbl { color: rgba(255,255,255,0.85); font-size: 5pt; font-weight: 900; letter-spacing: 0.6px; margin-bottom: 0.4mm; }
.rp-topad-overlay-val { color: #fff; font-size: 11pt; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; }
.rp-topad-overlay-sub { color: rgba(255,255,255,0.88); font-size: 5pt; font-weight: 700; margin-top: 0.4mm; letter-spacing: 0.2px; }
.rp-topad-body { padding: 1.4mm 1.6mm 1.8mm; display: flex; flex-direction: column; gap: 1mm; }
.rp-topad-name { font-size: 5.8pt; font-weight: 800; color: var(--rp-fg); line-height: 1.25; word-break: break-word; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; min-height: 6mm; }
.rp-topad-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8mm; font-size: 5.5pt; }
.rp-topad-metric { display: flex; flex-direction: column; gap: 0.3mm; }
.rp-topad-metric-lbl { color: var(--rp-fg-mute); font-size: 4.5pt; font-weight: 800; letter-spacing: 0.3px; text-transform: uppercase; }
.rp-topad-metric-val { color: var(--rp-fg); font-size: 6pt; font-weight: 900; font-variant-numeric: tabular-nums; }
.rp-topad-footer { display: flex; justify-content: space-between; font-size: 5pt; color: var(--rp-fg-mute); font-weight: 700; letter-spacing: 0.2px; padding-top: 0.8mm; border-top: 1px solid var(--rp-line); }
.rp-topad-watch { display: none; }
.rp-topad-cont-head { display: none; }
.rp-topad-cont-eyebrow { display: none; }
.rp-topad-cont-title { display: none; }
.rp-topad-cont-crit { display: none; }

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
.rp-creative-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.rp-creative-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; }
.rp-creative-thumb { position: relative; width: 100%; padding-top: 100%; }
.rp-creative-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rp-creative-fallback { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 8pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }
.rp-creative-rank { position: absolute; top: 2mm; left: 2mm; padding: 1mm 2.5mm; color: #fff; font-size: 7.5pt; font-weight: 900; border-radius: 2mm; letter-spacing: 0.5px; }
/* Platform badge, top-right of thumbnail. Kept for backwards compat
   but no longer emitted by the new by-objective-by-platform layout. */
.rp-creative-plat { position: absolute; top: 2mm; right: 2mm; padding: 1mm 2.5mm; color: #fff; font-size: 6.5pt; font-weight: 900; border-radius: 2mm; letter-spacing: 1px; text-transform: uppercase; }

/* Top Ads Per Objective (By Platform) block — mirrors dashboard's
   layout at App.jsx ~7620. One section per objective, each with a
   header + criterion caption, then one horizontal platform strip per
   platform that ran ads for that objective. Each strip carries a
   platform label chip on the left and three ad cards to its right. */
.rp-obj-section { margin-bottom: 8mm; border: 1px solid; border-radius: 4mm; overflow: hidden; page-break-inside: avoid; background: rgba(0,0,0,0.12); }
.rp-obj-section-head { padding: 4mm 5mm; border-left: 4px solid; }
.rp-obj-section-title { font-size: 12pt; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 1.5mm; }
.rp-obj-section-crit { font-size: 8.5pt; color: var(--rp-fg-mute); letter-spacing: 0.3px; }
/* Platform label promoted to a top banner (was a side pill). Cards
   below now use the full section width so each ad tile reads bigger,
   per owner feedback. */
.rp-obj-plat-block { padding: 3mm 4mm 4mm; border-top: 1px dashed var(--rp-line); page-break-inside: avoid; }
.rp-obj-plat-head { color: #fff; font-size: 10pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; border-radius: 2mm; padding: 2.5mm 4mm; margin-bottom: 3mm; text-align: left; }
.rp-obj-plat-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
/* Card body must give the ad name enough room to render on two lines
   without being clipped, plus the metrics stack below with breathing
   room. Earlier the max-height on the name squashed the ad-title on
   longer names. */
.rp-creative-body { padding: 3.5mm 3.5mm 3.5mm; display: flex; flex-direction: column; gap: 3mm; min-height: 24mm; }
/* Ad name capped at exactly 3 lines so every card in the 3-column
   grid has an identical height and the row reads clean. -webkit
   line-clamp works in Chrome print-to-PDF and Firefox's PDF export. */
.rp-creative-name { font-size: 9pt; font-weight: 800; color: var(--rp-fg); line-height: 1.4; word-break: break-word; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; max-height: 13.5mm; }
.rp-creative-metrics { display: flex; flex-direction: column; gap: 1.4mm; font-size: 8pt; color: var(--rp-fg-dim); margin-top: auto; }
.rp-creative-metrics strong { color: var(--rp-accent); font-weight: 900; font-variant-numeric: tabular-nums; }

/* ─────────────── FUNNEL CARDS (executive summary) ─────────────── */
/* Replaces the old inline row bars. Three side-by-side cards, one
   per funnel stage, with role explanation, percentage of budget,
   rand spend, mini fill bar, and what that stage actually delivered.
   Reads clearly for a marketing team without pre-context. */
.rp-block-caption { font-size: 9.5pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 5mm; }
.rp-funnel-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; page-break-inside: avoid; }
.rp-funnel-card { background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-left: 3px solid; border-radius: 3mm; padding: 4mm; display: flex; flex-direction: column; gap: 2.5mm; page-break-inside: avoid; }
.rp-funnel-card-eyebrow { font-size: 7pt; letter-spacing: 2px; text-transform: uppercase; font-weight: 900; }
.rp-funnel-card-title { font-size: 11pt; font-weight: 900; color: var(--rp-fg); line-height: 1.2; }
.rp-funnel-card-role { font-size: 8.5pt; color: var(--rp-fg-dim); line-height: 1.5; min-height: 15mm; }
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
/* Radial overlays removed on the closing page. Chrome's PDF
   rasteriser was rendering the semi-transparent radial gradient
   with hard-edged banding around the GAS emblem where the gradient
   sat directly behind it, producing a "shadow box" behind the
   logo. Flat gradient background reads cleaner in print. */
.rp-signoff-frame { position: relative; z-index: 1; padding: 28mm 28mm; display: flex; flex-direction: column; height: 297mm; }
.rp-signoff-top { display: flex; flex-direction: column; align-items: flex-start; gap: 6mm; }
/* Radial glow removed — screen-friendly but printed as a chunky
   orange halo behind the emblem. Kept the circular crop only. */
.rp-signoff-emblem-logo { width: 18mm; height: 18mm; border-radius: 50%; }
.rp-signoff-eyebrow { font-size: 9pt; letter-spacing: 6px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; }
.rp-signoff-heart { margin-top: auto; margin-bottom: auto; padding: 20mm 0; max-width: 150mm; }
.rp-signoff-title { font-family: var(--rp-font); font-size: 38pt; font-weight: 700; letter-spacing: -1px; line-height: 1.1; color: var(--rp-fg); margin-bottom: 10mm; }
.rp-signoff-body { font-size: 11.5pt; color: var(--rp-fg-dim); line-height: 1.8; margin-bottom: 6mm; }
.rp-signoff-body strong { color: var(--rp-fg); font-weight: 700; }
.rp-signoff-foot { display: flex; justify-content: space-between; align-items: flex-end; padding-top: 10mm; border-top: 1px solid var(--rp-line); margin-top: auto; }
.rp-signoff-sender-block { display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-sender { font-family: var(--rp-font); font-size: 15pt; font-weight: 700; color: var(--rp-fg); }
.rp-signoff-sender-title { font-size: 10pt; color: var(--rp-fg-dim); }
.rp-signoff-agency { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }
.rp-signoff-contact { text-align: right; font-size: 9pt; color: var(--rp-fg-mute); display: flex; flex-direction: column; gap: 1mm; }
.rp-signoff-emblem { font-size: 7pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-top: 3mm; }
/* Closing-page emblem band. Pulled out of the contact column and pinned
   near the physical bottom of the page, larger + more presence per
   owner spec. Sits below the sender/contact foot with breathing room. */
/* Outcomes grid replaces the earlier funnel-performance visual on
   the Executive Summary page. Simpler and factually correct: one
   tile per measurable outcome the campaigns achieved this window
   (media spend, clicks, leads, community, app store, LP, community
   reach) with a compact cost or efficiency sub-line. */
.rp-outcomes-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-bottom: 5mm; page-break-inside: avoid; }
.rp-outcome-tile { padding: 5mm 5mm; background: var(--rp-card-strong); border: 1px solid var(--rp-line); border-radius: 3mm; overflow: hidden; }
.rp-outcome-label { font-size: 7.5pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 900; margin-bottom: 3mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rp-outcome-value { font-size: 18pt; font-weight: 900; line-height: 1.1; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; }
.rp-outcome-sub { font-size: 8.5pt; color: var(--rp-fg-mute); margin-top: 3mm; letter-spacing: 0.3px; font-weight: 500; }

/* Emblem band. 14pt / 8px letter-spacing was wrapping across two
   lines at A4 width. 10pt / 4px keeps it a single-line strip that
   still reads as a proper closing emblem, plus nowrap so overflow
   clips rather than wraps if a future edit adds text to the string. */
.rp-signoff-bottom-band { margin-top: 10mm; padding: 6mm 0 0; border-top: 1px solid var(--rp-line); font-size: 10pt; letter-spacing: 4px; text-transform: uppercase; color: var(--rp-accent); font-weight: 900; text-align: center; white-space: nowrap; overflow: hidden; }

/* Closing-page CTA. Subtle glass button with a warm accent border and
   an underline-style caption so it reads corporate, not marketing. */
.rp-cta-block { margin-top: 10mm; padding: 8mm 0 0; border-top: 1px solid var(--rp-line); }
.rp-cta-btn { display: inline-block; padding: 4mm 10mm; background: linear-gradient(135deg, rgba(249,98,3,0.14), rgba(255,61,0,0.06)); border: 1px solid var(--rp-line-strong); border-radius: 2mm; color: var(--rp-fg); font-size: 11pt; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; text-decoration: none; box-shadow: 0 4mm 12mm rgba(249,98,3,0.10); }
.rp-cta-btn:hover { background: linear-gradient(135deg, rgba(249,98,3,0.22), rgba(255,61,0,0.10)); }
.rp-cta-note { margin-top: 4mm; font-size: 9pt; color: var(--rp-fg-mute); letter-spacing: 1px; font-weight: 500; }

/* Print rules — make the layout resilient to whatever margin the
   operator selects in Chrome's print dialog. Force @page to no
   margin so .rp-page controls its own padding, force .rp-page to
   width:100% so it adapts if Chrome's "Default" margin was chosen
   and the printable area is smaller than 210mm. */
@media print {
  @page { size: A4; margin: 0 !important; }
  html, body { background: var(--rp-bg) !important; margin: 0 !important; padding: 0 !important; width: 210mm !important; }
  .rp-page {
    width: 210mm !important;
    max-width: 210mm !important;
    min-height: 297mm !important;
    height: 297mm !important;
    padding: 13mm 15mm !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
    overflow: hidden !important;
    page-break-after: always !important;
    break-after: page !important;
  }
  .rp-page:last-child { page-break-after: auto !important; break-after: auto !important; }
  /* Cover + closing pages reach edge-to-edge. Their internal .rp-cover-frame
     / .rp-signoff-frame carries the padding. */
  .rp-cover, .rp-signoff { padding: 0 !important; }
  .rp-page * { max-width: 100% !important; }
  /* Guarantee no horizontal overflow on wide tables. */
  .rp-table, .rp-obj-plat-cards, .rp-creative-grid, .rp-kpi-grid, .rp-outcomes-grid { max-width: 100% !important; }
}
</style>
</head>
<body>
<div id="gas-print-bar" style="position:fixed;top:16px;right:16px;z-index:99999;display:flex;gap:8px;align-items:center;font-family:Helvetica,Arial,sans-serif;">
  <div id="gas-print-status" style="background:rgba(0,0,0,0.7);color:#fff;font-size:11px;letter-spacing:1px;font-weight:800;padding:8px 12px;border-radius:6px;">Preparing report...</div>
  <button id="gas-print-btn" type="button" onclick="try{window.focus();window.print();}catch(_){alert('Popup lost focus. Click inside this window and press Ctrl+P (Cmd+P on Mac), then choose Save as PDF.');}" style="background:#F96203;color:#fff;border:none;padding:9px 16px;border-radius:6px;font-size:11px;font-weight:900;letter-spacing:2px;cursor:pointer;text-transform:uppercase;font-family:inherit;box-shadow:0 4px 14px rgba(249,98,3,0.35);">Save as PDF</button>
</div>
<style>@media print{#gas-print-bar{display:none !important;}}</style>
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
  var status = document.getElementById("gas-print-status");
  function setStatus(msg){ if (status) status.textContent = msg; }
  function doPrint(){
    if (printed) return;
    printed = true;
    setStatus("Opening save dialog...");
    try { window.focus(); window.print(); }
    catch(_) { setStatus("Auto-print blocked. Click Save as PDF."); }
  }
  function whenImagesReady(cb, timeoutMs){
    var imgs = Array.prototype.slice.call(document.images || []);
    if (!imgs.length) { cb(); return; }
    var total = imgs.length;
    var remaining = total;
    var done = false;
    function tick(){
      remaining -= 1;
      var loaded = total - remaining;
      setStatus("Loading images " + loaded + "/" + total + "...");
      if (remaining <= 0 && !done) { done = true; cb(); }
    }
    imgs.forEach(function(img){
      if (img.complete) { tick(); return; }
      img.addEventListener("load", tick, { once: true });
      img.addEventListener("error", tick, { once: true });
    });
    setTimeout(function(){ if (!done) { done = true; cb(); } }, timeoutMs || 8000);
  }
  function start(){
    setStatus("Rendering layout...");
    // Longer settle so layout metrics, custom fonts, and image sizing
    // are all done before Chrome's print snapshot fires. Empty-PDF
    // reports on Windows traced back to a 300ms settle that fired
    // before some rp-obj-plat blocks had finished laying out.
    whenImagesReady(function(){
      setStatus("Ready. Opening dialog...");
      setTimeout(doPrint, 1500);
    }, 8000);
  }
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);

  // Auto-close popup after print dialog resolves so no lingering
  // Chrome file handle blocks Adobe Acrobat from opening the saved
  // PDF on Windows. 3 seconds so Chrome definitely finishes writing
  // to disk before we release the tab. Removed the focus-listener
  // fallback because it was closing the tab BEFORE the PDF write
  // completed on some machines, producing a 0-byte / empty PDF.
  window.addEventListener("afterprint", function(){
    setStatus("Saved. Closing...");
    setTimeout(function(){ try { window.close(); } catch(_) {} }, 3000);
  });

  // Ctrl+P / Cmd+P keyboard shortcut as an always-available fallback,
  // no matter the auto-print state. Chrome usually catches this natively
  // but scoping the listener here guarantees the doPrint() path fires
  // even if the popup was opened with restricted permissions.
  document.addEventListener("keydown", function(e){
    var isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    if ((isMac ? e.metaKey : e.ctrlKey) && String(e.key).toLowerCase() === "p") {
      e.preventDefault();
      printed = false;
      doPrint();
    }
  });
})();
</script>
</body>
</html>`;
}
