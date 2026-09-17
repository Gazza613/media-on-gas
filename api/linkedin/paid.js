// LinkedIn PAID performance for MTN MoMo. Reads Sponsored Content
// campaigns + ads from the Advertising API (App 1 credentials) and
// returns a shape the dashboard's <LinkedInSection> component
// consumes directly.
//
// Endpoints touched (LinkedIn REST v2, versioned):
//   GET /rest/adAccounts/{id}/adCampaigns    - list active campaigns
//   GET /rest/adAccounts/{id}/creatives      - list creatives (ads)
//   GET /rest/adAnalytics                    - impressions/clicks/spend/etc
//
// Query params:
//   from=YYYY-MM-DD, to=YYYY-MM-DD  - optional, default last 30 days
//
// Response shape (used by dashboard):
//   {
//     source: "live" | "mock",
//     dateRange: { from, to },
//     kpis: { impressions, clicks, ctr, spend, cpc, cpm, conversions, costPerConversion },
//     campaigns: [ { id, name, status, ...kpis } ],
//     ads: [ { id, name, campaignId, previewUrl, thumbUrl, ...kpis } ],
//     demographics: { seniority: [], industry: [], jobFunction: [], geography: [] }
//   }
//
// When LinkedIn credentials are missing OR the Advertising API request
// is still pending approval, this endpoint returns a signed mock payload
// so the dashboard's layout can be iterated before real data lands.
// The `source` field lets the UI show a "SAMPLE DATA" pill until real
// data flows.

import { checkAuth } from "../_auth.js";
import { rateLimit } from "../_rateLimit.js";
import { getAccessToken, getAdAccountId, fetchLinkedInJson } from "./_auth.js";

export const config = { maxDuration: 60 };

// ---- Client scope guard ---------------------------------------------------
//
// Only MTN MoMo (and admins) may read LinkedIn data. Mirrors the
// project_client_scope_invariant memory: client-facing endpoints
// filter by principal.allowedCampaignIds. For this dashboard-wide
// aggregate we check the principal's client slug allowlist instead
// of a campaign id.
function principalMayReadLinkedIn(principal) {
  if (!principal) return false;
  if (principal.role === "superadmin" || principal.role === "admin") return true;
  // Client principals: allow only if their allowed-client list contains a
  // MTN MoMo slug. mtnmomo / momo / mtn-momo cover the observed variants.
  var allowed = (principal.allowedClientSlugs || []).map(function (s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  });
  return allowed.some(function (s) { return s.indexOf("mtnmomo") >= 0 || s.indexOf("momo") >= 0; });
}

// ---- Date helpers ---------------------------------------------------------

