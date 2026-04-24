import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isCampaignAllowed } from "./_auth.js";

// Demographics endpoint. Returns age × gender, province (region), device
// and Google-only city breakdowns across Meta, TikTok and Google. The
// Demographics tab on the dashboard renders these directly. Heavy fetch
// (each Meta breakdown is a separate /insights call) so we cache the
// response for 5 minutes keyed on date range + client scope.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MTN MoMo Meta" },
  { id: "act_3600654450252189", name: "MTN Khava" },
  { id: "act_825253026181227", name: "Concord College" },
  { id: "act_1187886635852303", name: "Eden College" },
  { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
  { id: "act_542990539806888", name: "GAS Agency" }
];

var demoCache = {};
var DEMO_CACHE_TTL_MS = 5 * 60 * 1000;
var DEMO_CACHE_VERSION = "v7-ig-backfill-always";

function extractResults(actions) {
  var map = {};
  (actions || []).forEach(function(a) { map[a.action_type] = parseInt(a.value || 0, 10); });
  return {
    leads: Math.max(
      map["lead"] || 0,
      map["onsite_conversion.lead_grouped"] || 0,
      map["offsite_conversion.fb_pixel_lead"] || 0,
      map["offsite_complete_registration_add_meta_leads"] || 0
    ),
    appInstalls: Math.max(
      map["app_install"] || 0,
      map["mobile_app_install"] || 0,
      map["omni_app_install"] || 0
    ),
    pageLikes: map["page_like"] || 0,
    postReactions: map["post_reaction"] || 0,
    landingPageViews: map["landing_page_view"] || 0,
    follows: map["follow"] || map["onsite_conversion.follow"] || 0
  };
}

async function fetchMetaBreakdown(account, token, from, to, breakdown) {
  try {
    var url = "https://graph.facebook.com/v25.0/" + account.id +
      "/insights?fields=campaign_id,campaign_name,impressions,clicks,spend,actions" +
      "&level=campaign" +
      "&breakdowns=" + encodeURIComponent(breakdown) +
      "&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) +
      "&limit=1000&access_token=" + token;
    var rows = [];
    var next = url;
    var guard = 0;
    while (next && guard < 10) {
      guard++;
      var r = await fetch(next);
      if (!r.ok) {
        var errBody = await r.text();
        console.warn("[demo] Meta " + breakdown + " non-ok for " + account.name, r.status, errBody.substring(0, 200));
        break;
      }
      var d = await r.json();
      if (d.data) rows = rows.concat(d.data);
      next = d.paging && d.paging.next ? d.paging.next : null;
    }
    return rows;
  } catch (e) {
    console.error("Meta demo breakdown error", account.name, breakdown, e && e.message);
    return [];
  }
}

// Publisher platform -> dashboard platform label. Fold audience_network
// and messenger into Facebook, threads and any instagram_* variant into
// Instagram. Use indexOf so odd Meta placement tags like "instagram_stories"
// or "instagram_reels" still land on Instagram rather than falling through
// to the conservative Facebook default, which would quietly bury IG data
// in the FB bucket and make the Targeting tab persona card for IG look
// empty even when IG had real click volume.
function metaPlatformLabel(pub) {
  var p = String(pub || "").toLowerCase();
  if (p.indexOf("instagram") >= 0 || p === "threads") return "Instagram";
  if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
  return "Facebook"; // conservative default
}

