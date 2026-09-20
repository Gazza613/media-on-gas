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

// Audit fix #7b: skills live in a Redis hash (field = skill id) instead
// of a single JSON blob at sami:skills, so two admins editing the
// library simultaneously cannot clobber each other.
var LEGACY_SKILLS_KEY = "sami:skills";
var SKILLS_HASH_KEY = "sami:skills:hash";
var GUIDED_BUILD_SKILL_ID = "guided-campaign-build";

async function seedSkillsHash(list) {
  for (var i = 0; i < list.length; i++) {
    var s = list[i];
    if (s && s.id) await redisCmd(["HSET", SKILLS_HASH_KEY, s.id, JSON.stringify(s)]);
  }
}

async function migrateLegacySkills() {
  var legacy = await redisCmd(["GET", LEGACY_SKILLS_KEY]);
  if (!legacy || !legacy.result) return [];
  var parsed;
  try { parsed = JSON.parse(legacy.result); } catch (_) { parsed = null; }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    await redisCmd(["DEL", LEGACY_SKILLS_KEY]);
    return [];
  }
  await seedSkillsHash(parsed);
  await redisCmd(["DEL", LEGACY_SKILLS_KEY]);
  return parsed;
}

async function ensureGuidedBuildSkill(currentList) {
  if (currentList.find(function (s) { return s && s.id === GUIDED_BUILD_SKILL_ID; })) return currentList;
  var defaults = seedDefaults();
  var guided = defaults.find(function (s) { return s && s.id === GUIDED_BUILD_SKILL_ID; });
  if (!guided) return currentList;
  try { await redisCmd(["HSET", SKILLS_HASH_KEY, guided.id, JSON.stringify(guided)]); }
  catch (_) { /* non-fatal */ }
  return [guided].concat(currentList);
}

async function readSkills() {
  var r = await redisCmd(["HGETALL", SKILLS_HASH_KEY]);
  var raw = r && Array.isArray(r.result) ? r.result : [];
  var list = [];
  if (raw.length === 0) {
    var migrated = await migrateLegacySkills();
    if (migrated.length === 0) {
      // Empty store: seed the defaults into the hash so subsequent
      // writes stay in the concurrent-safe path.
      var defaults = seedDefaults();
      await seedSkillsHash(defaults);
      return defaults.slice(0, MAX_SKILLS);
    }
    list = migrated;
  } else {
    for (var i = 0; i < raw.length; i += 2) {
      try {
        var s = JSON.parse(raw[i + 1]);
        if (s && s.id) list.push(s);
      } catch (_) { /* skip corrupt row */ }
    }
  }
  list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  list = await ensureGuidedBuildSkill(list);
  return list.slice(0, MAX_SKILLS);
}

async function writeSkill(skill) {
  if (!skill || !skill.id) return;
  await redisCmd(["HSET", SKILLS_HASH_KEY, skill.id, JSON.stringify(skill)]);
  // Cap enforcement: if the hash grew past the library cap, prune the
  // oldest entries. Done after the write so a fresh save cannot be the
  // one dropped by its own cap-check.
  var sz = await redisCmd(["HLEN", SKILLS_HASH_KEY]);
  var count = sz && sz.result ? parseInt(sz.result, 10) : 0;
  if (count > MAX_SKILLS) {
    var all = await readSkills();
    var toDrop = all.slice(MAX_SKILLS);
    for (var k = 0; k < toDrop.length; k++) {
      await redisCmd(["HDEL", SKILLS_HASH_KEY, toDrop[k].id]);
    }
  }
}

async function deleteSkill(skillId) {
  if (!skillId) return;
  await redisCmd(["HDEL", SKILLS_HASH_KEY, skillId]);
}

