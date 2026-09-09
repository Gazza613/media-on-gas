// Quick Brief parser. Turns a plain-English campaign brief into a partial
// wizard draft the Create tab pre-fills from, so the team types one
// paragraph instead of filling seven steps of fields.
//
// Sami is TOOL-ENABLED via the Markifact MCP connector (same connector
// nlp/agent.js uses for Media AI). During parsing Sami can:
//   - Look up ad accounts + pages to match the client
//   - Search Meta Detailed Targeting for real interest IDs
//   - Search Meta Location Search for real geographic keys
//   - Read any account/page/pixel data the engine exposes
// The goal: Sami's output is filled fields, not "confirm manually" notes.
//
// Falls back to text-only mode (no tools) when MARKIFACT_MCP_TOKEN is
// missing so the panel still parses briefs, just without lookups.
//
// Safety model: the AI only fills the form. Its output is validated and
// clamped HERE against hard whitelists before it ever reaches the browser,
// and the actual campaign write still goes through the existing wizard
// review + /api/create/campaign path (PAUSED, R5,000/day cap, allowlist,
// approval flow). A bad parse costs an edit on screen, never a bad launch.
//
// Body: { brief: string, accounts: [{id, name}] }  (accounts optional, lets
// the model match "Boston" in the brief to the right allowlisted account)
// Returns: { draft: <partial wizard draft>, notes: [string], toolCalls?: [names] }

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, ALLOWED_OBJECTIVES } from "../_createAuth.js";

// Same 120s ceiling nlp/agent.js uses. A multi-tool lookup (account
// list -> page list -> targeting search -> geo search) can chew 30-60s
// on Anthropic's side. 60s was too tight and cut off complex briefs.
export const config = { maxDuration: 120 };

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-sonnet-5";
var MAX_OUTPUT_TOKENS = 4000;
var MAX_BRIEF_CHARS = 3000;
var MAX_ACCOUNTS = 100;
var SERVER_NAME = "gas-data-engine";

var CTA_WHITELIST = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "GET_OFFER", "CONTACT_US", "APPLY_NOW", "DOWNLOAD", "SUBSCRIBE"];
var SPECIAL_CATEGORY_WHITELIST = ["CREDIT", "EMPLOYMENT", "HOUSING"];
var GENDER_WHITELIST = ["male", "female"];
var GEO_TYPE_WHITELIST = ["country", "region", "city", "zip", "geo_market", "electoral_district", "subcity", "neighborhood"];

// ---- Helpers ---------------------------------------------------------------

