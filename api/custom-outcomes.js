// Custom Outcomes — manually-entered KPI events that don't reach us
// via any ad platform API. Purpose-built for outcomes clients track
// in their own systems (WhatsApp qualified leads, phone calls from
// ads, in-person consults booked, etc.) but want to see on their
// dashboard alongside the API-driven metrics.
//
// Storage: Redis hash key `client:outcomes:<canonical_slug>` →
// JSON array of outcome records. Each record:
//   {
//     id: "outcome_<timestamp>_<rand>",   // stable per entry
//     label: "WhatsApp Qualified Leads",  // client-facing tile label
//     month: "2026-07",                   // YYYY-MM
//     count: 8,                           // integer
//     cost: 688.80,                       // optional, R
//     campaignHint: "GAS_Learnalot_META_Leads_WApp_PSI_July_2026",
//     note: "From Meta dataset UI (Conversions API)",
//     createdBy: "gary@gasmarketing.co.za",
//     createdAt: "2026-07-13T14:23:00Z"
//   }
//
// Handler routes:
//   GET    /api/custom-outcomes?client=<slug>       list outcomes
//   POST   /api/custom-outcomes                      add outcome
//                    body { client, label, month, count, cost?,
//                           campaignHint?, note? }
//   DELETE /api/custom-outcomes?client=<slug>&id=<id>  remove one
//
// Auth: admin OR superadmin can add/edit/delete for any client.
// Client-scoped tokens can only GET their own outcomes (allowlist).

import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isAdminOrSuperadmin } from "./_auth.js";
import { canonicalClientSlug } from "./_clientIdentity.js";

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisCmd(args) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) {
    console.error("[custom-outcomes] redis error", err);
    return null;
  }
}

function storageKey(slug) {
  return "client:outcomes:" + slug;
}

async function listOutcomes(slug) {
  var r = await redisCmd(["GET", storageKey(slug)]);
  if (!r || !r.result) return [];
  try {
    var arr = JSON.parse(r.result);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

// Exported for email-share.js so the PDF report can fold Custom
// Outcomes into the Learnalot leads octet using the SAME Redis read
// the endpoint uses — no HTTP loop-back, no separate credentials
// path, no auth surface to reason about. Slug should already be
// canonical (via canonicalClientSlug) before the call.
export async function listOutcomesForSlug(canonicalSlug) {
  var s = String(canonicalSlug || "").trim();
  if (!s) return [];
  return listOutcomes(s);
}

async function saveOutcomes(slug, arr) {
  await redisCmd(["SET", storageKey(slug), JSON.stringify(arr || [])]);
}

function newId() {
  var ts = Date.now().toString(36);
  var rand = Math.random().toString(36).slice(2, 8);
  return "outcome_" + ts + "_" + rand;
}

function validMonth(m) {
  return /^\d{4}-\d{2}$/.test(String(m || ""));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;

  var principal = req.authPrincipal || { role: "admin" };
  var isPrivileged = isAdminOrSuperadmin(principal);

  // ── GET ────────────────────────────────────────────────────────
  if (req.method === "GET") {
    // Optional `client` param — if absent, admin sees ALL clients'
    // outcomes (used by the Settings management tab). Client tokens
    // can only see their own scoped set.
    var qClient = String(req.query.client || "").trim();
    if (!isPrivileged) {
      // Client role: allow only their own slug.
      var allowedSlug = String(principal.clientSlug || principal.sub || "").trim();
      var canonAllowed = canonicalClientSlug(allowedSlug);
      if (!canonAllowed) { res.status(200).json({ ok: true, outcomes: [] }); return; }
      var out = await listOutcomes(canonAllowed);
      res.status(200).json({ ok: true, client: canonAllowed, outcomes: out });
      return;
    }
    if (qClient) {
      var canon = canonicalClientSlug(qClient);
      var list = await listOutcomes(canon);
      res.status(200).json({ ok: true, client: canon, outcomes: list });
      return;
    }
    // Admin, no client → scan every client:outcomes:* key.
    var allR = await redisCmd(["KEYS", "client:outcomes:*"]);
    var keys = (allR && Array.isArray(allR.result)) ? allR.result : [];
    var byClient = {};
    for (var i = 0; i < keys.length; i++) {
      var slug = String(keys[i]).replace(/^client:outcomes:/, "");
      byClient[slug] = await listOutcomes(slug);
    }
    res.status(200).json({ ok: true, byClient: byClient });
    return;
  }

  // ── POST (create or replace one outcome) ───────────────────────
  if (req.method === "POST") {
    if (!isPrivileged) { res.status(403).json({ error: "admin_required" }); return; }
    var body = req.body || {};
    var slugRaw = String(body.client || "").trim();
    var slug = canonicalClientSlug(slugRaw);
    if (!slug) { res.status(400).json({ error: "client (canonical slug) required" }); return; }
    var label = String(body.label || "").trim();
    if (!label) { res.status(400).json({ error: "label required" }); return; }
    if (label.length > 80) { res.status(400).json({ error: "label too long (80 max)" }); return; }
    var month = String(body.month || "").trim();
    if (!validMonth(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
    var count = parseInt(body.count, 10);
    if (isNaN(count) || count < 0) { res.status(400).json({ error: "count must be non-negative integer" }); return; }
    var cost = body.cost === undefined || body.cost === null || body.cost === "" ? null : parseFloat(body.cost);
    if (cost !== null && (isNaN(cost) || cost < 0)) { res.status(400).json({ error: "cost must be non-negative number" }); return; }
    var campaignHint = String(body.campaignHint || "").trim().slice(0, 200);
    var note = String(body.note || "").trim().slice(0, 500);

    var arr = await listOutcomes(slug);
    var id = String(body.id || "").trim();
    if (id) {
      // Update-in-place if the id exists, else append with that id.
      var found = false;
      for (var u = 0; u < arr.length; u++) {
        if (arr[u].id === id) {
          arr[u] = Object.assign({}, arr[u], {
            label: label, month: month, count: count,
            cost: cost, campaignHint: campaignHint, note: note,
            updatedBy: principal.email || principal.sub || "",
            updatedAt: new Date(Date.now()).toISOString()
          });
          found = true;
          break;
        }
      }
      if (!found) arr.push({
        id: id, label: label, month: month, count: count, cost: cost,
        campaignHint: campaignHint, note: note,
        createdBy: principal.email || principal.sub || "",
        createdAt: new Date(Date.now()).toISOString()
      });
    } else {
      arr.push({
        id: newId(),
        label: label, month: month, count: count, cost: cost,
        campaignHint: campaignHint, note: note,
        createdBy: principal.email || principal.sub || "",
        createdAt: new Date(Date.now()).toISOString()
      });
    }
    await saveOutcomes(slug, arr);
    res.status(200).json({ ok: true, client: slug, outcomes: arr });
    return;
  }

  // ── DELETE ─────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    if (!isPrivileged) { res.status(403).json({ error: "admin_required" }); return; }
    var dSlug = canonicalClientSlug(String(req.query.client || "").trim());
    var dId = String(req.query.id || "").trim();
    if (!dSlug || !dId) { res.status(400).json({ error: "client and id required" }); return; }
    var dArr = await listOutcomes(dSlug);
    var filtered = dArr.filter(function(o) { return o.id !== dId; });
    await saveOutcomes(dSlug, filtered);
    res.status(200).json({ ok: true, client: dSlug, outcomes: filtered });
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
