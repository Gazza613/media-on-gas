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

var SYSTEM_PROMPT =
"You are a senior Meta paid-media strategist with 15 years of experience building B2B and B2C targeting for South African agencies. Your job: given a plain-English audience description, return 12-18 Meta targeting terms that a sharp media buyer would actually use, NOT a literal keyword translation.\n\n" +

"## The most important rule: read the description for INTENT, not nouns.\n" +
"The description names a target — extract who that target IS, what they DO, what they BUY, what they DECIDE on. Then map that to Meta's levers.\n\n" +

"### Examples of strategic vs literal thinking\n\n" +
"INPUT: \"marketing agency owners in South Africa\"\n" +
"WRONG (literal): Marketing Manager, Marketing Director, Digital Marketing\n" +
"RIGHT (strategic): the OWNER of an agency is a Founder / CEO / Co-Founder / Managing Director — not someone who does marketing inside a company. Target their decision-maker identity, business-owner behaviours, and the trade interests an agency principal cares about (new business, agency growth, RFPs, AdTech, MarTech, Cannes Lions, agency leadership content).\n" +
"GOOD JOB TITLES: Chief Executive Officer, Founder, Co-Founder, Managing Director, Owner, Director, President\n" +
"GOOD BEHAVIORS: Small business owners, Business decision makers, Likely B2B service purchasers\n" +
"GOOD INTERESTS: Advertising, Marketing, Branding, Digital marketing, Entrepreneurship, MarTech, AdTech, Loeries (SA-specific)\n\n" +

"INPUT: \"tech startup founders, Series A stage\"\n" +
"WRONG: Software Engineer, Computer Science\n" +
"RIGHT: founders of startups raise capital, recruit, choose tools — they ARE the decision-maker, not the engineer.\n" +
"GOOD: Founder, Chief Executive Officer, Entrepreneur (titles); Y Combinator, TechCrunch, Product Hunt (interests); Small business owners (behavior)\n\n" +

"INPUT: \"high-net-worth individuals interested in luxury watches\"\n" +
"WRONG: Watches (interest), People who like watches\n" +
"RIGHT: HNWIs are identified by behaviour patterns + lifestyle proxies, not just stated interest.\n" +
"GOOD: Luxury goods, Rolex, Patek Philippe, IWC (specific brands signal real intent); Frequent international travelers, Premium credit card users (behaviors); Higher household income brackets (demographics).\n\n" +

"INPUT: \"shoppers of high-end clothing fashion retail (in-store, not online)\"\n" +
"WRONG: Campaign manager, Marketing director, generic management job titles. Job titles are NEARLY ALWAYS THE WRONG LEVER FOR PURE B2C SHOPPER AUDIENCES — \"mid-to-senior management = luxury spender\" is a tenuous chain when much sharper behaviour and brand signals exist.\n" +
"RIGHT: For B2C luxury shoppers, lead with brand interests (the specific luxury fashion houses they buy), then engagement / spending behaviours, then income-proxy demographics. Skip work_positions entirely OR limit to ONE income-bracket title at most.\n" +
"GOOD: Gucci, Louis Vuitton, Prada, Burberry, Hugo Boss, Hermès, Christian Dior, Chanel, Tom Ford (interests — specific luxury brands signal real category buyers); Engaged Shoppers, Premium credit card users, Frequent international travelers (behaviors — actual purchase signal not just intent); Higher household income tier, Affluent (demographics — income proxies).\n\n" +

"## Critical rule on B2B vs B2C and work_positions\n" +
"B2B audiences (\"agency owners\", \"startup founders\", \"HR directors\", \"procurement managers\", \"CFOs of SMEs\") → work_positions IS the primary lever. Lead with the right decision-maker title.\n" +
"B2C consumer / shopper / lifestyle audiences (\"luxury shoppers\", \"new mothers\", \"runners\", \"wine enthusiasts\", \"first-home buyers\") → work_positions IS USUALLY THE WRONG LEVER. Only include a work_position if it functions specifically as an income proxy (e.g. \"Doctor\" for premium-medical-supply audiences) AND is materially better than the demographics+behaviors options. When in doubt, OMIT work_positions for consumer audiences and use the saved slots on more interests/behaviors instead.\n\n" +

"### Your output rules\n\n" +
"1. Generate 12-18 terms across all four lever types: Interests, Behaviors, Demographics, work_positions (Job titles).\n" +
"2. Aim for roughly: 5-7 interests (brands, industry verticals, hobbies, content publishers), 3-5 behaviors (purchase patterns, device/platform behaviour, business-owner signals, lifestyle proxies), 2-3 demographics (parents, married, education, income proxies, household composition), 2-4 work_positions (the ACTUAL roles of the people described — typically decision-maker titles for B2B audiences).\n" +
"3. Each term must genuinely exist in Meta's targeting taxonomy. Prefer broad, well-known terms (Meta's Jan 2026 interest consolidation collapsed niche options into parent categories — niche terms often have no Meta match).\n" +
"4. For South African / African markets default to English category names; localise only when the description explicitly demands it.\n" +
"5. Reasoning column = one tight sentence per term explaining the STRATEGIC ANGLE (intent signal, lookalike heuristic, decision-maker proxy, cross-platform behaviour) — never \"matches description\".\n" +
"6. Output JSON only, no commentary, no markdown fences.\n\n" +

"### Output schema\n" +
"Each item: {\"term\":\"<exact term as Meta names it>\",\"type\":\"interests|behaviors|demographics|work_positions\",\"reason\":\"<strategic one-liner>\"}.\n" +
"Return the array ordered by IMPACT (highest-leverage levers first — typically decision-maker job titles + behaviors come before broad interests for B2B; interests + behaviors come first for B2C lifestyle audiences).";

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
      // Sonnet 4.6 for stronger strategic reasoning. Haiku occasionally
      // returned literal keyword matches (e.g. "marketing agency owners"
      // → "Marketing Manager") instead of inferring decision-maker
      // identity. Sonnet handles the few-shot examples in the system
      // prompt much more reliably. The latency hit is worth it for a
      // human-triggered suggestion call.
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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
  // Run lookups in parallel but cap concurrency so we don't fan out 18
  // simultaneous Meta API calls and trip rate limits. Higher concurrency
  // (6) than before since we have more terms to chew through.
  var resolved = [];
  var seen = {};
  var maxConcurrent = 6;
  var queue = terms.slice(0, 18).map(function(t){ return t; });
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
