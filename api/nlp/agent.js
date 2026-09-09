// GAS Media AI, the NLP dashboard endpoint that replaced the Create wizard.
//
// White-label design: the browser only ever talks to THIS endpoint on the
// GAS domain. Server-side we call the Anthropic Messages API with the
// MCP connector pointed at the Markifact MCP server, so Claude selects and
// runs the right media operations (reports, account lookups, campaign data)
// in one round trip. The client never sees the Markifact name, URL or any
// tool traffic. Belt-and-braces: the reply text is scrubbed of the vendor
// name before it leaves this function.
//
// Auth: same PIN-gate JWT as the old Create tab (checkCreateAuth), so the
// existing CREATE_TAB_PIN_HASH + CREATE_TAB_JWT_SECRET keep working and one
// PIN unlock covers the tab.
//
// Env vars:
//   ANTHROPIC_API_KEY     - already set (copy-assist + analyst chat use it)
//   MARKIFACT_MCP_TOKEN   - NEW. OAuth/API token for the Markifact MCP server.
//   MARKIFACT_MCP_URL     - optional override, defaults to the public MCP URL.
//   NLP_ALLOW_WRITES      - optional, "true" to let the agent execute write
//                           operations after a typed CONFIRM. Anything else
//                           keeps the tab read-only (default).
//
// The MCP connector needs a beta header. Current docs pair
// "mcp-client-2025-11-20" with a tools:[{type:"mcp_toolset"}] entry; the
// older "mcp-client-2025-04-04" shape (no tools entry) is deprecated but
// still documented. We send the current shape first and fall back to the
// legacy shape on a 400 that mentions the beta/toolset, so a docs-side
// transition never takes the tab down.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

// MCP tool loops run server-side at Anthropic and a multi-operation answer
// (find operation -> inspect schema -> run report) can take a while. 120s
// sits safely inside Vercel's 300s ceiling with headroom over chat.js's 60.
export const config = { maxDuration: 120 };

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-sonnet-4-6";
var MAX_OUTPUT_TOKENS = 2000;
var MAX_HISTORY_MESSAGES = 16;
var MAX_MESSAGE_CHARS = 4000;
var SERVER_NAME = "gas-data-engine";

function buildSystemPrompt(writesEnabled) {
  var lines = [
    "You are Sami, the GAS Media AI, a senior paid-media analyst embedded in the media.gasmarketing.co.za dashboard run by GAS Marketing Automation in Johannesburg.",
    "",
    "You have live access to the GAS data engine, a set of tools for pulling advertising accounts, campaign reports and performance data across the platforms GAS runs media on.",
    "",
    "WHITE-LABEL RULES, absolute:",
    "- The data engine is a GAS-internal system. NEVER mention Markifact, MCP, 'tools', 'operations', server names or any vendor by name. If asked how you get the data, say you query the GAS data engine directly.",
    "- Never expose raw tool output, JSON, operation IDs or schemas. Translate everything into plain business language.",
    "",
    "VOICE AND FORMAT:",
    "- Southern African business English. Rand is written as R. Never use em dashes, use commas instead.",
    "- Numbers-first, concise, senior-strategist tone. Lead with the answer, no preamble, no closing filler.",
    "- Plain text only. No markdown headings, no asterisks, no tables unless the user asks for one, then use simple aligned text.",
    "- When data comes back empty or a request is outside what the engine holds, say so plainly and suggest the nearest thing you CAN pull. Never invent a number.",
    "",
    "WORKFLOW:",
    "- For data questions, search the engine for the right operation, check its inputs, then run it. Prefer one well-chosen pull over many speculative ones.",
    "- If an operation needs an input you do not have (an account, a date range, a platform), ask the user one short question rather than guessing.",
    "- Dates: 'this month' means the current calendar month to date, 'last month' the previous full calendar month, in South African time."
  ];
  if (writesEnabled) {
    lines.push(
      "",
      "WRITE OPERATIONS (enabled, guarded):",
      "- Any operation that creates, edits, pauses or deletes anything in a live ad account is a write.",
      "- Before executing a write you MUST first describe the exact change (operation, account, values) and ask the user to reply with the single word CONFIRM in capitals.",
      "- Only execute the write if the user's most recent message contains the word CONFIRM in capitals. A lowercase confirm, a 'yes' or anything else does not count, ask again."
    );
  } else {
    lines.push(
      "",
      "WRITE OPERATIONS (disabled):",
      "- This dashboard is read-only. Never execute any operation that creates, edits, pauses or deletes anything in a live account, even if asked.",
      "- If asked to make a change, explain the change is made by the GAS team directly and offer the read-only insight that helps them decide."
    );
  }
  return lines.join("\n");
}

// Scrub any vendor mention that slips through the system prompt.
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
  // The API requires the conversation to start with a user turn.
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

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 120 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Media AI not configured (ANTHROPIC_API_KEY missing)." }); return; }

  var mcpToken = process.env.MARKIFACT_MCP_TOKEN;
  if (!mcpToken) {
    res.status(503).json({ error: "Media AI data engine not configured yet. Set MARKIFACT_MCP_TOKEN in Vercel and redeploy." });
    return;
  }
  var mcpUrl = process.env.MARKIFACT_MCP_URL || "https://api.markifact.com/mcp";
  var writesEnabled = process.env.NLP_ALLOW_WRITES === "true";

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var messages = sanitiseMessages(body.messages);
  if (!messages.length) { res.status(400).json({ error: "Send at least one user message." }); return; }

  var systemPrompt = buildSystemPrompt(writesEnabled);

  try {
    // Current connector shape first.
    var result = await callAnthropic(
      apiKey,
      anthropicPayload(messages, systemPrompt, mcpUrl, mcpToken, false),
      "mcp-client-2025-11-20"
    );

    // Fall back to the legacy shape if the current beta/toolset is rejected.
    if (result.status === 400 && /toolset|beta|mcp/i.test(result.rawText || "")) {
      result = await callAnthropic(
        apiKey,
        anthropicPayload(messages, systemPrompt, mcpUrl, mcpToken, true),
        "mcp-client-2025-04-04"
      );
    }

    if (result.status === 401 || result.status === 403) {
      console.error("nlp agent upstream auth failure", result.status, result.rawText && result.rawText.slice(0, 300));
      res.status(502).json({ error: "The data engine rejected our credentials. Check MARKIFACT_MCP_TOKEN." });
      return;
    }
    if (result.status !== 200 || !result.data) {
      console.error("nlp agent upstream error", result.status, result.rawText && result.rawText.slice(0, 500));
      res.status(502).json({ error: "The Media AI hit a problem answering. Try again in a moment." });
      return;
    }

    var content = Array.isArray(result.data.content) ? result.data.content : [];
    var reply = content
      .filter(function (b) { return b && b.type === "text" && b.text; })
      .map(function (b) { return b.text; })
      .join("\n")
      .trim();

    // A compact, vendor-scrubbed trail of what the agent did, for the UI's
    // activity strip. Names only, never inputs or raw results.
    var actions = content
      .filter(function (b) { return b && b.type === "mcp_tool_use"; })
      .map(function (b) { return scrub(b.name || "engine-call"); });

    if (!reply) reply = "I ran the request but got nothing readable back. Rephrase it, or narrow the date range, and I will try again.";

    res.status(200).json({
      reply: scrub(reply),
      actions: actions,
      stopReason: result.data.stop_reason || null
    });
  } catch (err) {
    console.error("nlp agent failed", err);
    res.status(500).json({ error: "The Media AI hit a problem answering. Try again in a moment." });
  }
}
