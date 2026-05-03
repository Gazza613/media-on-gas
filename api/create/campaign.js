// The big one. Wizard submits the full draft state and this endpoint walks
// through Meta's three-tier hierarchy:
//
//   1. Validate JWT (checkCreateAuth)
//   2. Validate accountId is in CREATE_TAB_ALLOWED_ACCOUNTS (server-side, not
//      just client filtering)
//   3. Validate budget per level (CBO at campaign, ABO at adset) <= ceiling
//   4. Force status:"PAUSED" at every level — campaign body status is ignored
//   5. POST campaign → adset → 1..N (creative + ad). On failure the previous
//      resources stay around as orphan PAUSED objects (same as Ads Manager
//      does, recoverable via Meta UI).
//   6. Best-effort Gmail draft to gary@gasmarketing.co.za. If Gmail OAuth env
//      vars are missing, the draft step is skipped and we still return success.
//
// All campaigns created here are PAUSED. To go live, the team unpauses in
// Meta Ads Manager. There is no "create live" path in Phase 1.

import { rateLimit } from "../_rateLimit.js";
import {
  checkCreateAuth,
  isAccountAllowed,
  getCreateMetaToken,
  MAX_DAILY_BUDGET_CENTS,
  ALLOWED_OBJECTIVES,
  META_API_VERSION
} from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};

  var v = validate(body);
  if (v.error) { res.status(400).json({ error: v.error }); return; }
  var p = v.payload;

  var graphBase = "https://graph.facebook.com/" + META_API_VERSION;
  var acct = encodeURIComponent(p.accountId);

  try {
    // ----- 1. Campaign --------------------------------------------------
    // Budget routing: CBO holds the budget at campaign level and shares it
    // across (potential future) ad sets. ABO holds budget at the ad set
    // level and the campaign itself has no budget. The wizard ships one
    // ad set today, but using the right shape now makes adding more ad
    // sets later a no-op rather than a re-architecture.
    var campForm = new URLSearchParams();
    campForm.set("name", p.campaignName);
    campForm.set("objective", p.objective);
    campForm.set("status", "PAUSED");
    campForm.set("special_ad_categories", JSON.stringify(p.specialAdCategories || []));
    campForm.set("buying_type", "AUCTION");
    if (p.funding === "CBO") {
      if (p.budgetMode === "lifetime") {
        campForm.set("lifetime_budget", String(p.lifetimeBudgetCents));
      } else {
        campForm.set("daily_budget", String(p.dailyBudgetCents));
      }
      campForm.set("is_adset_budget_sharing_enabled", "true");
      // Bid strategy must live at the campaign level when CBO is on, otherwise
      // Meta rejects with "ad set bid strategy needed for CBO".
      campForm.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
    } else {
      // Meta v25 made this mandatory whenever the campaign doesn't carry a
      // CBO budget. Explicit false satisfies the validator.
      campForm.set("is_adset_budget_sharing_enabled", "false");
    }
    campForm.set("access_token", token);

    var campRes = await fetch(graphBase + "/" + acct + "/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: campForm.toString()
    });
    var campData = await campRes.json();
    if (!campRes.ok || !campData.id) {
      return fail(res, 502, "Campaign create failed", campData, null, scrubForm(campForm));
    }
    var campaignId = campData.id;

    // ----- 2. Ad Set ----------------------------------------------------
    var goal = ALLOWED_OBJECTIVES[p.objective];
    var targeting = buildTargeting(p);
    var adsetForm = new URLSearchParams();
    adsetForm.set("name", p.adsetName);
    adsetForm.set("campaign_id", campaignId);
    if (p.funding === "ABO") {
      if (p.budgetMode === "lifetime") {
        adsetForm.set("lifetime_budget", String(p.lifetimeBudgetCents));
      } else {
        adsetForm.set("daily_budget", String(p.dailyBudgetCents));
      }
      adsetForm.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
    }
    adsetForm.set("billing_event", goal.billing_event);
    adsetForm.set("optimization_goal", goal.optimization_goal);
    adsetForm.set("targeting", JSON.stringify(targeting));
    adsetForm.set("start_time", p.startTimeIso);
    if (p.endTimeIso) adsetForm.set("end_time", p.endTimeIso);
    adsetForm.set("status", "PAUSED");
    if (p.objective === "OUTCOME_SALES" && p.pixelId) {
      adsetForm.set("promoted_object", JSON.stringify({
        pixel_id: p.pixelId,
        custom_event_type: p.conversionEvent || "PURCHASE"
      }));
    } else if (p.objective === "OUTCOME_LEADS" && p.pageId) {
      adsetForm.set("promoted_object", JSON.stringify({ page_id: p.pageId }));
    }
    adsetForm.set("access_token", token);

    var adsetRes = await fetch(graphBase + "/" + acct + "/adsets", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adsetForm.toString()
    });
    var adsetData = await adsetRes.json();
    if (!adsetRes.ok || !adsetData.id) {
      return fail(res, 502, "Ad set create failed (campaign was created, paused)", adsetData,
        { campaignId: campaignId },
        scrubForm(adsetForm));
    }
    var adsetId = adsetData.id;

    // ----- 3. Creative + Ad (per creative, or one carousel) -------------
    // Three modes:
    //   single   → one creative, one ad. Same as old behaviour.
    //   multi    → N creatives, N ads under the same ad set. Meta will
    //              rotate / optimise between them.
    //   carousel → one creative with N child cards, one ad. Each card has
    //              its own image_hash + headline + link.
    var creativesPosted = [];   // [{ creativeId, adId, name }]
    if (p.creativeMode === "carousel") {
      var carouselBody = buildCarouselCreative(p);
      var crForm = creativeFormFromBody(carouselBody, p, token, p.creatives[0].adName);
      var crRes = await fetch(graphBase + "/" + acct + "/adcreatives", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: crForm.toString()
      });
      var crData = await crRes.json();
      if (!crRes.ok || !crData.id) {
        return fail(res, 502, "Carousel creative create failed (campaign + adset were created, paused)", crData,
          { campaignId: campaignId, adsetId: adsetId },
          scrubForm(crForm));
      }
      var ad = await postAd(graphBase, acct, token, p.creatives[0].adName, adsetId, crData.id, p);
      if (ad.error) {
        return fail(res, 502, "Ad create failed (carousel creative was created, paused)", ad.detail,
          { campaignId: campaignId, adsetId: adsetId, creativeId: crData.id },
          ad.scrubbed);
      }
      creativesPosted.push({ creativeId: crData.id, adId: ad.id, name: p.creatives[0].adName });
    } else {
      // single OR multi — same loop, just len === 1 for single
      for (var i = 0; i < p.creatives.length; i++) {
        var cr = p.creatives[i];
        var creativeBody = buildSingleCreative(cr, p);
        var form = creativeFormFromBody(creativeBody, p, token, cr.adName);
        var res2 = await fetch(graphBase + "/" + acct + "/adcreatives", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString()
        });
        var data2 = await res2.json();
        if (!res2.ok || !data2.id) {
          return fail(res, 502, "Creative create failed for ad #" + (i + 1) + " (" + cr.adName + ")", data2,
            { campaignId: campaignId, adsetId: adsetId, creativesPosted: creativesPosted },
            scrubForm(form));
        }
        var adRes = await postAd(graphBase, acct, token, cr.adName, adsetId, data2.id, p);
        if (adRes.error) {
          return fail(res, 502, "Ad create failed for ad #" + (i + 1) + " (" + cr.adName + ")", adRes.detail,
            { campaignId: campaignId, adsetId: adsetId, creativesPosted: creativesPosted, lastCreativeId: data2.id },
            adRes.scrubbed);
        }
        creativesPosted.push({ creativeId: data2.id, adId: adRes.id, name: cr.adName });
      }
    }

    // ----- 4. Email draft (best-effort) --------------------------------
    var draftResult = { skipped: true, reason: "GMAIL_* env vars not set" };
    try {
      draftResult = await tryCreateGmailDraft({
        campaignId: campaignId, adsetId: adsetId,
        ads: creativesPosted,
        accountId: p.accountId, accountName: p.accountName || p.accountId,
        campaignName: p.campaignName, adsetName: p.adsetName, objective: p.objective,
        funding: p.funding, budgetMode: p.budgetMode,
        dailyBudgetCents: p.dailyBudgetCents, lifetimeBudgetCents: p.lifetimeBudgetCents,
        startTimeIso: p.startTimeIso, endTimeIso: p.endTimeIso,
        audienceSummary: summariseAudience(p)
      });
    } catch (e) {
      draftResult = { skipped: true, reason: "draft error: " + (e && e.message || "unknown") };
    }

    res.status(200).json({
      ok: true,
      campaignId: campaignId,
      adsetId: adsetId,
      ads: creativesPosted,
      // Back-compat fields the existing success screen reads. Kept until the
      // frontend switches to the ads[] array fully.
      adId: creativesPosted.length ? creativesPosted[0].adId : null,
      creativeId: creativesPosted.length ? creativesPosted[0].creativeId : null,
      status: "PAUSED",
      adsManagerUrl: "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=" +
                     encodeURIComponent(p.accountId.replace(/^act_/, "")) +
                     "&selected_campaign_ids=" + encodeURIComponent(campaignId),
      emailDraft: draftResult
    });
  } catch (e) {
    console.error("[create/campaign] unexpected:", e && e.stack || e);
    res.status(500).json({ error: "Unexpected error during campaign creation" });
  }
}

