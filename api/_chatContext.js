// Build the rich campaign-data context string the AI analyst reasons over.
// Anti-hallucination principle: pack in actual numbers (not vague descriptions) plus
// SA benchmarks, so every claim the AI makes can be grounded in this block.

function fmtNum(n) {
  n = parseFloat(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toLocaleString();
}
function fmtR(n) {
  n = parseFloat(n) || 0;
  return "R" + n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n) {
  n = parseFloat(n) || 0;
  return n.toFixed(2) + "%";
}

function aggregate(arr) {
  var s = { impressions: 0, reach: 0, spend: 0, clicks: 0, leads: 0, appInstalls: 0, follows: 0, pageLikes: 0, likes: 0, landingPageViews: 0 };
  arr.forEach(function(c) {
    s.impressions += parseFloat(c.impressions || 0);
    s.reach += parseFloat(c.reach || 0);
    s.spend += parseFloat(c.spend || 0);
    s.clicks += parseFloat(c.clicks || 0);
    s.leads += parseFloat(c.leads || 0);
    s.appInstalls += parseFloat(c.appInstalls || 0);
    s.follows += parseFloat(c.follows || 0);
    s.pageLikes += parseFloat(c.pageLikes || 0);
    s.likes += parseFloat(c.likes || 0);
    s.landingPageViews += parseFloat(c.landingPageViews || 0);
  });
  s.cpm = s.impressions > 0 ? (s.spend / s.impressions * 1000) : 0;
  s.cpc = s.clicks > 0 ? (s.spend / s.clicks) : 0;
  s.ctr = s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0;
  s.frequency = s.reach > 0 ? (s.impressions / s.reach) : 0;
  return s;
}

async function internalFetch(req, path) {
  var apiKey = process.env.DASHBOARD_API_KEY;
  if (!apiKey) return null;
  // Pin to known-good production host, never trust incoming Host header for
  // credentialed outbound fetches.
  var host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "media-on-gas.vercel.app";
  var r = await fetch("https://" + host + path, { headers: { "x-api-key": apiKey } });
  if (!r.ok) return null;
  return r.json();
}

// Pulls campaigns + top ads, filters to the principal's allowlist, and returns
// { text, topAds } where text is the authoritative data block for the AI, and
// topAds is a structured list we can render as thumbnail cards in the UI when
// the user asks about best-performing creative.
export async function buildChatContext(req, from, to, principal) {
  var campData = await internalFetch(req, "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to));
  if (!campData || !Array.isArray(campData.campaigns)) return null;

  var allCamps = campData.campaigns;
  var filteredCamps;
  if (principal && principal.role === "client") {
    // Strict exact-match on the suffixed campaignId. No raw-ID cross-match
    // (which pulled the other publisher variant of the same Meta campaign
    // via shared rawCampaignId) and no name fallback (which cross-matched
    // same-named campaigns across accounts). Admin requests are downgraded
    // to this same principal shape in api/chat.js, so both paths share the
    // same strict rule.
    var idSet = {}; (principal.allowedCampaignIds || []).forEach(function(x) { idSet[String(x)] = true; });
    filteredCamps = allCamps.filter(function(c) {
      return idSet[String(c.campaignId || "")] === true;
    });
  } else {
    filteredCamps = allCamps;
  }
  if (filteredCamps.length === 0) return null;

  // Also pull top ads for creative-level questions. Ads store raw campaignId
  // with platform on a separate field, reconstruct the suffixed virtual id
  // (raw + "_facebook" / raw + "_instagram") to match the allowlist exactly.
  // For TikTok + Google (no FB/IG split) the virtual id equals the raw id.
  var adsData = await internalFetch(req, "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to));
  var filteredAds = [];
  if (adsData && Array.isArray(adsData.ads)) {
    if (principal && principal.role === "client") {
      var cIdSet = {}; (principal.allowedCampaignIds || []).forEach(function(x) { cIdSet[String(x)] = true; });
      filteredAds = adsData.ads.filter(function(a) {
        var raw = String(a.campaignId || "");
        var plat = String(a.platform || "").toLowerCase();
        var virtualCid = (plat === "facebook" || plat === "instagram") ? (raw + "_" + plat) : raw;
        return cIdSet[virtualCid] === true;
      });
    } else {
      filteredAds = adsData.ads;
    }
  }

  var grand = aggregate(filteredCamps);

  // Per-platform aggregation
  var byPlat = {};
  filteredCamps.forEach(function(c) {
    var p = c.platform || "Other";
    if (!byPlat[p]) byPlat[p] = [];
    byPlat[p].push(c);
  });
  var platforms = Object.keys(byPlat).map(function(p) {
    return { platform: p, agg: aggregate(byPlat[p]), count: byPlat[p].length };
  }).sort(function(a, b) { return b.agg.spend - a.agg.spend; });

  // Top 8 ads by results then spend
  var topAds = filteredAds.slice().sort(function(a, b) {
    var ar = parseFloat(a.results || 0), br = parseFloat(b.results || 0);
    if (br !== ar) return br - ar;
    return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
  }).slice(0, 8);

  // Render the data block
  var lines = [];
  lines.push("# CAMPAIGN PERFORMANCE DATA (period: " + from + " to " + to + ")");
  lines.push("");
  lines.push("## Aggregate totals across all " + filteredCamps.length + " campaigns in this client's allowlist");
  lines.push("- Ads served (impressions): " + fmtNum(grand.impressions));
  lines.push("- Reach (unique people): " + fmtNum(grand.reach));
  lines.push("- Spend: " + fmtR(grand.spend));
  lines.push("- Clicks: " + fmtNum(grand.clicks));
  lines.push("- Click-through rate: " + fmtPct(grand.ctr));
  lines.push("- Cost per 1000 ads served (CPM): " + fmtR(grand.cpm));
  lines.push("- Cost per click (CPC): " + fmtR(grand.cpc));
  lines.push("- Frequency (blended across the full media mix, Google Display/YouTube reach is estimated at 2x frequency since Google Ads does not expose unique-user reach): " + grand.frequency.toFixed(2) + "x");
  lines.push("- Leads generated: " + fmtNum(grand.leads));
  lines.push("- Page follows + likes (Meta): " + fmtNum(grand.follows + grand.pageLikes));
  lines.push("- TikTok follows + likes: " + fmtNum(grand.likes > 0 || grand.follows > 0 ? grand.likes : 0));
  lines.push("- Clicks to app store: " + fmtNum(grand.appInstalls));
  lines.push("- Landing page views: " + fmtNum(grand.landingPageViews));
  lines.push("");

  lines.push("## Per-platform breakdown (sorted by spend)");
  platforms.forEach(function(p) {
    var a = p.agg;
    lines.push("### " + p.platform + " (" + p.count + " campaign" + (p.count === 1 ? "" : "s") + ")");
    lines.push("- Spend: " + fmtR(a.spend) + " (" + (grand.spend > 0 ? (a.spend / grand.spend * 100).toFixed(1) : "0") + "% of total)");
    lines.push("- Ads served: " + fmtNum(a.impressions) + " | Reach: " + fmtNum(a.reach));
    lines.push("- Clicks: " + fmtNum(a.clicks) + " | CTR: " + fmtPct(a.ctr) + " | CPC: " + fmtR(a.cpc));
    lines.push("- CPM: " + fmtR(a.cpm) + " | Frequency: " + a.frequency.toFixed(2) + "x");
    if (a.leads > 0) lines.push("- Leads: " + fmtNum(a.leads) + " at " + fmtR(a.spend / a.leads) + " per lead");
    if (a.follows > 0 || a.pageLikes > 0) lines.push("- Follows/likes earned: " + fmtNum(a.follows + a.pageLikes));
    if (a.appInstalls > 0) lines.push("- Clicks to app store: " + fmtNum(a.appInstalls) + " at " + fmtR(a.spend / a.appInstalls) + " per click");
  });
  lines.push("");

  lines.push("## Individual campaigns (name, platform, spend, CTR, outcomes)");
  filteredCamps.slice().sort(function(a, b) { return parseFloat(b.spend || 0) - parseFloat(a.spend || 0); }).forEach(function(c) {
    var parts = [];
    parts.push('"' + (c.campaignName || "Unnamed") + '"');
    parts.push(c.platform);
    parts.push("spend " + fmtR(c.spend));
    parts.push("impressions " + fmtNum(c.impressions));
    parts.push("CTR " + fmtPct(c.ctr));
    parts.push("CPC " + fmtR(c.cpc));
    if (parseFloat(c.leads || 0) > 0) parts.push(parseFloat(c.leads) + " leads");
    if (parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0) > 0) parts.push((parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0)) + " follows/likes");
    if (parseFloat(c.appInstalls || 0) > 0) parts.push(parseFloat(c.appInstalls) + " installs");
    lines.push("- " + parts.join(", "));
  });
  lines.push("");

  if (topAds.length > 0) {
    lines.push("## Top creative ads (ranked by results, then spend)");
    topAds.forEach(function(a, i) {
      var results = parseFloat(a.results || 0);
      var rt = a.resultType || "results";
      var spend = parseFloat(a.spend || 0);
      var line = "#" + (i + 1) + ' "' + (a.adName || "Unnamed") + '" (' + a.platform + ", " + (a.format || "STATIC") + "): ";
      line += fmtR(spend) + " spend, " + fmtNum(a.impressions) + " impressions, " + fmtPct(a.ctr) + " CTR";
      if (results > 0) line += ", " + results + " " + rt + " at " + fmtR(spend / results) + " each";
      if (a.campaignName) line += ". From campaign: " + a.campaignName;
      lines.push(line);
    });
    lines.push("");
  }

  lines.push("## South African paid media benchmarks (for comparison only, use these to say whether something is good/healthy/above-range)");
  lines.push("Meta (Facebook + Instagram):");
  lines.push("- CPM healthy range: R12 to R25");
  lines.push("- CPC healthy range: R0.80 to R3.00");
  lines.push("- CTR healthy range: 0.8% to 2.0%");
  lines.push("- Cost per lead: R30 to R100 typical, R30 is excellent");
  lines.push("- Cost per follow: R2 to R8");
  lines.push("- Frequency 2-3x healthy, 3-4x watch, 4x+ fatigue");
  lines.push("TikTok:");
  lines.push("- CPM healthy: R4 to R15");
  lines.push("- CPC healthy: R0.01 to R0.20");
  lines.push("- Cost per follow: R1 to R5");
  lines.push("Google Display/Search:");
  lines.push("- CPM: R8 to R30");
  lines.push("- CPC: R1 to R6");
  lines.push("Google Ads does NOT expose unique-user reach in standard reporting. For blended totals the dashboard estimates Google Display + YouTube reach at 2x frequency (reach = impressions / 2). Meta and TikTok reach figures remain true unique-user counts. When reasoning about Google reach specifically, flag the number as an estimate, when quoting Meta or TikTok reach it is exact.");

  // Shape top ads into a compact structure suitable for UI thumbnail cards.
  var topAdCards = topAds.slice(0, 3).map(function(a) {
    var results = parseFloat(a.results || 0);
    var spend = parseFloat(a.spend || 0);
    return {
      adName: a.adName || "Unnamed ad",
      platform: a.platform || "",
      format: a.format || "STATIC",
      thumbnail: a.thumbnail || "",
      previewUrl: a.previewUrl || "",
      campaignName: a.campaignName || "",
      spend: spend,
      impressions: parseFloat(a.impressions || 0),
      clicks: parseFloat(a.clicks || 0),
      ctr: parseFloat(a.ctr || 0),
      results: results,
      resultType: a.resultType || "results",
      costPerResult: results > 0 ? spend / results : 0
    };
  });

  return { text: lines.join("\n"), topAds: topAdCards };
}
