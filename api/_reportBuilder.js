// Deep-insights PDF report builder. Distinct from api/email-share.js's
// buildEmailHtml (which is a scroll-friendly INBOX layout). This
// produces a multi-page A4 document — cover page, executive summary,
// funnel model (ToFu / MoFu / BoFu), per-stage sections, detail tables,
// creative highlights, recommendations, sign-off. All content is
// inline-styled so it survives the browser Save-as-PDF conversion
// without a bundler.
//
// Called from api/email-share.js when body.mode === "report". Data
// inputs (summary, topAds, ecommerce, placements, kpiProfile,
// clientLogo, dateRange, clientName, etc.) come from the same
// internal fetches the email path uses.

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

// ToFu / MoFu / BoFu classification. Uses the canonical objective key
// already set on each campaign by /api/campaigns (name-detection wins
// per project_objective_classification.md). Falls back to name-based
// hints if objective is missing.
function funnelStageFor(camp) {
  var obj = String((camp && camp.objective) || "").toLowerCase();
  var name = String((camp && camp.campaignName) || "").toLowerCase();
  var stage = null;
  if (obj === "awareness" || obj === "community_reach") stage = "tofu";
  else if (obj === "landingpage" || obj === "followers") stage = "mofu";
  else if (obj === "leads" || obj === "appinstall") stage = "bofu";
  else {
    // Name-based hints for the "unknown" objective
    if (/(^|[_\s|\-])reach([_\s|\-]|$)/.test(name) || name.indexOf("aware") >= 0) stage = "tofu";
    else if (name.indexOf("traffic") >= 0 || name.indexOf("engage") >= 0 || name.indexOf("follow") >= 0) stage = "mofu";
    else if (name.indexOf("lead") >= 0 || name.indexOf("conversion") >= 0 || name.indexOf("install") >= 0 || name.indexOf("purchase") >= 0) stage = "bofu";
    else stage = "mofu"; // safe default: consideration
  }
  return stage;
}

// Split campaigns list into the three funnel stages, aggregating
// stage-level metrics along the way.
function partitionByFunnel(campaigns) {
  var tofu = [], mofu = [], bofu = [];
  var totals = {
    tofu: { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, follows: 0, pageLikes: 0, appInstalls: 0, landingPageViews: 0 },
    mofu: { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, follows: 0, pageLikes: 0, appInstalls: 0, landingPageViews: 0 },
    bofu: { spend: 0, impressions: 0, clicks: 0, reach: 0, leads: 0, follows: 0, pageLikes: 0, appInstalls: 0, landingPageViews: 0 }
  };
  (campaigns || []).forEach(function(c) {
    var s = funnelStageFor(c);
    var bucket = s === "tofu" ? tofu : (s === "bofu" ? bofu : mofu);
    bucket.push(c);
    var t = totals[s];
    t.spend += parseFloat(c.spend || 0);
    t.impressions += parseFloat(c.impressions || 0);
    t.clicks += parseFloat(c.clicks || 0);
    t.reach += parseFloat(c.reach || 0);
    t.leads += parseFloat(c.leads || 0);
    t.follows += parseFloat(c.follows || 0);
    t.pageLikes += parseFloat(c.pageLikes || 0);
    t.appInstalls += parseFloat(c.appStoreClicks || c.appInstalls || 0);
    t.landingPageViews += parseFloat(c.landingPageViews || 0);
  });
  return { tofu: tofu, mofu: mofu, bofu: bofu, totals: totals };
}

// Format a period string. Prefer month name(s), fall back to raw range.
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
  var same = fY === tY && fM === tM;
  if (same) return MONTHS[fM] + " " + fY;
  if (fY === tY) return MONTHS[fM] + " " + fD + " to " + MONTHS[tM] + " " + tD + ", " + fY;
  return MONTHS[fM] + " " + fD + ", " + fY + " to " + MONTHS[tM] + " " + tD + ", " + tY;
}

// ═══════════════════════════════════════════════════════════════════
// SECTION RENDERERS
// ═══════════════════════════════════════════════════════════════════

// PAGE 1: Cover page. Client logo dominant, agency co-branding at foot.
function renderCoverPage(opts) {
  var clientLogo = opts.clientLogo || "";
  var clientName = escapeHtmlLocal(opts.clientName || "Client");
  var period = escapeHtmlLocal(opts.periodDisplay || "");
  var senderName = escapeHtmlLocal(opts.senderName || "");
  var senderTitle = escapeHtmlLocal(opts.senderTitle || "");
  var origin = opts.origin || "https://media.gasmarketing.co.za";
  var agencyLogo = origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  return `<section class="rp-page rp-cover">
    <div class="rp-cover-inner">
      <div class="rp-cover-brand">
        ${clientLogo
          ? `<img src="${clientLogo}" alt="${clientName}" class="rp-cover-logo"/>`
          : `<div class="rp-cover-name">${clientName}</div>`}
      </div>
      <div class="rp-cover-eyebrow">Performance Insights Report</div>
      <div class="rp-cover-title">${clientName}</div>
      <div class="rp-cover-period">${period}</div>
      <div class="rp-cover-divider"></div>
      <div class="rp-cover-foot">
        <div class="rp-cover-foot-left">
          <div class="rp-cover-label">Prepared by</div>
          <div class="rp-cover-sender">${senderName || "GAS Marketing"}</div>
          ${senderTitle ? `<div class="rp-cover-sender-title">${senderTitle}</div>` : ""}
        </div>
        <div class="rp-cover-foot-right">
          <img src="${agencyLogo}" alt="GAS Marketing" class="rp-cover-agency-logo"/>
          <div class="rp-cover-label">Media On GAS</div>
          <div class="rp-cover-sender-title">Metrics That Matter</div>
        </div>
      </div>
    </div>
  </section>`;
}

