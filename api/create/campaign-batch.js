// Audience x Creative matrix (Create-tab Phase 3, MVP cut line).
//
// Fans ONE campaign out across K audiences: a single CBO campaign,
// then one ad set per audience, then the shared creative set as
// DISCRETE ads under each ad set. Reuses the exact, proven Meta call
// shapes + validation + approval gate from api/create/campaign.js so
// there is no second source of truth for how a campaign is built.
//
// MVP scope (per the agreed roadmap): single campaign, K ad sets x a
// shared creative set, discrete ads (single/multi only), CBO only.
// Carousel / Advantage+ and ABO are intentionally rejected here for
// now and stay on the single-build endpoint.
//
// Auth: same checkCreateAuth gate; account scoped by isAccountAllowed
// (enforced inside the reused validate()). Everything PAUSED, exactly
// like the single path. One combined approval covers the batch since
// the high-spend fingerprint is account+campaignName+budget, all
// shared across the ad sets.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, getCreateMetaToken, ALLOWED_OBJECTIVES, META_API_VERSION } from "../_createAuth.js";
import {
  validate,
  buildTargeting,
  buildSingleCreative,
  creativeFormFromBody,
  postAd,
  scrubForm,
  verifyApproval
} from "./campaign.js";
import { logCreated } from "./_createdLog.js";

export const config = { maxDuration: 60 };

var HIGH_DAILY_CENTS = 300000;     // R3,000  (mirror of campaign.js)
var HIGH_LIFETIME_CENTS = 2000000; // R20,000