// First-run default skills so the sidebar isn't empty for the first user.
// These render as clickable prompts; the team can edit/delete/add later.
function seedDefaults() {
  return [
    {
      id: GUIDED_BUILD_SKILL_ID,
      label: "New Campaign — Guided Build",
      description: "Walk through every material campaign question before building. Ends in one PLAN_CARD.",
      prompt: [
        "Run the GAS Guided Campaign Build. Your job: walk me through every material decision so I don't forget anything, then emit ONE PLAN_CARD covering every write required to launch.",
        "",
        "Start with:",
        "\"Full brief already in hand? If yes, paste it and I'll build the plan card. If not, I'll walk you through step by step, one question at a time.\"",
        "",
        "If I paste a full brief, extract answers to the mandatory + relevant conditional questions below. Only re-ask the fields you cannot infer.",
        "",
        "If I want the guided flow, ask these ONE AT A TIME in order, waiting for each answer before the next. Confirm the answer briefly, then move on.",
        "",
        "MANDATORY (always ask, in this order):",
        "  1. Client name.",
        "  2. Objective (leads / traffic / awareness / sales / community / app installs).",
        "  3. Destination (WhatsApp number, landing page URL, on-Meta form, IG DM, app install).",
        "  4. Budget: amount + type (lifetime or daily) + currency (default ZAR).",
        "  5. Dates: start and end (or say 'ongoing').",
        "  6. Geographic focus (cities / radii / country / exclusions).",
        "  7. Age range.",
        "  8. Gender (all / male / female).",
        "  9. Platforms (Facebook, Instagram, Messenger, Audience Network, WhatsApp Status, Threads). Ask which subset.",
        " 10. Placements (Feed, Stories, Reels, Explore, Marketplace, In-Stream). Ask which subset.",
        " 11. Creative on hand (Drive/Dropbox link OR 'will supply later'). If a folder link, walk the folder and emit a CREATIVE_PAIR_CARD before continuing.",
        "",
        "CONDITIONAL (ask only when they apply based on the answers above):",
        "  - Pixel + optimisation event (traffic/sales/leads with a non-WhatsApp destination): is the pixel installed, which event is the goal?",
        "  - CAPI dataset + WABA ID + CRM event (WhatsApp destination AND they want lead-quality optimisation): confirm dataset, WABA, and which CRM event marks a qualified lead.",
        "  - Landing page URL + mobile-speed sanity (non-WhatsApp destination).",
        "  - Custom-audience seed + exclusion list (retargeting or lookalike).",
        "  - Frequency cap (awareness objective).",
        "  - CBO vs ABO (any campaign). Default CBO unless the client uses ABO by convention.",
        "  - Bid strategy: default 'Highest volume / lowest cost'. Only ask if the AM might want a cost cap or bid cap.",
        "  - Ads copy + headline + CTA button (Chat now / Learn more / Sign up / Book now / etc). Ask for the exact copy and CTA per creative group if different.",
        "  - Naming convention: GAS default is Client_Objective_Funding_YYYYMM_Variant for campaign, Audience_Geo_Demo_Placement for ad set, Format_Concept_Version for ad. Use it unless the client's saved memory overrides.",
        "  - Compliance / brand-safety flags (health, financial, alcohol, minors).",
        "",
        "REFUSE to emit a PLAN_CARD until every mandatory field is answered AND every relevant conditional field is answered. If the AM says 'just build it', re-ask the missing questions before you emit anything.",
        "",
        "Once you have every answer, emit ONE PLAN_CARD containing every write required (campaign + ad set(s) + ad(s) + custom-audience uploads). Include the exact naming for each level. Every child must carry operation_id and input_data. Then STOP and wait for APPROVED_PLAN.",
        "",
        "Tone: senior strategist. Do NOT lecture. One question per turn. Assume the AM knows their craft."
      ].join("\n")
    },
    {
      id: "b2b-lead-draft",
      label: "Draft a B2B lead campaign",
      description: "Ask the standard B2B qualification questions and propose a lead-gen structure.",
      prompt: "I want to draft a new B2B lead-generation campaign. Please ask me for: client, industry angle, budget + dates, geographic focus, primary destination (WhatsApp / form / landing page), and any creative already prepared. Then propose a campaign structure following GAS naming conventions, keeping everything paused until I approve."
    },
    {
      id: "weekly-optimisation-audit",
      label: "Weekly optimisation audit",
      description: "Full strategist-grade weekly review of a client. Pulls live data, ranks by impact, ends in a PLAN_CARD.",
      prompt: [
        "Run the GAS Weekly Optimisation Audit for the client I name. Every number you cite MUST come from a live tool call in this same turn, never from memory or invention. If the data is not available, say so plainly.",
        "",
        "Start by asking:",
        "\"Which client, and what date range? Default is last 7 days. Also, is there anything specific you want me to prioritise (spend leaks, scale winners, creative fatigue, audience refresh)?\"",
        "",
        "Then run this 7-dimension review IN ORDER. Pull the data for each dimension via a tool call BEFORE writing the analysis. Skip dimensions the client doesn't use (e.g. no TikTok = skip TikTok comparison).",
        "",
        "  1. SPEND vs PACE. Total spend last 7d vs the flight budget. Under-pacing or over-pacing? Days remaining, R/day required to land on plan.",
        "  2. HEADLINE KPIs. CPM, CTR, CPC, cost-per-result (leads / purchases / conversations depending on objective). Benchmark each against Meta ranges (CTR 0.9-1.4% good, CPC under R1.50 excellent) and flag anything materially off.",
        "  3. WINNERS to SCALE. Rank ad sets by cost-per-result ascending, spend > R500 in the window. Top 3 candidates for a budget lift (10-20% increment, not doubled).",
        "  4. LEAKS to CUT or FIX. Ad sets above the client's cost-per-result target with meaningful spend. Recommend pause or refresh (creative or audience).",
        "  5. CREATIVE FATIGUE. Frequency > 4 on any active ad set; frequency trend rising vs prior 7d. Flag ads to rotate out or pair with new creative.",
        "  6. AUDIENCE HEALTH. Reach saturation vs total audience size, first-time vs repeat impression ratio if available.",
        "  7. STRUCTURAL. Any objective / optimization_goal mismatches (e.g. WhatsApp CTA on a Traffic campaign), naming-convention drift, missing tracking.",
        "",
        "After the review, produce a summary line: 'X flags total — Y critical, Z warning'. Then propose specific ACTIONS.",
        "",
        "If any of the actions involve live writes (pause an ad set, shift budget, duplicate for a test), emit ONE PLAN_CARD covering every write. The AM approves the whole plan with one click; the GAS engine authorises every child. Do NOT emit individual APPROVAL_CARDs for a multi-write optimisation, use PLAN_CARD.",
        "",
        "If the recommended actions are all creative / brief-side (not platform writes), skip the plan card and hand the summary back with next-step guidance.",
        "",
        "Never invent a number. Never propose a budget lift on an ad set that spent less than R500 in the window (not enough signal). Never recommend a pause without stating what would replace that spend."
      ].join("\n")
    },
    {
      id: "deep-client-review",
      label: "Deep client optimisation review",
      description: "Longer 30-day strategic review. Trend analysis, structural recommendations, plus optional plan card.",
      prompt: [
        "Run the GAS Deep Client Optimisation Review. This is the monthly-cadence strategic version of the weekly audit: wider window, deeper structural analysis, and it produces a written narrative for the client alongside any platform actions.",
        "",
        "Ask first:",
        "\"Which client, and which 30-day window? Default is last 30 days rolled to today. Do you also want me to compare to the previous 30 days for trend?\"",
        "",
        "Pull the data for each section via live tool calls, never invent numbers.",
        "",
        "SECTION A: Performance narrative (2-3 short paragraphs). Total spend, results delivered, cost-per-result, trend vs previous 30 days. Lead with the headline number that matters most to the client's KPI, not with a table.",
        "",
        "SECTION B: What's working. Top 3 ad sets by efficiency, what they have in common (audience, creative, placement). Concrete evidence for scaling.",
        "",
        "SECTION C: What's leaking. Bottom 3 by cost-per-result with spend > R1,000. Root-cause hypothesis per line: audience mismatch, creative fatigue, wrong objective, wrong destination, or seasonal noise. State the confidence level.",
        "",
        "SECTION D: Structural moves. Naming / objective / tracking hygiene. Missing CAPI feedback. Retargeting exclusions overdue. Placement or platform mix skewed.",
        "",
        "SECTION E: Test to run next. One prioritised test recommendation with success criteria (X% CPA reduction over 14 days, minimum 200 conversions for signal).",
        "",
        "SECTION F: Actions to fire now. Any budget shifts, pauses, or duplications the AM should approve. Emit ONE PLAN_CARD for all live writes. Skip the plan card if the review is diagnostic only.",
        "",
        "Tone: senior strategist writing for a marketing director. No fluff, no hedging, no lecture. Numbers first, judgement clearly labelled. Never invent a number."
      ].join("\n")
    },
    {
      id: "weekly-optimisation-audit-legacy",
      label: "Weekly optimisation audit (short)",
      description: "Diagnostic-only quick audit. No writes. Kept for reference.",
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
  // Audit fix #4: skill authorship (createdBy / updatedBy) comes from
  // the signed JWT, not body.user, so authorship can be trusted.
  var auth = checkCreateAuth(req, res);
  if (!auth) return;
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
      var user = auth.user;
      // Read only the one existing field we care about so a concurrent
      // save on a different skill cannot influence createdBy/createdAt.
      var existingRaw = await redisCmd(["HGET", SKILLS_HASH_KEY, id]);
      var existing = null;
      if (existingRaw && existingRaw.result) { try { existing = JSON.parse(existingRaw.result); } catch (_) {} }
      var now = Date.now();
      var record = {
        id: id, label: label, description: description, prompt: prompt,
        updatedBy: user, updatedAt: now,
        createdBy: existing ? existing.createdBy : user,
        createdAt: existing ? existing.createdAt : now
      };
      await writeSkill(record);
      var next = await readSkills();
      res.status(200).json({ skills: next });
      return;
    }

    if (op === "delete") {
      var did = normSkillId(body.id);
      if (!did) { res.status(400).json({ error: "id required." }); return; }
      await deleteSkill(did);
      var pruned = await readSkills();
      res.status(200).json({ skills: pruned });
      return;
    }

    res.status(400).json({ error: "Unknown op. Use list | save | delete." });
  } catch (err) {
    console.error("[sami-skills] handler error", err);
    res.status(500).json({ error: "Skills operation failed." });
  }
}
