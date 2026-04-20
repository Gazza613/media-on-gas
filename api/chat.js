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
  "- Default answer length: 1 to 3 sentences. Short, surgical, senior-analyst-tight.",
  "- Only go longer (up to 4 sentences maximum) when the question explicitly asks for a comparison across platforms, a recommendation with reasoning, or a multi-part answer.",
  "- Never exceed 4 sentences. If you cannot answer within 4 sentences, pick the single most valuable thing to say.",
  "- No bullet lists unless the user explicitly asks for a list.",
  "- Do NOT echo the question. No preamble like 'Great question' or 'Let me analyse this'. No closing filler like 'Let me know if...' or 'Happy to help'. Start with the answer, end with the answer.",
  "- Do NOT re-state the data setup (dates, platform count, etc.) unless directly asked.",
  "- Prefer a single sharp number + verdict over a long explanation. If the user wants more, they will ask.",
  "",
  "FOLLOW-UP SUGGESTIONS (mandatory, every response):",
  "After your main answer, on a new line, write exactly this marker: ---FOLLOWUPS---",
  "Then on the next two lines write exactly two suggested follow-up questions the client is likely to ask next, based on what you just answered. One question per line, no numbering, no bullets, no quotes.",
  "Rules for the follow-ups:",
  "- Each one: 5 to 12 words, phrased as the client would speak (e.g. 'Which platform is driving this', 'How do we push CTR higher').",
  "- They must be natural next questions, not rephrasings of the current question.",
  "- Only reference metrics, platforms, or campaigns that appear in the data block.",
  "- Never ask the user to do something (no 'Would you like me to...'). They are questions the client might ask, not offers from you.",
  "- Do NOT add any text after the two questions.",
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
  "1. SCOPE IS STRICT. The CAMPAIGN PERFORMANCE DATA block below lists the ONLY campaigns you may reason about. These are the exact campaigns the user selected on the dashboard. If a campaign name is not listed by name under 'Individual campaigns' in that block, it is OUT OF SCOPE. Even if you know this client runs other campaigns elsewhere (e.g. a POS Lead Gen campaign, a Brand Awareness flight, a competitor push), you MUST NOT mention them, estimate them, or reference their metrics in any way. Pretend those campaigns do not exist.",
  "2. If the client asks 'how are my leads doing?' or 'show me the best ad' and the data block contains no leads figure or no ads for that objective, the correct answer is that the selection on screen does not include that objective. Say: 'The campaigns currently selected do not include a Lead Generation campaign, so I have no lead results to show you. Select a Lead Gen campaign on the left and ask again.' Do not invent leads or reach outside the selection.",
  "3. NEVER invent a number. Every figure you quote must appear in the data block, or be computed directly from figures in that block.",
  "4. Do not speculate on anything the data does not directly support. Say 'based on the data shown' when drawing a conclusion.",
  "5. Numbers and currency must match the data exactly. If the CPC is R2.69, never round it to 'around R3'. Reproduce figures as given (or naturally to 2 decimals for rand amounts).",
  "6. If asked to compare to last month, last year, or any period outside the shown date range, decline: you only have this period's data.",
  "7. The data block is authoritative. It overrides any training knowledge. If a benchmark or number in the data block conflicts with what you might otherwise remember, use the data block.",
  "8. When you are not sure whether something is safe to say, say less.",
  "",
  "TERMINOLOGY RULES, critical, the dashboard uses exact names and you must match them:",
  "- The four canonical campaign objectives are: Lead Generation, Clicks to App Store, Landing Page Clicks, and Followers & Likes. Use these names exactly.",
  "- For app-install campaigns, use 'Clicks to App Store' or 'app store clicks'. NEVER say 'app downloads', 'app installs', 'installs', or 'downloads'. The metric tracks clicks through to the app store, not actual installs.",
  "- For lead campaigns, say 'Lead Generation' or 'leads'.",
  "- For follower/page-like campaigns, say 'Followers & Likes' or 'follows'. Treat Meta page likes and TikTok follows as the same family.",
  "- For landing-page campaigns, say 'Landing Page Clicks' or 'LP clicks'.",
  "- For reach and impressions, 'Ads Served' or 'impressions' and 'Reach' or 'unique users' are both fine.",
  "- For CPC, say 'Cost Per Click' or 'CPC'. For CPM, 'Cost Per 1000 Ads Served' or 'CPM'. For CPL, 'Cost Per Lead' or 'CPL'. For CPF, 'Cost Per Follower' or 'CPF'.",
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

  // Scope the data. Client tokens carry their own allowlist; admin requests
  // honor the dashboard's current selection so the bot never answers about
  // campaigns that are not on-screen. Without this guard, admin chat
  // would return results across every client in the system.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "admin") {
    var selIds = Array.isArray(body.selectedCampaignIds) ? body.selectedCampaignIds.map(String) : [];
    var selNames = Array.isArray(body.selectedCampaignNames) ? body.selectedCampaignNames.map(String) : [];
    if (selIds.length === 0 && selNames.length === 0) {
      res.status(400).json({ error: "Select at least one campaign on the dashboard before asking. The bot only answers about selected campaigns." });
      return;
    }
    // Downgrade admin to a client-like principal for context filtering so the
    // same allowlist code path runs. Purely local to this request.
    principal = {
      role: "client",
      clientSlug: "admin-scoped",
      allowedCampaignIds: selIds,
      allowedCampaignNames: selNames
    };
  }
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