function bad(res, code, msg, extra) {
  return res.status(code).json(Object.assign({ error: msg }, extra || {}));
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  // Heavier than a single build (K ad sets x N ads), so a tighter limit.
  if (!(await rateLimit(req, res, { maxPerMin: 4, maxPerHour: 20 }))) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var variants = Array.isArray(body.variants) ? body.variants : [];
  if (variants.length < 2) return bad(res, 400, "Batch needs at least 2 audience variants. Use the single build for one ad set.");
  if (variants.length > 12) return bad(res, 400, "Batch is capped at 12 ad sets. Split into more than one campaign.");

  // Validate every variant through the SAME validator the single path
  // uses (account allowlist, budget ceiling, creatives, dates, etc.).
  var ps = [];
  for (var i = 0; i < variants.length; i++) {
    var vr = validate(variants[i] || {});
    if (vr.error) return bad(res, 400, "Audience #" + (i + 1) + ": " + vr.error);
    ps.push(vr.payload);
  }
  var p0 = ps[0];

  // MVP guardrails: CBO + discrete creatives only on the batch path.
  if (p0.funding !== "CBO") {
    return bad(res, 400, "The matrix builder is CBO-only for now (one shared campaign budget across the ad sets). Switch funding to CBO, or use the single build for ABO.");
  }
  for (var g = 0; g < ps.length; g++) {
    if (ps[g].creativeMode !== "single" && ps[g].creativeMode !== "multi") {
      return bad(res, 400, "The matrix builder supports discrete ads only (single / multi). Carousel and Advantage+ stay on the single build for now.");
    }
  }

  // All ad sets must belong to ONE campaign: account, campaign name,
  // objective and budget have to match across variants.
  for (var k = 1; k < ps.length; k++) {
    var a = ps[k], b0 = p0;
    if (a.accountId !== b0.accountId || a.campaignName !== b0.campaignName ||
        a.objective !== b0.objective || a.budgetMode !== b0.budgetMode ||
        a.funding !== b0.funding ||
        a.dailyBudgetCents !== b0.dailyBudgetCents ||
        a.lifetimeBudgetCents !== b0.lifetimeBudgetCents) {
      return bad(res, 400, "All audiences must share the same campaign name, account, objective and budget. Only the ad set name + audience may differ.");
    }
    if (!a.adsetName || a.adsetName === b0.adsetName) {
      return bad(res, 400, "Audience #" + (k + 1) + " needs a distinct ad set name (the audience label must differ).");
    }
  }

  // Combined high-spend approval (one fingerprint, shared budget).
  var highDaily = p0.budgetMode === "daily" && p0.dailyBudgetCents > HIGH_DAILY_CENTS;
  var highLifetime = p0.budgetMode === "lifetime" && p0.lifetimeBudgetCents > HIGH_LIFETIME_CENTS;
  if (highDaily || highLifetime) {
    var approvalToken = String(body.approvalToken || "").trim();
    if (!approvalToken) {
      return bad(res, 403, "approval_required", {
        message: "Daily budget over R3,000 or lifetime over R20,000 requires a second-person approval before launch.",
        threshold: { dailyCents: HIGH_DAILY_CENTS, lifetimeCents: HIGH_LIFETIME_CENTS }
      });
    }
    var ap = await verifyApproval(approvalToken, p0);
    if (!ap.ok) return bad(res, 403, "approval_invalid", { message: ap.reason || "Approval did not validate against this campaign." });
  }

  var graphBase = "https://graph.facebook.com/" + META_API_VERSION;
  var acct = encodeURIComponent(p0.accountId);
  var done = { campaignId: null, adsets: [] };

  try {
    // ----- 1. ONE campaign (CBO budget at campaign level) -------------
    var campForm = new URLSearchParams();
    campForm.set("name", p0.campaignName);
    campForm.set("objective", p0.objective);
    campForm.set("status", "PAUSED");
    campForm.set("special_ad_categories", JSON.stringify(p0.specialAdCategories || []));
    campForm.set("buying_type", "AUCTION");
    if (p0.budgetMode === "lifetime") campForm.set("lifetime_budget", String(p0.lifetimeBudgetCents));
    else campForm.set("daily_budget", String(p0.dailyBudgetCents));
    campForm.set("is_adset_budget_sharing_enabled", "true");
    campForm.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
    campForm.set("access_token", token);

    var campRes = await fetch(graphBase + "/" + acct + "/campaigns", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: campForm.toString()
    });
    var campData = await campRes.json();
    if (!campRes.ok || !campData.id) {
      return res.status(502).json({ error: "Campaign create failed", meta: campData && campData.error, sent: scrubForm(campForm) });
    }
    var campaignId = campData.id;
    done.campaignId = campaignId;

    // ----- 2. Per audience: ad set + discrete ads --------------------
    for (var vi = 0; vi < ps.length; vi++) {
      var p = ps[vi];
      var goal = ALLOWED_OBJECTIVES[p.objective];
      var targeting = buildTargeting(p);

      var adsetForm = new URLSearchParams();
      adsetForm.set("name", p.adsetName);
      adsetForm.set("campaign_id", campaignId);
      // CBO: no ad-set budget; the campaign shares its budget out.
      adsetForm.set("billing_event", goal.billing_event);
      adsetForm.set("optimization_goal", goal.optimization_goal);
      adsetForm.set("targeting", JSON.stringify(targeting));
      adsetForm.set("start_time", p.startTimeIso);
      if (p.endTimeIso) adsetForm.set("end_time", p.endTimeIso);
      adsetForm.set("status", "PAUSED");
      if (p.objective === "OUTCOME_SALES" && p.pixelId) {
        adsetForm.set("promoted_object", JSON.stringify({ pixel_id: p.pixelId, custom_event_type: p.conversionEvent || "PURCHASE" }));
      } else if (p.objective === "OUTCOME_LEADS" && p.pageId) {
        adsetForm.set("promoted_object", JSON.stringify({ page_id: p.pageId }));
      }
      adsetForm.set("access_token", token);

      var adsetRes = await fetch(graphBase + "/" + acct + "/adsets", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: adsetForm.toString()
      });
      var adsetData = await adsetRes.json();
      if (!adsetRes.ok || !adsetData.id) {
        return res.status(502).json({
          error: "Ad set create failed for audience #" + (vi + 1) + " (" + p.adsetName + ")",
          meta: adsetData && adsetData.error, partial: done, sent: scrubForm(adsetForm)
        });
      }
      var adsetId = adsetData.id;
      var adsForThis = [];

      for (var ci = 0; ci < p.creatives.length; ci++) {
        var cr = p.creatives[ci];
        var creativeBody = buildSingleCreative(cr, p);
        var form = creativeFormFromBody(creativeBody, p, token, cr.adName);
        var crRes = await fetch(graphBase + "/" + acct + "/adcreatives", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString()
        });
        var crData = await crRes.json();
        if (!crRes.ok || !crData.id) {
          return res.status(502).json({
            error: "Creative create failed (audience #" + (vi + 1) + ", ad " + (ci + 1) + ")",
            meta: crData && crData.error, partial: done, sent: scrubForm(form)
          });
        }
        var adR = await postAd(graphBase, acct, token, cr.adName, adsetId, crData.id, p);
        if (adR.error) {
          return res.status(502).json({
            error: "Ad create failed (audience #" + (vi + 1) + ", ad " + (ci + 1) + ")",
            meta: adR.detail && adR.detail.error, partial: done, sent: adR.scrubbed
          });
        }
        adsForThis.push({ creativeId: crData.id, adId: adR.id, name: cr.adName });
      }
      done.adsets.push({ adsetId: adsetId, adsetName: p.adsetName, ads: adsForThis });
    }

    var bAdCount = done.adsets.reduce(function(s, x){ return s + x.ads.length; }, 0);
    var bUrl = "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=" +
      encodeURIComponent(p0.accountId.replace(/^act_/, "")) +
      "&selected_campaign_ids=" + encodeURIComponent(campaignId);
    // Record the launch for Step 1's "what was created" table.
    try {
      await logCreated({
        campaignId: campaignId, campaignName: p0.campaignName,
        accountId: p0.accountId, accountName: p0.accountName || p0.accountId,
        objective: p0.objective, platformMode: p0.platformMode, funding: p0.funding,
        budgetMode: p0.budgetMode,
        dailyBudgetRand: Math.round((p0.dailyBudgetCents || 0) / 100),
        lifetimeBudgetRand: Math.round((p0.lifetimeBudgetCents || 0) / 100),
        adsetCount: done.adsets.length, adCount: bAdCount, batch: true,
        adsManagerUrl: bUrl
      });
    } catch (_) {}

    res.status(200).json({
      ok: true,
      campaignId: campaignId,
      adsets: done.adsets,
      adsetCount: done.adsets.length,
      adCount: bAdCount,
      status: "PAUSED",
      adsManagerUrl: bUrl
    });
  } catch (e) {
    console.error("[create/campaign-batch] unexpected:", e && e.stack || e);
    res.status(500).json({ error: "Unexpected error during batch creation", partial: done });
  }
}