// PAGE 2: Executive summary. Big headline KPIs, one paragraph narrative.
function renderExecutiveSummary(opts) {
  var s = opts.summary;
  if (!s || !s.grand) {
    return `<section class="rp-page">
      <h1 class="rp-h1">Executive Summary</h1>
      <p class="rp-body">No campaign data returned for the selected period.</p>
    </section>`;
  }
  var g = s.grand;
  var totalFollows = parseFloat(g.pageLikes || 0) + parseFloat(g.follows || 0);
  var kpis = [];
  kpis.push({ label: "Total Investment", value: fmtR(g.spend || 0), tone: "primary" });
  kpis.push({ label: "Reach", value: fmtNum(g.reach || 0), sub: "unique users" });
  kpis.push({ label: "Impressions", value: fmtNum(g.impressions || 0), sub: g.frequency ? fmtNum(g.frequency).replace(/,/g, ".") + " frequency" : "" });
  kpis.push({ label: "Click Through Rate", value: fmtPct(g.ctr || 0), sub: fmtNum(g.clicks || 0) + " clicks" });
  if (parseFloat(g.leads || 0) > 0) kpis.push({ label: "Leads Generated", value: fmtNum(g.leads), sub: fmtR(g.costPerLead || (g.spend / (g.leads || 1))) + " per lead" });
  if (totalFollows > 0) kpis.push({ label: "Community Growth", value: "+" + fmtNum(totalFollows), sub: g.costPerFollower ? fmtR(g.costPerFollower) + " per member" : "" });
  if (parseFloat(g.appStoreClicks || 0) > 0) kpis.push({ label: "App Store Clicks", value: fmtNum(g.appStoreClicks), sub: fmtR(g.spend / (g.appStoreClicks || 1)) + " per click" });
  if (parseFloat(g.landingPageViews || 0) > 0) kpis.push({ label: "Landing Page Views", value: fmtNum(g.landingPageViews), sub: fmtR(g.spend / (g.landingPageViews || 1)) + " per view" });

  // Truncate to first 6 so the grid stays clean at 3x2.
  kpis = kpis.slice(0, 6);
  var kpiHtml = kpis.map(function(k) {
    return `<div class="rp-kpi ${k.tone === "primary" ? "rp-kpi-primary" : ""}">
      <div class="rp-kpi-label">${escapeHtmlLocal(k.label)}</div>
      <div class="rp-kpi-value">${escapeHtmlLocal(k.value)}</div>
      ${k.sub ? `<div class="rp-kpi-sub">${escapeHtmlLocal(k.sub)}</div>` : ""}
    </div>`;
  }).join("");

  // One-paragraph narrative
  var narrativeParts = [];
  narrativeParts.push("During " + escapeHtmlLocal(opts.periodDisplay || "the period under review") + ", " + fmtR(g.spend || 0) + " was invested across " + (s.campaignCount || 0) + " active campaign" + ((s.campaignCount || 0) === 1 ? "" : "s") + ", generating " + fmtNum(g.impressions || 0) + " impressions and " + fmtNum(g.reach || 0) + " unique users reached.");
  if (parseFloat(g.leads || 0) > 0) narrativeParts.push(fmtNum(g.leads) + " qualified lead" + (g.leads === 1 ? "" : "s") + " were captured at " + fmtR(g.costPerLead || (g.spend / g.leads)) + " per lead.");
  if (totalFollows > 0) narrativeParts.push("The community earned " + fmtNum(totalFollows) + " new follower" + (totalFollows === 1 ? "" : "s") + " and page like" + (totalFollows === 1 ? "" : "s") + ", each representing a permanent organic distribution channel that continues to compound beyond the paid window.");
  if (parseFloat(g.ctr || 0) > 0) narrativeParts.push("A blended click-through rate of " + fmtPct(g.ctr) + " indicates " + (parseFloat(g.ctr) >= 1.2 ? "strong" : parseFloat(g.ctr) >= 0.8 ? "healthy" : "opportunity for creative refinement in") + " audience-message resonance.");

  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 01</div>
    <h1 class="rp-h1">Executive Summary</h1>
    <div class="rp-lede">A concise view of the period's investment, delivery and outcomes. Deeper stage-by-stage breakdowns follow.</div>
    <div class="rp-kpi-grid">${kpiHtml}</div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Period Read</div>
      <p class="rp-body">${narrativeParts.join(" ")}</p>
    </div>
  </section>`;
}

// PAGE 3: The Funnel. Visual bar-chart of spend and results per stage.
function renderFunnelOverview(opts) {
  var partition = opts.funnel;
  if (!partition) return "";
  var stages = [
    { key: "tofu", label: "Top of Funnel", subtitle: "Awareness &amp; Reach", role: "Grow audience recognition, build memory structures.", color: "#F96203" },
    { key: "mofu", label: "Middle of Funnel", subtitle: "Consideration &amp; Engagement", role: "Deepen intent, capture engaged audiences, drive site traffic.", color: "#FF6B00" },
    { key: "bofu", label: "Bottom of Funnel", subtitle: "Conversion &amp; Growth", role: "Convert intent into action — leads, installs, sales, community.", color: "#FF3D00" }
  ];
  var totalSpend = partition.totals.tofu.spend + partition.totals.mofu.spend + partition.totals.bofu.spend;
  var stageBars = stages.map(function(st) {
    var t = partition.totals[st.key];
    var pct = totalSpend > 0 ? (t.spend / totalSpend * 100) : 0;
    var count = partition[st.key].length;
    var primaryMetric;
    if (st.key === "tofu") primaryMetric = fmtNum(t.reach || t.impressions) + " " + (t.reach > 0 ? "reached" : "impressions");
    else if (st.key === "mofu") primaryMetric = fmtNum(t.clicks + t.landingPageViews + t.follows + t.pageLikes) + " engaged actions";
    else primaryMetric = fmtNum(t.leads + t.appInstalls) + " conversions" + ((t.follows + t.pageLikes) > 0 ? " + " + fmtNum(t.follows + t.pageLikes) + " community" : "");
    return `<div class="rp-funnel-stage">
      <div class="rp-funnel-stage-head">
        <div class="rp-funnel-stage-label">
          <div class="rp-funnel-stage-name" style="color:${st.color};">${st.label}</div>
          <div class="rp-funnel-stage-sub">${st.subtitle}</div>
        </div>
        <div class="rp-funnel-stage-share">${pct.toFixed(1)}%</div>
      </div>
      <div class="rp-funnel-bar-track">
        <div class="rp-funnel-bar-fill" style="width:${pct.toFixed(1)}%;background:linear-gradient(90deg,${st.color},${st.color}cc);"></div>
      </div>
      <div class="rp-funnel-stage-foot">
        <span>${count} campaign${count === 1 ? "" : "s"}</span>
        <span>${fmtR(t.spend)}</span>
        <span>${primaryMetric}</span>
      </div>
      <div class="rp-funnel-stage-role">${st.role}</div>
    </div>`;
  }).join("");
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 02</div>
    <h1 class="rp-h1">The Funnel</h1>
    <div class="rp-lede">Every campaign in this report is classified by its role in the customer journey. This overview shows how investment and outcomes are distributed across awareness, consideration and conversion stages before the section deep-dives that follow.</div>
    <div class="rp-funnel">${stageBars}</div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Why This Matters</div>
      <p class="rp-body">A balanced funnel keeps the pipeline healthy: too much bottom-of-funnel starves future demand as the audience is exhausted, too much top-of-funnel builds recognition without measurable action. The section-by-section reads that follow identify where each stage is over-, under-, or well-served for the outcome the brand needs next.</p>
    </div>
  </section>`;
}

