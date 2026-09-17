// LinkedIn ORGANIC performance for MTN MoMo (MoMo from MTN ZA Company
// Page). Reads follower stats + page views + top posts from the
// Community Management API (App 2 credentials).
//
// Endpoints touched:
//   GET /rest/networkSizes/{orgUrn}?edgeType=CompanyFollowedByMember
//     - current follower count
//   GET /rest/organizationalEntityFollowerStatistics
//     - follower demographic + growth data
//   GET /rest/organizationPageStatistics
//     - page views, unique visitors
//   GET /rest/posts
//     - post list (then organizationalEntityShareStatistics for
//       per-post impressions + engagements)
//
// Same mock-fallback pattern as paid.js so the dashboard renders
// before Community Management API approval lands.
//
// Newsletter subscribers, per user confirmation, live inside LinkedIn
// as a native LinkedIn Newsletter — surfaced here as an additional
// "subscribers" metric when the API returns one.

import { checkAuth } from "../_auth.js";
import { rateLimit } from "../_rateLimit.js";
import { getAccessToken, getOrgUrn, fetchLinkedInJson } from "./_auth.js";

export const config = { maxDuration: 60 };

// Same client-scope guard as paid.js.
function principalMayReadLinkedIn(principal) {
  if (!principal) return false;
  if (principal.role === "superadmin" || principal.role === "admin") return true;
  var allowed = (principal.allowedClientSlugs || []).map(function (s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  });
  return allowed.some(function (s) { return s.indexOf("mtnmomo") >= 0 || s.indexOf("momo") >= 0; });
}

