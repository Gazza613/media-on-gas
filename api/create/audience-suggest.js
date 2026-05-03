// Natural-language audience description → Meta targeting suggestions.
//
// Two-phase pipeline:
//   1. Claude generates 5–10 candidate "terms" — names of interests,
//      behaviors or demographics that match the user's description. Claude
//      only knows term names, not Meta's internal IDs (which would hallucinate).
//   2. Each term is resolved against Meta's targetingsearch endpoint to get
//      the real id + audience size + taxonomy path. Terms with no Meta match
//      are dropped silently rather than surfaced to the user.
//
// The result is a list of real, addressable Meta targeting items the user
// can add to their wizard with one click. Eliminates the cold start of
// "I have no idea what to type into the targeting search box."

import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed, getCreateMetaToken, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

var SYSTEM_PROMPT = "You are a Meta advertising targeting expert. Given a plain-English description of an audience, suggest 5-10 specific Meta targeting terms (interests, behaviors, demographics) that would match that audience. " +
  "Only suggest terms that genuinely exist in Meta's taxonomy — common interest categories (industries, hobbies, brands, lifestyle topics), well-known behaviors (small business owners, frequent travelers, engaged shoppers), and demographics (parents, married, education level). " +
  "Do not invent IDs. Output JSON only, no commentary, no markdown. Each item: " +
  '{"term":"<exact term as it appears in Meta>","type":"interests|behaviors|demographics|work_positions|family_statuses","reason":"<one sentence on why this matches>"}.' +
  "Return an array of 5-10 items, ordered most relevant first. Prefer broader/well-known terms over niche ones since niche terms often have no Meta match.";

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!rateLimit(req, res, { maxPerMin: 20 })) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Audience suggester not configured (ANTHROPIC_API_KEY missing)" }); return; }
  var metaToken = getCreateMetaToken();
  if (!metaToken) { res.status(503).json({ error: "META_CREATE_TOKEN or META_ACCESS_TOKEN must be set" }); return; }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var description = String(body.description || "").trim();
  var accountId = String(body.accountId || "").trim();
  if (!description || description.length < 10) { res.status(400).json({ error: "Description too short (min 10 chars)" }); return; }
  if (!isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }

  var ageMin = parseInt(body.ageMin, 10);
  var ageMax = parseInt(body.ageMax, 10);
  var countries = Array.isArray(body.countries) ? body.countries.filter(function(s){return typeof s === "string";}) : [];

  // ----- Phase 1: ask Claude for candidate terms ---------------------------
  var userMsg = "Audience description: \"" + description + "\"\n\n" +
    (isFinite(ageMin) && isFinite(ageMax) ? ("Age range: " + ageMin + "-" + ageMax + "\n") : "") +
    (countries.length > 0 ? ("Markets: " + countries.join(", ") + "\n") : "") +
    "\nReturn the JSON array.";

  var terms;
  try {
    var anthropic = new Anthropic({ apiKey: apiKey });
    var response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }]
    });
    var rawText = "";
    for (var i = 0; i < response.content.length; i++) {
      var block = response.content[i];
      if (block.type === "text") rawText += block.text;
    }
    // Trim possible markdown fencing the model occasionally adds despite the
    // instruction. Find the first [ and last ].
    var firstBracket = rawText.indexOf("[");
    var lastBracket = rawText.lastIndexOf("]");
    if (firstBracket < 0 || lastBracket < 0) {
      res.status(502).json({ error: "Claude returned no JSON array" }); return;
    }
    var jsonText = rawText.substring(firstBracket, lastBracket + 1);
    terms = JSON.parse(jsonText);
    if (!Array.isArray(terms)) { res.status(502).json({ error: "Claude returned non-array" }); return; }
  } catch (e) {
    console.error("[audience-suggest] Claude error:", e && e.message);
    res.status(502).json({ error: "Suggestion model failed: " + (e && e.message || "unknown") });
    return;
  }

  // ----- Phase 2: resolve each term to a real Meta targeting item -----------
  // Run lookups in parallel but cap concurrency so we don't fan out 10
  // simultaneous Meta API calls and trip rate limits.
  var resolved = [];
  var seen = {};
  var maxConcurrent = 4;
  var queue = terms.slice(0, 10).map(function(t){ return t; });
  async function worker() {
    while (queue.length > 0) {
      var t = queue.shift();
      if (!t || !t.term) continue;
      var cls = (t.type && /^[a-z_]+$/.test(t.type)) ? "&class=" + encodeURIComponent(t.type) : "";
      var url = "https://graph.facebook.com/" + META_API_VERSION + "/" + encodeURIComponent(accountId) +
                "/targetingsearch?q=" + encodeURIComponent(t.term) + cls + "&limit=3&access_token=" + encodeURIComponent(metaToken);
      try {
        var r = await fetch(url);
        var data = await r.json();
        var match = (data && data.data && data.data[0]) || null;
        if (!match) continue;
        var key = match.type + ":" + match.id;
        if (seen[key]) continue;
        seen[key] = true;
        resolved.push({
          id: match.id,
          name: match.name,
          type: match.type || t.type,
          path: (match.path || []).join(" › ") || null,
          audienceSizeLower: match.audience_size_lower_bound || null,
          audienceSizeUpper: match.audience_size_upper_bound || null,
          reason: t.reason || null
        });
      } catch (_) { /* skip this term, keep going */ }
    }
  }
  var workers = [];
  for (var w = 0; w < maxConcurrent; w++) workers.push(worker());
  await Promise.all(workers);

  res.status(200).json({ suggestions: resolved });
}
