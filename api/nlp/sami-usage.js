// Sami Hub credit-usage aggregate endpoint.
//
// Returns rolled-up MCP-tool consumption for the UsageStrip at the
// bottom of the hub. Read-only; the counters are written by the MCP
// proxy on every forwarded tools/call (see api/_samiUsage.js).
//
// Response shape:
//   {
//     daily: [{date, total, writes, byUser: {...}}, ...],   // last 30d, newest first
//     currentMonth: { total, writes, byUser: {...} },
//     plan: {
//       creditsLimit: 5000,       // Markifact PRO monthly allowance
//       alertAt: 4800,            // low-balance alert threshold
//       resetDay: 25              // day-of-month Markifact resets
//     }
//   }

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";
import { readUsageDaily, sumMonth } from "../_samiUsage.js";

var PLAN = { creditsLimit: 5000, alertAt: 4800, resetDay: 25 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  try {
    var daily = await readUsageDaily(30);
    var currentMonth = sumMonth(daily);
    res.status(200).json({
      daily: daily,
      currentMonth: currentMonth,
      plan: PLAN
    });
  } catch (err) {
    console.error("[sami-usage] handler error", err);
    res.status(500).json({ error: "Usage read failed." });
  }
}
