// The big one. Wizard submits the full draft state and this endpoint walks
// through Meta's three-tier hierarchy:
//
//   1. Validate JWT (checkCreateAuth)
//   2. Validate accountId is in CREATE_TAB_ALLOWED_ACCOUNTS (server-side, not
//      just client filtering)
//   3. Validate daily_budget <= MAX_DAILY_BUDGET_CENTS (R5,000)
//   4. Force status:"PAUSED" at every level — campaign body status is ignored
//   5. POST campaign → adset → adcreative → ad. Each step is a separate Meta
//      call; on failure the previous resources stay around as orphan PAUSED
//      objects (same as Ads Manager does, recoverable via Meta UI).
//   6. Best-effort Gmail draft to gary@gasmarketing.co.za. If Gmail OAuth env
//      vars are missing, the draft step is skipped and we still return success
//      — the campaign exists and is paused, an email is icing.
//
// All campaigns created here are PAUSED. To go live, Gary unpauses in Meta
// Ads Manager. There is no "create live" path in Phase 1.

import { rateLimit } from "../_rateLimit.js";
import {
  checkCreateAuth,
  isAccountAllowed,
  MAX_DAILY_BUDGET_CENTS,
  ALLOWED_OBJECTIVES,
  META_API_VERSION
} from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;

  var token = process.env.META_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: "META_ACCESS_TOKEN not set" }); return; }

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
    var campForm = new URLSearchParams();
    campForm.set("name", p.campaignName);
    campForm.set("objective", p.objective);
    campForm.set("status", "PAUSED");
    campForm.set("special_ad_categories", JSON.stringify(p.specialAdCategories || []));
    campForm.set("buying_type", "AUCTION");
    // Meta v25.0 made this mandatory whenever the campaign doesn't carry a
    // CBO budget. We hold budgets at the ad-set level (one ad set per campaign
    // in this wizard), so sharing is off — explicit false satisfies the
    // validator without changing pacing behaviour.
    campForm.set("is_adset_budget_sharing_enabled", "false");
    campForm.set("access_token", token);

    var campRes = await fetch(graphBase + "/" + acct + "/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: campForm.toString()
    });
    var campData = await campRes.json();
    if (!campRes.ok || !campData.id) {
      return fail(res, 502, "Campaign create failed", campData);
    }
    var campaignId = campData.id;

    // ----- 2. Ad Set ----------------------------------------------------
    var goal = ALLOWED_OBJECTIVES[p.objective];
    var targeting = buildTargeting(p);
    var adsetForm = new URLSearchParams();
    adsetForm.set("name", p.campaignName + " - AdSet");
    adsetForm.set("campaign_id", campaignId);
    adsetForm.set("daily_budget", String(p.dailyBudgetCents));
    adsetForm.set("billing_event", goal.billing_event);
    adsetForm.set("optimization_goal", goal.optimization_goal);
    adsetForm.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
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
      return fail(res, 502, "Ad set create failed (campaign was created, paused)", adsetData, { campaignId: campaignId });
    }
    var adsetId = adsetData.id;

    // ----- 3. Ad Creative ----------------------------------------------
    var creativeBody = buildCreative(p);
    var creativeForm = new URLSearchParams();
    creativeForm.set("name", p.campaignName + " - Creative");
    Object.keys(creativeBody).forEach(function(k){
      creativeForm.set(k, typeof creativeBody[k] === "string" ? creativeBody[k] : JSON.stringify(creativeBody[k]));
    });
    creativeForm.set("access_token", token);

    var crRes = await fetch(graphBase + "/" + acct + "/adcreatives", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: creativeForm.toString()
    });
    var crData = await crRes.json();
    if (!crRes.ok || !crData.id) {
      return fail(res, 502, "Ad creative create failed (campaign + adset were created, paused)", crData,
        { campaignId: campaignId, adsetId: adsetId });
    }
    var creativeId = crData.id;

    // ----- 4. Ad --------------------------------------------------------
    var adForm = new URLSearchParams();
    adForm.set("name", p.campaignName + " - Ad");
    adForm.set("adset_id", adsetId);
    adForm.set("creative", JSON.stringify({ creative_id: creativeId }));
    adForm.set("status", "PAUSED");
    adForm.set("access_token", token);
    if (p.urlTags) adForm.set("tracking_specs", JSON.stringify([]));

    var adRes = await fetch(graphBase + "/" + acct + "/ads", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adForm.toString()
    });
    var adData = await adRes.json();
    if (!adRes.ok || !adData.id) {
      return fail(res, 502, "Ad create failed (campaign + adset + creative were created, paused)", adData,
        { campaignId: campaignId, adsetId: adsetId, creativeId: creativeId });
    }
    var adId = adData.id;

    // ----- 5. Email draft (best-effort) --------------------------------
    var draftResult = { skipped: true, reason: "GMAIL_* env vars not set" };
    try {
      draftResult = await tryCreateGmailDraft({
        campaignId: campaignId, adsetId: adsetId, adId: adId,
        accountId: p.accountId, accountName: p.accountName || p.accountId,
        campaignName: p.campaignName, objective: p.objective,
        dailyBudgetCents: p.dailyBudgetCents,
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
      creativeId: creativeId,
      adId: adId,
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

function fail(res, code, msg, detail, ids) {
  return res.status(code).json({ error: msg, meta: detail && detail.error || detail || null, partial: ids || null });
}

function validate(b) {
  if (!b.accountId || !isAccountAllowed(b.accountId)) return { error: "accountId missing or not in allowlist" };
  if (!ALLOWED_OBJECTIVES[b.objective]) return { error: "objective not allowed for Phase 1" };
  if (!b.campaignName || String(b.campaignName).length < 3) return { error: "campaignName too short" };
  if (!b.pageId) return { error: "pageId required" };

  var dailyBudgetCents = parseInt(b.dailyBudgetCents, 10);
  if (!isFinite(dailyBudgetCents) || dailyBudgetCents <= 0) return { error: "dailyBudgetCents must be a positive integer" };
  if (dailyBudgetCents > MAX_DAILY_BUDGET_CENTS) {
    return { error: "dailyBudgetCents exceeds R" + (MAX_DAILY_BUDGET_CENTS / 100).toFixed(0) + " ceiling" };
  }

  var startIso = isoFromDate(b.startDate);
  if (!startIso) return { error: "startDate invalid (YYYY-MM-DD)" };
  var endIso = b.endDate ? isoFromDate(b.endDate, true) : null;
  if (b.endDate && !endIso) return { error: "endDate invalid (YYYY-MM-DD)" };

  // Headline + primary text + URL all required for a link ad. Video upload
  // path uses videoId; image path uses imageHash. Exactly one of each must
  // be supplied — Phase 1 is single-creative.
  if (!b.creative) return { error: "creative missing" };
  var hasImage = !!b.creative.imageHash;
  var hasVideo = !!b.creative.videoId;
  if (hasImage === hasVideo) return { error: "creative.imageHash XOR creative.videoId required" };
  if (!b.creative.headline) return { error: "creative.headline required" };
  if (!b.creative.primaryText) return { error: "creative.primaryText required" };
  if (!b.creative.linkUrl) return { error: "creative.linkUrl required" };

  return {
    payload: {
      accountId: String(b.accountId),
      accountName: b.accountName ? String(b.accountName) : null,
      objective: b.objective,
      specialAdCategories: Array.isArray(b.specialAdCategories) ? b.specialAdCategories : [],
      campaignName: String(b.campaignName).slice(0, 200),
      pageId: String(b.pageId),
      instagramId: b.instagramId ? String(b.instagramId) : null,
      pixelId: b.pixelId ? String(b.pixelId) : null,
      conversionEvent: b.conversionEvent ? String(b.conversionEvent) : null,
      urlTags: b.urlTags ? String(b.urlTags) : null,
      dailyBudgetCents: dailyBudgetCents,
      startTimeIso: startIso,
      endTimeIso: endIso,
      audience: b.audience || {},
      placement: b.placement || { mode: "advantage" },
      creative: {
        imageHash: b.creative.imageHash || null,
        videoId: b.creative.videoId || null,
        headline: String(b.creative.headline).slice(0, 200),
        primaryText: String(b.creative.primaryText).slice(0, 1500),
        description: b.creative.description ? String(b.creative.description).slice(0, 200) : null,
        linkUrl: String(b.creative.linkUrl),
        callToAction: b.creative.callToAction ? String(b.creative.callToAction) : "LEARN_MORE"
      }
    }
  };
}

function isoFromDate(s, endOfDay) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ""))) return null;
  // Times are interpreted in UTC for Meta; the wizard advertises this as
  // "campaign start at 00:00 SAST" — but Meta stores in account timezone.
  // Submitting the date with a Z suffix is the safest neutral option.
  return s + (endOfDay ? "T23:59:59+0000" : "T00:00:00+0000");
}

