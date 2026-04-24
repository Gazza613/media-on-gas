import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isCampaignAllowed } from "./_auth.js";
import { validateDates } from "./_validate.js";

// Google Search intent signals for the Targeting tab persona card. Unlike
// Meta and TikTok, Google Search does not surface strong demographic data by
// default, but it DOES expose rich intent signals that the other platforms
// don't have, so the persona for Google is built around what the clicker was
// trying to do rather than who they are.
//
// Signals pulled:
//   - Search terms report -> clustered into intent themes (brand, comparison,
//     transactional, problem-solving, informational)
//   - Age range + gender observation (when observation audiences are attached)
//   - Match type distribution -> readiness signal (high-intent vs research)
//   - Hour of day click pattern -> when they search one-liner
//
// All queries run against the one Google Ads customer id we already use
// elsewhere. The endpoint returns a single object shaped for the client card
// and never throws, it returns empty arrays / nulls for any segment that
// Google declines to populate.

var intentCache = {};
var INTENT_TTL_MS = 10 * 60 * 1000;

function bucketSearchTerm(term) {
  var t = String(term || "").toLowerCase();
  if (!t) return "other";
  if (/\b(buy|apply|price|sign ?up|open|order|book|download|install|get|find a|near me)\b/.test(t)) return "transactional";
  if (/\b(vs|versus|best|top|compare|comparison|review|rating|alternatives?)\b/.test(t)) return "comparison";
  if (/\b(how|why|what|when|where|which|tutorial|guide|help|fix|meaning|difference)\b/.test(t)) return "problem";
  if (/\b(about|news|info|information|overview|history|types?|examples?)\b/.test(t)) return "informational";
  return "branded";
}

