export default async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  const account = req.query.account || "act_8159212987434597";
  const from = req.query.from || "2026-04-01";
  const to = req.query.to || "2026-04-05";
  const level = req.query.level || "campaign";
  const breakdown = req.query.breakdown || "";
  const fields = "campaign_name,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions";
  const timeRange = JSON.stringify({since: from, until: to});
  let url = "https://graph.facebook.com/v25.0/" + account + "/insights?fields=" + fields + "&time_range=" + timeRange + "&level=" + level + "&limit=100&access_token=" + token;
  if (breakdown) {
    url += "&breakdowns=" + breakdown;
  }
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}