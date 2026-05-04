import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates, ALLOWED_CLIENTS } from "./_validate.js";
const clientAdvertisers = {
  "mtn-momo": "7446793748044202000"
};

export default async function handler(req, res) {
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
  if (!validateDates(req, res)) return;
  // Admin-only, raw TikTok Business API proxy with no per-campaign scope
  // filter. Clients go through /api/campaigns + /api/ads which apply their
  // token's campaign allowlist.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin" && principal.role !== "superadmin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const clientSlug = req.query.client || "mtn-momo";
  if (ALLOWED_CLIENTS.indexOf(clientSlug) < 0) { res.status(400).json({ error: "Invalid client" }); return; }
  const advId = clientAdvertisers[clientSlug] || process.env.TIKTOK_ADVERTISER_ID;
  const from = req.query.from || "2026-03-01";
  const to = req.query.to || "2026-04-07";
  const dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
  const metrics = encodeURIComponent(JSON.stringify(["spend","impressions","clicks","cpm","cpc","ctr","video_views_p100","follows","likes","comments","shares"]));
  const url = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + advId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + dims + "&metrics=" + metrics + "&start_date=" + from + "&end_date=" + to + "&page_size=50";
  try {
    const response = await fetch(url, {headers: {"Access-Token": token}});
    const data = await response.json();

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  }
}