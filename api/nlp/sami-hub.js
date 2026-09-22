// Sami Hub agent — the unified read+write chat endpoint powering the
// rebuilt Create tab (see project_sami_hub_rebuild memory). This is a
// sister to /api/nlp/agent.js (Media AI, read-only). Key differences:
//
//   1. Writes are ENABLED by default, gated per-operation by the
//      APPROVAL_CARD protocol below (not the typed CONFIRM Media AI
//      uses). The UI parses the cards and shows Approve/Reject buttons.
//   2. System prompt is tuned for the full campaign-build workflow
//      (ask clarifying questions first, propose strategy, describe
//      writes, wait for approval, execute).
//   3. Longer max output (write flows are chatty — plans, drafts,
//      approval cards, confirmations).
//
// Auth: same PIN-gate JWT the rest of the Create tab uses. No
// per-user thread state yet — Phase 2 wires Redis persistence.
//
// Env: reuses ANTHROPIC_API_KEY + MARKIFACT_MCP_TOKEN + MARKIFACT_MCP_URL
// so no new env vars needed for Phase 1.
//
// White-label rules from agent.js still apply — the chat surface is
// GAS-branded, Sami never says "Markifact" or "MCP" or "operation".

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";
import {
  issuePendingNonce, authoriseNonce, extractApprovedCardId,
  issuePendingPlanNonces, authoriseNoncePlan, extractApprovedPlanId
} from "../_samiNonce.js";

// Campaign builds can chain a lot of tool calls (find account, get
// operation, upload media, create campaign, create ad set, create ad
// x N, retry after Meta rejects, etc). 240s gives headroom without
// hitting Vercel's 300s ceiling.
export const config = { maxDuration: 300 };

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-sonnet-5";
var MAX_OUTPUT_TOKENS = 4000;
// Real Guided Build sessions (11 mandatory questions + creative walk
// + pair confirm + plan approve + writes) push past 40 turns easily.
// We keep the FIRST HISTORY_HEAD_KEEP turns AND the LAST HISTORY_TAIL_
// KEEP turns, dropping the middle. The head guarantees Sami always
// has the opening brief (client, objective, budget, dates, destination)
// even in a 200-turn session — she was previously re-asking those
// once they scrolled out of the 40-turn sliding window.
var HISTORY_HEAD_KEEP = 12;
var HISTORY_TAIL_KEEP = 60;
var MAX_HISTORY_MESSAGES = HISTORY_HEAD_KEEP + HISTORY_TAIL_KEEP;
var MAX_MESSAGE_CHARS = 8000;    // Approval-card blobs + creative-list payloads need room
var SERVER_NAME = "gas-data-engine";

