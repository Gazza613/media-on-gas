// List saved audiences AND custom audiences for an ad account. Both surface in
// the wizard's Audience step under one combined picker so the team can target
// either kind without having to know the difference (Meta separates them in
// Ads Manager but the targeting API treats them identically once selected).
//
// Saved audiences = reusable targeting configs (not actual people lists)
//   GET /act_X/saved_audiences  → name, id, account_id, sentence_lines
// Custom audiences = real people lists (uploaded, lookalikes, IG followers, ...)
//   GET /act_X/customaudiences  → name, id, subtype, approximate_count_lower_bound
//
// We blend them into a single { items: [...] } response with a `kind` field
// distinguishing them so the picker can label / colour-code each entry.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!rateLimit(req, res, { maxPerMin: 60 })) return;

  var token = getCreateMetaToken();
  if (!token) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var accountId = String((req.query && req.query.accountId) || "").trim();
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var graphBase = "https://graph.facebook.com/" + META_API_VERSION + "/" + encodeURIComponent(accountId);

  try {
    var sa = await fetchJson(graphBase + "/saved_audiences?fields=id,name,sentence_lines&limit=200&access_token=" + encodeURIComponent(token));
    var ca = await fetchJson(graphBase + "/customaudiences?fields=id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status&limit=200&access_token=" + encodeURIComponent(token));

    var items = [];
    (sa.data || []).forEach(function(row){
      items.push({
        id: String(row.id),
        kind: "saved",
        name: String(row.name || row.id),
        sentence: Array.isArray(row.sentence_lines) ? row.sentence_lines.join(" / ") : ""
      });
    });
    (ca.data || []).forEach(function(row){
      // Skip anything Meta has marked as broken or deleted-pending. Targeting
      // a deleted CA returns a generic "audience not available" 1487201 error
      // which is a frustrating thing to discover on submit.
      var status = (row.delivery_status && row.delivery_status.code) ||
                   (row.operation_status && row.operation_status.code) || 200;
      if (status === 412 || status === 414) return;
      items.push({
        id: String(row.id),
        kind: "custom",
        subtype: row.subtype || "",
        name: String(row.name || row.id),
        sizeLower: row.approximate_count_lower_bound || 0,
        sizeUpper: row.approximate_count_upper_bound || 0
      });
    });

    items.sort(function(a, b){
      // Custom audiences first (they're usually higher-intent), then alpha by name.
      if (a.kind !== b.kind) return a.kind === "custom" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    res.status(200).json({ items: items });
  } catch (e) {
    console.error("[create/saved-audiences] error:", e && e.message);
    res.status(502).json({ error: "Saved/custom audience fetch failed", detail: String(e && e.message || e) });
  }
}

async function fetchJson(url) {
  var r = await fetch(url);
  var j = await r.json();
  if (!r.ok) {
    var msg = (j && j.error && j.error.message) || ("HTTP " + r.status);
    throw new Error(msg);
  }
  return j;
}