function isoDateOnly(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
function todayIsoSast() { return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function clampNum(v, lo, hi, dflt) {
  var n = parseFloat(v);
  if (!isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
function cleanStr(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}
function cleanArr3(arr, maxLen) {
  var out = (Array.isArray(arr) ? arr : []).map(function (s) { return cleanStr(s, maxLen); }).filter(Boolean).slice(0, 3);
  while (out.length < 3) out.push("");
  return out;
}
function scrub(text) {
  // Vendor scrubbing, matches nlp/agent.js
  return String(text || "").replace(/markifact/gi, "GAS engine");
}

// ---- System prompt --------------------------------------------------------

function buildSystem(objKeys, accounts, today, toolsAvailable) {
  var lines = [
    "You are Sami, a senior paid-media strategist at GAS Marketing (Johannesburg). You turn a paid-media campaign brief into a JSON draft for GAS's Meta campaign loader. South African agency, currency is rand (R).",
    "Today's date (SAST): " + today + ".",
    ""
  ];

  if (toolsAvailable) {
    lines.push(
      "You have LIVE ACCESS to the GAS data engine (tool-use). Use it to fill the draft with real values instead of leaving 'confirm manually' notes:",
      "- Look up the correct ad ACCOUNT and PAGE for the client, even when the client name (e.g. Learnalot) is a Facebook page rather than an ad account name (in that case the account is often 'GAS Marketing' with the page attached). Match by page-to-account linkage, not just account-name string match.",
      "- Search Meta DETAILED TARGETING for interests that match the brief's audience angle (e.g. 'matric', 'university alternatives', 'parenting teens') and return the resolved interest IDs.",
      "- Search Meta LOCATION SEARCH for real geographic keys when the brief names provinces, cities, or regions.",
      "- Read any account/page/pixel data the engine exposes if it helps you pick the right defaults.",
      "",
      "NEVER mention Markifact, MCP, 'tools', 'operations', server names or vendor names in the returned JSON or notes. If asked how you got the data, it is the GAS data engine.",
      "",
      "Rule of thumb: if a field CAN be filled from the engine, fill it. Every unfilled field the team has to fix by hand costs them time. Put something into `notes` only when the engine genuinely cannot resolve it (e.g. the brief is ambiguous, or the client wants a decision the loader cannot pre-commit).",
      ""
    );
  }

  lines.push(
    "Return ONLY a JSON object as your FINAL response, no markdown fences, no commentary. Schema (every key optional, omit anything the brief truly does not support):",
    "{",
    '  "accountId": string,        // ONLY an id copied exactly from the account list below OR from the engine. Match on client name AND page linkage. Omit if no confident match.',
    '  "accountName": string,      // the matched account name, verbatim',
    '  "pageId": string,           // Facebook page ID (from the engine) that the campaign should run on. Omit if unresolved.',
    '  "pageName": string,         // the matched page name, verbatim',
    '  "clientCode": string,       // short ALL-CAPS client code for campaign naming, max 10 chars, e.g. Boston City Campus -> BOSTON, Learnalot -> LEARNALOT',
    '  "variant": string,          // campaign variant tag if the brief implies one, else "A"',
    '  "objective": string,        // one of: ' + objKeys.join(", ") + ". leads->OUTCOME_LEADS, website traffic/landing page->OUTCOME_TRAFFIC, followers/engagement->OUTCOME_ENGAGEMENT, awareness/reach->OUTCOME_AWARENESS, sales/purchases->OUTCOME_SALES, app installs->OUTCOME_APP_PROMOTION, WhatsApp/messaging->OUTCOME_ENGAGEMENT (CTWA campaigns run under Engagement).",
    '  "specialAdCategories": [],  // subset of ["CREDIT","EMPLOYMENT","HOUSING"] ONLY if the brief is clearly about loans/credit, jobs, or housing. Else [].',
    '  "audience": {',
    '     "ageMin": number, "ageMax": number,        // 18-65',
    '     "genders": ["male"] | ["female"] | [],       // [] means all genders. If brief says "split male and female", still emit [] here and add matrix rows via notes.',
    '     "geographies": [ { "key": string, "type": "country"|"region"|"city", "name": string, "countryCode": string, "countryName": string } ],  // Resolved via engine location search. Default: [{key:"ZA",type:"country",name:"South Africa",countryCode:"ZA",countryName:"South Africa"}]',
    '     "targetingItems": [ { "id": string, "name": string, "type": "interests"|"behaviors"|"demographics" } ],  // Real Meta interest IDs from engine. Empty when brief has no clear interest angle.',
    '     "audienceLabel": string                     // short human label, e.g. "Gauteng students 18-24"',
    '  },',
    '  "funding": "ABO" | "CBO",',
    '  "budgetMode": "daily" | "lifetime",',
    '  "dailyBudgetRand": number,     // 50-5000. Fill when budgetMode is "daily".',
    '  "lifetimeBudgetRand": number,  // 500-500000. Fill when budgetMode is "lifetime". A brief that says "R10K over 4 weeks" is lifetime R10000.',
    '  "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",  // Resolve relative dates like "Monday" or "for two weeks" from today. Explicit dates in the brief win (e.g. "1 October to 1 November 2026" -> startDate 2026-10-01, endDate 2026-11-01).',
    '  "adVariants": { "headlines": [3 strings], "primaryTexts": [3 strings] },',
    '  "creativeDefaults": { "linkUrl": string, "callToAction": string },  // callToAction one of: ' + CTA_WHITELIST.join(", ") + '. Omit linkUrl for CTWA (WhatsApp) campaigns.',
    '  "notes": [strings]           // Short still-to-do items ONLY for things the engine genuinely cannot resolve (e.g. "Client to confirm 4-week vs 6-week flight"). Do NOT emit notes about looking up accounts/audiences/geo/pages, those are your job via the engine.',
    "}",
    "",
    "Copy rules for adVariants: headlines max 40 characters, primary texts 80-180 characters, South African English, one concrete benefit plus an action verb, no emojis, no hashtags, no em dashes, no generic filler.",
    "",
    "Do NOT invent: interest IDs, page IDs, account IDs, location keys. Look them up via the engine or omit the field entirely. Never place a fake ID into the JSON.",
    "",
    "Allowlisted ad accounts (starting reference, engine has the authoritative list):",
    accounts.length
      ? accounts.map(function (a) { return "- id: " + a.id + "  name: " + a.name; }).join("\n")
      : "(none provided by client, use engine account list)"
  );

  return lines.join("\n");
}

// ---- Anthropic call -------------------------------------------------------

function anthropicPayload(systemPrompt, userText, mcpUrl, mcpToken, legacyShape) {
  var payload = {
    model: MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: "user", content: userText }]
  };
  if (mcpUrl && mcpToken) {
    payload.mcp_servers = [
      { type: "url", url: mcpUrl, name: SERVER_NAME, authorization_token: mcpToken }
    ];
    if (!legacyShape) {
      payload.tools = [{ type: "mcp_toolset", mcp_server_name: SERVER_NAME }];
    }
  }
  return payload;
}

async function callAnthropic(apiKey, payload, betaHeader) {
  var headers = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01"
  };
  if (betaHeader) headers["anthropic-beta"] = betaHeader;
  var resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });
  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: resp.status, data: data, rawText: text };
}

