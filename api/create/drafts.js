// Persistent, TEAM-SHARED Create-tab drafts. Unlike templates (which
// snapshot reusable config and deliberately drop creatives + dates),
// a draft is a full in-progress build the team can leave and resume,
// or that one person preps and another finishes (junior preps /
// senior reviews + launches). sessionStorage in CreateTab.jsx stays
// as the instant local cache; this is the durable, shareable copy.
//
// Storage: a single Redis list "create:drafts" (one JSON record per
// draft, newest first), capped at MAX_DRAFTS. Saves UPSERT by id so
// the frontend autosave updates one record instead of churning the
// list. Drafts carry creatives, but only Meta asset REFERENCES
// (imageHash / videoId) and copy text, never binary, so records stay
// small.
//
// Auth: same checkCreateAuth gate as every other create-tab endpoint
// (Bearer token from /api/create/auth). Rate-limited at the endpoint.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

var DRAFTS_KEY = "create:drafts";
var MAX_DRAFTS = 100;
// Hard ceiling on a single serialised record. A normal draft is a few
// KB; this only trips on something pathological (pasted data URLs,
// runaway arrays) and protects Redis / the response payload.
var MAX_RECORD_BYTES = 300000;

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

function str(v, max) { return String(v == null ? "" : v).slice(0, max || 200); }

// One creative, reduced to the resume-critical fields. Only references
// and copy, never binary. Caps string lengths defensively.
function pickCreative(c) {
  c = c || {};
  return {
    imageHash: c.imageHash || null,
    videoId: c.videoId || null,
    headline: str(c.headline, 400),
    primaryText: str(c.primaryText, 2000),
    description: str(c.description, 400),
    linkUrl: str(c.linkUrl, 1000),
    callToAction: str(c.callToAction, 60),
    adName: str(c.adName, 200),
    assetIndex: Number(c.assetIndex || 1),
    assetName: str(c.assetName, 120),
    productAction: str(c.productAction, 120),
    filename: str(c.filename, 260)
  };
}

// Whitelist every field the wizard needs to fully rehydrate a build.
// Mirrors CreateTab's draft shape; includes creatives + dates (the
// two things templates intentionally drop).
function pickDraft(draft) {
  if (!draft || typeof draft !== "object") return {};
  var creatives = Array.isArray(draft.creatives) ? draft.creatives.slice(0, 20).map(pickCreative) : [];
  var av = draft.adVariants || {};
  var clip = function(arr) { return (Array.isArray(arr) ? arr : []).slice(0, 10).map(function(s){ return str(s, 2000); }); };
  return {
    accountId: str(draft.accountId, 80),
    accountName: str(draft.accountName, 200),
    objective: str(draft.objective, 60) || "OUTCOME_TRAFFIC",
    specialAdCategories: Array.isArray(draft.specialAdCategories) ? draft.specialAdCategories.slice(0, 10) : [],
    clientCode: str(draft.clientCode, 40),
    productName: str(draft.productName, 80),
    variant: str(draft.variant, 80),
    platformMode: str(draft.platformMode, 20) || "fb_ig",
    pageId: str(draft.pageId, 80),
    pageName: str(draft.pageName, 200),
    instagramId: str(draft.instagramId, 80),
    audience: (draft.audience && typeof draft.audience === "object") ? draft.audience : {},
    placement: (draft.placement && typeof draft.placement === "object") ? draft.placement : {},
    creativeMode: str(draft.creativeMode, 20) || "single",
    creatives: creatives,
    adVariants: {
      headlines: clip(av.headlines),
      primaryTexts: clip(av.primaryTexts),
      descriptions: clip(av.descriptions)
    },
    multiAdvertiserAds: !!draft.multiAdvertiserAds,
    autoSplitByRatio: !!draft.autoSplitByRatio,
    funding: str(draft.funding, 10) || "ABO",
    budgetMode: str(draft.budgetMode, 12) || "daily",
    dailyBudgetRand: Number(draft.dailyBudgetRand || 0),
    lifetimeBudgetRand: Number(draft.lifetimeBudgetRand || 0),
    startDate: str(draft.startDate, 40),
    endDate: str(draft.endDate, 40),
    pixelId: str(draft.pixelId, 80),
    conversionEvent: str(draft.conversionEvent, 80),
    urlTags: str(draft.urlTags, 1000)
  };
}

