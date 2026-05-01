import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates, ALLOWED_META_ACCOUNTS, ALLOWED_LEVELS } from "./_validate.js";
export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!(await checkAuth(req, res))) return;
  if (!validateDates(req, res)) return;
  // Admin-only, raw /insights proxy that accepts any allowed account id.
  // Clients must go through /api/campaigns + /api/ads which enforce a
  // per-token campaign-scope filter.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }
  var token = process.env.META_ACCESS_TOKEN;
  var account = req.query.account || "act_8159212987434597";
  if (ALLOWED_META_ACCOUNTS.indexOf(account) < 0) { res.status(403).json({ error: "Invalid account" }); return; }
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";
  var level = req.query.level || "campaign";
  if (ALLOWED_LEVELS.indexOf(level) < 0) { res.status(400).json({ error: "Invalid level" }); return; }
  var fields = "campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions";
  var timeRange = JSON.stringify({since: from, until: to});
  var url = "https://graph.facebook.com/v25.0/" + account + "/insights?fields=" + fields + "&time_range=" + timeRange + "&level=" + level + "&breakdowns=publisher_platform&limit=500&access_token=" + token;
  try {
    var response = await fetch(url);
    var data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}