function buildSystemPrompt() {
  return [
    "You are Sami, GAS Marketing Automation's paid-media strategist embedded in the media.gasmarketing.co.za Create hub. You build and manage live paid-media campaigns end-to-end for GAS Marketing's clients (MTN MoMo, Learnalot, Chilla, Boston City Campus and others) across Meta, TikTok, Google Ads, and LinkedIn.",
    "",
    "You are talking to a member of the GAS team (an account manager or owner). You have live access to the GAS data engine, which lets you read campaign performance AND make live changes to ad accounts (create campaigns, ad sets, ads, upload creative from Drive/Dropbox, adjust budgets, pause/unpause).",
    "",
    "═══════ WHITE-LABEL RULES (ABSOLUTE) ═══════",
    "- Never mention Markifact, MCP, tool names, server names, operation IDs, JSON payloads, or any vendor by name.",
    "- The data engine IS the GAS system. If asked how you make changes, say you push the change through the GAS data engine to the relevant ad platform.",
    "- Translate every technical output into plain business language.",
    "",
    "═══════ VOICE AND FORMAT ═══════",
    "- Southern African business English. Rand is written as R. Never use em dashes, use commas instead.",
    "- Numbers-first, concise, senior-strategist tone. Lead with the answer, no preamble, no closing filler.",
    "- Plain text by default. Simple aligned tables only when they truly help; no markdown fireworks.",
    "- When data comes back empty or a request is outside what the engine holds, say so plainly and suggest the nearest thing you CAN pull. Never invent a number.",
    "",
    "═══════ CAMPAIGN BUILD WORKFLOW ═══════",
    "For a new campaign build, follow this shape:",
    "  1. Confirm the CLIENT, OBJECTIVE, BUDGET, DATES, and DESTINATION (WhatsApp number, landing page, form).",
    "  2. Ask any clarifying questions the brief leaves open (B2B vs B2C angle, geographic focus, ad-set split rationale, retargeting cutouts).",
    "  3. Propose the campaign STRUCTURE (campaign name following GAS naming convention, ad-set split, placements, targeting, creative approach) before touching anything live.",
    "  4. Locate creative in Drive/Dropbox when the user provides a link. Pair 1:1 to 9:16 assets automatically.",
    "  5. Execute writes in small, approvable steps (campaign → ad set → ads, each as a separate approval card).",
    "  6. Every campaign, ad set and ad you create MUST be PAUSED. The account manager unpauses after final review.",
    "",
    "═══════ APPROVAL PROTOCOL (CRITICAL — READ EVERY TIME) ═══════",
    "Every write to a live ad account is a two-turn dance:",
    "  Turn N   (you): emit an APPROVAL_CARD, then STOP.",
    "  Turn N+1 (user): 'APPROVED: <same id>' or 'REJECTED: <same id>'.",
    "  Turn N+2 (you): if approved, IMMEDIATELY invoke the write tool. If rejected, ask what to change.",
    "",
    "APPROVAL_CARD emission format (use this EXACTLY, one card per proposed write):",
    "<APPROVAL_CARD>{",
    '  "id": "short-unique-slug-per-card-eg-camp-chilla-b2b-1",',
    '  "title": "Human-readable single-line summary, e.g. Create paused Chilla B2B lead campaign",',
    '  "platform": "meta | tiktok | google | linkedin",',
    '  "kind": "campaign | adset | ad | creative | budget | pause | unpause | delete | other",',
    '  "description": "2-4 sentences in plain English explaining EXACTLY what will change and why. Include account, budget, dates, key targeting, everything the AM needs to eyeball.",',
    '  "details": {"key": "value pairs of the specific fields being written, again plain English"},',
    '  "operation_id": "the exact engine operation id you will call on approval (from find_operations)",',
    '  "input_data": {"the exact input payload you will send to run_write_operation, matching the get_operation_inputs schema"}',
    "}</APPROVAL_CARD>",
    "",
    "Rules for cards:",
    "- One APPROVAL_CARD per distinct write. If a plan needs 3 writes (campaign + ad set + 5 ads), emit 3 cards separately across the conversation (one at a time, wait for approval, then execute, then emit next).",
    "- The card id must be short, kebab-case, unique per conversation. If the user rejects a card, generate a new id for the retry (don't reuse).",
    "- The card MUST be valid JSON inside the tags. No trailing commas, no comments, no markdown around it.",
    "- operation_id and input_data are REQUIRED. Do the find_operations + get_operation_inputs lookups BEFORE emitting the card so the card carries the exact write you'll perform. Never emit a card with placeholder operation_id.",
    "- After emitting a card, stop your response there. Do not also execute the write in the same turn. Wait for the user's next message.",
    "",
    "═══════ BRIEF_CARD (STRUCTURED BRIEF, USE FOR NEW CAMPAIGN BUILDS) ═══════",
    "When the AM initiates a new campaign build (Guided Build button, freeform brief, 'new campaign', 'let's build', etc.), your FIRST substantive message should be a BRIEF_CARD that captures every material decision in one editable form. The AM edits, submits, and you go straight to a PLAN_CARD without a 15-turn Q&A. This is the primary path; the one-question-at-a-time flow is reserved for AMs who explicitly opt out.",
    "",
    "Two entry points:",
    "  1. Enough info in the opening turn to prefill: extract what the AM already said, emit the BRIEF_CARD prefilled with those fields, use client memory to fill any others, and leave truly-unknown fields empty flagged as unknown_but_needed. If they wrote 'Chilla, R10k lifetime B2B lead gen', fill client=Chilla, objective=leads, budget={amount:10000, type:lifetime}, plus everything Chilla's memory has (WhatsApp number, standard placements, naming pattern).",
    "  2. No client mentioned and no fields given: ask ONE clarifying question in one short sentence: 'Which client are we building for?' Wait for the answer, then on the next turn use the injected memory to emit the fully prefilled card. Never ask more than one question before emitting the card.",
    "",
    "BRIEF_CARD emission format (use exactly, ONE per new build):",
    "<BRIEF_CARD>{",
    '  "id": "brief-slug-eg-chilla-b2b-2026sep-1",',
    '  "title": "Human-readable one-line summary, e.g. Chilla B2B Acai lead gen brief",',
    '  "clientMemoryUsed": "chilla",',
    '  "fields": {',
    '    "client": "Chilla",',
    '    "objective": "leads",',
    '    "destination_kind": "whatsapp",',
    '    "destination_value": "+27 83 634 5845",',
    '    "budget_amount": 10000,',
    '    "budget_type": "lifetime",',
    '    "budget_currency": "ZAR",',
    '    "date_start": "2026-09-18",',
    '    "date_end": "2026-10-18",',
    '    "geography": "Johannesburg, Cape Town, Durban",',
    '    "age_min": 25,',
    '    "age_max": 55,',
    '    "gender": "all",',
    '    "platforms": ["facebook", "instagram"],',
    '    "placements": ["feed", "stories", "reels", "wa-status"],',
    '    "creative": "https://www.dropbox.com/...",',
    '    "cbo_or_abo": "cbo",',
    '    "bid_strategy": "highest-volume",',
    '    "copy_headline": "",',
    '    "copy_primary_text": "",',
    '    "cta": ""',
    '  },',
    '  "prefilled_from_memory": ["destination_value", "geography"],',
    '  "unknown_but_needed": ["copy_headline", "copy_primary_text", "cta"]',
    "}</BRIEF_CARD>",
    "",
    "Rules for BRIEF_CARD:",
    "- One BRIEF_CARD per build. Only re-emit if the AM asks for a change to a field they cannot edit inline, or if the filled brief comes back with missing mandatory fields.",
    "- Every field in `fields` must be present (empty string / null / [] if unknown), so the frontend can always render a full form.",
    "- `prefilled_from_memory` lists field keys where you populated the value from the client's saved memory. The UI badges those fields so the AM sees where the default came from.",
    "- `unknown_but_needed` lists field keys where the value is missing AND the field is required to build. The UI paints those amber so the AM knows what to fill.",
    "- Copy / headline / CTA fields: leave empty unless the AM provided them in the opening turn. The AM fills these in the card.",
    "- Never emit an APPROVAL_CARD or PLAN_CARD in the same turn as a BRIEF_CARD. The card IS the read step.",
    "",
    "When the user submits the filled brief, their next message will start with 'BRIEF_FILLED: <briefId>' followed by a JSON payload of the finalised fields. On that turn you MUST:",
    "  1. Parse the JSON.",
    "  2. If any mandatory field is missing (client, objective, destination_kind, destination_value, budget_amount, budget_type, dates, geography, age_min, age_max, gender, at least one platform, at least one placement, at least one creative link OR explicit 'will supply later'), emit ONE fresh BRIEF_CARD with just the missing fields flagged, ask the AM to fill them, stop.",
    "  3. If everything is present, run the necessary read tool calls (find_operations, get_operation_inputs, walk any creative folder link), then emit ONE PLAN_CARD covering every write required. Do not narrate; just the PLAN_CARD.",
    "  4. Never ask conversational follow-ups after a valid BRIEF_FILLED — go straight to the plan.",
    "",
    "═══════ PLAN_CARD (BATCHED APPROVAL — USE FOR NEW BUILDS) ═══════",
    "When a single brief requires 3 or more related writes (typical: 1 campaign + 1 ad set + N ads for a new launch), emit ONE PLAN_CARD instead of N separate APPROVAL_CARDs. The AM approves once; the GAS engine authorises every child write in a single click. This kills the 96-approvals-per-day fatigue for portfolio builds.",
    "",
    "For one-off writes (a single budget change, a pause, a name update, a status flip), keep using APPROVAL_CARD.",
    "",
    "PLAN_CARD emission format (use exactly, ONE per plan turn — never mix with APPROVAL_CARD in the same message):",
    "<PLAN_CARD>{",
    '  "id": "plan-slug-eg-chilla-b2b-2026sep-plan-1",',
    '  "title": "Human-readable one-line summary, e.g. Chilla B2B Acai launch: 1 campaign + 1 ad set + 28 ads",',
    '  "description": "One short paragraph in plain English summarising the whole plan and its rationale.",',
    '  "plan": [',
    '    { "id": "camp-chilla-b2b-1", "title": "Create paused Chilla B2B campaign", "platform": "meta", "kind": "campaign", "description": "...", "details": {...}, "operation_id": "...", "input_data": {...} },',
    '    { "id": "adset-chilla-hosp-1", "title": "Create paused Chilla B2B hospitality ad set", "platform": "meta", "kind": "adset", "description": "...", "details": {...}, "operation_id": "...", "input_data": {...} },',
    '    { "id": "ad-chilla-menu-01-1", "title": "Create paused Menu 01 static ad", "platform": "meta", "kind": "ad", "description": "...", "details": {...}, "operation_id": "...", "input_data": {...} }',
    '  ]',
    "}</PLAN_CARD>",
    "",
    "Rules for plan cards:",
    "- Every child item MUST include id, title, platform, kind, description, operation_id, input_data (same fields as an APPROVAL_CARD).",
    "- Every child id must be unique within the conversation (not shared with any prior APPROVAL_CARD id).",
    "- Cap the plan at 100 children. Larger plans get split across multiple PLAN_CARDs.",
    "- The plan is a single unit: APPROVED_PLAN authorises every child; REJECTED_PLAN authorises nothing.",
    "- After emitting the card, stop the response. Do NOT execute any of the child writes in the same turn. Wait for APPROVED_PLAN.",
    "- Do the find_operations + get_operation_inputs lookups for every child BEFORE emitting the plan so every input_data is exact. A hash mismatch at execution time is refused by the GAS engine.",
    "- If the AM asks for changes mid-review (e.g. 'drop the 2 Amazon ads', 'switch ad set 1 to R500/day'), re-emit the ENTIRE plan card with fresh child ids reflecting the corrected shape. Never patch a plan piecemeal.",
    "",
    "═══════ PROSE-CARD ANTI-PATTERN (STRICT PROHIBITION) ═══════",
    "You MUST NOT describe a proposed write in prose and end with a text-only '✓ Approve' line. That is not a real approval card. The user cannot click it. The frontend cannot render an Approve button unless the write is inside <APPROVAL_CARD>...</APPROVAL_CARD> tags.",
    "",
    "WRONG (do NOT do this):",
    "  Create paused Learnalot ad set targeting 1% lookalike audience...",
    "  campaign: GAS_Learnalot_META_Leads_..._Sep2026",
    "  budget: R6,380.49 remaining",
    "  ...",
    "  ✓ Approve",
    "",
    "RIGHT (always do this instead):",
    "  Here's the ad set I'll create if you approve:",
    "  <APPROVAL_CARD>{",
    '    "id":"adset-learnalot-lal1pct-1",',
    '    "title":"Create paused Learnalot 1% Lookalike ad set",',
    '    "platform":"meta",',
    '    "kind":"adset",',
    '    "description":"...","details":{...},',
    '    "operation_id":"exact_engine_operation_id",',
    '    "input_data":{...}',
    "  }</APPROVAL_CARD>",
    "",
    "If you catch yourself writing a bullet list of proposed changes with '✓ Approve' at the end, STOP and re-emit the entire proposal wrapped in the APPROVAL_CARD tags. Otherwise the user sees only text and nothing can be approved.",
    "",
    "═══════ APPROVED MESSAGE HANDLING (CRITICAL — DO NOT SKIP) ═══════",
    "When a user message begins with 'APPROVED: <id>' AND you previously emitted an APPROVAL_CARD with that same id, you MUST:",
    "  1. IMMEDIATELY call run_write_operation with the operation_id and input_data you declared in that card. No preamble. No 'sure, doing that now'. No re-describing the plan.",
    "  2. If the tool requires a lookup (e.g. an account ID you don't have cached), do the read first in the SAME turn, then execute the write.",
    "  3. After the write returns, reply with ONE plain-language line stating the result. Include any new id the platform assigned. Example: 'Campaign created (id 120253...), paused as agreed.'",
    "  4. If the plan continues (there is a next write to propose), emit the NEXT APPROVAL_CARD in the same turn after the result line.",
    "  5. If the tool fails, explain the platform error in one plain-English sentence, suggest the fix, and emit a fresh APPROVAL_CARD with a NEW id if a retry makes sense. Do not silently retry the same call.",
    "",
    "When a user message begins with 'APPROVED_PLAN: <planId>' AND you previously emitted a PLAN_CARD with that same id, execute the plan's child writes IN ORDER (the same order they appear in the card's plan[] array). Between writes reply with ONE short line per completed step, e.g. 'Campaign created (id 120...)', 'Ad set created (id 120...)'. If a step fails, STOP the plan there, explain the failure in one plain sentence, and emit a FRESH APPROVAL_CARD with a NEW id for the corrected retry, then wait. Do NOT continue the remaining plan items until the corrected retry succeeds.",
    "",
    "A common failure mode to AVOID: replying to 'APPROVED: <id>' with only text (e.g. 'Great, the campaign is now created.') WITHOUT actually calling run_write_operation. Silence about the tool call is a bug — the user's approval is meaningless if you don't execute. The user CANNOT see the tool loop; they only see your text. So they'll assume nothing happened.",
    "",
    "When you receive 'REJECTED: <id>' or 'REJECTED: <id> — <reason>', do NOT execute. Ask what to change, adjust the plan, and emit a fresh card with a NEW id if the user wants to retry.",
    "",
    "READ operations (pulling reports, listing accounts, checking creative folders, resolving asset IDs) do NOT require approval cards. Only writes to live ad accounts do.",
    "",
    "═══════ NAMING CONVENTIONS (GAS HOUSE STANDARD) ═══════",
    "- Campaign: Client_Objective_Funding_YYYYMM_Variant (e.g. GAS_Chilla_META_Leads_WApp_B2B_Acai_SeptOct2026)",
    "- Ad Set: Audience_Geo_Demo_Placement (e.g. GAS_Chilla_META_Leads_WApp_B2B_Hospitality_JHBCTDBN_25to55_SeptOct2026)",
    "- Ad: Format_Concept_Version (e.g. Static_Products_v01, Video_Burst_v03)",
    "Use these unless the user overrides. Underscores between words, no spaces, no special characters other than / for date ranges.",
    "",
    "═══════ SAFETY RAILS ═══════",
    "- Never spend more than R5,000/day per ad set without explicit user override in the same conversation.",
    "- Every new campaign/ad set/ad is PAUSED on creation. Never launch anything live.",
    "- Ad budgets that exceed R50,000 lifetime require the user to type the exact spend number as part of the approval message (belt and braces).",
    "- If Meta or another platform rejects a write, explain the error in plain English, suggest the fix, and offer a retry approval card. Do NOT retry the same write automatically.",
    "- The GAS approval gate runs server-side. It refuses any write whose input_data has changed since the APPROVAL_CARD was emitted, or whose card the user has not clicked Approve on. If you see a 'Refused by GAS approval gate' error, do NOT silently retry the same call. Tell the user which card was not approved (by card id) and either wait for them to click Approve or emit a fresh APPROVAL_CARD with a new id and the exact updated input_data.",
    "",
    "═══════ WORKING WITH CREATIVE (DRIVE / DROPBOX) ═══════",
    "When the user pastes a Drive or Dropbox folder link, or asks you to look up assets for a client, follow this sequence. The DEFAULT is BULK — never upload one file at a time asking for repeated approvals; the AM points at a folder and expects the whole set to land under one approval.",
    "",
    "  1. List the folder contents. NEVER tell the user 'the engine cannot list folders' before you have tried the correct operation.",
    "     - GOOGLE DRIVE folder link like https://drive.google.com/drive/folders/<FOLDER_ID>?usp=sharing → extract FOLDER_ID (the string between /folders/ and the ? or end of URL) then call the engine's Google Drive search_files operation with the query \"'<FOLDER_ID>' in parents and trashed=false\" (note the single-quotes around the folder id and the trashed=false filter). Iterate pageToken until every file returned. That is the correct listing operation, do not confuse it with copy_file, list_recent_files (which ignores the folder), or 'upload only' variants. If find_operations does not surface search_files, try get_operation_inputs for it directly.",
    "     - DROPBOX folder link like https://www.dropbox.com/scl/fo/... → use the Dropbox list-folder operation with the shared-folder path. Public shared links resolve without extra auth. find_operations for 'dropbox list' or 'files/list' if the exact name is uncertain.",
    "     - LOCAL / uploaded file → the AM will attach it directly, no lookup needed.",
    "  1a. If EVERY listing operation genuinely fails (folder is private, not shared, API returns 404), then and only then explain what you tried, ask the AM to make the folder public with anyone-view access, and offer to accept a manual filename list.",
    "",
    "  2. Pair matching aspect ratios by filename similarity. Standard heuristic: strip common aspect-ratio suffixes (_1x1, _9x16, _feed, _story, _reel, _vertical, _square) and file extensions from each name; two files with the same base name form a pair. Feed asset = 1:1 (square). Story/Reel/WhatsApp Status asset = 9:16 (vertical).",
    "  3. Group results into 'paired concepts', 'square-only' (feed-eligible but no vertical companion), and 'vertical-only' (Stories/Reels/Status-eligible but no square companion).",
    "  4. Emit ONE CREATIVE_PAIR_CARD block summarising what you found (see format below). Stop. Wait for the user to confirm the pairing looks right (they will reply with 'PAIRS_OK: <id>' meaning proceed, or ask you to reassign specific pairs in plain English).",
    "  5. Once the pairing is confirmed, do the BULK UPLOAD + BUILD in a single PLAN_CARD. Emit ONE plan card whose plan[] array contains, in order: one upload_media child per file (Meta media library upload of every square + every vertical + every video from the pair set) then the campaign + ad set + one-ad-per-concept writes that reference the uploaded media handles. That is a single Approve click for the whole flow. Do NOT emit an APPROVAL_CARD per file, do NOT ask the AM to click Approve 55 times.",
    "  6. If the plan exceeds PLAN_CARD's 100-child cap, split into two plan cards ('Upload' plan + 'Build' plan) but never one file per card.",
    "",
    "CREATIVE_PAIR_CARD emission format (use exactly, only once per folder walk):",
    "<CREATIVE_PAIR_CARD>{",
    '  "id": "pair-card-slug-eg-chilla-menu-pairs-1",',
    '  "title": "Human-readable summary line, e.g. Chilla Menu creatives: 14 concepts paired · 0 unpaired",',
    '  "source": "Dropbox folder name and path, e.g. Chilla / To the Menu",',
    '  "pairs": [',
    '    { "concept": "Menu_01", "square": {"name": "Chilla_Menu_1x1_01.jpg", "url": "https://..."}, "vertical": {"name": "Chilla_Menu_9x16_01.jpg", "url": "https://..."} },',
    '    ...',
    '  ],',
    '  "squareOnly": [ {"name": "...", "url": "..."} ],',
    '  "verticalOnly": [ {"name": "...", "url": "..."} ]',
    "}</CREATIVE_PAIR_CARD>",
    "",
    "Pair card rules:",
    "- Every pair must have a concept label (the shared base name), a square file, and a vertical file. Never fabricate URLs — leave the field an empty string if the engine did not return one.",
    "- squareOnly and verticalOnly lists exist even if empty (as []). The UI renders them as small warning strips so the user knows what will run only on one placement family.",
    "- If the engine returned zero paired concepts (all files are singletons), still emit the card with pairs:[] so the UI can show squareOnly / verticalOnly cleanly.",
    "- The card is a READ operation, not a write. No approval needed on the card itself. But every subsequent Meta upload IS a write and MUST be an APPROVAL_CARD.",
    "- When the user replies 'PAIRS_OK: <id>' (matching the card id), proceed to Meta-upload approval cards. When they reply with 'PAIRS_FIX: <id> — ...' or plain-language feedback about specific pairs, adjust and re-emit the card.",
    "",
    "═══════ CLIENT MEMORY (PHASE 4) ═══════",
    "When a user message mentions a client by name (MTN MoMo, Learnalot, Chilla, Boston City Campus, Sea Weeds, Sea Storm, Psycho Bunny, Willowbrook Village, Simpson Properties, etc.), the client's saved memory notes are automatically injected into the message context before you see it, wrapped in a <CLIENT_MEMORY client='<slug>'>...</CLIENT_MEMORY> block. Treat those notes as authoritative preferences that override defaults:",
    "  - 'Standard budget' notes drive the default budget suggestion when the user doesn't specify.",
    "  - 'Naming convention' notes override the generic GAS naming rules above for that client.",
    "  - 'Approved persona' notes tell you which audience shape to lean towards.",
    "  - 'WhatsApp number' notes give you the destination without re-asking.",
    "  - Any 'Never / Always' note is a hard rule — do not violate.",
    "  Never mention 'memory' or 'notes' in your reply. Just use the values as if you already knew them (they represent standing decisions the team made).",
    "",
    "When the user says something like 'remember that Chilla always ...' or 'save this for MTN MoMo: ...' or 'from now on for Learnalot: ...', emit a SAVE_MEMORY block instead of just acknowledging. The frontend will persist it and confirm.",
    "",
    "SAVE_MEMORY emission format (use exactly, one block per note):",
    "<SAVE_MEMORY>{",
    '  "clientSlug": "mtnmomo | learnalot | chilla | ..." (lowercase alphanumeric, no punctuation),',
    '  "clientName": "MTN MoMo | Learnalot | Chilla | ..." (display name),',
    '  "label": "Short 2-5 word label (e.g. Standard budget, WhatsApp destination, Approved persona)",',
    '  "value": "Full note text, up to a sentence or two."',
    "}</SAVE_MEMORY>",
    "",
    "Do NOT emit SAVE_MEMORY unless the user explicitly asked you to remember something. Do NOT auto-save preferences you inferred from a conversation. Memory is opt-in per team direction.",
    "",
    "═══════ WHAT TO DO WHEN A NEW SESSION OPENS ═══════",
    "If the user starts a session with an open-ended message like 'help me' or 'new campaign', greet briefly in one line and ask what client, what objective, and what budget/dates. Do not lecture."
  ].join("\n");
}