async function fetchMetaDemo(token, from, to) {
  var agAll = [];
  var regAll = [];
  var devAll = [];
  await Promise.all(META_ACCOUNTS.map(async function(acc) {
    // publisher_platform added to every Meta breakdown so each row can
    // be labelled Facebook or Instagram distinctly. This matches how
    // the rest of the dashboard surfaces these two platforms.
    var res = await Promise.all([
      fetchMetaBreakdown(acc, token, from, to, "age,gender,publisher_platform"),
      fetchMetaBreakdown(acc, token, from, to, "region,publisher_platform"),
      fetchMetaBreakdown(acc, token, from, to, "impression_device,publisher_platform")
    ]);
    var ag = res[0], reg = res[1], dev = res[2];
    // Meta's 3-dim breakdowns with publisher_platform sometimes return an
    // empty list, and more often return a subset (eg Facebook rows only
    // when IG has genuine click volume). For every breakdown we:
    //   1. Check if Instagram rows are present in the 3-dim result.
    //   2. If not, also pull the 2-dim per-platform query and append any
    //      Instagram rows found, carrying "unknown" on the axis dropped by
    //      the 2-dim shape.
    // This keeps the FB / IG split intact even when Meta is unhelpful.
    var hasInstagram = function(rows, platformField) {
      platformField = platformField || "publisher_platform";
      if (!rows || !rows.length) return false;
      for (var i = 0; i < rows.length; i++) {
        var p = String(rows[i][platformField] || "").toLowerCase();
        if (p.indexOf("instagram") >= 0 || p === "threads") return true;
      }
      return false;
    };
    if (!ag || ag.length === 0 || !hasInstagram(ag)) {
      var agByPlat = await fetchMetaBreakdown(acc, token, from, to, "age,publisher_platform");
      var genByPlat = await fetchMetaBreakdown(acc, token, from, to, "gender,publisher_platform");
      // Append IG rows only, so FB data in the 3-dim result is preserved.
      (agByPlat || []).forEach(function(row) {
        var pp = String(row.publisher_platform || "").toLowerCase();
        if (pp.indexOf("instagram") >= 0 || pp === "threads") {
          ag = ag || [];
          ag.push(Object.assign({}, row, { gender: "unknown" }));
        }
      });
      (genByPlat || []).forEach(function(row) {
        var pp = String(row.publisher_platform || "").toLowerCase();
        if (pp.indexOf("instagram") >= 0 || pp === "threads") {
          ag = ag || [];
          ag.push(Object.assign({}, row, { age: "unknown" }));
        }
      });
      // If the 3-dim came back completely empty and the per-platform 2-dim
      // returned no IG either, fall through to the no-platform pull tagged
      // as Facebook so the shape stays consistent downstream.
      if (!ag || ag.length === 0) {
        var agFallback = await fetchMetaBreakdown(acc, token, from, to, "age,gender");
        ag = (agFallback || []).map(function(row) { row.publisher_platform = "facebook"; return row; });
      }
    }
    if (!reg || reg.length === 0 || !hasInstagram(reg)) {
      var regByPlat = await fetchMetaBreakdown(acc, token, from, to, "region,publisher_platform");
      (regByPlat || []).forEach(function(row) {
        var pp = String(row.publisher_platform || "").toLowerCase();
        if (pp.indexOf("instagram") >= 0 || pp === "threads") {
          reg = reg || [];
          reg.push(row);
        }
      });
      if (!reg || reg.length === 0) {
        var regFallback = await fetchMetaBreakdown(acc, token, from, to, "region");
        reg = (regFallback || []).map(function(row) { row.publisher_platform = "facebook"; return row; });
      }
    }
    if (!dev || dev.length === 0 || !hasInstagram(dev)) {
      var devByPlat = await fetchMetaBreakdown(acc, token, from, to, "impression_device,publisher_platform");
      (devByPlat || []).forEach(function(row) {
        var pp = String(row.publisher_platform || "").toLowerCase();
        if (pp.indexOf("instagram") >= 0 || pp === "threads") {
          dev = dev || [];
          dev.push(row);
        }
      });
      if (!dev || dev.length === 0) {
        var devFallback = await fetchMetaBreakdown(acc, token, from, to, "impression_device");
        dev = (devFallback || []).map(function(row) { row.publisher_platform = "facebook"; return row; });
      }
    }
    ag.forEach(function(row) {
      var r = extractResults(row.actions);
      agAll.push({
        platform: metaPlatformLabel(row.publisher_platform),
        account: acc.name,
        campaignId: String(row.campaign_id || ""),
        campaignName: row.campaign_name || "",
        age: row.age || "unknown",
        gender: row.gender || "unknown",
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        spend: parseFloat(row.spend || 0),
        results: r
      });
    });
    reg.forEach(function(row) {
      var r = extractResults(row.actions);
      regAll.push({
        platform: metaPlatformLabel(row.publisher_platform),
        account: acc.name,
        campaignId: String(row.campaign_id || ""),
        campaignName: row.campaign_name || "",
        region: row.region || "Unknown",
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        spend: parseFloat(row.spend || 0),
        results: r
      });
    });
    dev.forEach(function(row) {
      var r = extractResults(row.actions);
      devAll.push({
        platform: metaPlatformLabel(row.publisher_platform),
        account: acc.name,
        campaignId: String(row.campaign_id || ""),
        campaignName: row.campaign_name || "",
        device: String(row.impression_device || "unknown"),
        impressions: parseInt(row.impressions || 0, 10),
        clicks: parseInt(row.clicks || 0, 10),
        spend: parseFloat(row.spend || 0),
        results: r
      });
    });
  }));
  return { ageGender: agAll, region: regAll, device: devAll };
}

