// Clone-from-live (Create-tab Phase 1b). Reads a live Meta campaign
// (its first ad set + ads) on an ALLOWLISTED account and reverse-maps
// it into the wizard's draft schema so the team can duplicate a setup
// instead of rebuilding it. The result is returned as a draft record
// the frontend loads via applyServerDraft.
//
// Deliberately conservative: only fields that reverse deterministically
// are mapped. Anything Meta does not expose cleanly (the naming inputs
// clientCode / productName / audienceLabel, saved-vs-custom audience
// distinction, image previews) is left blank/best-effort and reported
// in `review[]` so the wizard lands the user on it instead of guessing.
//
// Dates are intentionally blanked (always fresh per run). Names are NOT
// set here; the wizard regenerates them client-side from the convention.
//
// Auth: same checkCreateAuth gate. Account boundary = the existing
// isAccountAllowed allowlist (clone any campaign on an allowed account).

import { rateLimit } from "../_rateLimit.js";
import {
  checkCreateAuth,
  isAccountAllowed,
  getCreateMetaToken,
  ALLOWED_OBJECTIVES,
  META_API_VERSION
} from "../_createAuth.js";

var GRAPH = "https://graph.facebook.com/" + META_API_VERSION;

async function graphGet(path, token) {
  var url = GRAPH + path + (path.indexOf("?") >= 0 ? "&" : "?") + "access_token=" + encodeURIComponent(token);
  var r = await fetch(url);
  var j = await r.json().catch(function(){ return {}; });
  if (!r.ok || (j && j.error)) {
    var msg = (j && j.error && j.error.message) || ("Graph error " + r.status);
    var e = new Error(msg); e.meta = j && j.error; e.status = r.status;
    throw e;
  }
  return j;
}

// Meta budgets come back in minor currency units (cents for ZAR).
function centsToRand(v) {
  var n = parseInt(v, 10);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.round(n / 100);
}

var GEO_TYPE_BY_BUCKET = {
  countries: "country", country_groups: "country_group", regions: "region",
  cities: "city", subcities: "subcity", neighborhoods: "neighborhood",
  zips: "zip", geo_markets: "geo_market", electoral_districts: "electoral_district"
};

function reverseGeoBucket(obj, exclude, out) {
  if (!obj || typeof obj !== "object") return;
  Object.keys(GEO_TYPE_BY_BUCKET).forEach(function(bucket){
    var v = obj[bucket];
    if (!Array.isArray(v) || v.length === 0) return;
    var type = GEO_TYPE_BY_BUCKET[bucket];
    v.forEach(function(entry){
      if (bucket === "countries") {
        out.push({ type: "country", key: String(entry), name: String(entry), exclude: exclude });
      } else if (entry && (entry.key != null)) {
        out.push({ type: type, key: String(entry.key), name: String(entry.name || entry.key), exclude: exclude });
      }
    });
  });
}

function reverseCustomLocations(obj, exclude, out) {
  var cl = obj && obj.custom_locations;
  if (!Array.isArray(cl)) return;
  cl.forEach(function(p){
    if (!p || p.latitude == null || p.longitude == null) return;
    out.push({
      lat: p.latitude, lng: p.longitude,
      radius: p.radius || 15,
      unit: p.distance_unit === "mile" ? "mile" : "km",
      addressString: p.address_string || "",
      exclude: exclude
    });
  });
}

// flexible_spec -> draft.audience.targetingItems [{type,id,name}].
// INT_ONLY keys come back as raw integers (no name).
function reverseFlexibleSpec(flex) {
  var items = [];
  if (!Array.isArray(flex)) return items;
  flex.forEach(function(group){
    if (!group || typeof group !== "object") return;
    Object.keys(group).forEach(function(type){
      var arr = group[type];
      if (!Array.isArray(arr)) return;
      arr.forEach(function(el){
        if (el && typeof el === "object" && el.id != null) {
          items.push({ type: type, id: String(el.id), name: String(el.name || "") });
        } else if (typeof el === "number" || typeof el === "string") {
          items.push({ type: type, id: String(el), name: "" });
        }
      });
    });
  });
  return items;
}

