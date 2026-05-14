// Sami copy assist. Given the wizard's product/action label, audience
// label, objective and brand client, asks Claude for 3 headline
// variants + 3 primary-text variants that fit the configured campaign.
// Saves the team typing N times after a bulk upload — pick the
// variant that resonates and click to apply.

import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

export const config = { maxDuration: 30 };

var SYSTEM_PROMPT =
"You are Sami, a senior paid-media copywriter at GAS Marketing in South Africa with deep experience writing Facebook + Instagram ad copy for B2C and B2B campaigns across MTN MoMo, Willowbrook, Concord, Eden College and other agency clients.\n\n" +
"Your job: given the client, product/action, audience and objective the team is about to run, return 3 strong headline variants and 3 primary-text variants tailored to the configured campaign.\n\n" +
"## Rules\n" +
"1. Headlines: ≤ 40 chars each. Bold, scroll-stopping. No emojis unless the brand explicitly works in that register. Use sentence case unless an all-caps STOP-WORD genuinely adds force.\n" +
"2. Primary text: 80-180 chars each. One concrete benefit + one action verb. Use 1-2 short sentences max. South African English (no 'realize', no $); informal but specific.\n" +
"3. Match the objective:\n" +
"   - Traffic / Awareness: headline teases the value, primary text drives a click.\n" +
"   - Like&Follow / Engagement: lean into community + belonging, soft CTA.\n" +
"   - Leads: clear value-exchange, urgency where appropriate, explicit ask.\n" +
"   - Sales: outcome-focused with proof or specifics.\n" +
"   - AppInstall: hook + 'get it on your phone' simplicity.\n" +
"4. NO hashtags. NO emojis. NO em-dashes. Avoid generic 'unlock', 'discover', 'transform' filler.\n" +
"5. Return JSON only, no commentary, no markdown fences. Schema:\n" +
"   {\"headlines\":[\"…\",\"…\",\"…\"],\"primaryTexts\":[\"…\",\"…\",\"…\"]}\n";

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Copy assist not configured (ANTHROPIC_API_KEY missing)" }); return; }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var clientName = String(body.clientName || "").trim().slice(0, 60);
  var productName = String(body.productName || "").trim().slice(0, 80);
  var productAction = String(body.productAction || "").trim().slice(0, 80);
  var audienceLabel = String(body.audienceLabel || "").trim().slice(0, 60);
  var objective = String(body.objective || "").trim().slice(0, 40);

  if (!clientName && !productName && !productAction) {
    res.status(400).json({ error: "Provide at least clientName, productName or productAction" });
    return;
  }

  var userMsg =
    "Client: " + (clientName || "(unspecified)") + "\n" +
    "Product / theme: " + (productName || "(unspecified)") + "\n" +
    "Product & action segment for this ad: " + (productAction || "(none)") + "\n" +
    "Target audience: " + (audienceLabel || "(none)") + "\n" +
    "Campaign objective: " + (objective || "(unspecified)") + "\n\n" +
    "Return the JSON object with 3 headlines + 3 primary texts.";

  try {
    var anthropic = new Anthropic({ apiKey: apiKey });
    var response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMsg }]
    });
    var raw = "";
    for (var i = 0; i < response.content.length; i++) {
      if (response.content[i].type === "text") raw += response.content[i].text;
    }
    var first = raw.indexOf("{");
    var last = raw.lastIndexOf("}");
    if (first < 0 || last < 0) { res.status(502).json({ error: "Sami returned no JSON object" }); return; }
    var json;
    try { json = JSON.parse(raw.slice(first, last + 1)); } catch (e) {
      res.status(502).json({ error: "Sami JSON parse failed", raw: raw.slice(0, 400) });
      return;
    }
    var headlines = Array.isArray(json.headlines) ? json.headlines.map(function(s){ return String(s || "").trim(); }).filter(Boolean).slice(0, 6) : [];
    var primaryTexts = Array.isArray(json.primaryTexts) ? json.primaryTexts.map(function(s){ return String(s || "").trim(); }).filter(Boolean).slice(0, 6) : [];

    res.status(200).json({ ok: true, headlines: headlines, primaryTexts: primaryTexts });
  } catch (err) {
    console.error("copy-assist error", err);
    res.status(500).json({ error: "Copy generation failed", message: String(err && err.message || err) });
  }
}
