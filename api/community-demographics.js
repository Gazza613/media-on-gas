import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Community member (owned audience) demographics per platform.
// Distinct from /api/demographics, which returns PAID audience demographics,
// this endpoint pulls the follower / page-fan demographic composition so
// the Community tab and Summary can show "who already follows you" on each
// owned social page.
//
// Platforms:
//   - Facebook: Page Insights page_fans_gender_age + page_fans_country
//     Requires page access token OR user token with pages_read_engagement +
//     pages_show_list. The page_fans_gender_age endpoint is deprecated in
//     v19+ for new apps but continues to serve data for apps granted the
//     permission before cutoff, so we try it and gracefully return empty if
//     Meta refuses.
//   - Instagram Business: /{ig-user-id}/insights?metric=audience_gender_age,
//     audience_country, audience_city. Requires 100+ followers and the
//     instagram_manage_insights scope.
//   - TikTok Business: /creator/follower_demographics/ returns age, gender
//     and country splits of the account's followers.
//
// All three platforms: gracefully degrade to {available:false, reason:...}
// per-platform if the scope is missing or the endpoint returns empty. The
// card renderer falls back to a "data not exposed" placeholder rather than
// an empty skeleton.

var demoCache = {};
var DEMO_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, community demographics change slowly

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MoMo POS" },
  { id: "act_1096547581766373", name: "MTN MoMo" },
  { id: "act_1056268262507793", name: "Willowbrook" },
  { id: "act_1056268265841126", name: "Psycho" },
  { id: "act_1056268269174459", name: "Khava" },
  { id: "act_1056268272507792", name: "Concord" }
];

async function fetchFacebookCommunity(metaToken) {
  var platforms = [];
  for (var i = 0; i < META_ACCOUNTS.length; i++) {
    var acc = META_ACCOUNTS[i];
    try {
      // First resolve the Pages linked to this ad account.
      var pagesUrl = "https://graph.facebook.com/v25.0/" + acc.id + "/promote_pages?fields=id,name,fan_count,access_token&access_token=" + metaToken;
      var pr = await fetch(pagesUrl);
      if (!pr.ok) continue;
      var pd = await pr.json();
      var pages = pd.data || [];
      for (var pi = 0; pi < pages.length; pi++) {
        var page = pages[pi];
        var pageToken = page.access_token || metaToken;
        var ageGenderTotals = {};
        var countryTotals = {};
        try {
          // page_fans_gender_age: weekly metric, most recent day
          var agUrl = "https://graph.facebook.com/v25.0/" + page.id + "/insights?metric=page_fans_gender_age&period=lifetime&access_token=" + pageToken;
          var ar = await fetch(agUrl);
          if (ar.ok) {
            var ad = await ar.json();
            var values = ad.data && ad.data[0] && ad.data[0].values;
            if (values && values.length > 0) {
              var latest = values[values.length - 1].value || {};
              // keys look like "F.25-34" -> split into gender + age
              Object.keys(latest).forEach(function(k) {
                var m = /^([FMU])\.(.+)$/.exec(k);
                if (!m) return;
                ageGenderTotals[k] = latest[k];
              });
            }
          }
        } catch (_) {}
        try {
          var cUrl = "https://graph.facebook.com/v25.0/" + page.id + "/insights?metric=page_fans_country&period=lifetime&access_token=" + pageToken;
          var cr = await fetch(cUrl);
          if (cr.ok) {
            var cd = await cr.json();
            var cv = cd.data && cd.data[0] && cd.data[0].values;
            if (cv && cv.length > 0) {
              countryTotals = cv[cv.length - 1].value || {};
            }
          }
        } catch (_) {}
        platforms.push({
          platform: "Facebook",
          account: acc.name,
          pageName: page.name,
          totalFollowers: parseInt(page.fan_count || 0, 10),
          ageGender: ageGenderTotals,
          countries: countryTotals
        });
      }
    } catch (_) {}
  }
  return platforms;
}

