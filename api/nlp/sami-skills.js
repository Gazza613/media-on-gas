// Phase 4 of the Sami Hub rebuild: reusable Skills library.
//
// A "skill" is a saved prompt pattern the whole team can invoke, e.g.
//   - "Draft a B2B lead campaign"
//   - "Weekly optimisation audit"
//   - "New client onboarding questions"
// Clicking a skill in the left rail injects its prompt text into the
// chat composer for Sami to react to. Team-shared (no per-user
// namespace) so a skill Gary saves is visible to everyone on the team.
//
// Storage: single Redis key holding the whole skills array. Cap at 50
// to keep the sidebar readable. Reuses the same Upstash store as the
// rest of the app (KV_REST_API_URL / KV_REST_API_TOKEN).
//
// Endpoints (all POST):
//   op=list                       Returns [{id, label, description, prompt, ...}]
//   op=save    + skill payload    Upserts a skill (create if new id, update if exists)
//   op=delete  + id               Removes a skill

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

var MAX_SKILLS = 50;
var MAX_LABEL_LEN = 80;
var MAX_DESCRIPTION_LEN = 240;
var MAX_PROMPT_LEN = 8000;

function cleanStr(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}
// A skill id is either a short kebab-case slug caller supplies, or
// auto-generated on create. Restrict chars to prevent Redis key confusion.
function normSkillId(raw) {
  var s = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  if (!s) return "";
  return s.length > 60 ? s.slice(0, 60) : s;
}
function makeSkillId(label) {
  var base = normSkillId(label) || "skill";
  var suffix = Math.random().toString(36).slice(2, 6);
  return base + "-" + suffix;
}

// ---- Redis helpers (same shape as sami-threads.js) -----------------------

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
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
    console.error("[sami-skills] redis error", err);
    return null;
  }
}

var SKILLS_KEY = "sami:skills";

async function readSkills() {
  var r = await redisCmd(["GET", SKILLS_KEY]);
  if (!r || !r.result) return seedDefaults();
  try {
    var parsed = JSON.parse(r.result);
    return Array.isArray(parsed) ? parsed : seedDefaults();
  } catch (_) { return seedDefaults(); }
}
async function writeSkills(arr) {
  arr = (Array.isArray(arr) ? arr : []).slice(0, MAX_SKILLS);
  await redisCmd(["SET", SKILLS_KEY, JSON.stringify(arr)]);
}

// First-run default skills so the sidebar isn't empty for the first user.
// These render as clickable prompts; the team can edit/delete/add later.
function seedDefaults() {
  return [
    {
      id: "b2b-lead-draft",
      label: "Draft a B2B lead campaign",
      description: "Ask the standard B2B qualification questions and propose a lead-gen structure.",
      prompt: "I want to draft a new B2B lead-generation campaign. Please ask me for: client, industry angle, budget + dates, geographic focus, primary destination (WhatsApp / form / landing page), and any creative already prepared. Then propose a campaign structure following GAS naming conventions, keeping everything paused until I approve."
    },
    {
      id: "weekly-optimisation-audit",
      label: "Weekly optimisation audit",
      description: "Pull last 7d performance and suggest specific actions.",
      prompt: "Run a weekly optimisation audit for the client I name. Pull last 7 days of performance across every platform they use, flag any ad set spending over R500 with above-benchmark cost per result, identify top 3 winners to scale, and suggest specific budget shifts. Do not make any changes yet — this is diagnostic only."
    },
    {
      id: "new-client-onboarding",
      label: "New client onboarding checklist",
      description: "Walk through the standard onboarding questions for a new client.",
      prompt: "Walk me through the standard GAS new-client onboarding checklist. Ask for the client's brand name, primary objective (leads / traffic / awareness / community), monthly budget range, target audience, primary conversion action, existing ad accounts to link, page/property access status, and any creative on hand. At the end, summarise the setup checklist we need to complete before the first campaign can launch."
    },
    {
      id: "creative-review",
      label: "Review a creative folder",
      description: "Walk a Drive/Dropbox folder and propose a creative structure.",
      prompt: "I will paste a Drive or Dropbox folder link. Walk the folder, pair 1:1 with 9:16 assets, flag anything without a matching pair, and propose which creatives to launch first and which to hold for retargeting. Do not upload anything to Meta yet — just show me the pairing map."
    }
  ];
}

// ---- Handler -------------------------------------------------------------

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  if (!getRedisCreds()) {
    res.status(503).json({ error: "Sami Hub storage not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing)." });
    return;
  }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};
  var op = String(body.op || "").toLowerCase();

  try {
    if (op === "list") {
      var skills = await readSkills();
      res.status(200).json({ skills: skills });
      return;
    }

    if (op === "save") {
      var skillIn = body.skill || {};
      var label = cleanStr(skillIn.label, MAX_LABEL_LEN);
      var description = cleanStr(skillIn.description, MAX_DESCRIPTION_LEN);
      var prompt = cleanStr(skillIn.prompt, MAX_PROMPT_LEN);
      if (!label || !prompt) { res.status(400).json({ error: "label and prompt are required." }); return; }
      var id = normSkillId(skillIn.id) || makeSkillId(label);
      var user = cleanStr(body.user, 40) || "";
      var current = await readSkills();
      var existing = current.find(function (s) { return s.id === id; });
      var now = Date.now();
      var record = {
        id: id, label: label, description: description, prompt: prompt,
        updatedBy: user, updatedAt: now,
        createdBy: existing ? existing.createdBy : user,
        createdAt: existing ? existing.createdAt : now
      };
      var next = current.filter(function (s) { return s.id !== id; });
      next.unshift(record);
      await writeSkills(next);
      res.status(200).json({ skills: next.slice(0, MAX_SKILLS) });
      return;
    }

    if (op === "delete") {
      var did = normSkillId(body.id);
      if (!did) { res.status(400).json({ error: "id required." }); return; }
      var currentD = await readSkills();
      var pruned = currentD.filter(function (s) { return s.id !== did; });
      await writeSkills(pruned);
      res.status(200).json({ skills: pruned });
      return;
    }

    res.status(400).json({ error: "Unknown op. Use list | save | delete." });
  } catch (err) {
    console.error("[sami-skills] handler error", err);
    res.status(500).json({ error: "Skills operation failed." });
  }
}
