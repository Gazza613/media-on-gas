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
    "Every time you propose a WRITE to a live ad account (create/edit/pause/delete a campaign, ad set, ad, creative, budget, targeting change), you MUST first emit an APPROVAL_CARD block and then STOP. Do NOT execute the write until you receive a user message that contains 'APPROVED: <the same card id>'.",
    "",
    "APPROVAL_CARD emission format (use this EXACTLY, one card per proposed write):",
    "<APPROVAL_CARD>{",
    '  "id": "short-unique-slug-per-card-eg-camp-chilla-b2b-1",',
    '  "title": "Human-readable single-line summary, e.g. Create paused Chilla B2B lead campaign",',
    '  "platform": "meta | tiktok | google | linkedin",',
    '  "kind": "campaign | adset | ad | creative | budget | pause | unpause | delete | other",',
    '  "description": "2-4 sentences in plain English explaining EXACTLY what will change and why. Include account, budget, dates, key targeting, everything the AM needs to eyeball.",',
    '  "details": {"key": "value pairs of the specific fields being written, again plain English"}',
    "}</APPROVAL_CARD>",
    "",
    "Rules for cards:",
    "- One APPROVAL_CARD per distinct write. If a plan needs 3 writes (campaign + ad set + 5 ads), emit 3 cards separately across the conversation (one at a time, wait for approval, then execute, then emit next).",
    "- The card id must be short, kebab-case, unique per conversation. If the user rejects a card, generate a new id for the retry (don't reuse).",
    "- The card MUST be valid JSON inside the tags. No trailing commas, no comments, no markdown around it.",
    "- After emitting a card, stop your response there. Do not also execute the write in the same turn. Wait for the user's next message.",
    "- When you receive 'APPROVED: <id>' from the user, THEN and only then execute the write. Confirm the result in one line and move to the next step (which may include emitting the next APPROVAL_CARD).",
    "- When you receive 'REJECTED: <id>' or 'REJECTED: <id> — <reason>', do NOT execute. Ask what to change, adjust the plan, and emit a fresh card if the user wants to retry.",
    "- READ operations (pulling reports, listing accounts, checking creative folders, resolving asset IDs) do NOT require approval cards. Only writes to live ad accounts do.",
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
    "═══════ WORKING WITH CREATIVE ═══════",
    "- When the user provides a Drive or Dropbox link, use the engine to list the folder contents.",
    "- Auto-pair 1:1 assets (feeds) with matching 9:16 assets (Stories/Reels/WhatsApp Status). Present the pairing map before uploading.",
    "- Flag any asset without a matching pair — offer to run vertical-only on Stories/Reels/Status or hold until the missing pair is supplied.",
    "- Upload each paired creative to the target ad account as a separate approval card unless the user asks you to batch them.",
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

// Extract APPROVAL_CARD blocks from Sami's reply and return them
// separately so the UI can render them as interactive cards instead
// of raw JSON text in the chat bubble.
function extractApprovalCards(text) {
  var out = [];
  var cleanText = String(text || "");
  var re = /<APPROVAL_CARD>([\s\S]*?)<\/APPROVAL_CARD>/g;
  var m;
  while ((m = re.exec(cleanText)) !== null) {
    var raw = m[1].trim();
    try {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.id) out.push(parsed);
    } catch (_) {
      // Malformed card — leave it in the text so the user can see it
    }
  }
  // Strip the raw card blocks from the text so the chat bubble reads
  // cleanly (the UI renders the parsed cards separately).
  var stripped = cleanText.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cards: out, text: stripped };
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
    var extracted = extractApprovalCards(scrubbed);

    res.status(200).json({
      reply: extracted.text,
      cards: extracted.cards,
      actions: actions,
      stopReason: result.data.stop_reason || null
    });
  } catch (err) {
    console.error("sami-hub failed", err);
    res.status(500).json({ error: "Sami hit a problem answering. Try again in a moment." });
  }
}
