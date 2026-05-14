// Pre-flight validation. Asks Meta to validate the campaign-level
// configuration WITHOUT persisting anything, via the standard
// execution_options=["validate_only"] flag on the campaigns POST.
//
// Catches:
//   - Objective / special_ad_categories mismatches (e.g. credit
//     /housing/employment categories that disallow certain objectives)
//   - Budget / bid-strategy / funding-mode invariants
//   - Currency / account-status / account-permissions issues
//
// Audience- and targeting-validity is covered by /api/create/preflight
// (delivery_estimate). Naming-convention violations are caught by the
// frontend regex at submit. Together the three layers give the team
// confidence to commit without orphaning partial state in Meta.
//
// Body shape: same as /api/create/campaign — the team passes the exact
// payload they're about to submit, and this endpoint validates the
// campaign-level slice of it.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var accountId = String(body.accountId || "").trim();
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var campaignName = String(body.campaignName || "").trim();
  var objective = String(body.objective || "").trim();
  if (!campaignName || campaignName.length < 3) { res.status(400).json({ error: "campaignName too short" }); return; }
  if (!objective) { res.status(400).json({ error: "objective required" }); return; }

  var dailyBudgetCents = parseInt(body.dailyBudgetCents || 0, 10);
  var lifetimeBudgetCents = parseInt(body.lifetimeBudgetCents || 0, 10);
  var funding = String(body.funding || "ABO").toUpperCase();
  var budgetMode = String(body.budgetMode || "daily").toLowerCase();

  var form = new URLSearchParams();
  form.set("name", campaignName);
  form.set("objective", objective);
  form.set("status", "PAUSED");
  form.set("special_ad_categories", JSON.stringify(body.specialAdCategories || []));
  form.set("buying_type", "AUCTION");
  if (funding === "CBO") {
    if (budgetMode === "lifetime") form.set("lifetime_budget", String(lifetimeBudgetCents));
    else form.set("daily_budget", String(dailyBudgetCents));
    form.set("is_adset_budget_sharing_enabled", "true");
    form.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
  } else {
    form.set("is_adset_budget_sharing_enabled", "false");
  }
  form.set("execution_options", JSON.stringify(["validate_only"]));
  form.set("access_token", token);

  var url = "https://graph.facebook.com/" + META_API_VERSION + "/" + accountId + "/campaigns";
  try {
    var r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
    var d = await r.json();
    if (!r.ok || d.error) {
      var errMsg = d.error && d.error.message ? d.error.message : "Validation failed";
      var errType = d.error && d.error.type ? d.error.type : null;
      var errCode = d.error && d.error.code ? d.error.code : null;
      var subCode = d.error && d.error.error_subcode ? d.error.error_subcode : null;
      res.status(200).json({
        ok: false,
        errors: [errMsg + (errType ? " (" + errType + " " + errCode + (subCode ? "/" + subCode : "") + ")" : "")],
        meta: d.error || null
      });
      return;
    }
    res.status(200).json({ ok: true, message: "Campaign configuration validated by Meta — safe to launch." });
  } catch (err) {
    console.error("validate endpoint error", err);
    res.status(500).json({ error: "Validate request failed", message: String(err && err.message || err) });
  }
}
