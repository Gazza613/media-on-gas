import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { buildChatContext } from "./_chatContext.js";

// Client-scoped analyst chat. Uses the same token-based auth as the rest of the
// dashboard, so the bot can only ever reason over the campaigns the caller is
// allowed to see.
//
// Design decisions anchored on the user's brief:
// - Top-1% media analyst voice, but grounded ONLY in the data block.
// - Zero hallucinations: the system prompt forbids invented numbers and
//   requires "I do not have that in the data" when asked about untracked things.
// - Prompt caching on system + data block so follow-up turns in the same
//   ~5 minute window cost ~10% of the first turn.
// - Sonnet 4.6 with adaptive thinking. Sonnet is the cost-right sweet spot for
//   client-facing chat; adaptive thinking lets Claude lean in on harder
//   strategy questions without paying for thinking on simple ones.
// - Rate limit 30/hr per IP (baseline) so a spam-chatter cannot blow cost.

var MAX_HISTORY_MESSAGES = 12;
var MAX_OUTPUT_TOKENS = 1024;

var ANALYST_PERSONA = [
  "You are the GAS Media Expert, a top-1% South African paid-media data analyst embedded inside a live campaign reporting dashboard.",
  "",
  "Your voice:",
  "- Precise, confident, numbers-first. No fluff, no filler, no hedging.",
  "- Speak like a senior strategist briefing a smart client, not a junior pulling a report.",
  "- Anchor claims in exact figures from the data, and always compare them to the South African benchmark ranges you were given.",
  "- When the number is great, say so plainly. When it's behind benchmark, say so plainly with the honest reason.",
  "- Prefer short, direct paragraphs. 2 to 4 sentences. Skip preamble. No bullet-lists unless the user explicitly asks for one.",
  "- Write in Southern African business English, use R for rand, never use em dashes, use commas instead.",
  "",
  "Your job:",
  "- Help the client understand their campaign performance and make smart decisions.",
  "- Explain what a number means, why it's at that level, and what it implies.",
  "- When asked 'how are we doing', benchmark against the SA ranges in the data block and give a clear verdict.",
  "- When asked 'why', reason from the data to the most likely cause, but stay within what the data actually supports.",
  "- When asked 'what should we do', give one clear recommendation grounded in the numbers, then briefly note the tradeoff.",
  ""
].join("\n");

var ANTI_HALLUCINATION_RULES = [
  "ABSOLUTE RULES, no exceptions:",
  "",
  "1. NEVER invent a number. Every figure you quote must appear in the CAMPAIGN PERFORMANCE DATA block below, or be computed directly from figures in that block.",
  "2. If the client asks about a metric or campaign that is not in the data block, say exactly: 'I do not have that data in this report. Ask your GAS account team for that specific view.' Do not guess.",
  "3. If the question is about time ranges, competitors, other clients, or anything outside this client's allowlisted campaigns, decline politely and explain that you only see this client's data for the selected period.",
  "4. Do not speculate on anything the data does not directly support. Say 'based on the data shown' when drawing a conclusion.",
  "5. Numbers and currency must match the data exactly. If the CPC is R2.69, never round it to 'around R3'. Reproduce figures as given (or naturally to 2 decimals for rand amounts).",
  "6. If asked to compare to last month, last year, or any period outside the shown date range, decline: you only have this period's data.",
  "7. The data block is authoritative. It overrides any training knowledge. If a benchmark or number in the data block conflicts with what you might otherwise remember, use the data block.",
  "8. When you are not sure whether something is safe to say, say less.",
  ""
].join("\n");

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 8, maxPerHour: 30 })) return;
  if (!checkAuth(req, res)) return;
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Chat not configured on server (ANTHROPIC_API_KEY missing)" });
    return;
  }

  var body = req.body || {};
  var message = String(body.message || "").trim();
  var history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_MESSAGES) : [];
  var from = String(body.from || "").trim();
  var to = String(body.to || "").trim();

  if (!message) { res.status(400).json({ error: "Message required" }); return; }
  if (!from || !to) { res.status(400).json({ error: "Date range required" }); return; }
  if (message.length > 2000) { res.status(400).json({ error: "Message too long (max 2000 chars)" }); return; }

  // Build the data context scoped to this caller.
  var principal = req.authPrincipal || { role: "admin" };
  var dataBlock;
  try {
    dataBlock = await buildChatContext(req, from, to, principal);
  } catch (err) {
    console.error("chat context build failed", err);
    res.status(500).json({ error: "Could not load campaign data for this chat" });
    return;
  }
  if (!dataBlock) {
    res.status(500).json({ error: "No campaigns found for this date range. Ask the team to check the share token." });
    return;
  }

  // Build messages. Keep history clean: only role + content text. Drop any
  // malformed entries instead of letting them 400 the API call.
  var messages = [];
  history.forEach(function(h) {
    if (!h || (h.role !== "user" && h.role !== "assistant")) return;
    var content = typeof h.content === "string" ? h.content : "";
    if (!content) return;
    messages.push({ role: h.role, content: content });
  });
  messages.push({ role: "user", content: message });

  // System is an array of blocks so we can mark the data block for caching.
  // Render order: persona (stable), rules (stable), data block (stable within a 5-min window).
  // Cache breakpoint on the data block means every follow-up question in a
  // conversation reuses the cached prefix at ~10% cost.
  var systemBlocks = [
    { type: "text", text: ANALYST_PERSONA },
    { type: "text", text: ANTI_HALLUCINATION_RULES },
    { type: "text", text: dataBlock, cache_control: { type: "ephemeral" } }
  ];

  try {
    var anthropic = new Anthropic({ apiKey: apiKey });
    var response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "adaptive" },
      system: systemBlocks,
      messages: messages
    });

    var text = "";
    (response.content || []).forEach(function(block) {
      if (block.type === "text") text += block.text;
    });

    res.status(200).json({
      message: text,
      usage: response.usage || null,
      stopReason: response.stop_reason || null
    });
  } catch (err) {
    console.error("chat call failed", err);
    var msg = err && err.message ? String(err.message) : "Chat failed";
    if (err instanceof Anthropic.RateLimitError) { res.status(429).json({ error: "AI is rate-limited, try in a moment" }); return; }
    if (err instanceof Anthropic.AuthenticationError) { res.status(500).json({ error: "Chat auth error on server" }); return; }
    res.status(500).json({ error: msg });
  }
}