// Province id -> name map for TikTok. IDs are documented in TikTok's
// Business API geo dictionary. South Africa's nine provinces below.
var TT_PROVINCE_NAMES = {
  "7450": "Eastern Cape",
  "7451": "Free State",
  "7452": "Gauteng",
  "7453": "KwaZulu-Natal",
  "7454": "Limpopo",
  "7455": "Mpumalanga",
  "7456": "North West",
  "7457": "Northern Cape",
  "7458": "Western Cape"
};

async function fetchTikTokDemoDim(token, advId, from, to, dimensions) {
  try {
    // report_type=AUDIENCE with data_level=AUCTION_CAMPAIGN is documented
    // but returns empty lists in practice on many advertiser accounts.
    // BASIC report type supports the same demographic dimensions at the
    // campaign level and is consistently populated.
    var dims = encodeURIComponent(JSON.stringify(dimensions));
    var metrics = encodeURIComponent(JSON.stringify(["spend", "impressions", "clicks"]));
    var url = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/" +
      "?advertiser_id=" + advId +
      "&report_type=AUDIENCE" +
      "&data_level=AUCTION_CAMPAIGN" +
      "&dimensions=" + dims +
      "&metrics=" + metrics +
      "&start_date=" + from + "&end_date=" + to +
      "&page_size=1000";
    var r = await fetch(url, { headers: { "Access-Token": token } });
    if (!r.ok) {
      console.warn("[demo] TikTok " + JSON.stringify(dimensions) + " non-ok", r.status);
      return [];
    }
    var d = await r.json();
    if (d.code && d.code !== 0) {
      console.warn("[demo] TikTok " + JSON.stringify(dimensions) + " api error", d.code, d.message);
      // Retry at AUCTION_AD level — some advertiser accounts only populate
      // AUDIENCE reports at ad level, not campaign level.
      var urlAd = url.replace("AUCTION_CAMPAIGN", "AUCTION_AD");
      var r2 = await fetch(urlAd, { headers: { "Access-Token": token } });
      if (r2.ok) {
        var d2 = await r2.json();
        if (d2.data && d2.data.list) return d2.data.list;
      }
      return [];
    }
    if (!d.data || !d.data.list) return [];
    if (d.data.list.length === 0) {
      console.log("[demo] TikTok " + JSON.stringify(dimensions) + " returned 0 rows");
    }
    return d.data.list;
  } catch (e) {
    console.error("TikTok demo fetch error", dimensions, e && e.message);
    return [];
  }
}