async function fetchInstagramCommunity(metaToken) {
  var platforms = [];
  for (var i = 0; i < META_ACCOUNTS.length; i++) {
    var acc = META_ACCOUNTS[i];
    try {
      var pagesUrl = "https://graph.facebook.com/v25.0/" + acc.id + "/promote_pages?fields=id,name,access_token,instagram_business_account{id,username,followers_count}&access_token=" + metaToken;
      var pr = await fetch(pagesUrl);
      if (!pr.ok) continue;
      var pd = await pr.json();
      var pages = pd.data || [];
      for (var pi = 0; pi < pages.length; pi++) {
        var page = pages[pi];
        var iba = page.instagram_business_account;
        if (!iba || !iba.id) continue;
        var pageToken = page.access_token || metaToken;
        var ageGender = {};
        var countries = {};
        var cities = {};
        try {
          var agUrl = "https://graph.facebook.com/v25.0/" + iba.id + "/insights?metric=audience_gender_age&period=lifetime&access_token=" + pageToken;
          var ar = await fetch(agUrl);
          if (ar.ok) {
            var ad = await ar.json();
            var values = ad.data && ad.data[0] && ad.data[0].values;
            if (values && values.length > 0) {
              ageGender = values[0].value || {};
            }
          }
        } catch (_) {}
        try {
          var cUrl = "https://graph.facebook.com/v25.0/" + iba.id + "/insights?metric=audience_country&period=lifetime&access_token=" + pageToken;
          var cr = await fetch(cUrl);
          if (cr.ok) {
            var cd = await cr.json();
            var cv = cd.data && cd.data[0] && cd.data[0].values;
            if (cv && cv.length > 0) countries = cv[0].value || {};
          }
        } catch (_) {}
        try {
          var ciUrl = "https://graph.facebook.com/v25.0/" + iba.id + "/insights?metric=audience_city&period=lifetime&access_token=" + pageToken;
          var cir = await fetch(ciUrl);
          if (cir.ok) {
            var cid = await cir.json();
            var civ = cid.data && cid.data[0] && cid.data[0].values;
            if (civ && civ.length > 0) cities = civ[0].value || {};
          }
        } catch (_) {}
        platforms.push({
          platform: "Instagram",
          account: acc.name,
          pageName: iba.username || page.name,
          totalFollowers: parseInt(iba.followers_count || 0, 10),
          ageGender: ageGender,
          countries: countries,
          cities: cities
        });
      }
    } catch (_) {}
  }
  return platforms;
}

async function fetchTikTokCommunity(ttToken, ttAdvId) {
  // TikTok follower demographics endpoint, if the account has been authorised
  // for it. Returns age / gender / country splits.
  try {
    var url = "https://business-api.tiktok.com/open_api/v1.3/creator/follower_demographics/?advertiser_id=" + ttAdvId;
    var r = await fetch(url, { headers: { "Access-Token": ttToken } });
    if (!r.ok) return [];
    var d = await r.json();
    if (!d.data) return [];
    var data = d.data;
    return [{
      platform: "TikTok",
      account: "",
      pageName: data.username || "",
      totalFollowers: parseInt(data.follower_count || 0, 10),
      ageGender: data.age_gender_distribution || {},
      countries: data.country_distribution || {}
    }];
  } catch (_) {
    return [];
  }
}

function aggregateByPlatform(entries, platform) {
  var group = entries.filter(function(e) { return e.platform === platform; });
  if (group.length === 0) return { platform: platform, available: false };
  var totalFollowers = group.reduce(function(s, e) { return s + (e.totalFollowers || 0); }, 0);
  var ageGender = {};
  var countries = {};
  var cities = {};
  group.forEach(function(e) {
    Object.keys(e.ageGender || {}).forEach(function(k) { ageGender[k] = (ageGender[k] || 0) + (e.ageGender[k] || 0); });
    Object.keys(e.countries || {}).forEach(function(k) { countries[k] = (countries[k] || 0) + (e.countries[k] || 0); });
    if (e.cities) Object.keys(e.cities).forEach(function(k) { cities[k] = (cities[k] || 0) + (e.cities[k] || 0); });
  });
  return {
    platform: platform,
    available: Object.keys(ageGender).length > 0 || Object.keys(countries).length > 0 || totalFollowers > 0,
    totalFollowers: totalFollowers,
    ageGender: ageGender,
    countries: countries,
    cities: cities,
    pages: group.map(function(g) { return { account: g.account, name: g.pageName, followers: g.totalFollowers }; })
  };
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
  // Admin-only. The endpoint pulls owned-community demographics across every
  // configured Meta ad account and IG business account, plus the TikTok
  // advertiser, with no per-client scope filter, so a client JWT must not
  // be allowed to read this cross-tenant view. The dashboard's UI only
  // calls this from admin code paths anyway, so the gate doesn't change
  // behaviour, just blocks the direct-URL bypass.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }

  // Cache key includes role so a future scope expansion doesn't bleed
  // admin data to other roles via a shared cache slot.
  var cacheKey = "v1|" + (principal.role || "admin");
  var cached = demoCache[cacheKey];
  if (cached && Date.now() - cached.ts < DEMO_CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  try {
    var fbPagesP = metaToken ? fetchFacebookCommunity(metaToken) : Promise.resolve([]);
    var igPagesP = metaToken ? fetchInstagramCommunity(metaToken) : Promise.resolve([]);
    var ttPagesP = ttToken && ttAdvId ? fetchTikTokCommunity(ttToken, ttAdvId) : Promise.resolve([]);
    var results = await Promise.all([fbPagesP, igPagesP, ttPagesP]);
    var all = [].concat(results[0], results[1], results[2]);

    var payload = {
      available: true,
      facebook: aggregateByPlatform(all, "Facebook"),
      instagram: aggregateByPlatform(all, "Instagram"),
      tiktok: aggregateByPlatform(all, "TikTok")
    };
    demoCache[cacheKey] = { data: payload, ts: Date.now() };
    res.status(200).json(payload);
  } catch (err) {
    console.error("community-demographics error", err && err.message);
    res.status(200).json({ available: false, reason: "Community demographics fetch failed, " + (err && err.message || "unknown") });
  }
}
