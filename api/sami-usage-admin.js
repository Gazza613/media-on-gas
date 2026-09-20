// Superadmin-visible Sami Hub usage aggregate.
//
// Sibling of /api/nlp/sami-usage but session-authenticated instead of
// create-tab-JWT authenticated. Lets Gary see the full per-team-member
// credit picture from the Team Access page without needing to unlock
// Sami first. Same underlying counters (recorded by the MCP proxy on
// every forwarded tools/call), same readUsageDaily + sumMonth helpers,
// same response shape.

import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { isSuperadminEmail } from "./_users.js";
import { readUsageDaily, sumMonth } from "./_samiUsage.js";

var PLAN = { creditsLimit: 5000, alertAt: 4800, resetDay: 25 };

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isSuperadminEmail(session.email)) { res.status(403).json({ error: "Superadmin only" }); return; }

  try {
    var daily = await readUsageDaily(30);
    var currentMonth = sumMonth(daily);
    res.status(200).json({ daily: daily, currentMonth: currentMonth, plan: PLAN });
  } catch (err) {
    console.error("[sami-usage-admin] handler error", err);
    res.status(500).json({ error: "Usage read failed." });
  }
}