async function listDrafts() {
  var res = await redisCmd(["LRANGE", DRAFTS_KEY, "0", String(MAX_DRAFTS - 1)]);
  if (!res || !res.result) return [];
  return res.result.map(function(s){
    try { return JSON.parse(s); } catch (_) { return null; }
  }).filter(Boolean);
}

// Upsert: drop any existing record with the same id, then unshift the
// new/updated one to the front, then rewrite. The list is small
// (<=100) so a full rewrite is cheaper and simpler than LREM-by-value.
async function upsertDraft(record) {
  var existing = await listDrafts();
  var next = existing.filter(function(d){ return d && d.id !== record.id; });
  next.unshift(record);
  if (next.length > MAX_DRAFTS) next = next.slice(0, MAX_DRAFTS);
  await redisCmd(["DEL", DRAFTS_KEY]);
  // RPUSH in order so index 0 stays newest.
  for (var i = 0; i < next.length; i++) {
    await redisCmd(["RPUSH", DRAFTS_KEY, JSON.stringify(next[i])]);
  }
  return next;
}

async function deleteDraft(id) {
  var existing = await listDrafts();
  var next = existing.filter(function(d){ return d && d.id !== id; });
  await redisCmd(["DEL", DRAFTS_KEY]);
  for (var i = 0; i < next.length; i++) {
    await redisCmd(["RPUSH", DRAFTS_KEY, JSON.stringify(next[i])]);
  }
  return next;
}

function makeId() {
  return "drf_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 60 }))) return;

  try {
    var who = (req.authPrincipal && (req.authPrincipal.email || req.authPrincipal.name)) || "create-tab";

    if (req.method === "GET") {
      var all = await listDrafts();
      var id = String(req.query.id || "").trim();
      if (id) {
        var one = all.filter(function(d){ return d && d.id === id; })[0] || null;
        res.status(200).json({ draft: one });
        return;
      }
      // List view: omit the heavy draft body, return just the metadata
      // the picker needs. Full body is fetched on open via ?id=.
      var summaries = all.map(function(d){
        return {
          id: d.id, name: d.name, step: d.step || 0,
          savedBy: d.savedBy, savedAt: d.savedAt,
          updatedBy: d.updatedBy || d.savedBy, updatedAt: d.updatedAt || d.savedAt,
          clientCode: (d.draft && d.draft.clientCode) || "",
          objective: (d.draft && d.draft.objective) || "",
          accountName: (d.draft && d.draft.accountName) || ""
        };
      });
      res.status(200).json({ drafts: summaries });
      return;
    }

    if (req.method === "POST") {
      var body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      var name = String(body.name || "").trim().slice(0, 120);
      if (!name) { res.status(400).json({ error: "name required" }); return; }
      var draft = pickDraft(body.draft || {});
      var step = Math.max(0, Math.min(6, Number(body.step || 0)));
      var id = String(body.id || "").trim();

      var prior = null;
      if (id) {
        var current = await listDrafts();
        prior = current.filter(function(d){ return d && d.id === id; })[0] || null;
      }
      var record = {
        id: (prior && prior.id) || makeId(),
        name: name,
        step: step,
        savedBy: (prior && prior.savedBy) || who,
        savedAt: (prior && prior.savedAt) || new Date().toISOString(),
        updatedBy: who,
        updatedAt: new Date().toISOString(),
        draft: draft
      };
      var serialised = JSON.stringify(record);
      if (serialised.length > MAX_RECORD_BYTES) {
        res.status(413).json({ error: "Draft too large to save. Remove pasted data URLs or excess variants." });
        return;
      }
      var drafts = await upsertDraft(record);
      res.status(200).json({ ok: true, draft: record, count: drafts.length });
      return;
    }

    if (req.method === "DELETE") {
      var delId = String(req.query.id || "").trim();
      if (!delId) { res.status(400).json({ error: "id required" }); return; }
      var remaining = await deleteDraft(delId);
      res.status(200).json({ ok: true, drafts: remaining.map(function(d){ return { id: d.id, name: d.name }; }) });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("drafts endpoint error", err);
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