function hourPatternLabel(hourClicks) {
  if (!hourClicks || hourClicks.length === 0) return "";
  var total = hourClicks.reduce(function(s, h) { return s + h.clicks; }, 0);
  if (total === 0) return "";
  var business = 0, evening = 0, night = 0;
  hourClicks.forEach(function(h) {
    if (h.hour >= 9 && h.hour < 17) business += h.clicks;
    else if (h.hour >= 17 && h.hour < 22) evening += h.clicks;
    else night += h.clicks;
  });
  var bPct = business / total * 100;
  var ePct = evening / total * 100;
  if (bPct >= 55) return "peaks during business hours";
  if (ePct >= 40) return "peaks in the evening (after 5pm)";
  if (bPct >= 40 && ePct >= 30) return "spread across business hours and evenings";
  return "distributed across the day, no strong time signal";
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;
  var from = req.query.from, to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  var principal = req.authPrincipal || { role: "admin" };
  // Clients only need aggregated intent data for campaigns in their allowlist.
  // Rather than building a per-campaign GAQL filter (Google supports it but
  // it complicates the search_term_view query), we gate the whole endpoint
  // to admins for now. If a client-visible version is needed later, we filter
  // at result time using segments.campaign_id in each query.
  if (principal.role !== "admin") {
    return res.status(200).json({
      available: false,
      reason: "Google intent signals are admin-only for now. Client flows continue to use the aggregated Google row in /api/demographics."
    });
  }

  // Cache key includes role defensively, the admin gate above already
  // blocks non-admin callers but if the gate is ever relaxed in future the
  // cache won't bleed admin data to other principals via a shared slot.
  var cacheKey = "v1|" + (principal.role || "admin") + "|" + from + "|" + to;
  var cached = intentCache[cacheKey];
  if (cached && Date.now() - cached.ts < INTENT_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
  var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
  var gCustomerId = "9587382256";
  if (!gClientId || !gRefreshToken || !gDevToken) {
    return res.status(200).json({ available: false, reason: "Google Ads credentials not configured" });
  }

  try {
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.status(200).json({ available: false, reason: "Google Ads token refresh failed" });
    }
    var authHeader = "Bearer " + tokenData.access_token;

    var runQuery = async function(query) {
      try {
        var r = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": authHeader,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ query: query })
        });
        if (!r.ok) {
          // Log the first 300 chars of the response body so we see WHY the
          // query failed (usually a GAQL syntax error, permission scope
          // problem, or missing resource). Silent returns have been hiding
          // real errors that look identical to "account has no Search data".
          var body = "";
          try { body = (await r.text() || "").slice(0, 300); } catch (_) {}
          console.warn("[google-intent] query failed", { status: r.status, bodyPreview: body, queryPreview: query.slice(0, 120) });
          return [];
        }
        var d = await r.json();
        return d.results || [];
      } catch (err) {
        console.warn("[google-intent] query threw", { err: String(err && err.message || err), queryPreview: query.slice(0, 120) });
        return [];
      }
    };

    // 1. Search terms -> intent theme buckets
    var stRows = await runQuery(
      "SELECT search_term_view.search_term, metrics.clicks, metrics.impressions " +
      "FROM search_term_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' " +
      "AND metrics.clicks > 0 ORDER BY metrics.clicks DESC LIMIT 500"
    );
    var themeSums = { branded: 0, comparison: 0, problem: 0, transactional: 0, informational: 0, other: 0 };
    var totalSearchClicks = 0;
    var topTerms = [];
    stRows.forEach(function(row) {
      var term = (row.searchTermView && row.searchTermView.searchTerm) || "";
      var clicks = parseInt((row.metrics && row.metrics.clicks) || 0, 10);
      if (clicks <= 0) return;
      var bucket = bucketSearchTerm(term);
      themeSums[bucket] = (themeSums[bucket] || 0) + clicks;
      totalSearchClicks += clicks;
      if (topTerms.length < 5) topTerms.push({ term: term, clicks: clicks, bucket: bucket });
    });
    var intentThemes = Object.keys(themeSums).map(function(k) {
      return { theme: k, clicks: themeSums[k], share: totalSearchClicks > 0 ? (themeSums[k] / totalSearchClicks * 100) : 0 };
    }).filter(function(t) { return t.clicks > 0; }).sort(function(a, b) { return b.clicks - a.clicks; });

    // 2. Age observation
    var ageRows = await runQuery(
      "SELECT ad_group_criterion.age_range.type, metrics.clicks " +
      "FROM age_range_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"
    );
    var ageAgg = {};
    ageRows.forEach(function(row) {
      var t = row.adGroupCriterion && row.adGroupCriterion.ageRange && row.adGroupCriterion.ageRange.type;
      var clicks = parseInt((row.metrics && row.metrics.clicks) || 0, 10);
      if (!t || !clicks) return;
      ageAgg[t] = (ageAgg[t] || 0) + clicks;
    });
    var ageMap = {
      AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44",
      AGE_RANGE_45_54: "45-54", AGE_RANGE_55_64: "55-64", AGE_RANGE_65_UP: "65+"
    };
    var ageData = Object.keys(ageAgg).filter(function(k) { return ageMap[k]; }).map(function(k) {
      return { age: ageMap[k], clicks: ageAgg[k] };
    }).sort(function(a, b) { return b.clicks - a.clicks; });
    var ageTotal = ageData.reduce(function(s, a) { return s + a.clicks; }, 0);
    ageData.forEach(function(a) { a.share = ageTotal > 0 ? (a.clicks / ageTotal * 100) : 0; });

    // 3. Gender observation
    var genRows = await runQuery(
      "SELECT ad_group_criterion.gender.type, metrics.clicks " +
      "FROM gender_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"
    );
    var genAgg = { female: 0, male: 0 };
    genRows.forEach(function(row) {
      var t = row.adGroupCriterion && row.adGroupCriterion.gender && row.adGroupCriterion.gender.type;
      var clicks = parseInt((row.metrics && row.metrics.clicks) || 0, 10);
      if (t === "FEMALE") genAgg.female += clicks;
      else if (t === "MALE") genAgg.male += clicks;
    });
    var genSum = genAgg.female + genAgg.male;
    var genderSplit = {
      female: genSum > 0 ? (genAgg.female / genSum * 100) : 0,
      male: genSum > 0 ? (genAgg.male / genSum * 100) : 0
    };

    // 4. Match type distribution -> funnel readiness
    var mtRows = await runQuery(
      "SELECT ad_group_criterion.keyword.match_type, metrics.clicks " +
      "FROM keyword_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"
    );
    var mtAgg = { EXACT: 0, PHRASE: 0, BROAD: 0 };
    mtRows.forEach(function(row) {
      var t = row.adGroupCriterion && row.adGroupCriterion.keyword && row.adGroupCriterion.keyword.matchType;
      var clicks = parseInt((row.metrics && row.metrics.clicks) || 0, 10);
      if (mtAgg[t] !== undefined) mtAgg[t] += clicks;
    });
    var mtTotal = mtAgg.EXACT + mtAgg.PHRASE + mtAgg.BROAD;
    var readinessLabel = "";
    if (mtTotal > 0) {
      var exactShare = mtAgg.EXACT / mtTotal * 100;
      var broadShare = mtAgg.BROAD / mtTotal * 100;
      if (exactShare >= 50) readinessLabel = "High-intent, exact-match queries dominate";
      else if (broadShare >= 60) readinessLabel = "Research-stage, broad-match queries dominate";
      else readinessLabel = "Mixed intent, phrase and broad matching";
    }
    var matchTypeMix = {
      exact: mtTotal > 0 ? (mtAgg.EXACT / mtTotal * 100) : 0,
      phrase: mtTotal > 0 ? (mtAgg.PHRASE / mtTotal * 100) : 0,
      broad: mtTotal > 0 ? (mtAgg.BROAD / mtTotal * 100) : 0,
      readinessLabel: readinessLabel
    };

    // 5. Hour of day pattern
    var hrRows = await runQuery(
      "SELECT segments.hour, metrics.clicks " +
      "FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"
    );
    var hourAgg = {};
    hrRows.forEach(function(row) {
      var h = row.segments && row.segments.hour;
      var clicks = parseInt((row.metrics && row.metrics.clicks) || 0, 10);
      if (h === undefined || h === null) return;
      hourAgg[h] = (hourAgg[h] || 0) + clicks;
    });
    var hourClicks = Object.keys(hourAgg).map(function(k) { return { hour: parseInt(k, 10), clicks: hourAgg[k] }; });
    var whenLabel = hourPatternLabel(hourClicks);

    var payload = {
      available: true,
      from: from, to: to,
      totalSearchClicks: totalSearchClicks,
      intentThemes: intentThemes,
      topTerms: topTerms,
      age: ageData,
      gender: genderSplit,
      matchType: matchTypeMix,
      whenLabel: whenLabel,
      observationDemographicsAvailable: ageTotal > 0 || genSum > 0
    };

    // Diagnostic, tell us in the Vercel logs exactly what each Google Ads
    // query returned for this date range so we can distinguish between
    // "no Search campaigns active" and "account lacks observation audiences"
    // and "the account simply has nothing in this period".
    console.log("[google-intent] " + from + " to " + to + " raw counts", {
      searchTermRows: stRows.length,
      totalSearchClicks: totalSearchClicks,
      ageRows: ageRows.length,
      ageAggBuckets: Object.keys(ageAgg).length,
      genderRows: genRows.length,
      genderSum: genSum,
      matchTypeRows: mtRows.length,
      matchTypeTotal: mtTotal,
      hourRows: hrRows.length,
      intentThemeBreakdown: intentThemes.map(function(t) { return t.theme + ":" + t.clicks; }).join(", ")
    });

    intentCache[cacheKey] = { data: payload, ts: Date.now() };
    res.status(200).json(payload);
  } catch (err) {
    console.error("google-intent error", err && err.message);
    res.status(200).json({ available: false, reason: "Google intent query failed, " + (err && err.message || "unknown") });
  }
}
