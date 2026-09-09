// Quick Brief parser. Turns a plain-English campaign brief into a partial
// wizard draft the Create tab pre-fills from, so the team types one
// paragraph instead of filling seven steps of fields.
//
// Safety model: the AI only fills the form. Its output is validated and
// clamped HERE against hard whitelists before it ever reaches the browser,
// and the actual campaign write still goes through the existing wizard
// review + /api/create/campaign path (PAUSED, R5,000/day cap, allowlist,
// approval flow). A bad parse costs an edit on screen, never a bad launch.
//
// Body: { brief: string, accounts: [{id, name}] }  (accounts optional, lets
// the model match "Boston" in the brief to the right allowlisted account)
// Returns: { draft: <partial wizard draft>, notes: [string] }

import Anthropic from "@anthropic-ai/sdk";
import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, ALLOWED_OBJECTIVES } from "../_createAuth.js";

export const config = { maxDuration: 60 };

var MAX_BRIEF_CHARS = 3000;
var MAX_ACCOUNTS = 100;

var CTA_WHITELIST = ["LEARN_MORE", "SIGN_UP", "SHOP_NOW", "GET_OFFER", "CONTACT_US", "APPLY_NOW", "DOWNLOAD", "SUBSCRIBE"];
var SPECIAL_CATEGORY_WHITELIST = ["CREDIT", "EMPLOYMENT", "HOUSING"];

function isoDateOnly(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
}
function todayIsoSast() {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
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

function buildSystem(objKeys, accounts, today) {
  return [
    "You turn a paid-media campaign brief into a JSON draft for GAS Marketing's Meta campaign loader. South African agency, currency is rand (R).",
    "Today's date (SAST): " + today + ".",
    "",
    "Return ONLY a JSON object, no markdown fences, no commentary. Schema (every key optional, omit anything the brief does not support):",
    "{",
    '  "accountId": string,        // ONLY an id copied exactly from the account list below, matched to the client named in the brief. Omit if no confident match.',
    '  "accountName": string,      // the matched account name, verbatim from the list',
    '  "clientCode": string,       // short ALL-CAPS client code for campaign naming, max 10 chars, e.g. Boston City Campus -> BOSTON',
    '  "variant": string,          // campaign variant tag if the brief implies one, else "A"',
    '  "objective": string,        // one of: ' + objKeys.join(", ") + ". leads->OUTCOME_LEADS, website traffic/landing page->OUTCOME_TRAFFIC, followers/engagement->OUTCOME_ENGAGEMENT, awareness/reach->OUTCOME_AWARENESS, sales/purchases->OUTCOME_SALES, app installs->OUTCOME_APP_PROMOTION",
    '  "specialAdCategories": [],  // subset of ["CREDIT","EMPLOYMENT","HOUSING"] ONLY if the brief is clearly about loans/credit, jobs, or housing. Else [].',
    '  "audience": { "ageMin": number, "ageMax": number, "audienceLabel": string },  // ages 18-65. audienceLabel = short human label for the audience, e.g. "Gauteng students 18-24"',
    '  "funding": "ABO" | "CBO",',
    '  "budgetMode": "daily",',
    '  "dailyBudgetRand": number,  // 50-5000. Default 200 if the brief gives no budget.',
    '  "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",  // resolve relative dates like "Monday" or "for two weeks" from today. Default: start today, end in 7 days.',
    '  "adVariants": { "headlines": [3 strings], "primaryTexts": [3 strings] },',
    '  "creativeDefaults": { "linkUrl": string, "callToAction": string },  // callToAction one of: ' + CTA_WHITELIST.join(", "),
    '  "notes": [strings]          // short still-to-do items for the team: cities or interests to refine in the Audience step, gender targeting to set manually, images to upload, anything the brief asked for the loader cannot pre-fill',
    "}",
    "",
    "Copy rules for adVariants: headlines max 40 characters, primary texts 80-180 characters, South African English, one concrete benefit plus an action verb, no emojis, no hashtags, no em dashes, no generic filler.",
    "",
    "Do NOT invent: gender targeting, city or interest targeting IDs, pixel IDs, page IDs, or account IDs not in the list. Put those intents into notes instead.",
    "",
    "Allowlisted ad accounts:",
    accounts.length
      ? accounts.map(function (a) { return "- id: " + a.id + "  name: " + a.name; }).join("\n")
      : "(none provided, omit accountId and accountName)"
  ].join("\n");
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 100 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "Quick Brief not configured (ANTHROPIC_API_KEY missing)" }); return; }

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

  try {
    var anthropic = new Anthropic({ apiKey: apiKey });
    var msg = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1500,
      system: buildSystem(objKeys, accounts, today),
      messages: [{ role: "user", content: "Brief:\n" + brief + "\n\nReturn the JSON draft." }]
    });

    var raw = (msg.content || [])
      .filter(function (b) { return b.type === "text"; })
      .map(function (b) { return b.text; })
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    var parsed;
    try { parsed = JSON.parse(raw); } catch (_) {
      res.status(502).json({ error: "The brief did not parse cleanly. Reword it slightly and try again." });
      return;
    }

    // ---- Hard validation. Nothing model-shaped reaches the wizard raw. ----
    var draft = {};
    var notes = (Array.isArray(parsed.notes) ? parsed.notes : []).map(function (n) { return cleanStr(n, 160); }).filter(Boolean).slice(0, 8);

    if (parsed.accountId && accountIds[String(parsed.accountId)]) {
      draft.accountId = String(parsed.accountId);
      draft.accountName = accountIds[draft.accountId];
    } else if (parsed.accountId) {
      notes.unshift("Could not confidently match the client to an ad account, pick it on Step 1.");
    }

    draft.clientCode = cleanStr(parsed.clientCode, 10).toUpperCase().replace(/[^A-Z0-9]/g, "");
    draft.variant = cleanStr(parsed.variant, 10) || "A";

    var obj = String(parsed.objective || "");
    draft.objective = objKeys.indexOf(obj) >= 0 ? obj : "OUTCOME_TRAFFIC";

    draft.specialAdCategories = (Array.isArray(parsed.specialAdCategories) ? parsed.specialAdCategories : [])
      .filter(function (c) { return SPECIAL_CATEGORY_WHITELIST.indexOf(String(c)) >= 0; });

    var aud = parsed.audience || {};
    draft.audience = {
      ageMin: clampNum(aud.ageMin, 18, 65, 18),
      ageMax: clampNum(aud.ageMax, 18, 65, 65),
      audienceLabel: cleanStr(aud.audienceLabel, 60)
    };
    if (draft.audience.ageMin > draft.audience.ageMax) {
      var t = draft.audience.ageMin; draft.audience.ageMin = draft.audience.ageMax; draft.audience.ageMax = t;
    }

    draft.funding = parsed.funding === "CBO" ? "CBO" : "ABO";
    draft.budgetMode = "daily";
    draft.dailyBudgetRand = clampNum(parsed.dailyBudgetRand, 50, 5000, 200);

    draft.startDate = isoDateOnly(parsed.startDate) ? parsed.startDate : today;
    draft.endDate = isoDateOnly(parsed.endDate) && parsed.endDate >= draft.startDate
      ? parsed.endDate
      : new Date(new Date(draft.startDate + "T00:00:00Z").getTime() + 7 * 86400000).toISOString().slice(0, 10);

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

    res.status(200).json({ draft: draft, notes: notes });
  } catch (err) {
    console.error("brief-parse failed", err);
    res.status(500).json({ error: "Brief parsing hit a problem. Try again in a moment." });
  }
}
