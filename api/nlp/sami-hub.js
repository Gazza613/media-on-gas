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

// Campaign builds can chain a lot of tool calls (find account, get
// operation, upload media, create campaign, create ad set, create ad
// x N, retry after Meta rejects, etc). 240s gives headroom without
// hitting Vercel's 300s ceiling.
export const config = { maxDuration: 240 };

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-sonnet-5";
var MAX_OUTPUT_TOKENS = 4000;
var MAX_HISTORY_MESSAGES = 40;   // Longer than Media AI — build sessions run long
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
    "",
    "═══════ WORKING WITH CREATIVE (DRIVE / DROPBOX) ═══════",
    "When the user pastes a Drive or Dropbox folder link, or asks you to look up assets for a client, follow this sequence:",
    "  1. Use the engine to list the folder contents (call the appropriate Drive/Dropbox list operation).",
    "  2. Pair matching aspect ratios by filename similarity. Standard heuristic: strip common aspect-ratio suffixes (_1x1, _9x16, _feed, _story, _reel, _vertical, _square) and file extensions from each name; two files with the same base name form a pair. Feed asset = 1:1 (square). Story/Reel/WhatsApp Status asset = 9:16 (vertical).",
    "  3. Group results into 'paired concepts', 'square-only' (feed-eligible but no vertical companion), and 'vertical-only' (Stories/Reels/Status-eligible but no square companion).",
    "  4. Emit ONE CREATIVE_PAIR_CARD block summarising what you found (see format below). Stop. Wait for the user to confirm the pairing looks right (they will reply with 'PAIRS_OK: <id>' meaning proceed, or ask you to reassign specific pairs in plain English).",
    "  5. Once the pairing is confirmed, emit standard APPROVAL_CARDs to upload each paired creative to the target Meta ad account (either one card per pair, or one batched card if the user asked you to batch — check the plan the user agreed to at brief stage).",
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
  var out = [];
  raw.slice(-MAX_HISTORY_MESSAGES).forEach(function (m) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) return;
    var content = typeof m.content === "string" ? m.content : "";
    content = content.slice(0, MAX_MESSAGE_CHARS).trim();
    if (!content) return;
    out.push({ role: m.role, content: content });
  });
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

// Detect which known-client slugs the user's most recent message
// mentions. Reads the memory index (small, one Redis call) to find the
// candidate list, then substring-matches each client name against the
// last user message. Case-insensitive. Returns unique slugs, in order
// they appear in the message.
async function detectMentionedClients(lastUserContent) {
  if (!lastUserContent) return [];
  var indexRaw = await redisGet("sami:memory:__index");
  if (!indexRaw) return [];
  var index;
  try { index = JSON.parse(indexRaw); } catch (_) { return []; }
  if (!Array.isArray(index) || index.length === 0) return [];
  var lower = lastUserContent.toLowerCase();
  // Normalise the message the same way the memory slug generator does:
  // strip non-alphanumeric for slug-comparison, keep the original for
  // brand-name substring matching. Both help catch variants.
  var normalisedMsg = lower.replace(/[^a-z0-9]/g, "");
  var matches = [];
  index.forEach(function (rec) {
    if (!rec || !rec.slug) return;
    var slugMatched = rec.slug && normalisedMsg.indexOf(rec.slug) >= 0;
    var nameMatched = rec.name && lower.indexOf(String(rec.name).toLowerCase()) >= 0;
    if ((slugMatched || nameMatched) && matches.indexOf(rec.slug) < 0) matches.push(rec.slug);
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

// Extract APPROVAL_CARD and CREATIVE_PAIR_CARD blocks from Sami's reply
// and return them separately so the UI can render them as interactive
// cards instead of raw JSON in the chat bubble. Approval cards drive the
// per-write Approve/Reject flow; pair cards drive the Drive/Dropbox
// creative-pair confirmation flow (Phase 3).
function extractStructuredCards(text) {
  var cleanText = String(text || "");
  var approvalRe = /<APPROVAL_CARD>([\s\S]*?)<\/APPROVAL_CARD>/g;
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

  // Phase 4: SAVE_MEMORY blocks. Each carries clientSlug/clientName/
  // label/value. Frontend POSTs to /api/nlp/sami-memory op=upsertNote
  // and shows a confirmation chip in the chat.
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
    .replace(pairRe, "")
    .replace(memoryRe, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { cards: approvals, pairCards: pairCards, memories: memories, text: stripped };
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 20, maxPerHour: 240 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Sami Hub not configured (ANTHROPIC_API_KEY missing)." }); return; }

  var mcpToken = process.env.MARKIFACT_MCP_TOKEN;
  if (!mcpToken) {
    res.status(503).json({ error: "Sami Hub data engine not configured yet. Set MARKIFACT_MCP_TOKEN in Vercel and redeploy." });
    return;
  }
  var mcpUrl = process.env.MARKIFACT_MCP_URL || "https://api.markifact.com/mcp";

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var messages = sanitiseMessages(body.messages);
  if (!messages.length) { res.status(400).json({ error: "Send at least one user message." }); return; }

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
      res.status(502).json({ error: "The data engine rejected our credentials. Check ANTHROPIC_API_KEY and MARKIFACT_MCP_TOKEN." });
      return;
    }
    if (result.status !== 200 || !result.data) {
      console.error("sami-hub upstream error", result.status, result.rawText && result.rawText.slice(0, 500));
      res.status(502).json({ error: "Sami hit a problem answering. Try again in a moment." });
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

    res.status(200).json({
      reply: extracted.text,
      cards: extracted.cards,
      pairCards: extracted.pairCards,
      memories: extracted.memories,
      actions: actions,
      stopReason: result.data.stop_reason || null
    });
  } catch (err) {
    console.error("sami-hub failed", err);
    res.status(500).json({ error: "Sami hit a problem answering. Try again in a moment." });
  }
}