// ---- Handler --------------------------------------------------------------

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 100 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Quick Brief not configured (ANTHROPIC_API_KEY missing)" }); return; }

  // MCP is optional here (text-only mode still parses briefs). When both are
  // present Sami tool-uses via the Markifact connector.
  var mcpToken = process.env.MARKIFACT_MCP_TOKEN || "";
  var mcpUrl = process.env.MARKIFACT_MCP_URL || "https://api.markifact.com/mcp";
  var toolsAvailable = !!mcpToken;

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var brief = cleanStr(body.brief, MAX_BRIEF_CHARS);
  if (brief.length < 10) { res.status(400).json({ error: "Write a sentence or two about the campaign first." }); return; }

  var accounts = (Array.isArray(body.accounts) ? body.accounts : []).slice(0, MAX_ACCOUNTS)
    .map(function (a) { return { id: cleanStr(a && a.id, 40), name: cleanStr(a && a.name, 120) }; })
    .filter(function (a) { return a.id && a.name; });
  var accountIds = {};
  accounts.forEach(function (a) { accountIds[a.id] = a.name; });

  var objKeys = Object.keys(ALLOWED_OBJECTIVES);
  var today = todayIsoSast();
  var systemPrompt = buildSystem(objKeys, accounts, today, toolsAvailable);
  var userText = "Brief:\n" + brief + "\n\nResearch what you need via the engine, then return the JSON draft as your final message.";

  try {
    var result = await callAnthropic(
      apiKey,
      anthropicPayload(systemPrompt, userText, toolsAvailable ? mcpUrl : "", toolsAvailable ? mcpToken : "", false),
      toolsAvailable ? "mcp-client-2025-11-20" : null
    );

    // Legacy MCP shape fallback (only relevant when tools are enabled)
    if (toolsAvailable && result.status === 400 && /toolset|beta|mcp/i.test(result.rawText || "")) {
      result = await callAnthropic(
        apiKey,
        anthropicPayload(systemPrompt, userText, mcpUrl, mcpToken, true),
        "mcp-client-2025-04-04"
      );
    }

    if (result.status === 401 || result.status === 403) {
      console.error("brief-parse upstream auth failure", result.status, result.rawText && result.rawText.slice(0, 300));
      res.status(502).json({ error: "The data engine rejected our credentials. Check ANTHROPIC_API_KEY and MARKIFACT_MCP_TOKEN." });
      return;
    }
    if (result.status !== 200 || !result.data) {
      console.error("brief-parse upstream error", result.status, result.rawText && result.rawText.slice(0, 500));
      res.status(502).json({ error: "Brief parsing hit a problem. Try again in a moment." });
      return;
    }

    // Extract the last text block. Tool-use blocks are intermixed with text
    // blocks in tool-enabled responses; the final text block should carry
    // the JSON draft.
    var content = Array.isArray(result.data.content) ? result.data.content : [];
    var textBlocks = content.filter(function (b) { return b && b.type === "text" && b.text; });
    if (!textBlocks.length) {
      res.status(502).json({ error: "The brief did not parse cleanly. Reword it slightly and try again." });
      return;
    }
    var raw = textBlocks[textBlocks.length - 1].text
      .replace(/```json|```/g, "")
      .trim();

    // A compact list of tool names the model used, for the client's activity
    // strip (names only, never inputs or raw results, scrubbed of vendor).
    var toolCalls = content
      .filter(function (b) { return b && b.type === "mcp_tool_use"; })
      .map(function (b) { return scrub(b.name || "engine-call"); });

    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
      res.status(502).json({ error: "The brief did not parse cleanly. Reword it slightly and try again." });
      return;
    }

    // ---- Hard validation. Nothing model-shaped reaches the wizard raw. ----
    var draft = {};
    var notes = (Array.isArray(parsed.notes) ? parsed.notes : []).map(function (n) { return cleanStr(n, 160); }).filter(Boolean).slice(0, 8);

    // Account id: accept either from the allowlist we sent, or from the
    // engine's response (which is authoritative). If the engine returned an
    // id not in the incoming list, still accept the pair but flag it so the
    // wizard's Step 1 dropdown can highlight the mismatch.
    if (parsed.accountId && accountIds[String(parsed.accountId)]) {
      draft.accountId = String(parsed.accountId);
      draft.accountName = accountIds[draft.accountId];
    } else if (parsed.accountId && parsed.accountName) {
      draft.accountId = cleanStr(parsed.accountId, 40);
      draft.accountName = cleanStr(parsed.accountName, 120);
    } else if (parsed.accountId) {
      notes.unshift("Could not confidently match the client to an ad account, pick it on Step 1.");
    }

    if (parsed.pageId) {
      draft.pageId = cleanStr(parsed.pageId, 40);
      draft.pageName = cleanStr(parsed.pageName, 120);
    }

    draft.clientCode = cleanStr(parsed.clientCode, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
    draft.variant = cleanStr(parsed.variant, 10) || "A";

    var obj = String(parsed.objective || "");
    draft.objective = objKeys.indexOf(obj) >= 0 ? obj : "OUTCOME_TRAFFIC";

    draft.specialAdCategories = (Array.isArray(parsed.specialAdCategories) ? parsed.specialAdCategories : [])
      .filter(function (c) { return SPECIAL_CATEGORY_WHITELIST.indexOf(String(c)) >= 0; });

    // ---- Audience ----
    var aud = parsed.audience || {};
    var geosIn = Array.isArray(aud.geographies) ? aud.geographies : [];
    var geosOut = geosIn.slice(0, 20).map(function (g) {
      if (!g || typeof g !== "object") return null;
      var t = String(g.type || "").toLowerCase();
      if (GEO_TYPE_WHITELIST.indexOf(t) < 0) return null;
      var key = cleanStr(g.key, 40);
      var name = cleanStr(g.name, 120);
      if (!key || !name) return null;
      return {
        key: key,
        type: t,
        name: name,
        countryCode: cleanStr(g.countryCode, 4) || "ZA",
        countryName: cleanStr(g.countryName, 60) || "South Africa"
      };
    }).filter(Boolean);
    if (geosOut.length === 0) {
      geosOut = [{ key: "ZA", type: "country", name: "South Africa", countryCode: "ZA", countryName: "South Africa" }];
    }

    var gendersIn = Array.isArray(aud.genders) ? aud.genders : [];
    var gendersOut = gendersIn
      .map(function (g) { return String(g).toLowerCase(); })
      .filter(function (g) { return GENDER_WHITELIST.indexOf(g) >= 0; });

    var itemsIn = Array.isArray(aud.targetingItems) ? aud.targetingItems : [];
    var itemsOut = itemsIn.slice(0, 25).map(function (it) {
      if (!it || typeof it !== "object") return null;
      var id = cleanStr(it.id, 40);
      var name = cleanStr(it.name, 120);
      if (!id || !name) return null;
      var t = String(it.type || "interests").toLowerCase();
      if (["interests", "behaviors", "demographics"].indexOf(t) < 0) t = "interests";
      return { id: id, name: name, type: t };
    }).filter(Boolean);

    draft.audience = {
      locations: { geographies: geosOut, customLocations: [] },
      ageMin: clampNum(aud.ageMin, 18, 65, 18),
      ageMax: clampNum(aud.ageMax, 18, 65, 65),
      genders: gendersOut,
      advantageAudience: false,
      targetingItems: itemsOut,
      flexibleSpec: null,
      savedAudienceIds: [],
      customAudienceIds: [],
      targetCommunity: { fans: false, igFollowers: false },
      audienceLabel: cleanStr(aud.audienceLabel, 60)
    };
    if (draft.audience.ageMin > draft.audience.ageMax) {
      var t = draft.audience.ageMin; draft.audience.ageMin = draft.audience.ageMax; draft.audience.ageMax = t;
    }

    // ---- Budget + funding ----
    draft.funding = parsed.funding === "CBO" ? "CBO" : "ABO";
    var mode = parsed.budgetMode === "lifetime" ? "lifetime" : "daily";
    draft.budgetMode = mode;
    if (mode === "lifetime") {
      draft.lifetimeBudgetRand = clampNum(parsed.lifetimeBudgetRand, 500, 500000, 5000);
      // Keep dailyBudgetRand at a sane default so the wizard's toggle works.
      draft.dailyBudgetRand = 200;
    } else {
      draft.dailyBudgetRand = clampNum(parsed.dailyBudgetRand, 50, 5000, 200);
      draft.lifetimeBudgetRand = 5000;
    }

    // ---- Dates ----
    draft.startDate = isoDateOnly(parsed.startDate) ? parsed.startDate : today;
    draft.endDate = isoDateOnly(parsed.endDate) && parsed.endDate >= draft.startDate
      ? parsed.endDate
      : new Date(new Date(draft.startDate + "T00:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);

    // ---- Creative + copy ----
    var av = parsed.adVariants || {};
    draft.adVariants = {
      headlines: cleanArr3(av.headlines, 40),
      primaryTexts: cleanArr3(av.primaryTexts, 300)
    };

    var cd = parsed.creativeDefaults || {};
    var linkUrl = cleanStr(cd.linkUrl, 300);
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = "https://" + linkUrl;
    var cta = CTA_WHITELIST.indexOf(String(cd.callToAction)) >= 0 ? String(cd.callToAction) : "LEARN_MORE";
    draft.creativeDefaults = { linkUrl: linkUrl, callToAction: cta };

    var payload = { draft: draft, notes: notes };
    if (toolCalls.length) payload.toolCalls = toolCalls;
    res.status(200).json(payload);
  } catch (err) {
    console.error("brief-parse failed", err);
    res.status(500).json({ error: "Brief parsing hit a problem. Try again in a moment." });
  }
}