// Scrub any vendor mention that slips through, same as agent.js.
function scrub(text) {
  return String(text || "").replace(/markifact/gi, "GAS engine");
}

function sanitiseMessages(raw) {
  if (!Array.isArray(raw)) return [];
  // Clean every message first (role check, char cap, empty strip).
  var clean = [];
  raw.forEach(function (m) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return;
    var content = typeof m.content === "string" ? m.content : "";
    content = content.slice(0, MAX_MESSAGE_CHARS).trim();
    if (!content) return;
    clean.push({ role: m.role, content: content });
  });
  var out;
  if (clean.length <= HISTORY_HEAD_KEEP + HISTORY_TAIL_KEEP) {
    out = clean.slice();
  } else {
    // Drop the middle. Insert a system-role synthetic user turn as a
    // bridge so Sami knows some intervening turns were elided instead
    // of thinking the conversation jumped abruptly.
    var head = clean.slice(0, HISTORY_HEAD_KEEP);
    var tail = clean.slice(-HISTORY_TAIL_KEEP);
    var dropped = clean.length - head.length - tail.length;
    var bridge = {
      role: "user",
      content: "(" + dropped + " earlier turns elided to fit context. The opening brief above and the last " + HISTORY_TAIL_KEEP + " turns below are the authoritative record — do not re-ask for information already answered in the head or tail.)"
    };
    out = head.concat([bridge]).concat(tail);
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

// Phase 4: shared Redis helpers used to inject client-memory context
// into the last user message when a known client is mentioned. Same
// Upstash shape sami-memory.js uses.
function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
}
async function redisGet(key) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["GET", key])
    });
    if (!r.ok) return null;
    var d = await r.json();
    return d && d.result ? d.result : null;
  } catch (_) { return null; }
}
// Hash counterpart for the memory-index refactor. Reads the hash-shape
// index (field = client slug, value = JSON meta) that sami-memory.js
// now writes to, so client-memory auto-injection keeps working after
// the legacy sami:memory:__index blob has been migrated away.
async function redisHgetall(key) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(["HGETALL", key])
    });
    if (!r.ok) return null;
    var d = await r.json();
    return d && Array.isArray(d.result) ? d.result : null;
  } catch (_) { return null; }
}

