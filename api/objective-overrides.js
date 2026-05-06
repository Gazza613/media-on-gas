import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { isSuperadminEmail } from "./_users.js";
import { logUsageEvent } from "./_audit.js";
import { getOverrides, setOverride, displayToCanonical } from "./_objectiveOverrides.js";

// Manual objective overrides administered via Settings → Objectives Audit.
// Superadmin-only by design, overrides change reported numbers across
// every report on the dashboard, so the blast radius is intentionally
// tight.
//
// GET  /api/objective-overrides  → { overrides: { campaignId: displayString } }
// POST /api/objective-overrides  → set/clear override
//   body: { campaignId, objective }
//     objective = display string ("Clicks to App Store" / "Leads" / etc.)
//                 or "auto" / null to clear the override
//
// Every change is written to the usage audit log so we can see who
// overrode what when. The campaigns.js response cache is busted on a
// successful POST so the next dashboard fetch surfaces the override.

var ALLOWED_OBJECTIVES = {
  "Clicks to App Store": true,
  "Leads": true,
  "Followers & Likes": true,
  "Landing Page Clicks": true,
  "Unclassified": true
};

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;

  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }

  if (req.method === "GET") {
    // Any signed-in admin can READ the overrides, the audit modal
    // surfaces them as part of the regular audit view. Writing is
    // gated tighter below.
    var overrides = await getOverrides();
    res.status(200).json({ overrides: overrides });
    return;
  }

  if (req.method === "POST") {
    if (!isSuperadminEmail(session.email)) {
      res.status(403).json({ error: "Superadmin only" });
      return;
    }

    var body = req.body || {};
    var campaignId = String(body.campaignId || "").trim();
    var objective = body.objective == null ? null : String(body.objective).trim();
    if (!campaignId) { res.status(400).json({ error: "campaignId required" }); return; }

    var clearing = !objective || objective === "auto" || objective === "Auto";
    if (!clearing && !ALLOWED_OBJECTIVES[objective]) {
      res.status(400).json({ error: "Unknown objective. Allowed: " + Object.keys(ALLOWED_OBJECTIVES).join(", ") + ", or 'auto' to clear." });
      return;
    }

    var ok = await setOverride(campaignId, clearing ? null : objective);
    if (!ok) { res.status(500).json({ error: "Could not write override" }); return; }

    // Audit log entry. `kind` distinguishes set vs clear so a future
    // weekly summary or compliance review can list every classification
    // change with actor + timestamp.
    try {
      await logUsageEvent(
        clearing ? "objective_override_clear" : "objective_override_set",
        session.email,
        { campaignId: campaignId, objective: clearing ? null : objective, canonical: clearing ? null : displayToCanonical(objective) },
        { skipDedup: true }
      );
    } catch (_) {}

    // Bust the api/campaigns response cache so the dashboard picks up
    // the new override on next fetch. The cache is in-memory so we
    // can't invalidate from this function instance directly; instead
    // we set a Redis flag the campaigns endpoint checks on each request.
    // Falls back to natural TTL if Redis is unreachable.
    try {
      var creds = (function(){
        var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
        var tok = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
        return (url && tok) ? { url: url.replace(/\/$/, ""), token: tok } : null;
      })();
      if (creds) {
        await fetch(creds.url, {
          method: "POST",
          headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
          body: JSON.stringify(["SET", "obj:overrides:bumped", String(Date.now()), "EX", "3600"])
        });
      }
    } catch (_) {}

    res.status(200).json({ ok: true, campaignId: campaignId, objective: clearing ? null : objective });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