function isoDateOnly(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

function defaultRange() {
  var to = new Date();
  var from = new Date(to.getTime() - 30 * 86400000);
  var iso = function (d) { return d.toISOString().slice(0, 10); };
  return { from: iso(from), to: iso(to) };
}

// LinkedIn's dateRange input for /rest/adAnalytics wants year/month/day
// split components. Both start and end are inclusive.
function toLinkedInDateRange(fromIso, toIso) {
  var mk = function (iso) {
    var parts = iso.split("-");
    return "(year:" + parts[0] + ",month:" + parseInt(parts[1], 10) + ",day:" + parseInt(parts[2], 10) + ")";
  };
  return "(start:" + mk(fromIso) + ",end:" + mk(toIso) + ")";
}

// ---- Live fetch (Advertising API v2, versioned REST) ----------------------

async function fetchLive(fromIso, toIso) {
  var adAccountId = getAdAccountId();
  if (!adAccountId) throw new Error("linkedin_env_missing:LINKEDIN_AD_ACCOUNT_ID");

  var accountUrn = /^urn:li:sponsoredAccount:/.test(adAccountId)
    ? adAccountId
    : "urn:li:sponsoredAccount:" + adAccountId;

  var dateRangeParam = toLinkedInDateRange(fromIso, toIso);

  // Analytics is one call keyed by CAMPAIGN pivot — LinkedIn returns
  // aggregated metrics per campaign for the date range.
  var analyticsQ = "q=analytics" +
    "&pivot=CAMPAIGN" +
    "&dateRange=" + encodeURIComponent(dateRangeParam) +
    "&accounts=" + encodeURIComponent("List(" + accountUrn + ")") +
    "&timeGranularity=ALL" +
    "&fields=impressions,clicks,costInLocalCurrency,externalWebsiteConversions,pivotValues,dateRange";

  var analyticsResp = await fetchLinkedInJson("ads",
    "/rest/adAnalytics?" + analyticsQ);
  if (!analyticsResp.ok) {
    var err = new Error("linkedin_analytics_failed:" + analyticsResp.status);
    err.detail = String(analyticsResp.rawText || "").slice(0, 400);
    throw err;
  }
  var analyticsRows = (analyticsResp.data && analyticsResp.data.elements) || [];

  // Campaign metadata (name/status) — one call, filtered to the account.
  var campsResp = await fetchLinkedInJson("ads",
    "/rest/adAccounts/" + encodeURIComponent(adAccountId) + "/adCampaigns?q=search&search=(status:(values:List(ACTIVE,PAUSED,COMPLETED)))");
  var campElements = (campsResp.data && campsResp.data.elements) || [];
  var campById = {};
  campElements.forEach(function (c) {
    var urn = c.id ? "urn:li:sponsoredCampaign:" + c.id : (c.urn || "");
    campById[urn] = { name: c.name || "Untitled campaign", status: c.status || "" };
  });

  // Blend per-campaign metadata with analytics rows.
  var campaigns = analyticsRows.map(function (row) {
    var pivot = (row.pivotValues && row.pivotValues[0]) || "";
    var meta = campById[pivot] || { name: "Campaign " + pivot.slice(-6), status: "UNKNOWN" };
    var imps = row.impressions || 0;
    var clicks = row.clicks || 0;
    var spend = parseFloat(row.costInLocalCurrency || 0) || 0;
    var convs = row.externalWebsiteConversions || 0;
    return {
      id: pivot,
      name: meta.name,
      status: meta.status,
      impressions: imps,
      clicks: clicks,
      ctr: imps > 0 ? (clicks / imps * 100) : 0,
      spend: spend,
      cpc: clicks > 0 ? (spend / clicks) : 0,
      cpm: imps > 0 ? (spend / imps * 1000) : 0,
      conversions: convs,
      costPerConversion: convs > 0 ? (spend / convs) : 0
    };
  });

  // Aggregate to headline KPIs.
  var kpis = campaigns.reduce(function (acc, c) {
    acc.impressions += c.impressions;
    acc.clicks += c.clicks;
    acc.spend += c.spend;
    acc.conversions += c.conversions;
    return acc;
  }, { impressions: 0, clicks: 0, spend: 0, conversions: 0 });
  kpis.ctr = kpis.impressions > 0 ? (kpis.clicks / kpis.impressions * 100) : 0;
  kpis.cpc = kpis.clicks > 0 ? (kpis.spend / kpis.clicks) : 0;
  kpis.cpm = kpis.impressions > 0 ? (kpis.spend / kpis.impressions * 1000) : 0;
  kpis.costPerConversion = kpis.conversions > 0 ? (kpis.spend / kpis.conversions) : 0;

  // Ads (creatives) — separate pivot on CREATIVE. Same window.
  var creativeQ = "q=analytics" +
    "&pivot=CREATIVE" +
    "&dateRange=" + encodeURIComponent(dateRangeParam) +
    "&accounts=" + encodeURIComponent("List(" + accountUrn + ")") +
    "&timeGranularity=ALL" +
    "&fields=impressions,clicks,costInLocalCurrency,externalWebsiteConversions,pivotValues";
  var creativeResp = await fetchLinkedInJson("ads",
    "/rest/adAnalytics?" + creativeQ);
  var creativeElements = (creativeResp.data && creativeResp.data.elements) || [];

  // Resolve creative thumbnails. Each creative URN points to a Content
  // share whose media (image/video URN) has a CDN downloadUrl. Batch this
  // in parallel with a per-creative failure-tolerance: any resolution miss
  // leaves thumbUrl empty and the UI renders a color placeholder.
  var creativeUrns = creativeElements.map(function (row) {
    return (row.pivotValues && row.pivotValues[0]) || "";
  }).filter(Boolean).slice(0, 25);
  var creativeMediaByUrn = {}; // creative-urn -> { thumbUrl, name }
  await Promise.all(creativeUrns.map(async function (creativeUrn) {
    try {
      var creativeId = creativeUrn.split(":").pop();
      var cr = await fetchLinkedInJson("ads",
        "/rest/adAccounts/" + encodeURIComponent(adAccountId) + "/creatives/" + encodeURIComponent(creativeId));
      if (!cr.ok || !cr.data) return;
      var name = (cr.data.name || cr.data.reference || "Creative " + creativeId.slice(-6));
      // The image/video urn nests under content.reference or content.media
      // depending on the creative type (image, video, single-image, carousel).
      var mediaUrn = (cr.data.content && (cr.data.content.reference || (cr.data.content.media && cr.data.content.media.id))) || "";
      var thumbUrl = "";
      if (mediaUrn) {
        var isVideo = /^urn:li:video:/i.test(mediaUrn);
        var restPath = "/rest/" + (isVideo ? "videos" : "images") + "/" + encodeURIComponent(mediaUrn);
        var img = await fetchLinkedInJson("ads", restPath);
        if (img.ok && img.data) {
          thumbUrl = img.data.downloadUrl
            || img.data.aspectRatioAwarePosterUrl
            || (img.data.thumbnail && img.data.thumbnail.url)
            || "";
        }
      }
      creativeMediaByUrn[creativeUrn] = { thumbUrl: thumbUrl, name: name };
    } catch (_) { /* leave empty */ }
  }));

  // LinkedIn creative palette for placeholder blocks when thumbUrl is empty.
  var _palette = ["#0A66C2", "#FFCC00", "#34D399", "#A855F7", "#F43F5E", "#0891B2", "#F97316", "#22C55E"];
  var ads = creativeElements.map(function (row, i) {
    var pivot = (row.pivotValues && row.pivotValues[0]) || "";
    var imps = row.impressions || 0;
    var clicks = row.clicks || 0;
    var spend = parseFloat(row.costInLocalCurrency || 0) || 0;
    var meta = creativeMediaByUrn[pivot] || {};
    return {
      id: pivot,
      name: meta.name || ("Creative " + pivot.slice(-8)),
      campaignId: "",
      previewUrl: "",
      thumbUrl: meta.thumbUrl || "",
      thumbColor: _palette[i % _palette.length],
      impressions: imps,
      clicks: clicks,
      ctr: imps > 0 ? (clicks / imps * 100) : 0,
      spend: spend,
      cpc: clicks > 0 ? (spend / clicks) : 0,
      conversions: row.externalWebsiteConversions || 0
    };
  });

  return {
    source: "live",
    dateRange: { from: fromIso, to: toIso },
    kpis: kpis,
    campaigns: campaigns,
    ads: ads,
    demographics: { seniority: [], industry: [], jobFunction: [], geography: [] }
  };
}

// ---- Mock payload (used before LinkedIn approval lands) -------------------

function mockPayload(fromIso, toIso, reason) {
  return {
    source: "mock",
    mockReason: reason,
    dateRange: { from: fromIso, to: toIso },
    kpis: {
      impressions: 87420, clicks: 2103, ctr: 2.41,
      spend: 18450, cpc: 8.77, cpm: 211.05,
      conversions: 142, costPerConversion: 129.93
    },
    campaigns: [
      { id: "mock-camp-1", name: "Kagiso Thought Leadership - Sep 2026",
        status: "ACTIVE",
        impressions: 42100, clicks: 1180, ctr: 2.80,
        spend: 9800, cpc: 8.31, cpm: 232.78, conversions: 78, costPerConversion: 125.64 },
      { id: "mock-camp-2", name: "Newsletter Growth - Sponsored Content",
        status: "ACTIVE",
        impressions: 31200, clicks: 640, ctr: 2.05,
        spend: 5900, cpc: 9.22, cpm: 189.10, conversions: 45, costPerConversion: 131.11 },
      { id: "mock-camp-3", name: "MoMo Financial Inclusion Insights",
        status: "PAUSED",
        impressions: 14120, clicks: 283, ctr: 2.00,
        spend: 2750, cpc: 9.72, cpm: 194.76, conversions: 19, costPerConversion: 144.74 }
    ],
    ads: [
      { id: "mock-ad-1", name: "The 3-part fintech thesis for South Africa (single-image)",
        campaignId: "mock-camp-1", previewUrl: "", thumbUrl: "",
        impressions: 22800, clicks: 640, ctr: 2.81, spend: 5400, cpc: 8.44, conversions: 45 },
      { id: "mock-ad-2", name: "Why WhatsApp is winning the SA payments race (video)",
        campaignId: "mock-camp-1", previewUrl: "", thumbUrl: "",
        impressions: 19300, clicks: 540, ctr: 2.80, spend: 4400, cpc: 8.15, conversions: 33 },
      { id: "mock-ad-3", name: "Subscribe to the MoMo Insider newsletter (article)",
        campaignId: "mock-camp-2", previewUrl: "", thumbUrl: "",
        impressions: 17200, clicks: 355, ctr: 2.06, spend: 3250, cpc: 9.15, conversions: 25 },
      { id: "mock-ad-4", name: "Kagiso Mothibi on rewiring African fintech (article)",
        campaignId: "mock-camp-2", previewUrl: "", thumbUrl: "",
        impressions: 14000, clicks: 285, ctr: 2.04, spend: 2650, cpc: 9.30, conversions: 20 },
      { id: "mock-ad-5", name: "Financial inclusion field report (carousel)",
        campaignId: "mock-camp-3", previewUrl: "", thumbUrl: "",
        impressions: 14120, clicks: 283, ctr: 2.00, spend: 2750, cpc: 9.72, conversions: 19 }
    ],
    demographics: {
      seniority: [
        { name: "Director",     impressions: 22400, share: 25.62 },
        { name: "Manager",      impressions: 19800, share: 22.65 },
        { name: "Senior",       impressions: 15100, share: 17.27 },
        { name: "VP",           impressions: 11200, share: 12.81 },
        { name: "CXO",          impressions:  8300, share:  9.49 },
        { name: "Entry",        impressions:  6100, share:  6.98 },
        { name: "Other",        impressions:  4520, share:  5.18 }
      ],
      industry: [
        { name: "Financial Services",             impressions: 26200, share: 29.97 },
        { name: "Banking",                         impressions: 15300, share: 17.50 },
        { name: "Telecommunications",              impressions: 11800, share: 13.50 },
        { name: "Information Technology & Services", impressions: 10100, share: 11.55 },
        { name: "Retail",                          impressions:  7400, share:  8.47 },
        { name: "Government Administration",       impressions:  4900, share:  5.61 },
        { name: "Other",                           impressions: 11720, share: 13.40 }
      ],
      jobFunction: [
        { name: "Finance",              impressions: 18100, share: 20.71 },
        { name: "Business Development", impressions: 15400, share: 17.62 },
        { name: "Operations",           impressions: 12100, share: 13.84 },
        { name: "Sales",                impressions: 10800, share: 12.35 },
        { name: "Marketing",            impressions:  8900, share: 10.18 },
        { name: "Engineering",          impressions:  7300, share:  8.35 },
        { name: "Other",                impressions: 14820, share: 16.95 }
      ],
      geography: [
        { name: "Gauteng",       impressions: 38400, share: 43.93 },
        { name: "Western Cape",  impressions: 21200, share: 24.25 },
        { name: "KwaZulu-Natal", impressions: 11500, share: 13.15 },
        { name: "Eastern Cape",  impressions:  6200, share:  7.09 },
        { name: "Rest of ZA",    impressions: 10120, share: 11.58 }
      ]
    }
  };
}

// ---- Handler --------------------------------------------------------------

export default async function handler(req, res) {
  if (!(await checkAuth(req, res))) return;
  if (!principalMayReadLinkedIn(req.authPrincipal)) {
    res.status(403).json({ error: "LinkedIn data is restricted to MTN MoMo access." });
    return;
  }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;

  var q = req.query || {};
  var range = defaultRange();
  var fromIso = isoDateOnly(q.from) ? q.from : range.from;
  var toIso = isoDateOnly(q.to) ? q.to : range.to;

  // Env-check first so we can return the mock cleanly without exceptions.
  try { await getAccessToken("ads"); }
  catch (err) {
    res.status(200).json(mockPayload(fromIso, toIso, "credentials_pending: " + (err.message || err)));
    return;
  }
  if (!getAdAccountId()) {
    res.status(200).json(mockPayload(fromIso, toIso, "credentials_pending: LINKEDIN_AD_ACCOUNT_ID missing"));
    return;
  }

  try {
    var live = await fetchLive(fromIso, toIso);
    res.status(200).json(live);
  } catch (err) {
    console.error("[linkedin/paid] live fetch failed", err, err && err.detail);
    // Fall back to mock rather than 500ing the dashboard. The `mockReason`
    // field surfaces the real error to the client console for diagnosis.
    res.status(200).json(mockPayload(fromIso, toIso, "live_fetch_failed: " + (err.message || err)));
  }
}