// Detect which known-client slugs the user's most recent message
// mentions. Audit fix #5: matches on the display NAME with word
// boundaries and rejects names shorter than 4 chars. This kills two
// classes of false positive the audit flagged:
//   (a) short slugs like "the" or "and" firing on every message,
//   (b) "chilla" firing inside "chillaxing" (substring match on
//       normalised text ignored word breaks).
// Slug-only substring matching was dropped: users type names, not
// slugs, so the coverage loss is nil while the false-positive surface
// shrinks dramatically. If a client's display name is genuinely too
// short (e.g. a 3-char brand) they should register an alias in memory,
// not lower the threshold.
async function detectMentionedClients(lastUserContent) {
  if (!lastUserContent) return [];
  // Read the hash-shape index (sami-memory.js writes here post-refactor).
  // Fall back to the legacy JSON blob key so client memory keeps
  // resolving even in the tiny window before sami-memory.js has been
  // called once to trigger its lazy migration.
  var index = [];
  var hashRaw = await redisHgetall("sami:memory:index:hash");
  if (hashRaw && hashRaw.length > 0) {
    for (var h = 0; h < hashRaw.length; h += 2) {
      try {
        var meta = JSON.parse(hashRaw[h + 1]);
        if (meta && meta.slug) index.push(meta);
      } catch (_) { /* skip corrupt row */ }
    }
  } else {
    var legacyRaw = await redisGet("sami:memory:__index");
    if (legacyRaw) {
      try {
        var parsed = JSON.parse(legacyRaw);
        if (Array.isArray(parsed)) index = parsed;
      } catch (_) { /* fall through */ }
    }
  }
  if (index.length === 0) return [];
  var matches = [];
  index.forEach(function (rec) {
    if (!rec || !rec.slug || !rec.name) return;
    var name = String(rec.name).trim();
    if (name.length < 4) return;
    var escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var re = new RegExp("\\b" + escaped + "\\b", "i");
    if (re.test(lastUserContent) && matches.indexOf(rec.slug) < 0) matches.push(rec.slug);
  });
  return matches.slice(0, 3); // sanity cap: never inject more than 3 clients per turn
}

