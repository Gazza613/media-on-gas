// Sami Hub Live Campaign State endpoint.
//
// Powers the always-visible header strip at the top of the hub that
// shows the AM at a glance: which client they've been building for,
// what got created today (campaigns / ad sets / ads / uploads),
// week-to-date totals, budget locked in today, and credit headroom.
//
// Reads the RESULT_CARD log written by sami-hub (see api/_samiResults.js)
// plus the usage counter for credit remaining.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";
import { readUserResults, readActiveClient, summariseResults } from "../_samiResults.js";
import { readUsageDaily, sumMonth } from "../_samiUsage.js";

var PLAN = { creditsLimit: 5000, alertAt: 4800 };

export default async function handler(req, res) {
  var auth = checkCreateAuth(req, res);
  if (!auth) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;

  try {
    var results = await readUserResults(auth.user, 7);
    var today = new Date().toISOString().slice(0, 10);
    var todaySummary = summariseResults(results, today);
    var weekSummary = summariseResults(results, null);
    var active = await readActiveClient(auth.user);

    // Credit context (monthly total from the same store the credit
    // strip uses). Keeps the header self-contained; no separate fetch
    // needed for the credit chip.
    var daily = await readUsageDaily(30);
    var month = sumMonth(daily);
    var remaining = Math.max(0, PLAN.creditsLimit - (month.total || 0));

    res.status(200).json({
      today: {
        date: today,
        counts: todaySummary.counts,
        totalWrites: todaySummary.totalWrites,
        dailyBudgetCents: todaySummary.totalDailyBudgetCents,
        lifetimeBudgetCents: todaySummary.totalLifetimeBudgetCents,
        byClient: todaySummary.byClient
      },
      week: {
        totalWrites: weekSummary.totalWrites,
        byClient: weekSummary.byClient
      },
      activeClient: active || todaySummary.mostRecentClient || "",
      credits: {
        used: month.total || 0,
        limit: PLAN.creditsLimit,
        remaining: remaining,
        alertAt: PLAN.alertAt
      }
    });
  } catch (err) {
    console.error("[sami-live-state] handler error", err);
    res.status(500).json({ error: "Live state read failed" });
  }
}