// ---------------------------------------------------------------------------

async function postAd(graphBase, acct, token, adName, adsetId, creativeId, p) {
  var adForm = new URLSearchParams();
  adForm.set("name", adName);
  adForm.set("adset_id", adsetId);
  adForm.set("creative", JSON.stringify({ creative_id: creativeId }));
  adForm.set("status", "PAUSED");
  // Multi-advertiser ads default OFF — explicit OPT_OUT so Meta doesn't fall
  // back to account-level defaults that may have it enabled. Premium brands
  // get bundled with strangers' ads in Reels carousels otherwise, which is
  // bad for client perception even if it nudges reach up.
  if (p.multiAdvertiserAds === false) {
    adForm.set("contextual_multi_ads", JSON.stringify({ enroll_status: "OPT_OUT" }));
  }
  adForm.set("access_token", token);
  if (p.urlTags) adForm.set("tracking_specs", JSON.stringify([]));

  var r = await fetch(graphBase + "/" + acct + "/ads", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: adForm.toString()
  });
  var d = await r.json();
  if (!r.ok || !d.id) {
    return { error: true, detail: d, scrubbed: scrubForm(adForm) };
  }
  return { id: d.id };
}

function creativeFormFromBody(body, p, token, name) {
  var form = new URLSearchParams();
  form.set("name", name + " - Creative");
  Object.keys(body).forEach(function(k){
    form.set(k, typeof body[k] === "string" ? body[k] : JSON.stringify(body[k]));
  });
  form.set("access_token", token);
  return form;
}

