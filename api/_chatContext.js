// Build the rich campaign-data context string the AI analyst reasons over.
// Anti-hallucination principle: pack in actual numbers (not vague descriptions) plus
// industry benchmarks, so every claim the AI makes can be grounded in this block.

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
  // Outcome counts are scoped by the campaign's own objective so a traffic
  // campaign with stray "conversion" events is not counted as leads, a
  // lead-gen campaign with incidental profile visits is not counted as
  // landing-page clicks, and so on. Mirrors the email-share + dashboard
  // rule so every surface speaks the same numbers.
  var s = {
    impressions: 0, reach: 0, spend: 0, clicks: 0,
    leads: 0, appStoreClicks: 0, landingPageClicks: 0,
    follows: 0, pageLikes: 0,
    leadsSpend: 0, appInstallSpend: 0, landingPageSpend: 0, followersSpend: 0
  };
  arr.forEach(function(c) {
    s.impressions += parseFloat(c.impressions || 0);
    s.reach += parseFloat(c.reach || 0);
    s.spend += parseFloat(c.spend || 0);
    s.clicks += parseFloat(c.clicks || 0);
    var obj = c.objective || "landingpage";
    if (obj === "leads") {
      s.leads += parseFloat(c.leads || 0);
      s.leadsSpend += parseFloat(c.spend || 0);
    } else if (obj === "appinstall") {
      s.appStoreClicks += parseFloat(c.clicks || 0);
      s.appInstallSpend += parseFloat(c.spend || 0);
    } else if (obj === "landingpage") {
      s.landingPageClicks += parseFloat(c.clicks || 0);
      s.landingPageSpend += parseFloat(c.spend || 0);
    } else if (obj === "followers") {
      s.follows += parseFloat(c.follows || 0);
      s.pageLikes += parseFloat(c.pageLikes || 0);
      s.followersSpend += parseFloat(c.spend || 0);
    }
  });
  s.cpm = s.impressions > 0 ? (s.spend / s.impressions * 1000) : 0;
  s.cpc = s.clicks > 0 ? (s.spend / s.clicks) : 0;
  s.ctr = s.impressions > 0 ? (s.clicks / s.impressions * 100) : 0;
  s.frequency = s.reach > 0 ? (s.impressions / s.reach) : 0;
  s.costPerLead = s.leads > 0 ? (s.leadsSpend / s.leads) : 0;
  s.costPerFollower = (s.follows + s.pageLikes) > 0 ? (s.followersSpend / (s.follows + s.pageLikes)) : 0;
  s.costPerAppStoreClick = s.appStoreClicks > 0 ? (s.appInstallSpend / s.appStoreClicks) : 0;
  s.costPerLandingClick = s.landingPageClicks > 0 ? (s.landingPageSpend / s.landingPageClicks) : 0;
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

