// Search across Meta's targeting taxonomy for the wizard's Audience step.
//
// Hits /act_<id>/targetingsearch which returns interests + behaviors +
// demographics + work_positions + family_statuses + life_events + locales
// in one query, ranked by relevance to the search term, with audience-size
// estimates per item. Account-scoped because Meta sometimes filters by what
// targeting an account is eligible for in its market.
//
// Output is normalised so the wizard can show a single results list with
// type chips. Each item carries its native `type` (interests, behaviors, …)
// so the server-side flexible_spec builder can place it in the right key
// when the campaign gets created.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!rateLimit(req, res, { maxPerMin: 60 })) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "Missing accountId" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var q = String(req.query.q || "").trim();
  if (!q || q.length < 2) { res.status(200).json({ items: [] }); return; }

  // Optional class filter narrows the search server-side. Wizard sends
  // class=interests, class=behaviors, etc. when the user picks a tab; omit
  // for a global search across the whole taxonomy.
  var cls = String(req.query.class || "").trim();
  var classParam = (cls && /^[a-z_]+$/.test(cls)) ? "&class=" + encodeURIComponent(cls) : "";

  try {
    var url = "https://graph.facebook.com/" + META_API_VERSION + "/" + encodeURIComponent(accountId) +
              "/targetingsearch?q=" + encodeURIComponent(q) + classParam +
              "&limit=25&access_token=" + encodeURIComponent(token);
    var r = await fetch(url);
    var data = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: "Meta search failed", detail: data && data.error || data });
      return;
    }
    var items = ((data && data.data) || []).map(function(d){
      return {
        id: d.id,
        name: d.name,
        type: d.type || "interests",
        path: (d.path || []).join(" › ") || null,
        description: d.description || null,
        audienceSizeLower: d.audience_size_lower_bound || null,
        audienceSizeUpper: d.audience_size_upper_bound || null
      };
    });
    res.status(200).json({ items: items });
  } catch (e) {
    console.error("[create/targeting-search] error:", e && e.message);
    res.status(500).json({ error: "Search failed" });
  }
}