function fail(res, code, msg, detail, ids, sentForm) {
  return res.status(code).json({
    error: msg,
    meta: detail && detail.error || detail || null,
    partial: ids || null,
    sent: sentForm || null
  });
}

// Pull a URLSearchParams form back into a plain object for echoing in error
// responses, dropping the access_token so it doesn't bounce through logs or
// browser DevTools.
function scrubForm(form) {
  if (!form) return null;
  var out = {};
  form.forEach(function(v, k){ if (k !== "access_token") out[k] = v; });
  return out;
}

function validate(b) {
  if (!b.accountId || !isAccountAllowed(b.accountId)) return { error: "accountId missing or not in allowlist" };
  if (!ALLOWED_OBJECTIVES[b.objective]) return { error: "objective not allowed for Phase 1" };
  if (!b.campaignName || String(b.campaignName).length < 3) return { error: "campaignName too short" };
  if (!b.adsetName || String(b.adsetName).length < 3) return { error: "adsetName too short" };
  if (!b.pageId) return { error: "pageId required" };

  var funding = b.funding === "CBO" ? "CBO" : "ABO";
  var budgetMode = b.budgetMode === "lifetime" ? "lifetime" : "daily";
  var dailyBudgetCents = 0;
  var lifetimeBudgetCents = 0;

  if (budgetMode === "daily") {
    dailyBudgetCents = parseInt(b.dailyBudgetCents, 10);
    if (!isFinite(dailyBudgetCents) || dailyBudgetCents <= 0) return { error: "dailyBudgetCents must be a positive integer" };
    if (dailyBudgetCents > MAX_DAILY_BUDGET_CENTS) {
      return { error: "dailyBudgetCents exceeds R" + (MAX_DAILY_BUDGET_CENTS / 100).toFixed(0) + " ceiling" };
    }
  } else {
    lifetimeBudgetCents = parseInt(b.lifetimeBudgetCents, 10);
    if (!isFinite(lifetimeBudgetCents) || lifetimeBudgetCents <= 0) return { error: "lifetimeBudgetCents must be a positive integer" };
    if (!b.endDate) return { error: "endDate required when budgetMode is lifetime" };
    var lStart = Date.parse(isoFromDate(b.startDate) || "");
    var lEnd = Date.parse(isoFromDate(b.endDate, true) || "");
    var days = (isFinite(lStart) && isFinite(lEnd) && lEnd > lStart)
      ? Math.max(1, Math.ceil((lEnd - lStart) / (24 * 60 * 60 * 1000)))
      : 1;
    var lifetimeCeiling = MAX_DAILY_BUDGET_CENTS * days;
    if (lifetimeBudgetCents > lifetimeCeiling) {
      return { error: "lifetimeBudgetCents exceeds R" + (lifetimeCeiling / 100).toFixed(0) +
        " ceiling (R" + (MAX_DAILY_BUDGET_CENTS / 100).toFixed(0) + " × " + days + " days)" };
    }
  }

  var startIso = isoFromDate(b.startDate);
  if (!startIso) return { error: "startDate invalid (YYYY-MM-DD)" };
  // Hard-set 08:00 SAST on the picked date. If that 08:00 is already in the
  // past (e.g. team scheduling at 14:00 for "today"), bump to now + 15 min in
  // SAST so Meta accepts; otherwise leave it at 08:00 as the team requested.
  var nowMs = Date.now();
  var startMs = Date.parse(startIso);
  if (isFinite(startMs) && startMs < nowMs + 5 * 60 * 1000) {
    startIso = formatSastIso(new Date(nowMs + 15 * 60 * 1000));
  }
  var endIso = b.endDate ? isoFromDate(b.endDate, true) : null;
  if (b.endDate && !endIso) return { error: "endDate invalid (YYYY-MM-DD)" };

  // Creative validation. Three modes; per-mode rules differ.
  var creativeMode = ["single", "multi", "carousel"].indexOf(b.creativeMode) >= 0 ? b.creativeMode : "single";
  if (!Array.isArray(b.creatives) || b.creatives.length === 0) {
    return { error: "creatives[] missing — at least one creative required" };
  }
  if (creativeMode === "carousel") {
    if (b.creatives.length < 2) return { error: "carousel needs at least 2 cards" };
    if (b.creatives.length > 10) return { error: "carousel maximum is 10 cards" };
  }
  for (var i = 0; i < b.creatives.length; i++) {
    var c = b.creatives[i];
    if (!c) return { error: "creative #" + (i + 1) + " missing" };
    if (creativeMode === "carousel") {
      // Each card needs an image_hash, link, name (headline). primaryText/CTA
      // live at the parent creative level for carousel.
      if (!c.imageHash) return { error: "carousel card #" + (i + 1) + " missing imageHash" };
      if (!c.headline) return { error: "carousel card #" + (i + 1) + " missing headline" };
      if (!c.linkUrl) return { error: "carousel card #" + (i + 1) + " missing linkUrl" };
    } else {
      var hasImage = !!c.imageHash;
      var hasVideo = !!c.videoId;
      if (hasImage === hasVideo) return { error: "creative #" + (i + 1) + ": imageHash XOR videoId required" };
      if (!c.headline) return { error: "creative #" + (i + 1) + ": headline required" };
      if (!c.primaryText) return { error: "creative #" + (i + 1) + ": primaryText required" };
      if (!c.linkUrl) return { error: "creative #" + (i + 1) + ": linkUrl required" };
    }
    if (!c.adName || String(c.adName).length < 3) return { error: "creative #" + (i + 1) + ": adName required" };
  }

  return {
    payload: {
      accountId: String(b.accountId),
      accountName: b.accountName ? String(b.accountName) : null,
      objective: b.objective,
      specialAdCategories: Array.isArray(b.specialAdCategories) ? b.specialAdCategories : [],
      campaignName: String(b.campaignName).slice(0, 200),
      adsetName: String(b.adsetName).slice(0, 200),
      pageId: String(b.pageId),
      instagramId: b.instagramId ? String(b.instagramId) : null,
      pixelId: b.pixelId ? String(b.pixelId) : null,
      conversionEvent: b.conversionEvent ? String(b.conversionEvent) : null,
      urlTags: b.urlTags ? String(b.urlTags) : null,
      funding: funding,
      budgetMode: budgetMode,
      dailyBudgetCents: dailyBudgetCents,
      lifetimeBudgetCents: lifetimeBudgetCents,
      startTimeIso: startIso,
      endTimeIso: endIso,
      platformMode: ["fb_only", "fb_ig", "ig_only"].indexOf(b.platformMode) >= 0 ? b.platformMode : "fb_ig",
      audience: b.audience || {},
      placement: b.placement || { mode: "advantage" },
      multiAdvertiserAds: b.multiAdvertiserAds === true ? true : false,
      creativeMode: creativeMode,
      creatives: b.creatives.map(function(c){
        return {
          imageHash: c.imageHash || null,
          videoId: c.videoId || null,
          headline: String(c.headline || "").slice(0, 200),
          primaryText: String(c.primaryText || "").slice(0, 1500),
          description: c.description ? String(c.description).slice(0, 200) : null,
          linkUrl: String(c.linkUrl || ""),
          callToAction: c.callToAction ? String(c.callToAction) : "LEARN_MORE",
          adName: String(c.adName || "").slice(0, 200)
        };
      })
    }
  };
}