function buildTargeting(p) {
  var a = p.audience || {};
  var geos = (a.countries && a.countries.length) ? a.countries : ["ZA"];
  var t = {
    geo_locations: { countries: geos },
    age_min: a.ageMin || 18,
    age_max: a.ageMax || 65,
    targeting_automation: { advantage_audience: a.advantageAudience ? 1 : 0 }
  };
  if (a.genders && a.genders.length) t.genders = a.genders;
  if (a.flexibleSpec) t.flexible_spec = a.flexibleSpec;

  var pl = p.placement || {};
  if (pl.mode === "manual") {
    t.publisher_platforms = pl.platforms || ["facebook", "instagram"];
    if (pl.facebookPositions) t.facebook_positions = pl.facebookPositions;
    if (pl.instagramPositions) t.instagram_positions = pl.instagramPositions;
    t.device_platforms = pl.devicePlatforms || ["mobile", "desktop"];
  }
  return t;
}

function buildCreative(p) {
  var c = p.creative;
  var storySpec = { page_id: p.pageId };
  // v22+ renamed instagram_actor_id → instagram_user_id in object_story_spec.
  // The old name still parses but Meta validates the value differently
  // depending on which field it sees, so the new name is more reliable.
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

function summariseAudience(p) {
  var a = p.audience || {};
  var bits = [];
  bits.push("Geo: " + ((a.countries && a.countries.join(",")) || "ZA"));
  bits.push("Age: " + (a.ageMin || 18) + "-" + (a.ageMax || 65));
  if (a.genders && a.genders.length) bits.push("Gender: " + a.genders.join(","));
  var pl = p.placement || {};
  bits.push("Placement: " + (pl.mode === "manual" ? "Manual" : "Advantage+"));
  return bits.join(" | ");
}

// ---------------------------------------------------------------------------
// Gmail draft, OAuth refresh-token flow. Returns { ok, draftId } or
// { skipped, reason }. Never throws — caller wraps in try/catch anyway.
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

  var subj = "[CREATE TAB] Campaign created — " + p.campaignName + " — " + p.accountName;
  var bodyText =
    "A new campaign was created via the Create tab and is currently PAUSED.\n\n" +
    "Campaign:        " + p.campaignName + "\n" +
    "Account:         " + p.accountName + " (" + p.accountId + ")\n" +
    "Objective:       " + p.objective + "\n" +
    "Daily budget:    R" + (p.dailyBudgetCents / 100).toFixed(2) + "\n" +
    "Start:           " + p.startTimeIso + "\n" +
    "End:             " + (p.endTimeIso || "(no end date)") + "\n" +
    "Audience:        " + p.audienceSummary + "\n" +
    "Status:          PAUSED at all three levels\n\n" +
    "IDs:\n" +
    "  campaign_id = " + p.campaignId + "\n" +
    "  adset_id    = " + p.adsetId + "\n" +
    "  ad_id       = " + p.adId + "\n\n" +
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