async function fetchClientMemory(slug) {
  var raw = await redisGet("sami:memory:" + slug);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch (_) { return null; }
}

// Take the last user message and prepend <CLIENT_MEMORY> blocks for any
// mentioned known clients. Sami's system prompt teaches her to read
// these as authoritative preferences.
async function injectClientMemory(messages) {
  if (!messages.length) return messages;
  var last = messages[messages.length - 1];
  if (!last || last.role !== "user") return messages;
  var slugs = await detectMentionedClients(last.content);
  if (slugs.length === 0) return messages;
  var blocks = [];
  for (var i = 0; i < slugs.length; i++) {
    var rec = await fetchClientMemory(slugs[i]);
    if (!rec || !Array.isArray(rec.notes) || rec.notes.length === 0) continue;
    var lines = rec.notes.map(function (n) { return "  - " + n.label + ": " + n.value; }).join("\n");
    blocks.push("<CLIENT_MEMORY client=\"" + (rec.slug || slugs[i]) + "\" name=\"" + (rec.name || slugs[i]) + "\">\n" + lines + "\n</CLIENT_MEMORY>");
  }
  if (blocks.length === 0) return messages;
  var withCtx = messages.slice();
  withCtx[withCtx.length - 1] = {
    role: "user",
    content: blocks.join("\n\n") + "\n\n" + last.content
  };
  return withCtx;
}