function isoFromDate(s, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  // SAST is UTC+2 with no DST. Hard 08:00 launch on every campaign per team
  // policy, so the team gets a predictable serving window. End-of-day is
  // 23:59:59 for lifetime budget windows.
  return s + (endOfDay ? "T23:59:59+0200" : "T08:00:00+0200");
}

function formatSastIso(date) {
  var sast = new Date(date.getTime() + 2 * 60 * 60 * 1000);
  var pad = function(n){ return n < 10 ? "0" + n : "" + n; };
  return sast.getUTCFullYear() + "-" +
         pad(sast.getUTCMonth() + 1) + "-" +
         pad(sast.getUTCDate()) + "T" +
         pad(sast.getUTCHours()) + ":" +
         pad(sast.getUTCMinutes()) + ":" +
         pad(sast.getUTCSeconds()) + "+0200";
}

function buildTargeting(p) {
  var a = p.audience || {};
  var geo = {};
  var excludedGeo = {};
  var typeMap = {
    country: "countries",
    country_group: "country_groups",
    region: "regions",
    city: "cities",
    subcity: "subcities",
    neighborhood: "neighborhoods",
    zip: "zips",
    geo_market: "geo_markets",
    electoral_district: "electoral_districts"
  };
  if (a.locations && (a.locations.geographies || a.locations.customLocations)) {
    var geographies = a.locations.geographies || [];
    var customLocations = a.locations.customLocations || [];
    geographies.forEach(function(g){
      if (!g || !g.key) return;
      var bucket = typeMap[g.type];
      if (!bucket) return;
      var dest = g.exclude ? excludedGeo : geo;
      if (bucket === "countries") {
        dest.countries = dest.countries || [];
        dest.countries.push(g.key);
      } else {
        dest[bucket] = dest[bucket] || [];
        dest[bucket].push({ key: String(g.key), name: g.name || "" });
      }
    });
    customLocations.forEach(function(pin){
      var radius = parseFloat(pin.radius);
      if (!isFinite(radius) || radius <= 0) radius = 15;
      var entry = {
        latitude: parseFloat(pin.lat),
        longitude: parseFloat(pin.lng),
        radius: Math.min(80, Math.max(1, radius)),
        distance_unit: pin.unit === "mile" ? "mile" : "kilometer",
        address_string: pin.addressString ? String(pin.addressString).slice(0, 200) : ""
      };
      if (!isFinite(entry.latitude) || !isFinite(entry.longitude)) return;
      var dest = pin.exclude ? excludedGeo : geo;
      dest.custom_locations = dest.custom_locations || [];
      dest.custom_locations.push(entry);
    });
  }
  var hasFinerInclude = (geo.regions && geo.regions.length) ||
                        (geo.cities && geo.cities.length) ||
                        (geo.zips && geo.zips.length) ||
                        (geo.subcities && geo.subcities.length) ||
                        (geo.neighborhoods && geo.neighborhoods.length) ||
                        (geo.custom_locations && geo.custom_locations.length);
  var hasAnyGeo = (geo.countries && geo.countries.length) || hasFinerInclude;
  if (!hasAnyGeo) {
    var legacyCountries = (a.countries && a.countries.length) ? a.countries : ["ZA"];
    geo.countries = legacyCountries;
  }
  if (hasFinerInclude && geo.countries) {
    delete geo.countries;
  }

  var t = {
    geo_locations: geo,
    age_min: a.ageMin || 18,
    age_max: a.ageMax || 65
  };
  var hasExclusions = Object.keys(excludedGeo).some(function(k){
    var v = excludedGeo[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  if (hasExclusions) t.excluded_geo_locations = excludedGeo;
  if (a.advantageAudience) t.targeting_automation = { advantage_audience: 1 };
  if (a.genders && a.genders.length) t.genders = a.genders;

  // Saved + custom audiences both go into targeting.custom_audiences. Meta's
  // API doesn't distinguish — saved audiences resolve to a saved set of
  // criteria, custom audiences resolve to a person list, both sit in the
  // same field once selected.
  var caIds = [];
  if (Array.isArray(a.customAudienceIds)) {
    a.customAudienceIds.forEach(function(id){ if (id) caIds.push({ id: String(id) }); });
  }
  if (Array.isArray(a.savedAudienceIds)) {
    a.savedAudienceIds.forEach(function(id){ if (id) caIds.push({ id: String(id) }); });
  }
  if (caIds.length) t.custom_audiences = caIds;

  // Engaged community: page fans go via connections[] which is a hard
  // include-only filter ("must be a fan of this page AND match the rest").
  // For IG followers there is no equivalent connections target — Meta
  // requires a Custom Audience for that, which the wizard prompts users
  // to build in Ads Manager and then pick via the Saved Audiences picker.
  if (a.targetCommunity && a.targetCommunity.fans && p.pageId) {
    t.connections = [String(p.pageId)];
  }

  if (a.flexibleSpec) {
    t.flexible_spec = a.flexibleSpec;
  } else if (Array.isArray(a.targetingItems) && a.targetingItems.length > 0) {
    var grouped = {};
    a.targetingItems.forEach(function(item){
      if (!item || !item.id || !item.type) return;
      var key = item.type;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({ id: String(item.id), name: String(item.name || "") });
    });
    if (Object.keys(grouped).length > 0) {
      t.flexible_spec = [grouped];
    }
  }

  // Defensive position sanitisation for deprecations + ad-creative-format
  // mismatches. Audience Network rewarded_video requires a video creative;
  // strip it when the campaign is image-only so the ad set doesn't ship with
  // a permanently-undeliverable placement that confuses the team.
  var imageOnly = (p.creatives || []).every(function(c){ return c.imageHash && !c.videoId; });
  var DEPRECATED_POSITIONS = { facebook: ["video_feeds"], instagram: [] };
  var sanitisePositions = function(arr, plat){
    if (!arr) return arr;
    var dep = DEPRECATED_POSITIONS[plat] || [];
    return arr.filter(function(x){ return dep.indexOf(x) < 0; });
  };
  var pl = p.placement || {};
  if (p.platformMode === "fb_only") {
    t.publisher_platforms = ["facebook"];
    if (pl.mode === "manual" && pl.facebookPositions) t.facebook_positions = sanitisePositions(pl.facebookPositions, "facebook");
    if (pl.mode === "manual") t.device_platforms = pl.devicePlatforms || ["mobile", "desktop"];
  } else if (p.platformMode === "ig_only") {
    t.publisher_platforms = ["instagram"];
    if (pl.mode === "manual" && pl.instagramPositions) t.instagram_positions = sanitisePositions(pl.instagramPositions, "instagram");
    if (pl.mode === "manual") t.device_platforms = pl.devicePlatforms || ["mobile", "desktop"];
  } else if (pl.mode === "manual") {
    t.publisher_platforms = pl.platforms || ["facebook", "instagram"];
    if (pl.facebookPositions) t.facebook_positions = sanitisePositions(pl.facebookPositions, "facebook");
    if (pl.instagramPositions) t.instagram_positions = sanitisePositions(pl.instagramPositions, "instagram");
    t.device_platforms = pl.devicePlatforms || ["mobile", "desktop"];
  }

  // Exclude AN rewarded_video positions when image-only. Only relevant when
  // Audience Network is in play (manual mode only — Advantage+ handles its
  // own incompatibilities).
  if (imageOnly && pl.mode === "manual" && (pl.platforms || []).indexOf("audience_network") >= 0) {
    t.audience_network_positions = ["classic", "instream_video"]; // omit rewarded_video
  }

  return t;
}

function buildSingleCreative(c, p) {
  var storySpec = { page_id: p.pageId };
  if (p.instagramId) storySpec.instagram_user_id = p.instagramId;

  if (c.videoId) {
    storySpec.video_data = {
      video_id: c.videoId,
      title: c.headline,
      message: c.primaryText,
      call_to_action: { type: c.callToAction, value: { link: c.linkUrl } }
    };
  } else {
    storySpec.link_data = {
      image_hash: c.imageHash,
      link: c.linkUrl,
      message: c.primaryText,
      name: c.headline,
      description: c.description || undefined,
      call_to_action: { type: c.callToAction, value: { link: c.linkUrl } }
    };
  }
  return { object_story_spec: storySpec };
}

function buildCarouselCreative(p) {
  // Carousel uses a single object_story_spec with link_data.child_attachments[]
  // — each child is one card. The parent link_data carries the primary text
  // (message) and the default CTA; cards each carry their own headline,
  // description, image_hash and link.
  var first = p.creatives[0];
  var storySpec = { page_id: p.pageId };
  if (p.instagramId) storySpec.instagram_user_id = p.instagramId;
  storySpec.link_data = {
    link: first.linkUrl,
    message: first.primaryText,
    call_to_action: { type: first.callToAction, value: { link: first.linkUrl } },
    child_attachments: p.creatives.map(function(c){
      var card = {
        link: c.linkUrl,
        image_hash: c.imageHash,
        name: c.headline,
        call_to_action: { type: c.callToAction || first.callToAction, value: { link: c.linkUrl } }
      };
      if (c.description) card.description = c.description;
      return card;
    })
  };
  return { object_story_spec: storySpec };
}

function summariseAudience(p) {
  var a = p.audience || {};
  var bits = [];
  bits.push("Geo: " + ((a.locations && (a.locations.geographies || []).filter(function(g){return !g.exclude;}).map(function(g){return g.name;}).join(",")) || "ZA"));
  bits.push("Age: " + (a.ageMin || 18) + "-" + (a.ageMax || 65));
  if (a.genders && a.genders.length) bits.push("Gender: " + a.genders.join(","));
  if (a.savedAudienceIds && a.savedAudienceIds.length) bits.push("Saved/CA: " + a.savedAudienceIds.length + " selected");
  if (a.targetCommunity && a.targetCommunity.fans) bits.push("+ Page fans only");
  var pl = p.placement || {};
  bits.push("Placement: " + (pl.mode === "manual" ? "Manual" : "Advantage+"));
  return bits.join(" | ");
}

// ---------------------------------------------------------------------------
// Gmail draft, OAuth refresh-token flow.
async function tryCreateGmailDraft(p) {
  var cid = process.env.GMAIL_CLIENT_ID;
  var secret = process.env.GMAIL_CLIENT_SECRET;
  var refresh = process.env.GMAIL_REFRESH_TOKEN;
  if (!cid || !secret || !refresh) return { skipped: true, reason: "GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN not all set" };

  var tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "client_id=" + encodeURIComponent(cid) +
          "&client_secret=" + encodeURIComponent(secret) +
          "&refresh_token=" + encodeURIComponent(refresh) +
          "&grant_type=refresh_token"
  });
  var tokData = await tokRes.json();
  if (!tokRes.ok || !tokData.access_token) {
    return { skipped: true, reason: "Could not refresh Gmail token" };
  }

  var budgetLine = p.budgetMode === "lifetime"
    ? "Lifetime budget: R" + (p.lifetimeBudgetCents / 100).toFixed(2) + " (" + p.funding + ")"
    : "Daily budget:    R" + (p.dailyBudgetCents / 100).toFixed(2) + " (" + p.funding + ")";

  var adsBlock = (p.ads || []).map(function(a, i){
    return "  ad #" + (i + 1) + " (" + a.name + ") = " + a.adId;
  }).join("\n");

  var subj = "[CREATE TAB] Campaign created, " + p.campaignName + ", " + p.accountName;
  var bodyText =
    "A new campaign was created via the Create tab and is currently PAUSED.\n\n" +
    "Campaign:        " + p.campaignName + "\n" +
    "Ad set:          " + p.adsetName + "\n" +
    "Account:         " + p.accountName + " (" + p.accountId + ")\n" +
    "Objective:       " + p.objective + "\n" +
    budgetLine + "\n" +
    "Start:           " + p.startTimeIso + "\n" +
    "End:             " + (p.endTimeIso || "(no end date)") + "\n" +
    "Audience:        " + p.audienceSummary + "\n" +
    "Status:          PAUSED at all three levels\n\n" +
    "IDs:\n" +
    "  campaign_id = " + p.campaignId + "\n" +
    "  adset_id    = " + p.adsetId + "\n" +
    adsBlock + "\n\n" +
    "Open in Ads Manager:\n" +
    "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=" +
      p.accountId.replace(/^act_/, "") +
      "&selected_campaign_ids=" + p.campaignId + "\n\n" +
    "Review and unpause when ready.\n";

  var rfc822 =
    "To: gary@gasmarketing.co.za\r\n" +
    "Subject: " + subj + "\r\n" +
    "MIME-Version: 1.0\r\n" +
    "Content-Type: text/plain; charset=UTF-8\r\n" +
    "\r\n" + bodyText;

  var raw = Buffer.from(rfc822, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  var dRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + tokData.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message: { raw: raw } })
  });
  var dData = await dRes.json();
  if (!dRes.ok || !dData.id) {
    return { skipped: true, reason: "Gmail draft API rejected: " + ((dData && dData.error && dData.error.message) || "unknown") };
  }
  return { ok: true, draftId: dData.id };
}