// Shared: render a stage-specific KPI strip.
function renderStageKpis(t, stage) {
  var kpis = [];
  kpis.push({ label: "Investment", value: fmtR(t.spend), primary: true });
  if (stage === "tofu") {
    kpis.push({ label: "Reach", value: fmtNum(t.reach || 0), sub: "unique" });
    kpis.push({ label: "Impressions", value: fmtNum(t.impressions || 0) });
    kpis.push({ label: "CPM", value: fmtR(t.impressions > 0 ? (t.spend / t.impressions * 1000) : 0), sub: "cost per 1,000" });
  } else if (stage === "mofu") {
    kpis.push({ label: "Clicks", value: fmtNum(t.clicks || 0) });
    kpis.push({ label: "CTR", value: t.impressions > 0 ? fmtPct(t.clicks / t.impressions * 100) : "0.00%" });
    kpis.push({ label: "Cost Per Click", value: fmtR(t.clicks > 0 ? t.spend / t.clicks : 0) });
    if (t.landingPageViews > 0) kpis.push({ label: "Landing Page Views", value: fmtNum(t.landingPageViews) });
    if (t.follows + t.pageLikes > 0) kpis.push({ label: "New Community", value: "+" + fmtNum(t.follows + t.pageLikes) });
  } else {
    if (t.leads > 0) {
      kpis.push({ label: "Leads", value: fmtNum(t.leads) });
      kpis.push({ label: "Cost Per Lead", value: fmtR(t.leads > 0 ? t.spend / t.leads : 0) });
      var convRate = t.clicks > 0 ? (t.leads / t.clicks * 100) : 0;
      if (convRate > 0) kpis.push({ label: "Conversion Rate", value: fmtPct(convRate), sub: "clicks to leads" });
    }
    if (t.appInstalls > 0) {
      kpis.push({ label: "App Store Clicks", value: fmtNum(t.appInstalls) });
      kpis.push({ label: "Cost Per Click", value: fmtR(t.appInstalls > 0 ? t.spend / t.appInstalls : 0) });
    }
    if (t.follows + t.pageLikes > 0) {
      kpis.push({ label: "New Community", value: "+" + fmtNum(t.follows + t.pageLikes) });
      kpis.push({ label: "Cost Per Member", value: fmtR((t.follows + t.pageLikes) > 0 ? t.spend / (t.follows + t.pageLikes) : 0) });
    }
  }
  return kpis.slice(0, 6).map(function(k) {
    return `<div class="rp-kpi ${k.primary ? "rp-kpi-primary" : ""}">
      <div class="rp-kpi-label">${escapeHtmlLocal(k.label)}</div>
      <div class="rp-kpi-value">${escapeHtmlLocal(k.value)}</div>
      ${k.sub ? `<div class="rp-kpi-sub">${escapeHtmlLocal(k.sub)}</div>` : ""}
    </div>`;
  }).join("");
}

// Render a compact per-campaign list inside a funnel stage.
function renderStageCampaignList(campaigns) {
  if (!campaigns || !campaigns.length) return `<div class="rp-empty">No campaigns in this stage for the selected period.</div>`;
  var sorted = campaigns.slice().sort(function(a, b) { return parseFloat(b.spend || 0) - parseFloat(a.spend || 0); });
  var rows = sorted.map(function(c) {
    var plat = c.platform || "-";
    var platC = plat === "Facebook" ? "#1877F2" : plat === "Instagram" ? "#E1306C" : plat === "TikTok" ? "#00F2EA" : plat === "Google Ads" ? "#34A853" : "#8B7FA3";
    var stage = funnelStageFor(c);
    var primary;
    if (stage === "tofu") primary = fmtNum(c.reach || c.impressions || 0) + (c.reach > 0 ? " reached" : " imps");
    else if (stage === "mofu") primary = fmtNum(parseFloat(c.clicks || 0)) + " clicks";
    else primary = parseFloat(c.leads || 0) > 0 ? fmtNum(c.leads) + " leads" : (parseFloat(c.appStoreClicks || 0) > 0 ? fmtNum(c.appStoreClicks) + " app clicks" : ((parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0)) > 0 ? "+" + fmtNum(parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0)) + " community" : "-"));
    return `<tr>
      <td class="rp-td-name">
        <span class="rp-plat-chip" style="background:${platC};">${escapeHtmlLocal(plat)}</span>
        <span>${escapeHtmlLocal(c.campaignName || "Untitled")}</span>
      </td>
      <td class="rp-td-num">${fmtR(c.spend || 0)}</td>
      <td class="rp-td-num">${fmtNum(c.impressions || 0)}</td>
      <td class="rp-td-num">${fmtPct(c.ctr || 0)}</td>
      <td class="rp-td-num">${primary}</td>
    </tr>`;
  }).join("");
  return `<table class="rp-table">
    <thead><tr>
      <th class="rp-th-name">Campaign</th>
      <th class="rp-th-num">Spend</th>
      <th class="rp-th-num">Impressions</th>
      <th class="rp-th-num">CTR</th>
      <th class="rp-th-num">Primary Result</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderTofuSection(opts) {
  var camps = opts.funnel.tofu;
  var t = opts.funnel.totals.tofu;
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 03 &middot; Top of Funnel</div>
    <h1 class="rp-h1">Awareness &amp; Reach</h1>
    <div class="rp-lede">The audience-building layer. Awareness campaigns exist to plant the brand in memory ahead of a decision moment. Success is measured in reach and cost efficiency of that reach, not clicks.</div>
    <div class="rp-kpi-grid">${renderStageKpis(t, "tofu")}</div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Campaigns In This Stage</div>
      ${renderStageCampaignList(camps)}
      <p class="rp-body rp-body-note">${camps.length === 0 ? "No awareness campaigns ran during this window. If the brand is entering a growth phase, consider a paid reach layer to seed future demand." : "Awareness campaigns compound: every impression today reduces the cost of every click and lead tomorrow. Read the CPM column above as the price of introducing the brand to one thousand people."}</p>
    </div>
  </section>`;
}

