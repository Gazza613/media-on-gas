// Pre-flight reach + delivery estimate. Takes the same payload shape
// the team is about to submit, builds the Meta targeting spec
// exactly as the real /api/create/campaign endpoint would, and asks
// Meta for a reach + delivery estimate without creating any
// campaign / ad-set / ad. The team sees:
//   - estimated audience size (lower/upper)
//   - estimated daily impressions and reach at the chosen budget
//   - any Meta-side warnings (e.g. estimate unavailable for the
//     objective, audience too narrow, etc.)
//
// Meta API:
//   GET /act_{id}/delivery_estimate?targeting_spec=<json>&optimization_goal=<goal>
//
// We use delivery_estimate (the newer endpoint) over reachestimate
// because it returns both audience size AND projected daily delivery
// for the chosen optimization goal, which is what the team actually
// reads to decide whether the budget is well-matched to the audience.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";
import { buildTargeting } from "./campaign.js";

export const config = { maxDuration: 30 };

// Map create-tab objective -> the optimization_goal Meta wants. These
// are the goals that pair naturally with the campaign objective at
// ad-set level.
var OBJ_TO_GOAL = {
  OUTCOME_TRAFFIC:       "LINK_CLICKS",
  OUTCOME_ENGAGEMENT:    "POST_ENGAGEMENT",
  OUTCOME_LEADS:         "LEAD_GENERATION",
  OUTCOME_AWARENESS:     "REACH",
  OUTCOME_SALES:         "OFFSITE_CONVERSIONS",
  OUTCOME_APP_PROMOTION: "APP_INSTALLS"
};

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 20 }))) return;

  var metaToken = getCreateMetaToken();
  if (!metaToken) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var accountId = String(body.accountId || "").trim();
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var objective = String(body.objective || "OUTCOME_TRAFFIC");
  var optimizationGoal = OBJ_TO_GOAL[objective] || "LINK_CLICKS";

  var targeting;
  try {
    targeting = buildTargeting(body);
  } catch (err) {
    res.status(400).json({ error: "Could not build targeting spec", message: String(err && err.message || err) });
    return;
  }

  var url = "https://graph.facebook.com/" + META_API_VERSION + "/" + accountId +
    "/delivery_estimate?targeting_spec=" + encodeURIComponent(JSON.stringify(targeting)) +
    "&optimization_goal=" + encodeURIComponent(optimizationGoal) +
    "&access_token=" + encodeURIComponent(metaToken);

  try {
    var r = await fetch(url);
    var d = await r.json();
    if (!r.ok || d.error) {
      // Meta surfaces a structured error here — code 100 (invalid
      // param) is the usual one when targeting is malformed.
      res.status(200).json({
        ok: false,
        warnings: [(d.error && d.error.message) || "Delivery estimate unavailable for this configuration"],
        meta: d.error || null,
        targetingPreview: targeting
      });
      return;
    }
    var row = (d.data && d.data[0]) || null;
    if (!row) {
      res.status(200).json({
        ok: false,
        warnings: ["Meta returned no delivery estimate row"],
        targetingPreview: targeting
      });
      return;
    }

    // Compute projected daily impressions from the budget if provided.
    // Meta returns estimate_dau (active daily users in the audience)
    // and estimate_mau (active monthly). We surface both raw.
    var dailyBudgetRand = parseFloat(body.dailyBudgetRand || 0);
    var lifetimeBudgetRand = parseFloat(body.lifetimeBudgetRand || 0);
    var dailyBudgetCents = body.budgetMode === "lifetime" && lifetimeBudgetRand > 0
      ? Math.round((lifetimeBudgetRand / Math.max(1, parseInt(body.lifetimeDays || 7, 10))) * 100)
      : Math.round(dailyBudgetRand * 100);

    res.status(200).json({
      ok: true,
      optimizationGoal: optimizationGoal,
      audience: {
        estimateDau: row.estimate_dau || null,
        estimateMau: row.estimate_mau || null,
        estimateReady: !!row.estimate_ready
      },
      bidEstimate: row.estimate_bid_value || null,
      bidRange: row.bid_estimate || null,
      dailyOutcomes: row.estimate_outcomes_daily || null,
      dailyBudgetCents: dailyBudgetCents,
      warnings: [],
      targetingPreview: targeting
    });
  } catch (err) {
    console.error("preflight error", err);
    res.status(500).json({ error: "Reach estimate request failed", message: String(err && err.message || err) });
  }
}