async function fetchTikTokDemo(token, advId, from, to) {
  var ageGender = [];
  var region = [];
  var device = [];

  var res = await Promise.all([
    fetchTikTokDemoDim(token, advId, from, to, ["campaign_id", "age", "gender"]),
    fetchTikTokDemoDim(token, advId, from, to, ["campaign_id", "province_id"]),
    fetchTikTokDemoDim(token, advId, from, to, ["campaign_id", "platform"])
  ]);

  (res[0] || []).forEach(function(row) {
    var dim = row.dimensions || {};
    var met = row.metrics || {};
    ageGender.push({
      platform: "TikTok",
      account: "TikTok",
      campaignId: String(dim.campaign_id || ""),
      campaignName: "",
      age: dim.age || "unknown",
      gender: dim.gender || "unknown",
      impressions: parseInt(met.impressions || 0, 10),
      clicks: parseInt(met.clicks || 0, 10),
      spend: parseFloat(met.spend || 0),
      results: { follows: parseInt(met.follows || 0, 10), leads: 0, appInstalls: 0, pageLikes: 0, postReactions: parseInt(met.likes || 0, 10), landingPageViews: 0 }
    });
  });

  (res[1] || []).forEach(function(row) {
    var dim = row.dimensions || {};
    var met = row.metrics || {};
    var pn = TT_PROVINCE_NAMES[String(dim.province_id || "")] || null;
    if (!pn) return; // outside SA or unknown
    region.push({
      platform: "TikTok",
      account: "TikTok",
      campaignId: String(dim.campaign_id || ""),
      campaignName: "",
      region: pn,
      impressions: parseInt(met.impressions || 0, 10),
      clicks: parseInt(met.clicks || 0, 10),
      spend: parseFloat(met.spend || 0),
      results: { follows: parseInt(met.follows || 0, 10), leads: 0, appInstalls: 0, pageLikes: 0, postReactions: parseInt(met.likes || 0, 10), landingPageViews: 0 }
    });
  });

  (res[2] || []).forEach(function(row) {
    var dim = row.dimensions || {};
    var met = row.metrics || {};
    device.push({
      platform: "TikTok",
      account: "TikTok",
      campaignId: String(dim.campaign_id || ""),
      campaignName: "",
      device: String(dim.platform || "unknown").toLowerCase(),
      impressions: parseInt(met.impressions || 0, 10),
      clicks: parseInt(met.clicks || 0, 10),
      spend: parseFloat(met.spend || 0),
      results: { follows: parseInt(met.follows || 0, 10), leads: 0, appInstalls: 0, pageLikes: 0, postReactions: parseInt(met.likes || 0, 10), landingPageViews: 0 }
    });
  });

  return { ageGender: ageGender, region: region, device: device };
}

