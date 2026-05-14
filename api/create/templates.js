// Saved Create-tab templates. Lets the team snapshot the wizard state
// (account, objective, audience, placement, budget, creative-mode
// defaults, but NOT the uploaded creatives or scheduled dates) and
// reload it the next time they run a similar campaign for the same
// client. Cuts a 5-minute wizard pass to ~30 seconds.
//
// Storage: a single Redis list keyed at "create:templates" carrying a
// JSON object per saved template. List-based so the team can see the
// full set at-a-glance; capped at 100 entries to keep the response
// payload sensible. Older entries are dropped via LTRIM on save.
//
// Auth: same checkCreateAuth gate as every other create-tab endpoint
// (Bearer token issued by /api/create/auth). Rate-limited at the
// endpoint level so a runaway frontend can't churn the list.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

var TEMPLATES_KEY = "create:templates";
var MAX_TEMPLATES = 100;

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
  } catch (_) { return null; }
}

// Whitelist the draft fields we persist. Excludes uploaded creatives
// (per-campaign), startDate / endDate (always fresh per run), and any
// transient UI flags.
function pickTemplateDraft(draft) {
  if (!draft || typeof draft !== "object") return {};
  return {
    accountId: draft.accountId || "",
    accountName: draft.accountName || "",
    objective: draft.objective || "OUTCOME_TRAFFIC",
    specialAdCategories: draft.specialAdCategories || [],
    clientCode: draft.clientCode || "",
    productName: draft.productName || "",
    variant: draft.variant || "",
    platformMode: draft.platformMode || "fb_ig",
    pageId: draft.pageId || "",
    pageName: draft.pageName || "",
    instagramId: draft.instagramId || "",
    audience: draft.audience || {},
    placement: draft.placement || {},
    creativeMode: draft.creativeMode || "single",
    multiAdvertiserAds: !!draft.multiAdvertiserAds,
    funding: draft.funding || "ABO",
    budgetMode: draft.budgetMode || "daily",
    dailyBudgetRand: Number(draft.dailyBudgetRand || 0),
    lifetimeBudgetRand: Number(draft.lifetimeBudgetRand || 0),
    pixelId: draft.pixelId || "",
    conversionEvent: draft.conversionEvent || "",
    urlTags: draft.urlTags || ""
  };
}

async function listTemplates() {
  var res = await redisCmd(["LRANGE", TEMPLATES_KEY, "0", String(MAX_TEMPLATES - 1)]);
  if (!res || !res.result) return [];
  return res.result.map(function(s){
    try { return JSON.parse(s); } catch (_) { return null; }
  }).filter(Boolean);
}

async function saveTemplate(record) {
  await redisCmd(["LPUSH", TEMPLATES_KEY, JSON.stringify(record)]);
  await redisCmd(["LTRIM", TEMPLATES_KEY, "0", String(MAX_TEMPLATES - 1)]);
}

async function deleteTemplate(id) {
  var existing = await listTemplates();
  var next = existing.filter(function(t){ return t && t.id !== id; });
  // Rewrite the list: delete the key, push all survivors. Cheaper to
  // do this than LREM because the list is small (<=100) and LREM
  // would need an exact value match.
  await redisCmd(["DEL", TEMPLATES_KEY]);
  for (var i = next.length - 1; i >= 0; i--) {
    await redisCmd(["LPUSH", TEMPLATES_KEY, JSON.stringify(next[i])]);
  }
  return next;
}

function makeId() {
  return "tpl_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  try {
    if (req.method === "GET") {
      var items = await listTemplates();
      res.status(200).json({ templates: items });
      return;
    }

    if (req.method === "POST") {
      var body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      var name = String(body.name || "").trim().slice(0, 120);
      var draft = body.draft || {};
      if (!name) { res.status(400).json({ error: "name required" }); return; }
      var savedBy = (req.authPrincipal && (req.authPrincipal.email || req.authPrincipal.name)) || "create-tab";
      var record = {
        id: makeId(),
        name: name,
        savedAt: new Date().toISOString(),
        savedBy: savedBy,
        draft: pickTemplateDraft(draft)
      };
      await saveTemplate(record);
      res.status(200).json({ ok: true, template: record });
      return;
    }

    if (req.method === "DELETE") {
      var id = String(req.query.id || "").trim();
      if (!id) { res.status(400).json({ error: "id required" }); return; }
      var remaining = await deleteTemplate(id);
      res.status(200).json({ ok: true, templates: remaining });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("templates endpoint error", err);
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