function isoDateOnly(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function defaultRange() {
  var to = new Date();
  var from = new Date(to.getTime() - 30 * 86400000);
  var iso = function (d) { return d.toISOString().slice(0, 10); };
  return { from: iso(from), to: iso(to) };
}

// ---- Live fetch ----------------------------------------------------------

async function fetchLive(fromIso, toIso) {
  var orgUrn = getOrgUrn();
  if (!orgUrn) throw new Error("linkedin_env_missing:LINKEDIN_ORG_URN");

  // Current follower count.
  var fResp = await fetchLinkedInJson("organic",
    "/rest/networkSizes/" + encodeURIComponent(orgUrn) + "?edgeType=CompanyFollowedByMember");
  var followers = (fResp.data && fResp.data.firstDegreeSize) || 0;

  // Page statistics (views, unique visitors) for the date range.
  var startMs = new Date(fromIso + "T00:00:00Z").getTime();
  var endMs = new Date(toIso + "T23:59:59Z").getTime();
  var timeIntervalsParam = "(timeGranularityType:DAY,timeRange:(start:" + startMs + ",end:" + endMs + "))";
  var pageStatsResp = await fetchLinkedInJson("organic",
    "/rest/organizationPageStatistics?q=organization&organization=" +
      encodeURIComponent(orgUrn) +
      "&timeIntervals=" + encodeURIComponent(timeIntervalsParam));
  var pageStatsElements = (pageStatsResp.data && pageStatsResp.data.elements) || [];
  var pageViews = 0, uniqueVisitors = 0;
  pageStatsElements.forEach(function (el) {
    var pv = (el.totalPageStatistics && el.totalPageStatistics.views) || {};
    // LinkedIn nests view metrics under a page-type map; sum them all.
    Object.keys(pv).forEach(function (k) {
      if (pv[k] && typeof pv[k].pageViews === "number") pageViews += pv[k].pageViews;
      if (pv[k] && typeof pv[k].uniquePageViews === "number") uniqueVisitors += pv[k].uniquePageViews;
    });
  });

  // Post list — organic posts published by the org. Ranked by engagement
  // is computed here since LinkedIn's API returns them in publish order.
  var postsResp = await fetchLinkedInJson("organic",
    "/rest/posts?q=author&author=" + encodeURIComponent(orgUrn) + "&count=25&sortBy=LAST_MODIFIED");
  var postElements = (postsResp.data && postsResp.data.elements) || [];

  // Per-post statistics + thumbnails. LinkedIn returns each post's media
  // as an image/video URN. We resolve up to 25 in parallel via /rest/images
  // and /rest/videos which return short-lived CDN downloadUrls that we
  // pass through as thumbUrl. On any single resolution failure the post
  // keeps thumbUrl empty and the frontend renders a color placeholder.
  var posts = [];
  if (postElements.length > 0) {
    var shareUrns = postElements.map(function (p) { return p.id; }).filter(Boolean).slice(0, 25);
    if (shareUrns.length > 0) {
      var sList = shareUrns.map(encodeURIComponent).join(",");
      var statsResp = await fetchLinkedInJson("organic",
        "/rest/organizationalEntityShareStatistics?q=organizationalEntity" +
        "&organizationalEntity=" + encodeURIComponent(orgUrn) +
        "&shares=List(" + sList + ")");
      var statsByShare = {};
      var statsElements = (statsResp.data && statsResp.data.elements) || [];
      statsElements.forEach(function (el) {
        var key = el.share || (el.totalShareStatistics && el.totalShareStatistics.share) || "";
        if (!key) return;
        var s = el.totalShareStatistics || {};
        statsByShare[key] = {
          impressions: s.impressionCount || 0,
          uniqueImpressions: s.uniqueImpressionsCount || 0,
          clicks: s.clickCount || 0,
          likes: s.likeCount || 0,
          comments: s.commentCount || 0,
          shares: s.shareCount || 0,
          engagement: (s.likeCount || 0) + (s.commentCount || 0) + (s.shareCount || 0) + (s.clickCount || 0)
        };
      });

      // Resolve media URNs -> downloadUrl for thumbnails. Parallel + tolerant.
      var mediaUrnByPost = {};
      postElements.forEach(function (p) {
        var m = (p.content && p.content.media && p.content.media.id)
          || (p.content && p.content.article && p.content.article.thumbnail)
          || "";
        if (m) mediaUrnByPost[p.id] = m;
      });
      var urns = Object.values(mediaUrnByPost);
      var thumbByUrn = {};
      if (urns.length > 0) {
        await Promise.all(urns.slice(0, 25).map(async function (urn) {
          var isVideo = /^urn:li:video:/i.test(urn);
          var restPath = "/rest/" + (isVideo ? "videos" : "images") + "/" + encodeURIComponent(urn);
          try {
            var r = await fetchLinkedInJson("organic", restPath);
            if (r.ok && r.data) {
              // Images: downloadUrl on the image object. Videos: transcripts array;
              // use aspectRatioAwarePosterUrl or the smallest poster if available.
              var dl = r.data.downloadUrl
                || (r.data.aspectRatioAwarePosterUrl || "")
                || (r.data.thumbnail && r.data.thumbnail.url)
                || "";
              if (dl) thumbByUrn[urn] = dl;
            }
          } catch (_) { /* keep empty */ }
        }));
      }

      posts = postElements.map(function (p) {
        var stats = statsByShare[p.id] || {};
        var imps = stats.impressions || 0;
        var eng = stats.engagement || 0;
        var mediaUrn = mediaUrnByPost[p.id] || "";
        var thumbUrl = mediaUrn ? (thumbByUrn[mediaUrn] || "") : "";
        return {
          id: p.id,
          publishedAt: p.publishedAt || p.createdAt || null,
          commentary: (p.commentary || "").slice(0, 240),
          thumbUrl: thumbUrl,
          thumbColor: "#0A66C2", // brand-blue fallback tint if the CDN URL is empty
          impressions: imps,
          clicks: stats.clicks || 0,
          engagement: eng,
          engagementRate: imps > 0 ? (eng / imps * 100) : 0,
          likes: stats.likes || 0,
          comments: stats.comments || 0,
          shares: stats.shares || 0
        };
      });
      posts.sort(function (a, b) { return b.engagementRate - a.engagementRate; });
    }
  }

  // KPI aggregate.
  var totalImps = posts.reduce(function (a, p) { return a + p.impressions; }, 0);
  var totalEng = posts.reduce(function (a, p) { return a + p.engagement; }, 0);

  return {
    source: "live",
    dateRange: { from: fromIso, to: toIso },
    kpis: {
      followers: followers,
      followerGrowth: 0, // filled by perf-snapshot integration when wired
      subscribers: 0,     // newsletter subscribers, populated when LI exposes the field
      pageViews: pageViews,
      uniqueVisitors: uniqueVisitors,
      postImpressions: totalImps,
      postEngagements: totalEng,
      engagementRate: totalImps > 0 ? (totalEng / totalImps * 100) : 0
    },
    topPosts: posts.slice(0, 5),
    posts: posts
  };
}

// ---- Mock payload --------------------------------------------------------

function mockPayload(fromIso, toIso, reason) {
  // Content-type labels vary per mock so the sample thumbnails read as
  // representative creative cards (article / video / newsletter etc)
  // rather than five identical brand-blue blocks. Real LinkedIn data
  // will drop thumbUrl in (CDN image) and this label is ignored.
  var mockPosts = [
    { id: "urn:li:share:mock-1",
      publishedAt: Date.now() - 2 * 86400000,
      commentary: "The next chapter of mobile money in South Africa is not about a bigger app, it is about smaller friction. Three barriers we are removing this quarter, and the numbers behind why.",
      thumbUrl: "", thumbColor: "#0A66C2", thumbLabel: "ARTICLE",
      impressions: 12400, clicks: 287, engagement: 682, engagementRate: 5.50,
      likes: 512, comments: 89, shares: 81 },
    { id: "urn:li:share:mock-2",
      publishedAt: Date.now() - 5 * 86400000,
      commentary: "Financial inclusion is not a mandate we tick, it is a scoreboard. Four indicators MoMo tracks internally that no bank reports on, and why they matter for real economic access.",
      thumbUrl: "", thumbColor: "#FFCC00", thumbLabel: "CAROUSEL",
      impressions: 9800, clicks: 214, engagement: 512, engagementRate: 5.22,
      likes: 397, comments: 67, shares: 48 },
    { id: "urn:li:share:mock-3",
      publishedAt: Date.now() - 8 * 86400000,
      commentary: "Why the WhatsApp payments race in SA is being run on the wrong finish line. Our CEO on where the real product-market fit lives.",
      thumbUrl: "", thumbColor: "#34D399", thumbLabel: "VIDEO",
      impressions: 7600, clicks: 189, engagement: 431, engagementRate: 5.67,
      likes: 342, comments: 51, shares: 38 },
    { id: "urn:li:share:mock-4",
      publishedAt: Date.now() - 12 * 86400000,
      commentary: "Kagiso Mothibi at Africa Fintech Summit: the three-part thesis on why the next unicorn will be a wallet, not a bank.",
      thumbUrl: "", thumbColor: "#A855F7", thumbLabel: "PHOTO",
      impressions: 6200, clicks: 152, engagement: 348, engagementRate: 5.61,
      likes: 271, comments: 43, shares: 34 },
    { id: "urn:li:share:mock-5",
      publishedAt: Date.now() - 18 * 86400000,
      commentary: "Introducing the MoMo Insider newsletter, monthly field notes from the front line of African fintech. Subscribe on the button above.",
      thumbUrl: "", thumbColor: "#F43F5E", thumbLabel: "NEWSLETTER",
      impressions: 5900, clicks: 412, engagement: 519, engagementRate: 8.80,
      likes: 78, comments: 12, shares: 17 }
  ];
  var totalImps = mockPosts.reduce(function (a, p) { return a + p.impressions; }, 0);
  var totalEng = mockPosts.reduce(function (a, p) { return a + p.engagement; }, 0);
  return {
    source: "mock",
    mockReason: reason,
    dateRange: { from: fromIso, to: toIso },
    kpis: {
      followers: 18420,
      followerGrowth: 312,
      subscribers: 4180,
      pageViews: 9420,
      uniqueVisitors: 6120,
      postImpressions: totalImps,
      postEngagements: totalEng,
      engagementRate: totalImps > 0 ? (totalEng / totalImps * 100) : 0
    },
    topPosts: mockPosts.slice(0, 5),
    posts: mockPosts
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

  try { await getAccessToken("organic"); }
  catch (err) {
    res.status(200).json(mockPayload(fromIso, toIso, "credentials_pending: " + (err.message || err)));
    return;
  }
  if (!getOrgUrn()) {
    res.status(200).json(mockPayload(fromIso, toIso, "credentials_pending: LINKEDIN_ORG_URN missing"));
    return;
  }

  try {
    var live = await fetchLive(fromIso, toIso);
    res.status(200).json(live);
  } catch (err) {
    console.error("[linkedin/organic] live fetch failed", err);
    res.status(200).json(mockPayload(fromIso, toIso, "live_fetch_failed: " + (err.message || err)));
  }
}