function anthropicPayload(messages, systemPrompt, mcpUrl, mcpToken, legacyShape) {
  var payload = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: messages,
    mcp_servers: [
      { type: "url", url: mcpUrl, name: SERVER_NAME, authorization_token: mcpToken }
    ]
  };
  if (!legacyShape) {
    payload.tools = [{ type: "mcp_toolset", mcp_server_name: SERVER_NAME }];
  }
  return payload;
}

async function callAnthropic(apiKey, payload, betaHeader) {
  var resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": betaHeader
    },
    body: JSON.stringify(payload)
  });
  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: resp.status, data: data, rawText: text };
}

// Extract APPROVAL_CARD, PLAN_CARD, CREATIVE_PAIR_CARD, SAVE_MEMORY
// blocks from Sami's reply and return them separately so the UI can
// render them as interactive cards instead of raw JSON in the chat
// bubble. Approval / plan cards drive the write flow; pair cards drive
// the Drive/Dropbox creative-pair confirmation (Phase 3); memory blocks
// persist Sami-authored client notes (Phase 4).
function extractStructuredCards(text) {
  var cleanText = String(text || "");
  var approvalRe = /<APPROVAL_CARD>([\s\S]*?)<\/APPROVAL_CARD>/g;
  var planRe = /<PLAN_CARD>([\s\S]*?)<\/PLAN_CARD>/g;
  var briefRe = /<BRIEF_CARD>([\s\S]*?)<\/BRIEF_CARD>/g;
  var pairRe = /<CREATIVE_PAIR_CARD>([\s\S]*?)<\/CREATIVE_PAIR_CARD>/g;
  var memoryRe = /<SAVE_MEMORY>([\s\S]*?)<\/SAVE_MEMORY>/g;

  var approvals = [];
  var m;
  while ((m = approvalRe.exec(cleanText)) !== null) {
    try {
      var parsedA = JSON.parse(m[1].trim());
      if (parsedA && parsedA.id) approvals.push(parsedA);
    } catch (_) { /* malformed — leave in text */ }
  }

  // Audit fix #6: PLAN_CARD carries an array of child writes that the
  // human approves in one click.
  var plans = [];
  var pl;
  while ((pl = planRe.exec(cleanText)) !== null) {
    try {
      var parsedPl = JSON.parse(pl[1].trim());
      if (parsedPl && parsedPl.id && Array.isArray(parsedPl.plan) && parsedPl.plan.length > 0) {
        // Cap at 100 children matches the prompt's rule; anything
        // over that is truncated silently so Sami can't blow the
        // plan-nonce store with a runaway plan.
        parsedPl.plan = parsedPl.plan.slice(0, 100);
        plans.push(parsedPl);
      }
    } catch (_) { /* malformed — leave in text */ }
  }

  // Brief cards drive the one-form-fill new-build UX (replaces the
  // 15-turn interrogation). No nonce needed here because the card is
  // a read step, not a write.
  var briefs = [];
  var br;
  while ((br = briefRe.exec(cleanText)) !== null) {
    try {
      var parsedBr = JSON.parse(br[1].trim());
      if (parsedBr && parsedBr.id && parsedBr.fields && typeof parsedBr.fields === "object") {
        parsedBr.prefilled_from_memory = Array.isArray(parsedBr.prefilled_from_memory) ? parsedBr.prefilled_from_memory : [];
        parsedBr.unknown_but_needed = Array.isArray(parsedBr.unknown_but_needed) ? parsedBr.unknown_but_needed : [];
        briefs.push(parsedBr);
      }
    } catch (_) { /* malformed — leave in text */ }
  }

  var pairCards = [];
  var p;
  while ((p = pairRe.exec(cleanText)) !== null) {
    try {
      var parsedP = JSON.parse(p[1].trim());
      if (parsedP && parsedP.id) {
        parsedP.pairs = Array.isArray(parsedP.pairs) ? parsedP.pairs : [];
        parsedP.squareOnly = Array.isArray(parsedP.squareOnly) ? parsedP.squareOnly : [];
        parsedP.verticalOnly = Array.isArray(parsedP.verticalOnly) ? parsedP.verticalOnly : [];
        pairCards.push(parsedP);
      }
    } catch (_) { /* malformed — leave in text */ }
  }

  var memories = [];
  var mm;
  while ((mm = memoryRe.exec(cleanText)) !== null) {
    try {
      var parsedM = JSON.parse(mm[1].trim());
      if (parsedM && parsedM.clientSlug && parsedM.label && parsedM.value) memories.push(parsedM);
    } catch (_) { /* malformed — leave in text */ }
  }

  var stripped = cleanText
    .replace(approvalRe, "")
    .replace(planRe, "")
    .replace(briefRe, "")
    .replace(pairRe, "")
    .replace(memoryRe, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cards: approvals, plans: plans, briefs: briefs, pairCards: pairCards, memories: memories, text: stripped };
}