// Pull one creative's editable fields out of a Meta object_story_spec.
function creativeFromStorySpec(spec, adName) {
  var ld = (spec && spec.link_data) || null;
  var vd = (spec && spec.video_data) || null;
  if (vd) {
    return {
      imageHash: vd.image_hash || null,
      videoId: vd.video_id || null,
      headline: vd.title || "",
      primaryText: vd.message || "",
      description: "",
      linkUrl: (vd.call_to_action && vd.call_to_action.value && vd.call_to_action.value.link) || "",
      callToAction: (vd.call_to_action && vd.call_to_action.type) || "LEARN_MORE",
      adName: adName || ""
    };
  }
  if (ld) {
    return {
      imageHash: ld.image_hash || null,
      videoId: null,
      headline: ld.name || "",
      primaryText: ld.message || "",
      description: ld.description || "",
      linkUrl: ld.link || (ld.call_to_action && ld.call_to_action.value && ld.call_to_action.value.link) || "",
      callToAction: (ld.call_to_action && ld.call_to_action.type) || "LEARN_MORE",
      adName: adName || ""
    };
  }
  return null;
}

// Best-effort parse of the naming convention so the user has a starting
// point: Client_Platform_Objective_Product_MonthYear. Always flagged
// for review, never trusted.
function guessFromName(name) {
  var parts = String(name || "").split("_").filter(Boolean);
  if (parts.length >= 4) {
    return { clientCode: parts[0] || "", productName: parts[3] || "" };
  }
  if (parts.length >= 1) return { clientCode: parts[0] || "", productName: "" };
  return { clientCode: "", productName: "" };
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 20 }))) return;

  try {
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    var campaignId = String((body && body.campaignId) || req.query.campaignId || "").trim().replace(/^act_/, "");
    if (!campaignId || !/^\d+$/.test(campaignId)) {
      res.status(400).json({ error: "campaignId (numeric) required" });
      return;
    }

    var token = getCreateMetaToken();
    if (!token) { res.status(500).json({ error: "Meta token not configured" }); return; }

    var review = [];

    // 1. Campaign
    var camp = await graphGet("/" + campaignId + "?fields=id,name,objective,special_ad_categories,daily_budget,lifetime_budget,account_id,status,bid_strategy", token);
    var acctId = "act_" + String(camp.account_id || "").replace(/^act_/, "");
    if (!isAccountAllowed(acctId)) {
      res.status(403).json({ error: "That campaign's ad account is not in the Create-tab allowlist." });
      return;
    }

    var objective = ALLOWED_OBJECTIVES[camp.objective] ? camp.objective : "OUTCOME_TRAFFIC";
    if (!ALLOWED_OBJECTIVES[camp.objective]) {
      review.push("Original objective '" + (camp.objective || "unknown") + "' is not offered in Phase 1. Defaulted to Traffic, confirm Step 1.");
    }
    var specialAdCategories = (Array.isArray(camp.special_ad_categories) ? camp.special_ad_categories : [])
      .filter(function(s){ return s && String(s).toUpperCase() !== "NONE"; });

    // 2. First ad set (the clone target's setup)
    var adsetRes = await graphGet("/" + campaignId + "/adsets?fields=id,name,optimization_goal,billing_event,daily_budget,lifetime_budget,targeting,promoted_object&limit=1", token);
    var adset = (adsetRes.data && adsetRes.data[0]) || null;
    if (!adset) { res.status(422).json({ error: "Campaign has no ad sets to clone from." }); return; }
    var tg = adset.targeting || {};

    // Budget + funding: campaign-level budget => CBO, else ad-set => ABO.
    var funding = "ABO", budgetMode = "daily", dailyBudgetRand = 0, lifetimeBudgetRand = 0;
    if (camp.daily_budget) { funding = "CBO"; budgetMode = "daily"; dailyBudgetRand = centsToRand(camp.daily_budget); }
    else if (camp.lifetime_budget) { funding = "CBO"; budgetMode = "lifetime"; lifetimeBudgetRand = centsToRand(camp.lifetime_budget); }
    else if (adset.daily_budget) { funding = "ABO"; budgetMode = "daily"; dailyBudgetRand = centsToRand(adset.daily_budget); }
    else if (adset.lifetime_budget) { funding = "ABO"; budgetMode = "lifetime"; lifetimeBudgetRand = centsToRand(adset.lifetime_budget); }
    if (!dailyBudgetRand && !lifetimeBudgetRand) review.push("Could not read a budget off the source, set it on Step 4.");

    // Platform mode + placement
    var pubs = Array.isArray(tg.publisher_platforms) ? tg.publisher_platforms : [];
    var platformMode = "fb_ig";
    if (pubs.length === 1 && pubs[0] === "facebook") platformMode = "fb_only";
    else if (pubs.length === 1 && pubs[0] === "instagram") platformMode = "ig_only";
    var manual = !!(tg.facebook_positions || tg.instagram_positions || tg.device_platforms || (pubs.length && pubs.indexOf("audience_network") >= 0));
    var placement = manual ? {
      mode: "manual",
      platforms: pubs.length ? pubs : ["facebook", "instagram"],
      facebookPositions: tg.facebook_positions || [],
      instagramPositions: tg.instagram_positions || [],
      devicePlatforms: tg.device_platforms || ["mobile", "desktop"]
    } : { mode: "advantage" };

    // Audience
    var geos = [];
    reverseGeoBucket(tg.geo_locations, false, geos);
    reverseGeoBucket(tg.excluded_geo_locations, true, geos);
    var customLocations = [];
    reverseCustomLocations(tg.geo_locations, false, customLocations);
    reverseCustomLocations(tg.excluded_geo_locations, true, customLocations);

    var caIds = (Array.isArray(tg.custom_audiences) ? tg.custom_audiences : [])
      .map(function(x){ return x && x.id ? String(x.id) : null; }).filter(Boolean);
    if (caIds.length) review.push(caIds.length + " saved/custom audience(s) carried over by ID. Meta does not say which are saved vs custom, confirm on Step 1.");

    var audience = {
      locations: { geographies: geos, customLocations: customLocations },
      ageMin: tg.age_min || 18,
      ageMax: tg.age_max || 65,
      genders: Array.isArray(tg.genders) ? tg.genders : [],
      customAudienceIds: caIds,
      savedAudienceIds: [],
      targetingItems: reverseFlexibleSpec(tg.flexible_spec),
      advantageAudience: !!(tg.targeting_automation && tg.targeting_automation.advantage_audience === 1),
      audienceLabel: "",
      targetCommunity: false
    };
    review.push("Audience label is a naming input Meta does not store, set it on Step 1 before continuing.");

    // Tracking
    var po = adset.promoted_object || {};
    var pixelId = po.pixel_id ? String(po.pixel_id) : "";
    var conversionEvent = po.custom_event_type ? String(po.custom_event_type) : "";

    // 3. Ads -> creatives + mode
    var adsRes = await graphGet("/" + campaignId + "/ads?fields=id,name,creative{id,object_story_spec,asset_feed_spec}&limit=25", token);
    var ads = (adsRes.data || []).filter(Boolean);
    var creatives = [];
    var adVariants = { headlines: [], primaryTexts: [], descriptions: [] };
    var creativeMode = "single";
    var pageId = "", instagramId = "";

    var afsAd = ads.filter(function(a){ return a.creative && a.creative.asset_feed_spec; })[0];
    var carouselAd = ads.filter(function(a){
      return a.creative && a.creative.object_story_spec && a.creative.object_story_spec.link_data &&
        Array.isArray(a.creative.object_story_spec.link_data.child_attachments);
    })[0];

    if (afsAd) {
      creativeMode = "advantage_plus";
      var afs = afsAd.creative.asset_feed_spec || {};
      var oss = afsAd.creative.object_story_spec || {};
      pageId = oss.page_id || "";
      instagramId = oss.instagram_user_id || "";
      var titles = (afs.titles || []).map(function(t){ return t.text || ""; }).filter(Boolean);
      var bodies = (afs.bodies || []).map(function(t){ return t.text || ""; }).filter(Boolean);
      var descs = (afs.descriptions || []).map(function(t){ return t.text || ""; }).filter(Boolean);
      var imgs = (afs.images || []).map(function(im){ return im.hash; }).filter(Boolean);
      var vids = (afs.videos || []).map(function(v){ return v.video_id; }).filter(Boolean);
      var link = (afs.link_urls && afs.link_urls[0] && afs.link_urls[0].website_url) || "";
      var cta = (afs.call_to_action_types && afs.call_to_action_types[0]) || "LEARN_MORE";
      var maxAssets = Math.max(imgs.length, vids.length, 1);
      for (var ai = 0; ai < maxAssets; ai++) {
        creatives.push({
          imageHash: imgs[ai] || null,
          videoId: vids[ai] || null,
          headline: titles[ai] || titles[0] || "",
          primaryText: bodies[ai] || bodies[0] || "",
          description: descs[ai] || "",
          linkUrl: link,
          callToAction: cta,
          adName: afsAd.name || ""
        });
      }
      adVariants = {
        headlines: titles.slice(0, 5),
        primaryTexts: bodies.slice(0, 5),
        descriptions: descs.slice(0, 5)
      };
      review.push("Advantage+ asset feed rebuilt from its variants. Re-check the creative split on Step 3, image previews need a re-upload (the asset hash is kept so delivery still works).");
    } else if (carouselAd) {
      creativeMode = "carousel";
      var cspec = carouselAd.creative.object_story_spec || {};
      pageId = cspec.page_id || "";
      instagramId = cspec.instagram_user_id || "";
      var parentLd = cspec.link_data || {};
      (parentLd.child_attachments || []).forEach(function(card){
        creatives.push({
          imageHash: card.image_hash || null,
          videoId: null,
          headline: card.name || "",
          primaryText: parentLd.message || "",
          description: card.description || "",
          linkUrl: card.link || parentLd.link || "",
          callToAction: (card.call_to_action && card.call_to_action.type) || (parentLd.call_to_action && parentLd.call_to_action.type) || "LEARN_MORE",
          adName: carouselAd.name || ""
        });
      });
    } else {
      var built = [];
      ads.forEach(function(a){
        var spec = a.creative && a.creative.object_story_spec;
        var c = creativeFromStorySpec(spec, a.name);
        if (c) {
          built.push(c);
          if (!pageId && spec && spec.page_id) pageId = spec.page_id;
          if (!instagramId && spec && spec.instagram_user_id) instagramId = spec.instagram_user_id;
        }
      });
      if (built.length === 0) {
        review.push("Could not reconstruct the creative(s) from the source ad. Rebuild them on Step 3.");
      } else {
        creatives = built;
        creativeMode = built.length > 1 ? "multi" : "single";
      }
    }
    if (creatives.length === 0) {
      creatives = [{ imageHash: null, videoId: null, headline: "", primaryText: "", description: "", linkUrl: "", callToAction: "LEARN_MORE", adName: "" }];
    }
    if (!pageId) review.push("Could not read the Facebook Page off the source creative, reselect it on Step 1.");

    var guess = guessFromName(camp.name);
    review.push("Client name and product are naming inputs, not stored by Meta. Pre-filled a best guess from the old campaign name, confirm on Step 0.");

    var draft = {
      accountId: acctId,
      accountName: "",
      objective: objective,
      specialAdCategories: specialAdCategories,
      clientCode: guess.clientCode,
      productName: guess.productName,
      variant: "",
      platformMode: platformMode,
      pageId: pageId,
      pageName: "",
      instagramId: instagramId,
      audience: audience,
      placement: placement,
      creativeMode: creativeMode,
      creatives: creatives,
      adVariants: adVariants,
      multiAdvertiserAds: false,
      autoSplitByRatio: false,
      funding: funding,
      budgetMode: budgetMode,
      dailyBudgetRand: dailyBudgetRand,
      lifetimeBudgetRand: lifetimeBudgetRand,
      startDate: "",
      endDate: "",
      pixelId: pixelId,
      conversionEvent: conversionEvent,
      urlTags: ""
    };

    res.status(200).json({
      ok: true,
      // Shaped like a draft record so the frontend loads it via the
      // same applyServerDraft path. id "" => not yet a saved shared
      // draft (the user reviews, then explicitly Saves).
      draft: { id: "", name: "Clone of " + (camp.name || campaignId), step: 0, draft: draft },
      review: review,
      source: { campaignId: campaignId, campaignName: camp.name || "", accountId: acctId, status: camp.status || "" }
    });
  } catch (err) {
    console.error("clone endpoint error", err);
    var code = err && err.status === 404 ? 404 : 502;
    res.status(code).json({ error: String(err && err.message || err), meta: err && err.meta });
  }
}