function renderMofuSection(opts) {
  var camps = opts.funnel.mofu;
  var t = opts.funnel.totals.mofu;
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 04 &middot; Middle of Funnel</div>
    <h1 class="rp-h1">Consideration &amp; Engagement</h1>
    <div class="rp-lede">The intent-capture layer. This stage takes audiences who now recognise the brand and gives them a low-friction next step: a click through to a landing page, a follow, a video watched to completion.</div>
    <div class="rp-kpi-grid">${renderStageKpis(t, "mofu")}</div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Campaigns In This Stage</div>
      ${renderStageCampaignList(camps)}
      <p class="rp-body rp-body-note">${camps.length === 0 ? "No consideration-layer campaigns ran during this window. Awareness without a consideration layer risks impressions that never translate into pipeline." : "CTR above the 1.2% benchmark suggests the creative and audience combination is resonating. A stage this size deepens intent for the conversion campaigns below and lowers their acquisition cost."}</p>
    </div>
  </section>`;
}

function renderBofuSection(opts) {
  var camps = opts.funnel.bofu;
  var t = opts.funnel.totals.bofu;
  var ecoBlock = "";
  var eco = opts.ecommerce && opts.ecommerce.ecommerce;
  if (eco) {
    var rev = parseFloat(eco.revenue || 0);
    var tx = parseFloat(eco.transactions || 0);
    ecoBlock = `<div class="rp-eco-block">
      <div class="rp-narrative-eyebrow">Site Ecommerce Performance</div>
      <div class="rp-eco-row">
        <div class="rp-eco-tile"><div class="rp-eco-label">Revenue</div><div class="rp-eco-value">${fmtR(rev)}</div></div>
        <div class="rp-eco-tile"><div class="rp-eco-label">Transactions</div><div class="rp-eco-value">${fmtNum(tx)}</div></div>
        <div class="rp-eco-tile"><div class="rp-eco-label">Average Order</div><div class="rp-eco-value">${fmtR(tx > 0 ? rev / tx : 0)}</div></div>
        ${eco.sessions ? `<div class="rp-eco-tile"><div class="rp-eco-label">Sessions</div><div class="rp-eco-value">${fmtNum(eco.sessions)}</div></div>` : ""}
      </div>
      <p class="rp-body rp-body-note">Total-site revenue reflects the whole business, not only paid-social contribution. It is included in the bottom-of-funnel section as the ultimate outcome the funnel is optimising toward.</p>
    </div>`;
  }
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 05 &middot; Bottom of Funnel</div>
    <h1 class="rp-h1">Conversion &amp; Growth</h1>
    <div class="rp-lede">The action layer. This stage converts warm audiences into measurable business outcomes: qualified leads, app installs, purchases, or a new community member.</div>
    <div class="rp-kpi-grid">${renderStageKpis(t, "bofu")}</div>
    <div class="rp-narrative">
      <div class="rp-narrative-eyebrow">Campaigns In This Stage</div>
      ${renderStageCampaignList(camps)}
      <p class="rp-body rp-body-note">${camps.length === 0 ? "No conversion-layer campaigns ran during this window. The awareness and consideration built above needs a paid mechanism to convert." : "Conversion cost is the diagnostic metric here. A stable or declining cost per outcome relative to prior windows confirms the funnel above is doing its job."}</p>
    </div>
    ${ecoBlock}
  </section>`;
}

