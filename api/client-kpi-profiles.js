import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { checkAuth } from "./_auth.js";
import { isSuperadminEmail } from "./_users.js";
import { logUsageEvent } from "./_audit.js";
import { getAllKpiProfiles, setKpiProfile, getKpiProfile } from "./_clientKpiProfiles.js";

// Per-client KPI profiles administered via Settings → KPI Profiles.
// Superadmin-only writes by design: a profile changes which KPIs the
// dashboard leads with and toggles the ecommerce view for that client,
// so the blast radius is intentionally tight (mirrors objective
// overrides).
//
// GET    /api/client-kpi-profiles            -> { profiles: { slug: profile } }
// POST   /api/client-kpi-profiles            -> upsert
//   body: { client, profile }    client = raw client name (canonicalised
//                                 server-side), profile = the JSON shape
//   body: { client, profile: null }          -> delete (revert to default)
//
// Every change is written to the usage audit log.

var BENCHMARK_BANDS = { awareness: true, direct_response: true, "default": true };
var KNOWN_KPIS = {
  unique_reach: true, reach: true, frequency: true, cpm: true, impressions: true,
  clicks: true, ctr: true, cpc: true,
  newsletter_signups: true, leads: true, installs: true, follows: true,
  revenue: true, roas: true, transactions: true, aov: true, top_products: true,
  site_users: true, conversion_rate: true
};

function sanitiseKpiList(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map(function(s) { return String(s || "").trim(); })
    .filter(function(s) { return s && KNOWN_KPIS[s]; })
    .slice(0, 12);
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;

  // ?resolve=<clientName> -> tolerant single-profile lookup, used by
  // the dashboard (admin AND client share views) to decide if the
  // Ecommerce tab shows. Uses checkAuth so a client viewToken works;
  // client-role principals are forced to their own share-token slug
  // so a client can't probe another client's profile.
  if (req.method === "GET" && String(req.query.resolve || "").trim()) {
    if (!(await checkAuth(req, res))) return;
    var principalR = req.authPrincipal || { role: "admin" };
    var resolveName = String(req.query.resolve || "").trim();
    var target = principalR.role === "client" ? String(principalR.clientSlug || "") : resolveName;
    // ?fresh=1 bypasses the 30s instance cache so a profile just saved
    // in Settings is reflected immediately on the dashboard (the editor
    // appends ?fresh=1 right after a save).
    var fresh = String(req.query.fresh || "") === "1";
    var prof = target ? await getKpiProfile(target, fresh) : null;
    res.status(200).json({ profile: prof || null });
    return;
  }

  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }

  if (req.method === "GET") {
    // Any signed-in admin can read all profiles (the Settings editor
    // needs them). Writes are gated below.
    var profiles = await getAllKpiProfiles();
    res.status(200).json({ profiles: profiles });
    return;
  }

  if (req.method === "POST") {
    if (!isSuperadminEmail(session.email)) {
      res.status(403).json({ error: "Superadmin only" });
      return;
    }
    var body = req.body || {};
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
    var client = String(body.client || "").trim();
    if (!client) { res.status(400).json({ error: "client required" }); return; }

    // Null profile = delete (client reverts to default behaviour).
    if (body.profile === null || body.profile === undefined) {
      await setKpiProfile(client, null);
      try { await logUsageEvent("kpi_profile_delete", session.email, client, { skipDedup: true }); } catch (_) {}
      res.status(200).json({ ok: true, deleted: true, client: client });
      return;
    }

    var p = body.profile || {};
    var band = String(p.benchmarkBand || "default");
    if (!BENCHMARK_BANDS[band]) band = "default";
    var ec = p.ecommerce || {};
    var profile = {
      primaryKpis: sanitiseKpiList(p.primaryKpis),
      secondaryKpis: sanitiseKpiList(p.secondaryKpis),
      tertiaryKpis: sanitiseKpiList(p.tertiaryKpis),
      benchmarkBand: band,
      ecommerce: {
        enabled: !!ec.enabled,
        source: "ga4",
        ga4PropertyId: String(ec.ga4PropertyId || "").replace(/[^0-9]/g, "").slice(0, 20),
        newsletterEvent: String(ec.newsletterEvent || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 60),
        // Preferred newsletter signal: GA4 page path of the post-signup
        // thank-you page (e.g. "/thanks-page/"). A hit there is a
        // deterministic completed-signup, no event-name guessing. When
        // set it overrides newsletterEvent. Allow path chars only.
        newsletterPagePath: String(ec.newsletterPagePath || "").replace(/[^a-zA-Z0-9_\-\/]/g, "").slice(0, 120)
      }
    };

    var ok = await setKpiProfile(client, profile);
    if (!ok) { res.status(500).json({ error: "Could not save profile (Redis unavailable?)" }); return; }
    try { await logUsageEvent("kpi_profile_set", session.email, client + " :: " + JSON.stringify(profile), { skipDedup: true }); } catch (_) {}
    res.status(200).json({ ok: true, client: client, profile: profile });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