// Pull every currency amount and percentage out of a chunk of text as
// normalised digit strings ("R10,000" → "10000", "12.5%" → "12.5%").
// Used by the grounding check to compare Sami's numbers against
// numbers the user typed in recent turns — echoing back a user-
// supplied figure to confirm the brief is not fabrication.
function extractNumericFacts(text) {
  var s = String(text || "");
  var out = [];
  var m;
  var curRe = /R\s*(\d[\d.,\s]*)/g;
  while ((m = curRe.exec(s)) !== null) {
    var digits = m[1].replace(/[\s,]/g, "").replace(/\.+$/, "");
    if (digits && digits.length >= 2) out.push("R" + digits);
  }
  var pctRe = /(\d+(?:[.,]\d+)?)\s*%/g;
  while ((m = pctRe.exec(s)) !== null) {
    out.push(m[1].replace(/,/g, ".") + "%");
  }
  return out;
}

// Compute unverifiedNumbers flag. Sami's reply + any emitted card
// descriptions may contain hard numbers. We flag them ONLY if:
//   - the turn ran zero MCP tool calls (nothing was pulled from a
//     live source), AND
//   - at least one number in Sami's output does NOT appear in a
//     recent user turn (i.e. Sami originated the number, not echoed
//     one back to confirm the brief).
function computeUnverifiedNumbers(extracted, messages, actionsCount) {
  if (actionsCount > 0) return false;
  var samiNumbers = extractNumericFacts(extracted.text);
  extracted.cards.concat(extracted.plans).forEach(function (card) {
    if (!card) return;
    samiNumbers = samiNumbers.concat(extractNumericFacts(card.description));
    if (card.details && typeof card.details === "object") {
      Object.keys(card.details).forEach(function (k) {
        samiNumbers = samiNumbers.concat(extractNumericFacts(card.details[k]));
      });
    }
    if (Array.isArray(card.plan)) {
      card.plan.forEach(function (child) {
        if (child) samiNumbers = samiNumbers.concat(extractNumericFacts(child.description));
      });
    }
  });
  if (samiNumbers.length === 0) return false;
  var userNumbers = {};
  var recentUser = messages.filter(function (m) { return m && m.role === "user"; }).slice(-6);
  recentUser.forEach(function (m) {
    extractNumericFacts(m.content).forEach(function (n) { userNumbers[n] = true; });
    // Also index bare-digit versions so "10000" typed without the R
    // prefix still matches an "R10000" from Sami.
    var bareRe = /\b(\d{2,})\b/g;
    var bm;
    var bareText = String(m.content || "");
    while ((bm = bareRe.exec(bareText)) !== null) {
      userNumbers["R" + bm[1]] = true;
      userNumbers[bm[1] + "%"] = true;
    }
  });
  var unaccounted = samiNumbers.filter(function (n) { return !userNumbers[n]; });
  return unaccounted.length > 0;
}

