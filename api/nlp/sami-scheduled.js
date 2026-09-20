// Phase 4 of the Sami Hub rebuild: Scheduled tasks view.
//
// Read-only endpoint returning the list of automated tasks the
// dashboard has configured (Vercel crons + any Redis-backed
// scheduled campaign starts). Powers the small "Scheduled" strip
// in the Sami Hub left rail so the team knows what runs and when
// without hunting through the Vercel dashboard.
//
// Data sources:
//   - vercel.json crons (compiled in at build; we hardcode the same
//     schedule + description mapping here so the endpoint stays fast
//     and does not need file-system access at runtime).
//   - Redis key sami:scheduled:extras — optional future extension for
//     scheduled campaign starts / ad set start dates written by
//     Sami during campaign builds.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

// Mirrors vercel.json crons (2026-09-19). Update in lockstep if that
// file changes — a mismatch just means this endpoint reports stale
// schedule metadata, no runtime impact.
var CRON_MANIFEST = [
  { path: "/api/reconcile?alert=1",     schedule: "0 6 * * *",   label: "Reconcile & alert",      description: "Cross-platform metric reconcile pass; emails an alert email if any delta > 5%." },
  { path: "/api/nudge-cron",             schedule: "30 6 * * *",  label: "Daily SLA nudge",        description: "Nudges the leadership team about any client whose last report is more than 7 days old." },
  { path: "/api/daily-report",           schedule: "15 6 * * *",  label: "Daily pulse email",      description: "Daily performance pulse email to the team." },
  { path: "/api/weekly-summary",         schedule: "0 8 * * 5",   label: "Weekly activity summary", description: "Friday morning summary with SLA overdue table, reports sent, and adoption scorecards." },
  { path: "/api/weekly-pulse",           schedule: "0 6 * * 1",   label: "Weekly client pulse",     description: "Monday morning weekly performance pulse to clients." },
  { path: "/api/ig-snapshot",            schedule: "0 4 * * *",   label: "IG follower snapshot",    description: "Records daily Instagram follower counts for growth trendlines." },
  { path: "/api/fb-page-snapshot",       schedule: "5 4 * * *",   label: "FB page snapshot",        description: "Records daily Facebook page follower counts." },
  { path: "/api/sami-usage-alert",       schedule: "0 */6 * * *", label: "Sami credit-balance alert", description: "Emails the owner once per month when Markifact MCP-tool usage crosses 4,800 of the 5,000 monthly credits so extra credits can be topped up in time." }
];

// UTC → SAST for display. All Vercel crons are UTC. SAST = UTC+2.
function utcCronToSast(cron) {
  var parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  var minute = parts[0];
  var hourStr = parts[1];
  if (!/^\d+$/.test(hourStr)) return cron;
  var hourUtc = parseInt(hourStr, 10);
  var hourSast = (hourUtc + 2) % 24;
  return minute + " " + hourSast + " " + parts.slice(2).join(" ");
}

// Very rough next-run estimate for the sidebar strip. Returns a Date
// or null if we can't parse. Handles the simple cron patterns we
// actually use (fixed minute, fixed hour, either wildcard day or a
// specific weekday). Not a general cron parser.
function estimateNextRun(cron) {
  var parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) return null;
  var minute = parseInt(parts[0], 10);
  var hour = parseInt(parts[1], 10);
  if (isNaN(minute) || isNaN(hour)) return null;
  var dow = parts[4]; // e.g. "*" or "5" (Fri) or "1" (Mon)
  var now = new Date();
  // Work in UTC so we match Vercel's cron timezone.
  var candidate = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),
    hour, minute, 0, 0
  ));
  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
  }
  if (dow === "*") return candidate;
  var wantDow = parseInt(dow, 10);
  if (isNaN(wantDow)) return candidate;
  // Advance until we hit the requested weekday (UTC).
  var guard = 0;
  while (candidate.getUTCDay() !== wantDow && guard < 8) {
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
    guard++;
  }
  return candidate;
}

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) { console.error("[sami-scheduled] redis error", err); return null; }
}

async function readExtras() {
  var r = await redisCmd(["GET", "sami:scheduled:extras"]);
  if (!r || !r.result) return [];
  try { var parsed = JSON.parse(r.result); return Array.isArray(parsed) ? parsed : []; }
  catch (_) { return []; }
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  var scheduled = CRON_MANIFEST.map(function (entry) {
    var next = estimateNextRun(entry.schedule);
    return {
      kind: "cron",
      path: entry.path,
      label: entry.label,
      description: entry.description,
      scheduleUtc: entry.schedule,
      scheduleSast: utcCronToSast(entry.schedule),
      nextRunIso: next ? next.toISOString() : null
    };
  });

  // Merge in any Redis-tracked extras (future: Sami-scheduled campaign
  // starts). These live under sami:scheduled:extras with the same
  // shape { kind, label, description, nextRunIso } so the UI can render
  // them alongside the cron rows.
  try {
    var extras = await readExtras();
    if (Array.isArray(extras)) {
      extras.forEach(function (e) {
        if (e && e.label) scheduled.push({
          kind: e.kind || "extra",
          path: e.path || "",
          label: String(e.label).slice(0, 80),
          description: String(e.description || "").slice(0, 240),
          scheduleUtc: "",
          scheduleSast: "",
          nextRunIso: e.nextRunIso || null
        });
      });
    }
  } catch (_) { /* extras is optional */ }

  // Sort by next-run soonest-first so the sidebar strip shows the
  // most imminent tasks. Tasks with no nextRunIso sink to the bottom.
  scheduled.sort(function (a, b) {
    var ta = a.nextRunIso ? Date.parse(a.nextRunIso) : Number.MAX_SAFE_INTEGER;
    var tb = b.nextRunIso ? Date.parse(b.nextRunIso) : Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });

  res.status(200).json({ scheduled: scheduled });
}