// Detail section: placement performance table.
function renderPlacementsSection(opts) {
  var placements = (opts.placements || []).slice(0, 10);
  if (!placements.length) return "";
  var totalSpend = placements.reduce(function(s, p) { return s + parseFloat(p.spend || 0); }, 0);
  var rows = placements.map(function(p, i) {
    var spend = parseFloat(p.spend || 0);
    var imps = parseFloat(p.impressions || 0);
    var clicks = parseFloat(p.clicks || 0);
    var leads = parseFloat(p.leads || 0);
    var follows = parseFloat(p.follows || 0);
    var pageLikes = parseFloat(p.pageLikes || 0);
    var ctr = imps > 0 ? (clicks / imps * 100) : 0;
    var share = totalSpend > 0 ? (spend / totalSpend * 100) : 0;
    var result = leads > 0 ? leads : (follows + pageLikes > 0 ? (follows + pageLikes) : clicks);
    var resLabel = leads > 0 ? "leads" : (follows + pageLikes > 0 ? "follows" : "clicks");
    return `<tr>
      <td class="rp-td-rank">${i + 1}</td>
      <td class="rp-td-name">
        <span class="rp-dot" style="background:${escapeHtmlLocal(p.color || "#8B7FA3")};"></span>
        ${escapeHtmlLocal(p.name || "Unknown")}
        <div class="rp-td-name-sub">${escapeHtmlLocal(p.platform || "")}</div>
      </td>
      <td class="rp-td-num">${share.toFixed(1)}%</td>
      <td class="rp-td-num">${fmtR(spend)}</td>
      <td class="rp-td-num">${fmtNum(imps)}</td>
      <td class="rp-td-num">${fmtPct(ctr)}</td>
      <td class="rp-td-num">${result > 0 ? fmtNum(result) + " " + resLabel : "-"}</td>
      <td class="rp-td-num rp-td-sub">${result > 0 ? fmtR(spend / result) : "-"}</td>
    </tr>`;
  }).join("");
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 06 &middot; Delivery Detail</div>
    <h1 class="rp-h1">Placement Performance</h1>
    <div class="rp-lede">Where the budget is delivering, ranked by share of spend. Placement analysis identifies the specific surfaces (feeds, reels, stories, search, YouTube) driving the funnel outcomes above.</div>
    <table class="rp-table rp-table-wide">
      <thead><tr>
        <th class="rp-th-rank">#</th>
        <th class="rp-th-name">Placement</th>
        <th class="rp-th-num">Share</th>
        <th class="rp-th-num">Spend</th>
        <th class="rp-th-num">Impressions</th>
        <th class="rp-th-num">CTR</th>
        <th class="rp-th-num">Results</th>
        <th class="rp-th-num">Cost / Result</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// Detail section: full per-campaign table.
function renderCampaignsSection(opts) {
  var campaigns = opts.summary && opts.summary.campaigns;
  if (!campaigns || !campaigns.length) return "";
  var sorted = campaigns.slice().sort(function(a, b) { return parseFloat(b.spend || 0) - parseFloat(a.spend || 0); });
  var rows = sorted.map(function(c) {
    var plat = c.platform || "-";
    var platC = plat === "Facebook" ? "#1877F2" : plat === "Instagram" ? "#E1306C" : plat === "TikTok" ? "#00F2EA" : plat === "Google Ads" ? "#34A853" : "#8B7FA3";
    var stage = funnelStageFor(c);
    var stageLbl = stage === "tofu" ? "ToFu" : stage === "mofu" ? "MoFu" : "BoFu";
    var stageC = stage === "tofu" ? "#F96203" : stage === "mofu" ? "#FF6B00" : "#FF3D00";
    var leads = parseFloat(c.leads || 0);
    var follows = parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0);
    var clicks = parseFloat(c.clicks || 0);
    var result, resLbl;
    if (leads > 0) { result = leads; resLbl = "leads"; }
    else if (follows > 0) { result = follows; resLbl = "follows"; }
    else { result = clicks; resLbl = "clicks"; }
    return `<tr>
      <td class="rp-td-name">
        <span class="rp-plat-chip" style="background:${platC};">${escapeHtmlLocal(plat)}</span>
        <span>${escapeHtmlLocal(c.campaignName || "Untitled")}</span>
      </td>
      <td><span class="rp-stage-chip" style="border-color:${stageC};color:${stageC};">${stageLbl}</span></td>
      <td class="rp-td-num">${fmtR(c.spend || 0)}</td>
      <td class="rp-td-num">${fmtNum(c.impressions || 0)}</td>
      <td class="rp-td-num">${fmtPct(c.ctr || 0)}</td>
      <td class="rp-td-num">${result > 0 ? fmtNum(result) + " " + resLbl : "-"}</td>
      <td class="rp-td-num rp-td-sub">${result > 0 ? fmtR(parseFloat(c.spend || 0) / result) : "-"}</td>
    </tr>`;
  }).join("");
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 07 &middot; Campaign Detail</div>
    <h1 class="rp-h1">Every Campaign In This Report</h1>
    <div class="rp-lede">Complete campaign roster ranked by spend, tagged with the funnel stage each is optimised for. Result column reads the objective-appropriate outcome so each row is compared against its own goal, not a blanket click count.</div>
    <table class="rp-table rp-table-wide">
      <thead><tr>
        <th class="rp-th-name">Campaign</th>
        <th class="rp-th-num">Stage</th>
        <th class="rp-th-num">Spend</th>
        <th class="rp-th-num">Impressions</th>
        <th class="rp-th-num">CTR</th>
        <th class="rp-th-num">Result</th>
        <th class="rp-th-num">Cost / Result</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

// Detail section: top creatives per platform.
function renderCreativeSection(opts) {
  // topAds arrives as [{platform: "Facebook", ads: [...]}, ...] per
  // fetchTopAds in email-share.js.
  var top = opts.topAds;
  if (!Array.isArray(top) || !top.length) return "";
  var pBlocks = top.filter(function(pl) { return pl && Array.isArray(pl.ads) && pl.ads.length; }).map(function(pl) {
    var p = pl.platform || "-";
    var arr = pl.ads.slice(0, 3);
    var color = p === "Facebook" ? "#1877F2" : p === "Instagram" ? "#E1306C" : p === "TikTok" ? "#00F2EA" : "#34A853";
    var cards = arr.map(function(a, i) {
      var thumb = a.thumbnail || "";
      var resLabel = a.resultType === "leads" ? "leads" : a.resultType === "follows" ? "follows" : a.resultType === "installs" ? "app clicks" : a.resultType === "impressions" ? "impressions" : "clicks";
      return `<div class="rp-creative-card">
        <div class="rp-creative-thumb">
          ${thumb ? `<img src="${escapeHtmlLocal(thumb)}" alt="" onerror="this.style.display='none'"/>` : ""}
          <div class="rp-creative-rank">#${i + 1}</div>
        </div>
        <div class="rp-creative-body">
          <div class="rp-creative-name">${escapeHtmlLocal(a.adName || "Untitled")}</div>
          <div class="rp-creative-camp">${escapeHtmlLocal(a.campaignName || "")}</div>
          <div class="rp-creative-metrics">
            <span><strong>${fmtR(a.spend || 0)}</strong> spent</span>
            <span><strong>${fmtNum(a.results || 0)}</strong> ${resLabel}</span>
            <span><strong>${fmtPct(a.ctr || 0)}</strong> CTR</span>
          </div>
        </div>
      </div>`;
    }).join("");
    return `<div class="rp-platform-block">
      <div class="rp-platform-head" style="border-left-color:${color};color:${color};">${escapeHtmlLocal(p)}</div>
      <div class="rp-creative-grid">${cards}</div>
    </div>`;
  }).join("");
  if (!pBlocks) return "";
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 08 &middot; Creative Read</div>
    <h1 class="rp-h1">Top Performing Creatives</h1>
    <div class="rp-lede">The three highest-performing ads per platform. Rankings honour each ad's objective — awareness ads are ranked on impressions and reach efficiency, conversion ads on outcome volume and cost.</div>
    ${pBlocks}
  </section>`;
}

// Recommendations — auto-generated from the data.
function renderRecommendations(opts) {
  var recs = [];
  var g = opts.summary && opts.summary.grand;
  var f = opts.funnel && opts.funnel.totals;
  if (g && f) {
    var totalSpend = f.tofu.spend + f.mofu.spend + f.bofu.spend;
    if (totalSpend > 0) {
      var tofuPct = f.tofu.spend / totalSpend * 100;
      var mofuPct = f.mofu.spend / totalSpend * 100;
      var bofuPct = f.bofu.spend / totalSpend * 100;
      if (tofuPct < 15 && bofuPct > 60) recs.push({ title: "Rebalance The Funnel Toward Awareness", body: "Awareness carries only " + tofuPct.toFixed(1) + "% of investment while conversion carries " + bofuPct.toFixed(1) + "%. Sustained conversion volume needs a warm audience above it, otherwise CPL will rise as the pool exhausts. Recommend shifting 10-15% of BoFu budget into a persistent awareness layer for the next window." });
      if (bofuPct < 10 && tofuPct > 50) recs.push({ title: "Introduce A Conversion Layer", body: "The current investment is heavily weighted to awareness (" + tofuPct.toFixed(1) + "%). Awareness only converts when followed by a low-friction ask. Recommend adding a lead-generation or landing-page layer at 15-20% of budget to capture the demand being generated." });
    }
    var ctr = parseFloat(g.ctr || 0);
    if (ctr < 0.8 && f.mofu.impressions > 10000) recs.push({ title: "Refresh Consideration Creative", body: "The blended click-through rate of " + fmtPct(ctr) + " is below the 0.8% benchmark for consideration-stage delivery, suggesting creative fatigue or a message-audience mismatch. Recommend introducing 2-3 new creative variants and running a two-week A/B against the current top performers." });
    if (parseFloat(g.frequency || 0) > 4.0) recs.push({ title: "Reduce Frequency Ceiling", body: "Meta frequency at " + parseFloat(g.frequency).toFixed(2) + "x has crossed the 4.0x fatigue ceiling. Diminishing returns accelerate above this threshold. Recommend expanding audience with lookalikes or shifting spend to an interest-based cold layer to reset delivery." });
    var leadCost = f.bofu.leads > 0 ? f.bofu.spend / f.bofu.leads : 0;
    if (leadCost > 0 && leadCost < 50) recs.push({ title: "Scale The Lead Generation Layer", body: "Cost per lead at " + fmtR(leadCost) + " sits well inside industry benchmarks. This is a scale signal: recommend a 20-30% budget increase for the highest-performing lead campaigns while monitoring frequency and quality." });
    if (f.tofu.reach === 0 && f.tofu.impressions > 0) recs.push({ title: "Enable Reach Reporting", body: "Awareness delivery is measured only in impressions this period. Reach reporting via TikTok or older-format Meta objectives would unlock frequency and unique-user metrics that are critical for judging awareness efficiency." });
  }
  // If no data-driven recs surfaced, provide one balanced default so the section isn't empty.
  if (recs.length === 0) {
    recs.push({ title: "Review Cadence", body: "Continue current campaign structure into next window; monitor CTR and frequency for early signals of creative fatigue. Full report review recommended on a monthly cadence." });
  }
  var recsHtml = recs.slice(0, 5).map(function(r, i) {
    return `<div class="rp-rec">
      <div class="rp-rec-num">${(i + 1).toString().padStart(2, "0")}</div>
      <div class="rp-rec-body">
        <div class="rp-rec-title">${escapeHtmlLocal(r.title)}</div>
        <div class="rp-rec-text">${escapeHtmlLocal(r.body)}</div>
      </div>
    </div>`;
  }).join("");
  return `<section class="rp-page">
    <div class="rp-section-eyebrow">Section 09 &middot; Action Plan</div>
    <h1 class="rp-h1">Recommendations For Next Window</h1>
    <div class="rp-lede">Data-driven recommendations derived from the performance patterns in this report. Prioritised by expected impact on the next window's results.</div>
    <div class="rp-recs">${recsHtml}</div>
  </section>`;
}

// Sign-off / closing page.
function renderSignOff(opts) {
  var senderName = escapeHtmlLocal(opts.senderName || "");
  var senderTitle = escapeHtmlLocal(opts.senderTitle || "");
  var origin = opts.origin || "https://media.gasmarketing.co.za";
  return `<section class="rp-page rp-signoff">
    <div class="rp-signoff-inner">
      <div class="rp-signoff-eyebrow">Thank You</div>
      <div class="rp-signoff-title">A note from your team</div>
      <p class="rp-signoff-body">This report reflects the data captured directly from the ad platforms at the moment it was generated. For live figures, deeper deep-dives, or bespoke cuts of this data, the full interactive dashboard is available at any time via your team's shared link.</p>
      <div class="rp-signoff-sign">
        <div class="rp-signoff-sender">${senderName || "GAS Marketing"}</div>
        ${senderTitle ? `<div class="rp-signoff-sender-title">${senderTitle}</div>` : ""}
      </div>
      <div class="rp-signoff-contact">
        <div>grow@gasmarketing.co.za</div>
        <div>${escapeHtmlLocal(origin.replace(/^https?:\/\//, ""))}</div>
      </div>
      <div class="rp-signoff-emblem">Media On GAS &middot; Metrics That Matter</div>
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

  // Precompute the funnel partition ONCE so every section reuses it.
  var funnel = partitionByFunnel((opts.summary && opts.summary.campaigns) || []);

  var contentOpts = Object.assign({}, opts, {
    clientName: clientName,
    periodDisplay: periodDisplay,
    funnel: funnel
  });

  var pages = [
    renderCoverPage(contentOpts),
    renderExecutiveSummary(contentOpts),
    renderFunnelOverview(contentOpts),
    renderTofuSection(contentOpts),
    renderMofuSection(contentOpts),
    renderBofuSection(contentOpts),
    renderPlacementsSection(contentOpts),
    renderCampaignsSection(contentOpts),
    renderCreativeSection(contentOpts),
    renderRecommendations(contentOpts),
    renderSignOff(contentOpts)
  ].filter(Boolean).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtmlLocal(docTitle)}</title>
<style>
/* Print-first document. Screen preview uses the same styles so what
   the operator sees on screen is what saves to PDF. */
:root {
  --rp-bg: #0F1820;
  --rp-bg2: #13202C;
  --rp-fg: #FFFBF8;
  --rp-fg-dim: rgba(255,251,248,0.72);
  --rp-fg-mute: rgba(255,251,248,0.5);
  --rp-accent: #F96203;
  --rp-accent2: #FF3D00;
  --rp-accent3: #FF6B00;
  --rp-line: rgba(255,255,255,0.08);
  --rp-line-strong: rgba(249,98,3,0.42);
  --rp-card: rgba(0,0,0,0.28);
}
@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: var(--rp-bg); color: var(--rp-fg); font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
* { box-sizing: border-box; }
img { max-width: 100%; display: block; }

.rp-page {
  width: 210mm;
  min-height: 297mm;
  padding: 22mm 20mm;
  background: linear-gradient(170deg, var(--rp-bg) 0%, var(--rp-bg2) 100%);
  page-break-after: always;
  break-after: page;
  position: relative;
}
.rp-page:last-child { page-break-after: auto; break-after: auto; }

/* Cover ─────────────────────────────────────────────────────────── */
.rp-cover {
  background: linear-gradient(160deg, #06020e 0%, #0F1820 55%, #131a2c 100%);
  padding: 26mm 22mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 297mm;
}
.rp-cover-inner { display: flex; flex-direction: column; height: 100%; min-height: 253mm; }
.rp-cover-brand { min-height: 60mm; display: flex; align-items: center; justify-content: flex-start; }
.rp-cover-logo { max-width: 90mm; max-height: 50mm; object-fit: contain; }
.rp-cover-name { font-size: 34pt; font-weight: 900; letter-spacing: -0.5px; color: var(--rp-fg); }
.rp-cover-eyebrow { margin-top: 28mm; font-size: 9pt; letter-spacing: 6px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; }
.rp-cover-title { font-size: 46pt; font-weight: 900; letter-spacing: -1.2px; line-height: 1.05; color: var(--rp-fg); margin-top: 8mm; word-break: break-word; }
.rp-cover-period { font-size: 16pt; letter-spacing: 2px; color: var(--rp-fg-dim); margin-top: 10mm; font-weight: 500; }
.rp-cover-divider { height: 3px; width: 60mm; background: linear-gradient(90deg, var(--rp-accent), var(--rp-accent2)); margin: 14mm 0 auto; border-radius: 2px; }
.rp-cover-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 14mm; border-top: 1px solid var(--rp-line); }
.rp-cover-foot-left, .rp-cover-foot-right { display: flex; flex-direction: column; gap: 3mm; }
.rp-cover-foot-right { align-items: flex-end; text-align: right; }
.rp-cover-agency-logo { width: 20mm; height: 20mm; border-radius: 50%; box-shadow: 0 0 12mm rgba(249,98,3,0.35); margin-bottom: 4mm; }
.rp-cover-label { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; }
.rp-cover-sender { font-size: 14pt; font-weight: 800; color: var(--rp-fg); }
.rp-cover-sender-title { font-size: 10pt; color: var(--rp-fg-dim); }

/* Section chrome ────────────────────────────────────────────────── */
.rp-section-eyebrow { font-size: 8pt; letter-spacing: 4px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 4mm; }
.rp-h1 { font-size: 28pt; font-weight: 900; letter-spacing: -0.8px; line-height: 1.1; color: var(--rp-fg); margin: 0 0 6mm 0; }
.rp-lede { font-size: 11pt; color: var(--rp-fg-dim); line-height: 1.6; margin-bottom: 10mm; max-width: 160mm; }

/* KPI grid ──────────────────────────────────────────────────────── */
.rp-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-bottom: 10mm; }
.rp-kpi { padding: 6mm 6mm; background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 3mm; page-break-inside: avoid; }
.rp-kpi-primary { border-color: var(--rp-line-strong); background: linear-gradient(140deg, rgba(249,98,3,0.14), var(--rp-card)); }
.rp-kpi-label { font-size: 7.5pt; letter-spacing: 2px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; margin-bottom: 3mm; }
.rp-kpi-value { font-size: 22pt; font-weight: 900; color: var(--rp-fg); line-height: 1; letter-spacing: -0.5px; font-variant-numeric: tabular-nums; }
.rp-kpi-primary .rp-kpi-value { color: var(--rp-accent); }
.rp-kpi-sub { font-size: 8pt; color: var(--rp-fg-mute); margin-top: 3mm; letter-spacing: 0.5px; }

/* Narrative + body ──────────────────────────────────────────────── */
.rp-narrative { margin-top: 6mm; padding: 6mm; background: var(--rp-card); border-radius: 3mm; border-left: 3px solid var(--rp-accent); page-break-inside: avoid; }
.rp-narrative-eyebrow { font-size: 8pt; letter-spacing: 3px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 4mm; }
.rp-body { font-size: 10.5pt; color: var(--rp-fg-dim); line-height: 1.7; margin: 0; }
.rp-body-note { margin-top: 5mm; font-size: 10pt; color: var(--rp-fg-mute); font-style: italic; }

/* Funnel visual ─────────────────────────────────────────────────── */
.rp-funnel { display: flex; flex-direction: column; gap: 6mm; margin-bottom: 8mm; }
.rp-funnel-stage { background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 4mm; padding: 6mm; }
.rp-funnel-stage-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4mm; }
.rp-funnel-stage-name { font-size: 14pt; font-weight: 900; letter-spacing: 0.5px; }
.rp-funnel-stage-sub { font-size: 9pt; color: var(--rp-fg-mute); letter-spacing: 1px; text-transform: uppercase; font-weight: 700; margin-top: 1mm; }
.rp-funnel-stage-share { font-size: 20pt; font-weight: 900; color: var(--rp-fg); font-variant-numeric: tabular-nums; }
.rp-funnel-bar-track { height: 6mm; background: rgba(0,0,0,0.4); border-radius: 3mm; overflow: hidden; margin-bottom: 4mm; }
.rp-funnel-bar-fill { height: 100%; border-radius: 3mm; }
.rp-funnel-stage-foot { display: flex; gap: 6mm; font-size: 10pt; color: var(--rp-fg); font-weight: 700; letter-spacing: 0.3px; }
.rp-funnel-stage-foot span { padding-right: 6mm; border-right: 1px solid var(--rp-line); }
.rp-funnel-stage-foot span:last-child { border-right: 0; }
.rp-funnel-stage-role { margin-top: 3mm; font-size: 9.5pt; color: var(--rp-fg-mute); font-style: italic; line-height: 1.5; }

/* Tables ────────────────────────────────────────────────────────── */
.rp-table { width: 100%; border-collapse: collapse; background: var(--rp-card); border-radius: 3mm; overflow: hidden; font-size: 9.5pt; margin-top: 4mm; }
.rp-table-wide { font-size: 9pt; }
.rp-table th { padding: 3mm 3mm; text-align: left; font-size: 7.5pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 800; border-bottom: 1px solid rgba(249,98,3,0.2); background: rgba(249,98,3,0.06); }
.rp-th-num { text-align: right; }
.rp-th-rank { text-align: center; width: 8mm; }
.rp-table td { padding: 3mm 3mm; border-bottom: 1px solid rgba(255,255,255,0.06); color: var(--rp-fg); vertical-align: middle; }
.rp-table tbody tr:nth-child(even) td { background: rgba(255,255,255,0.02); }
.rp-td-num { text-align: right; font-variant-numeric: tabular-nums; }
.rp-td-rank { text-align: center; color: var(--rp-fg-mute); font-weight: 800; }
.rp-td-sub { color: var(--rp-fg-mute); font-size: 8.5pt; }
.rp-td-name-sub { font-size: 7.5pt; color: var(--rp-fg-mute); text-transform: uppercase; letter-spacing: 1px; margin-top: 1mm; }
.rp-plat-chip { display: inline-block; padding: 1mm 2.5mm; font-size: 7pt; font-weight: 900; color: #fff; border-radius: 2px; letter-spacing: 1px; margin-right: 2mm; vertical-align: middle; }
.rp-stage-chip { display: inline-block; padding: 1mm 2.5mm; font-size: 7pt; font-weight: 900; border: 1px solid; border-radius: 2px; letter-spacing: 1px; }
.rp-dot { display: inline-block; width: 2.5mm; height: 2.5mm; border-radius: 50%; margin-right: 2mm; vertical-align: middle; }
.rp-empty { padding: 6mm; text-align: center; color: var(--rp-fg-mute); font-style: italic; background: var(--rp-card); border-radius: 3mm; font-size: 10pt; }

/* Ecommerce block ───────────────────────────────────────────────── */
.rp-eco-block { margin-top: 6mm; padding: 6mm; background: var(--rp-card); border-radius: 3mm; border-left: 3px solid var(--rp-accent2); page-break-inside: avoid; }
.rp-eco-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 5mm 0; }
.rp-eco-tile { padding: 4mm; background: rgba(0,0,0,0.24); border-radius: 2mm; text-align: center; }
.rp-eco-label { font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; color: var(--rp-fg-mute); font-weight: 700; margin-bottom: 2mm; }
.rp-eco-value { font-size: 15pt; font-weight: 900; color: var(--rp-fg); font-variant-numeric: tabular-nums; letter-spacing: -0.3px; }

/* Creative section ──────────────────────────────────────────────── */
.rp-platform-block { margin-bottom: 8mm; page-break-inside: avoid; }
.rp-platform-head { border-left: 3px solid; padding-left: 4mm; font-size: 11pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4mm; }
.rp-creative-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
.rp-creative-card { background: var(--rp-card); border: 1px solid var(--rp-line); border-radius: 3mm; overflow: hidden; }
.rp-creative-thumb { position: relative; width: 100%; padding-top: 100%; background: #000; }
.rp-creative-thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.rp-creative-rank { position: absolute; top: 3mm; left: 3mm; padding: 1mm 3mm; background: var(--rp-accent); color: #fff; font-size: 8pt; font-weight: 900; border-radius: 2mm; letter-spacing: 0.5px; }
.rp-creative-body { padding: 4mm; }
.rp-creative-name { font-size: 9pt; font-weight: 800; color: var(--rp-fg); margin-bottom: 1.5mm; line-height: 1.4; word-break: break-word; }
.rp-creative-camp { font-size: 7.5pt; color: var(--rp-fg-mute); letter-spacing: 0.5px; margin-bottom: 3mm; text-transform: uppercase; }
.rp-creative-metrics { display: flex; flex-direction: column; gap: 1mm; font-size: 8.5pt; color: var(--rp-fg-dim); }
.rp-creative-metrics strong { color: var(--rp-accent); font-weight: 900; }

/* Recommendations ───────────────────────────────────────────────── */
.rp-recs { display: flex; flex-direction: column; gap: 5mm; }
.rp-rec { display: flex; gap: 5mm; padding: 6mm; background: var(--rp-card); border-radius: 3mm; border-left: 3px solid var(--rp-accent); page-break-inside: avoid; }
.rp-rec-num { font-size: 22pt; font-weight: 900; color: var(--rp-accent); letter-spacing: -1px; line-height: 1; font-variant-numeric: tabular-nums; min-width: 15mm; }
.rp-rec-body { flex: 1; }
.rp-rec-title { font-size: 12pt; font-weight: 900; color: var(--rp-fg); margin-bottom: 3mm; letter-spacing: -0.3px; }
.rp-rec-text { font-size: 10pt; color: var(--rp-fg-dim); line-height: 1.7; }

/* Sign-off ──────────────────────────────────────────────────────── */
.rp-signoff { background: linear-gradient(210deg, #06020e 0%, #0F1820 60%); display: flex; align-items: center; justify-content: center; min-height: 297mm; }
.rp-signoff-inner { max-width: 140mm; text-align: center; padding: 0 20mm; }
.rp-signoff-eyebrow { font-size: 9pt; letter-spacing: 6px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; margin-bottom: 8mm; }
.rp-signoff-title { font-size: 30pt; font-weight: 900; letter-spacing: -0.8px; color: var(--rp-fg); margin-bottom: 10mm; }
.rp-signoff-body { font-size: 12pt; color: var(--rp-fg-dim); line-height: 1.8; margin-bottom: 14mm; }
.rp-signoff-sign { margin-bottom: 12mm; padding-top: 8mm; border-top: 1px solid var(--rp-line); }
.rp-signoff-sender { font-size: 14pt; font-weight: 800; color: var(--rp-fg); }
.rp-signoff-sender-title { font-size: 10pt; color: var(--rp-fg-dim); margin-top: 2mm; }
.rp-signoff-contact { font-size: 10pt; color: var(--rp-fg-mute); margin-bottom: 12mm; line-height: 1.8; }
.rp-signoff-emblem { font-size: 8pt; letter-spacing: 5px; text-transform: uppercase; color: var(--rp-accent); font-weight: 800; }

/* Print rules ───────────────────────────────────────────────────── */
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