async function fetchGoogleDemo(from, to) {
  var out = { ageGender: [], region: [], device: [], city: [] };
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (!gClientId || !gRefreshToken || !gDevToken) return out;

    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) return out;
    var authHeader = "Bearer " + tokenData.access_token;

    var googleSearch = async function(query) {
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
        if (!r.ok) return [];
        var d = await r.json();
        return d.results || [];
      } catch (_) { return []; }
    };

    var AGE_MAP = {
      "AGE_RANGE_18_24": "18-24",
      "AGE_RANGE_25_34": "25-34",
      "AGE_RANGE_35_44": "35-44",
      "AGE_RANGE_45_54": "45-54",
      "AGE_RANGE_55_64": "55-64",
      "AGE_RANGE_65_UP": "65+",
      "AGE_RANGE_UNDETERMINED": "unknown"
    };
    var GENDER_MAP = {
      "MALE": "male",
      "FEMALE": "female",
      "UNDETERMINED": "unknown"
    };
    var DEVICE_MAP = {
      "MOBILE": "mobile",
      "DESKTOP": "desktop",
      "TABLET": "tablet",
      "CONNECTED_TV": "connected_tv",
      "OTHER": "other"
    };

    var ageQ = "SELECT campaign.id, campaign.name, ad_group_criterion.age_range.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM age_range_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
    var genQ = "SELECT campaign.id, campaign.name, ad_group_criterion.gender.type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM gender_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
    var devQ = "SELECT campaign.id, campaign.name, segments.device, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "'";
    // Geographic. Using geo_target_most_specific_location rather than
    // geo_target_city picks up every granularity Google attributed to —
    // city, metro, county, or region (province). Display / YouTube /
    // Performance Max often attribute at region level rather than city,
    // and the city-only query dropped all of those rows. Names + target
    // type need a second lookup (geo_target_constant).
    var locQ = "SELECT campaign.id, campaign.name, geographic_view.country_criterion_id, segments.geo_target_most_specific_location, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'";

    var results = await Promise.all([
      googleSearch(ageQ),
      googleSearch(genQ),
      googleSearch(devQ),
      googleSearch(locQ)
    ]);

    var ageRows = results[0], genRows = results[1], devRows = results[2], locRows = results[3];

    // Age and gender are separate queries on Google (no combined breakdown).
    // Combine them best-effort: for each campaign, report age and gender
    // independently, and the frontend collapses into a 1D breakdown.
    ageRows.forEach(function(row) {
      var c = row.campaign || {}, m = row.metrics || {}, k = row.adGroupCriterion || {};
      var ageKey = (k.ageRange && k.ageRange.type) || "AGE_RANGE_UNDETERMINED";
      out.ageGender.push({
        platform: "Google",
        account: "Google Ads",
        campaignId: String(c.id || ""),
        campaignName: c.name || "",
        age: AGE_MAP[ageKey] || "unknown",
        gender: "unknown",
        impressions: parseInt(m.impressions || 0, 10),
        clicks: parseInt(m.clicks || 0, 10),
        spend: parseFloat(m.costMicros || 0) / 1e6,
        results: { leads: Math.round(parseFloat(m.conversions || 0)), appInstalls: 0, pageLikes: 0, postReactions: 0, landingPageViews: 0, follows: 0 }
      });
    });
    genRows.forEach(function(row) {
      var c = row.campaign || {}, m = row.metrics || {}, k = row.adGroupCriterion || {};
      var genKey = (k.gender && k.gender.type) || "UNDETERMINED";
      out.ageGender.push({
        platform: "Google",
        account: "Google Ads",
        campaignId: String(c.id || ""),
        campaignName: c.name || "",
        age: "unknown",
        gender: GENDER_MAP[genKey] || "unknown",
        impressions: parseInt(m.impressions || 0, 10),
        clicks: parseInt(m.clicks || 0, 10),
        spend: parseFloat(m.costMicros || 0) / 1e6,
        results: { leads: Math.round(parseFloat(m.conversions || 0)), appInstalls: 0, pageLikes: 0, postReactions: 0, landingPageViews: 0, follows: 0 }
      });
    });
    devRows.forEach(function(row) {
      var c = row.campaign || {}, m = row.metrics || {}, s = row.segments || {};
      out.device.push({
        platform: "Google",
        account: "Google Ads",
        campaignId: String(c.id || ""),
        campaignName: c.name || "",
        device: DEVICE_MAP[s.device] || "unknown",
        impressions: parseInt(m.impressions || 0, 10),
        clicks: parseInt(m.clicks || 0, 10),
        spend: parseFloat(m.costMicros || 0) / 1e6,
        results: { leads: Math.round(parseFloat(m.conversions || 0)), appInstalls: 0, pageLikes: 0, postReactions: 0, landingPageViews: 0, follows: 0 }
      });
    });

    // Resolve location names. geo_target_most_specific_location returns
    // 'geoTargetConstants/{id}' at whichever granularity Google used
    // (city / county / metro / region) — we pull name, canonical name,
    // country code and target_type so the consumer can decide how to
    // attribute each row.
    var locIds = {};
    locRows.forEach(function(row) {
      var s = row.segments || {};
      var gtc = s.geoTargetMostSpecificLocation || s.geo_target_most_specific_location;
      if (gtc) locIds[gtc] = true;
    });
    var cityNames = {};
    if (Object.keys(locIds).length > 0) {
      var ids = Object.keys(locIds).map(function(id) { return "'" + id + "'"; }).join(",");
      var namesQ = "SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name, geo_target_constant.country_code, geo_target_constant.target_type FROM geo_target_constant WHERE geo_target_constant.resource_name IN (" + ids + ")";
      try {
        var nameRows = await googleSearch(namesQ);
        nameRows.forEach(function(nr) {
          var g = nr.geoTargetConstant || {};
          var rn = g.resourceName || g.resource_name;
          if (rn) cityNames[rn] = { name: g.name, canonical: g.canonicalName || g.canonical_name, country: g.countryCode || g.country_code, targetType: g.targetType || g.target_type };
        });
      } catch (_) {}
    }
    // Province parser — Google's geo_target_constant canonical_name for a
    // ZA city is "City,Province,South Africa". The province token lets us
    // fold Google city-level data into province-level rows (Google Ads
    // does not expose SA provinces as a first-class breakdown, so without
    // this mapping Google clicks/impressions are absent from the region
    // aggregate and the Top Provinces table understates by the Google
    // share — often the bulk of paid-search + display spend).
    var PROVINCE_ALIASES = {
      "gauteng": "Gauteng",
      "western cape": "Western Cape",
      "eastern cape": "Eastern Cape",
      "kwazulu-natal": "KwaZulu-Natal",
      "kwazulu natal": "KwaZulu-Natal",
      "kwa-zulu natal": "KwaZulu-Natal",
      "free state": "Free State",
      "northern cape": "Northern Cape",
      "north west": "North West",
      "north-west": "North West",
      "mpumalanga": "Mpumalanga",
      "limpopo": "Limpopo"
    };
    var provinceFromCanonical = function(canon) {
      if (!canon) return null;
      var parts = String(canon).split(",").map(function(s) { return s.trim(); });
      // Drop trailing country token, take the next token as the province candidate.
      if (parts.length < 2) return null;
      var raw = parts[parts.length - 2] || "";
      raw = raw.replace(/^Province of /i, "").replace(/ Province$/i, "").trim().toLowerCase();
      return PROVINCE_ALIASES[raw] || null;
    };

    // Aggregate Google geographic rows into province totals, then push as
    // region rows so the Top Provinces view includes Google clicks / impressions.
    // Each row's geo_target_constant can be at city-, county-, metro- or
    // region-level — we treat the canonical name as authoritative (it always
    // contains the province for SA rows) and only surface the row in the
    // Cities block when it really is city-level (canonical has three or more
    // comma parts, i.e. "<city>, <province>, <country>").
    var googleProvinceAgg = {};
    locRows.forEach(function(row) {
      var c = row.campaign || {}, m = row.metrics || {}, s = row.segments || {};
      var gtc = s.geoTargetMostSpecificLocation || s.geo_target_most_specific_location;
      var cn = gtc && cityNames[gtc];
      // Scope to SA only — otherwise international long-tail rows leak in.
      if (!cn || cn.country !== "ZA") return;
      var parts = String(cn.canonical || "").split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      var isCity = parts.length >= 3;
      if (isCity) {
        out.city.push({
          platform: "Google",
          account: "Google Ads",
          campaignId: String(c.id || ""),
          campaignName: c.name || "",
          city: cn.name || "Unknown",
          canonicalName: cn.canonical || "",
          impressions: parseInt(m.impressions || 0, 10),
          clicks: parseInt(m.clicks || 0, 10),
          spend: parseFloat(m.costMicros || 0) / 1e6,
          results: { leads: Math.round(parseFloat(m.conversions || 0)), appInstalls: 0, pageLikes: 0, postReactions: 0, landingPageViews: 0, follows: 0 }
        });
      }
      var prov = provinceFromCanonical(cn.canonical);
      if (!prov) return;
      var key = String(c.id || "") + "|" + prov;
      if (!googleProvinceAgg[key]) {
        googleProvinceAgg[key] = {
          platform: "Google",
          account: "Google Ads",
          campaignId: String(c.id || ""),
          campaignName: c.name || "",
          region: prov,
          impressions: 0,
          clicks: 0,
          spend: 0,
          leads: 0
        };
      }
      var agg = googleProvinceAgg[key];
      agg.impressions += parseInt(m.impressions || 0, 10);
      agg.clicks += parseInt(m.clicks || 0, 10);
      agg.spend += parseFloat(m.costMicros || 0) / 1e6;
      agg.leads += Math.round(parseFloat(m.conversions || 0));
    });
    Object.keys(googleProvinceAgg).forEach(function(k) {
      var a = googleProvinceAgg[k];
      out.region.push({
        platform: a.platform,
        account: a.account,
        campaignId: a.campaignId,
        campaignName: a.campaignName,
        region: a.region,
        impressions: a.impressions,
        clicks: a.clicks,
        spend: a.spend,
        results: { leads: a.leads, appInstalls: 0, pageLikes: 0, postReactions: 0, landingPageViews: 0, follows: 0 }
      });
    });
  } catch (e) {
    console.error("Google demo fetch error", e && e.message);
  }
  return out;
}

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 })) return;
  if (!checkAuth(req, res)) return;

  var from = String(req.query.from || "").trim();
  var to = String(req.query.to || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({ error: "from and to required as YYYY-MM-DD" });
  }

  var principal = req.authPrincipal || { role: "admin" };
  // Cache key must include the client's specific campaign allowlist, not just
  // the role tag, otherwise two different clients both hitting role==="client"
  // would share a cache slot and see each other's filtered data. Admin tokens
  // get a shared slot since the unfiltered payload is identical for all admins.
  var scopeKey = principal.role === "client"
    ? (principal.allowedCampaignIds || []).map(String).sort().join(",")
    : "admin";
  var cacheKey = DEMO_CACHE_VERSION + "|" + from + "|" + to + "|" + (principal.role || "admin") + "|" + scopeKey;
  var cached = demoCache[cacheKey];
  if (cached && Date.now() - cached.ts < DEMO_CACHE_TTL_MS) {
    return res.status(200).json(cached.data);
  }

  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;

  try {
    var pulls = await Promise.all([
      metaToken ? fetchMetaDemo(metaToken, from, to) : Promise.resolve({ ageGender: [], region: [], device: [] }),
      ttToken && ttAdvId ? fetchTikTokDemo(ttToken, ttAdvId, from, to) : Promise.resolve({ ageGender: [], region: [], device: [] }),
      fetchGoogleDemo(from, to)
    ]);
    var meta = pulls[0], tt = pulls[1], google = pulls[2];

    // Client-scoped: strip rows for campaigns outside the allowlist.
    if (principal.role === "client") {
      var allowed = {}; (principal.allowedCampaignIds || []).forEach(function(id) {
        var s = String(id);
        allowed[s] = true;
        allowed[s.replace(/_facebook$/, "").replace(/_instagram$/, "")] = true;
      });
      var scope = function(row) { return allowed[String(row.campaignId || "")]; };
      meta = { ageGender: meta.ageGender.filter(scope), region: meta.region.filter(scope), device: meta.device.filter(scope) };
      tt = { ageGender: tt.ageGender.filter(scope), region: tt.region.filter(scope), device: tt.device.filter(scope) };
      google = { ageGender: google.ageGender.filter(scope), region: google.region.filter(scope), device: google.device.filter(scope), city: google.city.filter(scope) };
    }

    var response = {
      from: from, to: to,
      ageGender: [].concat(meta.ageGender, tt.ageGender, google.ageGender),
      region: [].concat(meta.region, tt.region, google.region || []),
      device: [].concat(meta.device, tt.device, google.device),
      googleCity: google.city || []
    };
    demoCache[cacheKey] = { data: response, ts: Date.now() };
    res.status(200).json(response);
  } catch (e) {
    console.error("demographics handler error", e && e.message);
    res.status(500).json({ error: "Demographics fetch failed" });
  }
}