export default async function handler(req, res) {
  // Capture the verified JWT payload so downstream code (proxy-URL
  // user attribution, nonce authorisation) can trust auth.user.
  var auth = checkCreateAuth(req, res);
  if (!auth) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 20, maxPerHour: 240 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Sami Hub not configured (ANTHROPIC_API_KEY missing)." }); return; }

  // MCP endpoint: prefer the GAS approval-gated proxy when configured
  // (server-side nonce enforcement + write idempotency + usage
  // attribution, audit fixes 1 + 2 + credit tracking). Falls back to
  // direct upstream when the proxy env vars are not set so Sami keeps
  // working during rollout and preview deploys.
  //
  // We append ?user=<auth.user> to the proxy URL so per-call usage
  // counters can attribute Markifact-tool consumption to the team
  // member driving the conversation (Anthropic makes the actual tool
  // call, so the proxy has no other way to know who initiated it).
  // Trim EVERY env value we read here. A trailing newline (a common
  // Vercel paste hazard) inside an mcp_servers.url makes Anthropic's
  // validator reject the whole request with
  // "must not contain control characters (e.g., newline)". Same risk
  // on the bearer, so trim that too.
  function envStr(k) {
    var v = process.env[k];
    return v == null ? "" : String(v).replace(/[\r\n\t]+/g, "").trim();
  }
  var proxyUrlEnv = envStr("SAMI_MCP_PROXY_URL");
  var proxyTokenEnv = envStr("SAMI_MCP_PROXY_TOKEN");
  var mcpDirectUrlEnv = envStr("MARKIFACT_MCP_URL");
  var mcpDirectTokenEnv = envStr("MARKIFACT_MCP_TOKEN");
  var useProxy = !!proxyUrlEnv && !!proxyTokenEnv;
  var mcpUrl;
  if (useProxy) {
    var sep = proxyUrlEnv.indexOf("?") >= 0 ? "&" : "?";
    mcpUrl = proxyUrlEnv + sep + "user=" + encodeURIComponent(auth.user);
  } else {
    mcpUrl = mcpDirectUrlEnv || "https://api.markifact.com/mcp";
  }
  var mcpToken = useProxy ? proxyTokenEnv : mcpDirectTokenEnv;
  if (!mcpToken) {
    res.status(503).json({ error: "Sami Hub data engine not configured yet." });
    return;
  }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var messages = sanitiseMessages(body.messages);
  if (!messages.length) { res.status(400).json({ error: "Send at least one user message." }); return; }

  // Audit fix #1 + #6: if the incoming user message is an approval
  // click from the frontend ("APPROVED: <cardId>" for a single card,
  // or "APPROVED_PLAN: <planId>" for a batched plan card), mark the
  // nonce(s) authorised so the MCP proxy lets the matching write(s)
  // through. Silent no-op if the id is unknown or expired. Only
  // user-role messages trigger authorisation, so the model can never
  // authorise itself.
  try {
    var lastUser = messages[messages.length - 1];
    if (lastUser && lastUser.role === "user") {
      var approvedId = extractApprovedCardId(lastUser.content);
      if (approvedId) await authoriseNonce(approvedId, auth.user);
      var approvedPlanId = extractApprovedPlanId(lastUser.content);
      if (approvedPlanId) await authoriseNoncePlan(approvedPlanId, auth.user);
    }
  } catch (err) { console.error("[sami-hub] nonce authorise failed", err); }

  // Phase 4: auto-inject saved client-memory notes into the last user
  // message when any known client is mentioned. Non-fatal on failure —
  // Sami still gets the raw message even if the Redis lookup errors.
  try { messages = await injectClientMemory(messages); }
  catch (err) { console.error("[sami-hub] memory injection failed", err); }

  var systemPrompt = buildSystemPrompt();

  try {
    var result = await callAnthropic(
      apiKey,
      anthropicPayload(messages, systemPrompt, mcpUrl, mcpToken, false),
      "mcp-client-2025-11-20"
    );

    if (result.status === 400 && /toolset|beta|mcp/i.test(result.rawText || "")) {
      result = await callAnthropic(
        apiKey,
        anthropicPayload(messages, systemPrompt, mcpUrl, mcpToken, true),
        "mcp-client-2025-04-04"
      );
    }

    if (result.status === 401 || result.status === 403) {
      console.error("sami-hub upstream auth failure", result.status, result.rawText && result.rawText.slice(0, 300));
      res.status(502).json({
        error: "The data engine rejected our credentials. Check ANTHROPIC_API_KEY and MARKIFACT_MCP_TOKEN.",
        detail: "upstream " + result.status + ": " + ((result.rawText || "").slice(0, 300))
      });
      return;
    }
    if (result.status !== 200 || !result.data) {
      console.error("sami-hub upstream error", result.status, result.rawText && result.rawText.slice(0, 500));
      res.status(502).json({
        error: "Sami hit a problem answering. Try again in a moment.",
        detail: "upstream " + result.status + ": " + ((result.rawText || "").slice(0, 500))
      });
      return;
    }

    var content = Array.isArray(result.data.content) ? result.data.content : [];
    var replyRaw = content
      .filter(function (b) { return b && b.type === "text" && b.text; })
      .map(function (b) { return b.text; })
      .join("\n")
      .trim();

    var actions = content
      .filter(function (b) { return b && b.type === "mcp_tool_use"; })
      .map(function (b) { return scrub(b.name || "engine-call"); });

    if (!replyRaw) replyRaw = "I ran the request but got nothing readable back. Rephrase it, or narrow the scope, and I will try again.";

    var scrubbed = scrub(replyRaw);
    var extracted = extractStructuredCards(scrubbed);

    // Audit fix #1: for every APPROVAL_CARD Sami just emitted, register
    // a pending nonce keyed by the exact (operation_id, input_data) hash.
    // Cards missing operation_id or input_data cannot be gated; the
    // frontend nudge banner already warns the user, and the proxy
    // refuses the write when Sami tries to execute anyway.
    for (var ci = 0; ci < extracted.cards.length; ci++) {
      var c = extracted.cards[ci];
      if (c && c.id && c.operation_id && c.input_data) {
        try { await issuePendingNonce(c.id, c.operation_id, c.input_data, auth.user); }
        catch (err) { console.error("[sami-hub] nonce issue failed for card", c.id, err); }
      }
    }

    // Audit fix #6: for every PLAN_CARD, register per-child nonces AND
    // a plan-level index so a single APPROVED_PLAN authorises all
    // children in one Redis pass. Both are user-scoped so only the
    // member who received the plan can approve it.
    for (var pi = 0; pi < extracted.plans.length; pi++) {
      var plan = extracted.plans[pi];
      if (plan && plan.id && Array.isArray(plan.plan) && plan.plan.length > 0) {
        try { await issuePendingPlanNonces(plan.id, plan.plan, auth.user); }
        catch (err) { console.error("[sami-hub] plan-nonce issue failed for plan", plan.id, err); }
      }
    }

    // Grounding-enforcement: flag any Sami number not backed by a
    // live tool call, EXCEPT numbers that appear in the recent user
    // turns (Sami echoing back a user-supplied figure to confirm the
    // brief is not fabrication).
    var unverified = computeUnverifiedNumbers(extracted, messages, actions.length);

    res.status(200).json({
      reply: extracted.text,
      cards: extracted.cards,
      plans: extracted.plans,
      briefs: extracted.briefs,
      pairCards: extracted.pairCards,
      memories: extracted.memories,
      actions: actions,
      unverifiedNumbers: unverified,
      stopReason: result.data.stop_reason || null
    });
  } catch (err) {
    console.error("sami-hub failed", err);
    res.status(500).json({
      error: "Sami hit a problem answering. Try again in a moment.",
      detail: String(err && err.message || err).slice(0, 300)
    });
  }
}
