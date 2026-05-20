// Monthly refresh of platform best-practices used by the Command Centre
// Growth Plan. Vercel cron hits this endpoint on the 1st of every month
// (see vercel.json). It calls Claude API with a structured prompt
// describing the current month and writes the response to Redis under
// `bp:v1` so the dashboard reads fresh advice without per-request LLM
// calls.
//
// Robust to failure: if anything errors (no API key, malformed LLM
// response, Redis down), the existing Redis copy stays untouched and
// the dashboard falls back to the bundled JSON file. The cron only
// REPLACES the Redis copy on a clean, validated success.

import Anthropic from "@anthropic-ai/sdk";
import { redisSetJson } from "../_pulseShared.js";

export const config = { maxDuration: 60 };

// Vercel cron sends a GET; allow either method since manual triggers
// from the dashboard (or curl) can come as POST.
export default async function handler(req, res) {
  // Vercel cron auth: presence of x-vercel-cron header. Outside cron,
  // require the same DASHBOARD_API_KEY used by other scheduled jobs.
  var isCron = !!req.headers["x-vercel-cron"];
  if (!isCron) {
    var key = process.env.DASHBOARD_API_KEY || "";
    var hdr = req.headers["x-api-key"] || req.query.key || "";
    if (!key || hdr !== key) { res.status(401).json({ error: "Unauthorized" }); return; }
  }

  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" }); return; }

  var now = new Date();
  var monthLabel = now.toLocaleString("en-ZA", { month: "long", year: "numeric" });
  var asOf = now.toISOString().slice(0, 10);

  var anthropic = new Anthropic({ apiKey: apiKey });

  // Single prompt covering all three platforms — one Claude call is
  // cheaper and gives a coherent answer (the prompt can reference its
  // own statements across platforms). Strict JSON output schema so the
  // dashboard can rely on the shape.
  var system = "You are the head of strategy at a top-1% global digital media agency, focused on Meta, TikTok and Google. You stay current on every platform's algorithm changes, default-feature shifts, and what world-class teams are doing differently from 12 months ago. You write short, sharp, actionable copy — no fluff, no hedging. Each bullet is a sentence the operator can act on this week.";

  var user = "Write the current platform best-practices playbook for " + monthLabel + ", focused on what changed in the last 12 months and what top-1% agencies are doing now that the average agency isn't.\n\n" +
    "Return ONLY valid JSON, no prose before or after, matching this exact shape:\n\n" +
    "{\n" +
    "  \"asOf\": \"YYYY-MM-DD\",\n" +
    "  \"meta\": {\n" +
    "    \"audiences\": [ /* 1-2 sentences each, prefixed 'META · ' */ ],\n" +
    "    \"creative\":  [ /* 1-2 sentences each, prefixed 'META · ' */ ],\n" +
    "    \"objectives\":[ /* 1-2 sentences each, prefixed 'META · ' */ ]\n" +
    "  },\n" +
    "  \"tiktok\": { \"audiences\":[...], \"creative\":[...], \"objectives\":[...] },\n" +
    "  \"google\": { \"audiences\":[...], \"creative\":[...], \"objectives\":[...] },\n" +
    "  \"rebuild\": {\n" +
    "    \"meta\":      [ /* structural 60-90 day rebuild plays */ ],\n" +
    "    \"tiktok\":    [...],\n" +
    "    \"google\":    [...],\n" +
    "    \"universal\": [ /* platform-agnostic rebuild plays */ ]\n" +
    "  }\n" +
    "}\n\n" +
    "Each array should have 1-2 items max. Each item should be one tight sentence (or two short sentences). Reference specific current features by name (e.g. 'Advantage+ Shopping', 'Smart+', 'Performance Max', 'Conversions API', 'Customer Match', 'Spark Ads', 'Enhanced Conversions'). Mention the 12-month shift where it matters (e.g. 'broad targeting now beats narrow lookalikes BECAUSE iOS14+ + cookie deprecation gutted signal').";

  var raw;
  try {
    var resp = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      system: system,
      messages: [{ role: "user", content: user }]
    });
    raw = "";
    for (var i = 0; i < (resp.content || []).length; i++) {
      var blk = resp.content[i];
      if (blk && blk.type === "text") raw += blk.text;
    }
  } catch (err) {
    console.error("[refresh-best-practices] Claude API call failed", err && err.message);
    res.status(502).json({ error: "Claude API call failed", message: String((err && err.message) || err) });
    return;
  }

  // Pull the JSON object out of whatever wrapping the model produced
  // (the prompt asks for raw JSON, but a defensive parse covers the
  // case where the model adds backticks or a leading sentence).
  var jsonStart = raw.indexOf("{");
  var jsonEnd = raw.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd <= jsonStart) {
    console.error("[refresh-best-practices] no JSON object found in response");
    res.status(502).json({ error: "Malformed Claude response", raw: raw.slice(0, 500) });
    return;
  }
  var parsed;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    console.error("[refresh-best-practices] JSON parse failed", err && err.message);
    res.status(502).json({ error: "JSON parse failed", raw: raw.slice(0, 500) });
    return;
  }

  // Validate shape before writing — refuse to overwrite Redis with a
  // half-broken response. If any required field is missing, leave the
  // existing copy in place and surface the error.
  var requireArray = function(obj, path) {
    var parts = path.split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (!cur || typeof cur !== "object") return false;
      cur = cur[parts[i]];
    }
    return Array.isArray(cur);
  };
  var paths = [
    "meta.audiences", "meta.creative", "meta.objectives",
    "tiktok.audiences", "tiktok.creative", "tiktok.objectives",
    "google.audiences", "google.creative", "google.objectives",
    "rebuild.meta", "rebuild.tiktok", "rebuild.google", "rebuild.universal"
  ];
  for (var pi = 0; pi < paths.length; pi++) {
    if (!requireArray(parsed, paths[pi])) {
      console.error("[refresh-best-practices] missing required path", paths[pi]);
      res.status(502).json({ error: "Missing required field in Claude response: " + paths[pi] });
      return;
    }
  }

  // Stamp + write. No TTL so a Redis outage in subsequent months
  // doesn't wipe the last good copy. Cron overwrites every month.
  parsed.asOf = asOf;
  parsed.version = monthLabel;
  parsed.source = "Claude " + new Date().toISOString();

  // 100 days TTL so a permanently-broken cron eventually falls back to
  // the bundled JSON file (which gets refreshed by the team on PR).
  var ok = await redisSetJson("bp:v1", parsed, 100 * 24 * 60 * 60);
  if (!ok) {
    console.error("[refresh-best-practices] Redis write failed");
    res.status(502).json({ error: "Redis write failed" });
    return;
  }

  res.status(200).json({
    ok: true,
    refreshedAt: now.toISOString(),
    asOf: asOf,
    version: monthLabel,
    sectionsWritten: paths.length
  });
}