// Pulls campaigns + top ads + demographics, filters to the principal's
// allowlist, and returns { text, topAds, allAds } where text is the
// authoritative data block for the AI.
export async function buildChatContext(req, from, to, principal) {
  var fetches = await Promise.all([
    internalFetch(req, "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to)),
    internalFetch(req, "/api/ads?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to)),
    internalFetch(req, "/api/demographics?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to))
  ]);
  var campData = fetches[0];
  var adsData = fetches[1];
  var demoData = fetches[2];
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

  // Top 5 ads PER PLATFORM (FB / IG / TikTok / Google families) plus the
  // global top 8. Previously only exposing global top 8 meant a platform-
  // specific question ("how did ads on IG perform") couldn't reach a
  // lower-ranked platform ad that never cracked the global list. Group
  // and keep top 5 each, dedup against the global list, render all.
  var byPlatAds = {};
  filteredAds.forEach(function(a) {
    var p = a.platform || "Other";
    if (!byPlatAds[p]) byPlatAds[p] = [];
    byPlatAds[p].push(a);
  });
  var topAds = filteredAds.slice().sort(function(a, b) {
    var ar = parseFloat(a.results || 0), br = parseFloat(b.results || 0);
    if (br !== ar) return br - ar;
    return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
  }).slice(0, 8);
  var platformTopAds = [];
  Object.keys(byPlatAds).forEach(function(p) {
    var sorted = byPlatAds[p].slice().sort(function(a, b) {
      var ar = parseFloat(a.results || 0), br = parseFloat(b.results || 0);
      if (br !== ar) return br - ar;
      return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
    }).slice(0, 5);
    platformTopAds.push({ platform: p, ads: sorted });
  });
  platformTopAds.sort(function(a, b) {
    var as = a.ads.reduce(function(s, x) { return s + parseFloat(x.spend || 0); }, 0);
    var bs = b.ads.reduce(function(s, x) { return s + parseFloat(x.spend || 0); }, 0);
    return bs - as;
  });

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
  // Outcome totals and cost-per-result are scoped to the matching
  // objective's spend. Do not use blended total spend as the denominator
  // when computing CPL, Cost Per Follower, etc.
  lines.push("- Leads generated (from Lead Generation campaigns only): " + fmtNum(grand.leads) + (grand.costPerLead > 0 ? " at " + fmtR(grand.costPerLead) + " CPL (on " + fmtR(grand.leadsSpend) + " lead-gen spend)" : ""));
  lines.push("- New Followers + Page Likes (from Followers & Likes campaigns only): " + fmtNum(grand.follows + grand.pageLikes) + (grand.costPerFollower > 0 ? " at " + fmtR(grand.costPerFollower) + " CPF (on " + fmtR(grand.followersSpend) + " follower-campaign spend)" : ""));
  lines.push("- Clicks to App Store (from Clicks to App Store campaigns only): " + fmtNum(grand.appStoreClicks) + (grand.costPerAppStoreClick > 0 ? " at " + fmtR(grand.costPerAppStoreClick) + " per click (on " + fmtR(grand.appInstallSpend) + " app-store spend)" : ""));
  lines.push("- Clicks to Landing Page (from Landing Page Clicks / Traffic campaigns only): " + fmtNum(grand.landingPageClicks) + (grand.costPerLandingClick > 0 ? " at " + fmtR(grand.costPerLandingClick) + " per click (on " + fmtR(grand.landingPageSpend) + " traffic spend)" : ""));
  lines.push("");

  lines.push("## Per-platform breakdown (sorted by spend)");
  platforms.forEach(function(p) {
    var a = p.agg;
    lines.push("### " + p.platform + " (" + p.count + " campaign" + (p.count === 1 ? "" : "s") + ")");
    lines.push("- Spend: " + fmtR(a.spend) + " (" + (grand.spend > 0 ? (a.spend / grand.spend * 100).toFixed(1) : "0") + "% of total)");
    lines.push("- Ads served: " + fmtNum(a.impressions) + " | Reach: " + fmtNum(a.reach));
    lines.push("- Clicks: " + fmtNum(a.clicks) + " | CTR: " + fmtPct(a.ctr) + " | CPC: " + fmtR(a.cpc));
    lines.push("- CPM: " + fmtR(a.cpm) + " | Frequency: " + a.frequency.toFixed(2) + "x");
    if (a.leads > 0) lines.push("- Leads (lead-gen campaigns only): " + fmtNum(a.leads) + " at " + fmtR(a.costPerLead) + " per lead");
    if (a.follows > 0 || a.pageLikes > 0) lines.push("- Follows/likes (follower campaigns only): " + fmtNum(a.follows + a.pageLikes) + (a.costPerFollower > 0 ? " at " + fmtR(a.costPerFollower) + " per follow" : ""));
    if (a.appStoreClicks > 0) lines.push("- Clicks to App Store (app-install campaigns only): " + fmtNum(a.appStoreClicks) + " at " + fmtR(a.costPerAppStoreClick) + " per click");
    if (a.landingPageClicks > 0) lines.push("- Clicks to Landing Page (traffic campaigns only): " + fmtNum(a.landingPageClicks) + " at " + fmtR(a.costPerLandingClick) + " per click");
  });
  lines.push("");

  // Budget block — derived per-campaign budgets sourced from Meta /
  // TikTok / Google campaign-level settings. De-dup by rawCampaignId
  // because Meta campaigns appear on both FB and IG rows with the same
  // campaign-level budget on each.
  var seenBudgetIds = {};
  var budgetLines = [];
  var totalBudget = 0;
  var totalBudgetKnown = 0;
  var ongoingDaily = 0;
  filteredCamps.forEach(function(c) {
    var raw = String(c.rawCampaignId || c.campaignId || "");
    if (seenBudgetIds[raw]) return;
    seenBudgetIds[raw] = true;
    var mode = c.budgetMode || "unset";
    var amt = parseFloat(c.budgetAmount || 0);
    var daily = parseFloat(c.budgetDaily || 0);
    var spent = parseFloat(c.spend || 0);
    if (mode === "unset" || mode === "infinite") return;
    if (amt > 0) { totalBudget += amt; totalBudgetKnown += amt; }
    if (mode === "daily_ongoing" && daily > 0) ongoingDaily += daily;
    var line = "- " + (c.campaignName || "Unnamed") + " (" + c.platform + "): ";
    if (amt > 0) {
      var usedPct = amt > 0 ? (spent / amt * 100).toFixed(1) : "0.0";
      line += fmtR(amt) + " budget, " + fmtR(spent) + " spent (" + usedPct + "%). Mode: " + mode;
      if (mode === "daily_inferred") line += " (inferred from daily cap × flight days)";
    } else if (mode === "daily_ongoing") {
      line += fmtR(daily) + "/day ongoing (no end date set, total cap unknown)";
    }
    budgetLines.push(line);
  });
  if (budgetLines.length > 0) {
    lines.push("## Budget by campaign (campaign-level caps from Meta / TikTok / Google)");
    if (totalBudgetKnown > 0) {
      var totalSpent = parseFloat(grand.spend || 0);
      var totalUsedPct = totalBudgetKnown > 0 ? (totalSpent / totalBudgetKnown * 100).toFixed(1) : "0.0";
      lines.push("- Known-total budget across campaigns with a set cap: " + fmtR(totalBudgetKnown) + ", spent " + fmtR(totalSpent) + " (" + totalUsedPct + "% used, " + fmtR(Math.max(0, totalBudgetKnown - totalSpent)) + " remaining).");
    }
    if (ongoingDaily > 0) {
      lines.push("- Ongoing daily-capped campaigns (no end date) run at " + fmtR(ongoingDaily) + "/day combined. Treat remaining budget as open-ended.");
    }
    lines.push("- Per-campaign breakdown:");
    budgetLines.forEach(function(l) { lines.push(l); });
    lines.push("- budgetMode meanings: \"lifetime\" = total cap set on the campaign. \"daily_inferred\" = daily cap × flight duration with a known end date. \"daily_ongoing\" = daily cap but no end date, no lifetime total can be derived. \"infinite\" / \"unset\" = no budget cap visible.");
    lines.push("");
  }

  lines.push("## Individual campaigns (name, platform, objective, spend, CTR, outcomes)");
  var objectiveLabel = function(o) {
    if (o === "leads") return "Lead Generation";
    if (o === "appinstall") return "Clicks to App Store";
    if (o === "followers") return "Followers & Likes";
    if (o === "landingpage") return "Landing Page Clicks";
    return "Landing Page Clicks";
  };
  filteredCamps.slice().sort(function(a, b) { return parseFloat(b.spend || 0) - parseFloat(a.spend || 0); }).forEach(function(c) {
    var parts = [];
    parts.push('"' + (c.campaignName || "Unnamed") + '"');
    parts.push(c.platform);
    parts.push("objective: " + objectiveLabel(c.objective));
    parts.push("spend " + fmtR(c.spend));
    parts.push("impressions " + fmtNum(c.impressions));
    parts.push("CTR " + fmtPct(c.ctr));
    parts.push("CPC " + fmtR(c.cpc));
    // Only surface outcome numbers that match the campaign's objective. A
    // traffic / landing-page campaign MUST NOT report leads, even if Meta
    // or Google attributed a stray "lead"-like action to it. This keeps
    // the bot from answering "what was my CPL" with numbers that came
    // from a campaign whose actual goal was profile visits or LP clicks.
    if (c.objective === "leads" && parseFloat(c.leads || 0) > 0) parts.push(parseFloat(c.leads) + " leads");
    if (c.objective === "followers" && parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0) > 0) parts.push((parseFloat(c.follows || 0) + parseFloat(c.pageLikes || 0)) + " follows/likes");
    if (c.objective === "appinstall" && parseFloat(c.clicks || 0) > 0) parts.push(parseFloat(c.clicks) + " clicks to app store");
    if (c.objective === "landingpage" && parseFloat(c.clicks || 0) > 0) parts.push(parseFloat(c.clicks) + " clicks to landing page");
    lines.push("- " + parts.join(", "));
  });
  lines.push("");

  var renderAdLine = function(a, rank) {
    var results = parseFloat(a.results || 0);
    var rt = a.resultType || "results";
    var spend = parseFloat(a.spend || 0);
    var line = "#" + rank + ' "' + (a.adName || "Unnamed") + '" (' + a.platform + ", " + (a.format || "STATIC") + "): ";
    line += fmtR(spend) + " spend, " + fmtNum(a.impressions) + " impressions, " + fmtPct(a.ctr) + " CTR";
    if (results > 0) line += ", " + results + " " + rt + " at " + fmtR(spend / results) + " each";
    if (a.campaignName) line += ". From campaign: " + a.campaignName;
    return line;
  };

  if (topAds.length > 0) {
    lines.push("## Top creative ads across all platforms (ranked by results, then spend)");
    topAds.forEach(function(a, i) { lines.push(renderAdLine(a, i + 1)); });
    lines.push("");
  }

  // Per-platform top 5 so the bot can answer platform-specific questions
  // (e.g. "how did Ayanda ads perform on Instagram", "best TikTok ad") even
  // when the ads don't rank in the global top 8.
  platformTopAds.forEach(function(pb) {
    if (pb.ads.length === 0) return;
    lines.push("## Top " + Math.min(5, pb.ads.length) + " ads on " + pb.platform + " (ranked by results, then spend)");
    pb.ads.forEach(function(a, i) { lines.push(renderAdLine(a, i + 1)); });
    lines.push("");
  });

  // Compact catalogue of EVERY ad in the selection so the bot can answer
  // name-based questions ("how did Ayanda perform on IG", "what was the
  // CPC on Kabelo on TikTok") without needing those ads to crack the top
  // 5 of any platform. Minimal fields keep the token budget reasonable
  // even on wide selections.
  if (filteredAds.length > 0) {
    // Soft cap to keep the prompt sensible, sorted by spend so the most
    // relevant ads are always present, bot can still request names from
    // elsewhere if missing.
    var compactList = filteredAds.slice().sort(function(a, b) {
      return parseFloat(b.spend || 0) - parseFloat(a.spend || 0);
    }).slice(0, 100);
    lines.push("## All ads in scope (compact, sorted by spend)");
    lines.push("Use this to find any specific ad by name. Each line: \"ad name\" (platform, format, objective), metrics.");
    compactList.forEach(function(a) {
      var spend = parseFloat(a.spend || 0);
      var imps = parseFloat(a.impressions || 0);
      var clks = parseFloat(a.clicks || 0);
      var ctr = parseFloat(a.ctr || 0);
      var results = parseFloat(a.results || 0);
      var rt = a.resultType || "results";
      var obj = a.objective || "landingpage";
      var parts = ['"' + (a.adName || "Unnamed") + '"'];
      parts.push(a.platform || "Other");
      parts.push(a.format || "STATIC");
      parts.push("obj: " + obj);
      parts.push(fmtR(spend) + " spend");
      parts.push(fmtNum(imps) + " imp");
      parts.push(fmtNum(clks) + " clicks");
      parts.push(fmtPct(ctr) + " CTR");
      if (results > 0) parts.push(results + " " + rt);
      if (a.campaignName) parts.push("from: " + a.campaignName);
      lines.push("- " + parts.join(" | "));
    });
    if (filteredAds.length > compactList.length) {
      lines.push("(+ " + (filteredAds.length - compactList.length) + " more ads with lower spend, omitted from this listing)");
    }
    lines.push("");
  }

  // Demographics — filter to the principal's allowlist and render each
  // dimension (province, age, gender, device) with impressions, clicks and
  // CTR per bucket. Lets the bot answer questions like "are people in Free
  // State engaging?", "which age bracket clicks best?", "is Mobile or
  // Desktop driving the CTR?" without hallucinating.
  if (demoData && (demoData.ageGender || demoData.region || demoData.device)) {
    var rawIdSet = {};
    (principal && principal.role === "client" ? (principal.allowedCampaignIds || []) : []).forEach(function(id) {
      var s = String(id);
      rawIdSet[s] = true;
      rawIdSet[s.replace(/_facebook$/, "").replace(/_instagram$/, "")] = true;
    });
    var inDemo = function(r) {
      if (principal && principal.role === "client") return rawIdSet[String(r.campaignId || "")] === true;
      return true;
    };
    var regRows = (demoData.region || []).filter(inDemo);
    var agRowsRaw = (demoData.ageGender || []).filter(inDemo);
    var devRows = (demoData.device || []).filter(inDemo);

    // Google returns age-only and gender-only rows as separate entries in
    // ageGender, which double-counts Google impressions when summed flat.
    // Keep only age-known rows for the age aggregate, gender-known rows
    // for the gender aggregate — same strategy the dashboard uses.
    var ageOrder = ["18-24","25-34","35-44","45-54","55-64","65+"];
    var genderOrder = ["female","male"];

    // Province aggregation
    var provBuckets = {};
    regRows.forEach(function(r) {
      var p = String(r.region || "").trim();
      if (!p || p.toLowerCase() === "unknown") return;
      if (!provBuckets[p]) provBuckets[p] = { impressions: 0, clicks: 0 };
      provBuckets[p].impressions += parseFloat(r.impressions || 0);
      provBuckets[p].clicks += parseFloat(r.clicks || 0);
    });
    var provList = Object.keys(provBuckets).map(function(p) {
      var b = provBuckets[p];
      return { name: p, impressions: b.impressions, clicks: b.clicks, ctr: b.impressions > 0 ? (b.clicks / b.impressions * 100) : 0 };
    }).sort(function(a, b) { return b.impressions - a.impressions; });

    var provTotalImp = provList.reduce(function(s, x) { return s + x.impressions; }, 0);
    var provTotalClk = provList.reduce(function(s, x) { return s + x.clicks; }, 0);
    if (provList.length > 0) {
      lines.push("## Regional engagement by SA province (tagged rows only, Meta + TikTok + Google via geo attribution)");
      lines.push("Use this to answer questions about any specific province's engagement. Percentages below are the province's share of province-tagged traffic (not total). The subset outside of this list is traffic the ad platforms did not attribute to a specific SA province, common for upper-funnel targeting.");
      lines.push("Tagged totals: " + fmtNum(provTotalImp) + " impressions, " + fmtNum(provTotalClk) + " clicks, " + (provTotalImp > 0 ? fmtPct(provTotalClk / provTotalImp * 100) : "0%") + " blended CTR.");
      provList.forEach(function(p) {
        var share = provTotalImp > 0 ? (p.impressions / provTotalImp * 100).toFixed(1) : "0.0";
        lines.push("- " + p.name + ": " + fmtNum(p.impressions) + " impressions, " + fmtNum(p.clicks) + " clicks, " + fmtPct(p.ctr) + " CTR, " + share + "% of province-tagged impressions");
      });
      lines.push("");
    }

    // Age aggregation
    var ageBuckets = {};
    ageOrder.forEach(function(a) { ageBuckets[a] = { impressions: 0, clicks: 0 }; });
    agRowsRaw.forEach(function(r) {
      var a = String(r.age || "").trim();
      if (!ageBuckets[a]) return;
      ageBuckets[a].impressions += parseFloat(r.impressions || 0);
      ageBuckets[a].clicks += parseFloat(r.clicks || 0);
    });
    var ageList = ageOrder.map(function(a) {
      var b = ageBuckets[a];
      return { name: a, impressions: b.impressions, clicks: b.clicks, ctr: b.impressions > 0 ? (b.clicks / b.impressions * 100) : 0 };
    }).filter(function(x) { return x.impressions > 0; }).sort(function(a, b) { return b.impressions - a.impressions; });
    var ageTotalImp = ageList.reduce(function(s, x) { return s + x.impressions; }, 0);
    if (ageList.length > 0) {
      lines.push("## Age engagement (tagged rows only)");
      lines.push("Use this to answer questions about age brackets. Share % is share of age-tagged impressions. Platforms return a significant share of impressions without an age tag (iOS 14.5+ signal loss, logged-out users, teen accounts) and those sit outside this list.");
      ageList.forEach(function(a) {
        var share = ageTotalImp > 0 ? (a.impressions / ageTotalImp * 100).toFixed(1) : "0.0";
        lines.push("- " + a.name + ": " + fmtNum(a.impressions) + " impressions, " + fmtNum(a.clicks) + " clicks, " + fmtPct(a.ctr) + " CTR, " + share + "% of age-tagged impressions");
      });
      lines.push("");
    }

    // Gender aggregation
    var genBuckets = { female: { impressions: 0, clicks: 0 }, male: { impressions: 0, clicks: 0 } };
    agRowsRaw.forEach(function(r) {
      var g = String(r.gender || "").toLowerCase();
      if (!genBuckets[g]) return;
      genBuckets[g].impressions += parseFloat(r.impressions || 0);
      genBuckets[g].clicks += parseFloat(r.clicks || 0);
    });
    var genderTotalImp = genBuckets.female.impressions + genBuckets.male.impressions;
    if (genderTotalImp > 0) {
      lines.push("## Gender engagement (tagged rows only)");
      lines.push("Share % is share of gender-tagged impressions only. A meaningful fraction of impressions has no gender tag and sits outside this list.");
      ["female", "male"].forEach(function(g) {
        var b = genBuckets[g];
        if (b.impressions === 0) return;
        var ctr = b.impressions > 0 ? (b.clicks / b.impressions * 100) : 0;
        var share = genderTotalImp > 0 ? (b.impressions / genderTotalImp * 100).toFixed(1) : "0.0";
        var label = g.charAt(0).toUpperCase() + g.slice(1);
        lines.push("- " + label + ": " + fmtNum(b.impressions) + " impressions, " + fmtNum(b.clicks) + " clicks, " + fmtPct(ctr) + " CTR, " + share + "% of gender-tagged impressions");
      });
      lines.push("");
    }

    // Device aggregation — normalize platform-specific device names.
    var normDevice = function(d) {
      var s = String(d || "").toLowerCase();
      if (s.indexOf("mobile") >= 0 || s.indexOf("android") >= 0 || s.indexOf("ios") >= 0 || s === "iphone") return "Mobile";
      if (s === "ipad" || s.indexOf("tablet") >= 0) return "Tablet";
      if (s.indexOf("desktop") >= 0 || s === "web") return "Desktop";
      if (s.indexOf("ctv") >= 0 || s.indexOf("connected_tv") >= 0) return "Connected TV";
      return null;
    };
    var devBuckets = {};
    devRows.forEach(function(r) {
      var d = normDevice(r.device);
      if (!d) return;
      if (!devBuckets[d]) devBuckets[d] = { impressions: 0, clicks: 0 };
      devBuckets[d].impressions += parseFloat(r.impressions || 0);
      devBuckets[d].clicks += parseFloat(r.clicks || 0);
    });
    var devList = Object.keys(devBuckets).map(function(d) {
      var b = devBuckets[d];
      return { name: d, impressions: b.impressions, clicks: b.clicks, ctr: b.impressions > 0 ? (b.clicks / b.impressions * 100) : 0 };
    }).sort(function(a, b) { return b.impressions - a.impressions; });
    var devTotalImp = devList.reduce(function(s, x) { return s + x.impressions; }, 0);
    if (devList.length > 0) {
      lines.push("## Device engagement (tagged rows only)");
      lines.push("Share % is share of device-tagged impressions only.");
      devList.forEach(function(d) {
        var share = devTotalImp > 0 ? (d.impressions / devTotalImp * 100).toFixed(1) : "0.0";
        lines.push("- " + d.name + ": " + fmtNum(d.impressions) + " impressions, " + fmtNum(d.clicks) + " clicks, " + fmtPct(d.ctr) + " CTR, " + share + "% of device-tagged impressions");
      });
      lines.push("");
    }
  }

  lines.push("## Industry paid media benchmarks (for comparison only, use these to say whether something is good/healthy/above-range)");
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

  // Shape ads into a compact card structure for UI thumbnail cards.
  var toCard = function(a) {
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
  };
  var topAdCards = topAds.slice(0, 3).map(toCard);
  // Full card list so chat.js can filter by user-mentioned names / platforms
  // when attaching thumbnails ("show me Ayanda ads on Instagram").
  var allAdCards = filteredAds.map(toCard);

  return { text: lines.join("\n"), topAds: topAdCards, allAds: allAdCards };
}
