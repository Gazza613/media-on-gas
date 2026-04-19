import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { buildChatContext } from "./_chatContext.js";

// In-memory context cache. The data block is deterministic for
// (principal + date range) over short windows, so caching it for 60s lets
// follow-up messages in a conversation skip the /api/campaigns + /api/ads
// fetch entirely. Warm instances only; cold starts still pay once.
var contextCache = {};
var CONTEXT_TTL_MS = 60 * 1000;
function contextKey(principal, from, to) {
  if (!principal || principal.role === "admin") return "admin|" + from + "|" + to;
  return (principal.clientSlug || "client") + "|" + (principal.allowedCampaignIds || []).join(",") + "|" + from + "|" + to;
}
function getCachedContext(key) {
  var entry = contextCache[key];
  if (entry && Date.now() - entry.ts < CONTEXT_TTL_MS) return entry.value;
  return null;
}
function setCachedContext(key, value) {
  contextCache[key] = { value: value, ts: Date.now() };
}

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
var MAX_OUTPUT_TOKENS = 1600;

var ANALYST_PERSONA = [
  "You are the GAS Media Expert, a top-1% South African paid-media data analyst embedded inside a live campaign reporting dashboard.",
  "",
  "Your voice:",
  "- Precise, confident, numbers-first. No fluff, no filler, no hedging.",
  "- Speak like a senior strategist briefing a smart client, not a junior pulling a report.",
  "- Anchor claims in exact figures from the data, and always compare them to the South African benchmark ranges you were given.",
  "- When the number is great, say so plainly. When it's behind benchmark, say so plainly with the honest reason.",
  "- Write in Southern African business English, use R for rand, never use em dashes, use commas instead.",
  "",
  "LENGTH RULES, strict:",
  "- Default answer length: 2 to 4 sentences. Keep it tight.",
  "- If the question genuinely needs more detail (a comparative breakdown, a recommendation with reasoning, a multi-part question), go up to 6 sentences total, never more.",
  "- No bullet lists unless the user explicitly asks for a list.",
  "- Do NOT echo the question. Do NOT open with pleasantries like 'Great question' or 'Let me analyse this'. Get straight to the answer.",
  "- Do NOT re-state the data setup (dates, platform count, etc.) unless directly asked.",
  "",
  "Your job:",
  "- Help the client understand their campaign performance and make smart decisions, scoped to the data provided.",
  "- Explain what a number means, why it's at that level, and what it implies.",
  "- When asked 'how are we doing', benchmark against the SA ranges in the data block and give a clear verdict.",
  "- When asked 'why', reason from the data to the most likely cause, but stay within what the data actually supports.",
  "- When asked 'what should we do', give one clear recommendation grounded in the numbers, then briefly note the tradeoff.",
  "",
  "OFF-TOPIC HANDLING:",
  "If the user asks about anything NOT related to their paid media performance in this dashboard, for example general knowledge, weather, sport, coding, news, politics, personal advice, health, legal, finance, other brands, their own business outside of paid media, or anything Claude-related, respond with exactly this pattern (adapted to context): \"That sits outside my role. I am the GAS Media Expert for your campaign performance in this report. Ask me anything about your ads, spend, reach, leads, or platform mix and I will help.\" Do not entertain the off-topic request even partially."
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

  // Build (or reuse) the data context scoped to this caller.
  var principal = req.authPrincipal || { role: "admin" };
  var cacheKey = contextKey(principal, from, to);
  var ctx = getCachedContext(cacheKey);
  if (!ctx) {
    try {
      ctx = await buildChatContext(req, from, to, principal);
    } catch (err) {
      console.error("chat context build failed", err);
      res.status(500).json({ error: "Could not load campaign data for this chat" });
      return;
    }
    if (!ctx || !ctx.text) {
      res.status(500).json({ error: "No campaigns found for this date range. Ask the team to check the share token." });
      return;
    }
    setCachedContext(cacheKey, ctx);
  }
  var dataBlock = ctx.text;
  var topAdCards = ctx.topAds || [];

  // Detect intent for "top performing ad" questions so we can attach a
  // visual ad card to the response. Keyword-based for reliability, matches
  // common phrasings and avoids false positives on generic campaign questions.
  var msgLow = message.toLowerCase();
  var wantsTopAds = /(best|top|highest|leading|winning|strongest)[^.]{0,40}(ad|ads|creative|creatives|post|posts|performer|performers)/.test(msgLow) ||
                    /(ad|creative|performer)[^.]{0,30}(best|top|highest|winning)/.test(msgLow) ||
                    /which.*(ad|creative).*(best|top|winning|performing)/.test(msgLow);

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

  // Stream the response back over SSE. The user sees the first token in
  // ~1 second instead of waiting for the whole completion, which is the
  // single biggest UX lever for a chat UI.
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders && res.flushHeaders();

  var writeEvent = function(obj) {
    try { res.write("data: " + JSON.stringify(obj) + "\n\n"); } catch (_) {}
  };

  // Emit ad cards first so the UI can render them above the streaming text.
  if (wantsTopAds && topAdCards.length > 0) {
    writeEvent({ type: "attachments", ads: topAdCards });
  }

  try {
    var anthropic = new Anthropic({ apiKey: apiKey });
    var stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: MAX_OUTPUT_TOKENS,
      thinking: { type: "adaptive" },
      system: systemBlocks,
      messages: messages
    });

    for await (var event of stream) {
      if (event.type === "content_block_delta" && event.delta && event.delta.type === "text_delta" && event.delta.text) {
        writeEvent({ type: "delta", text: event.delta.text });
      }
    }
    var finalMsg = await stream.finalMessage();
    writeEvent({ type: "done", usage: finalMsg.usage || null, stopReason: finalMsg.stop_reason || null });
    res.end();
  } catch (err) {
    console.error("chat stream failed", err);
    var errMsg = err && err.message ? String(err.message) : "Chat failed";
    if (err instanceof Anthropic.RateLimitError) errMsg = "AI is rate-limited, try in a moment";
    else if (err instanceof Anthropic.AuthenticationError) errMsg = "Chat auth error on server";
    writeEvent({ type: "error", error: errMsg });
    res.end();
  }
}
