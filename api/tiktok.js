export default async function handler(req, res) {
  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const advId = process.env.TIKTOK_ADVERTISER_ID;
  const from = req.query.from || "2026-03-01";
  const to = req.query.to || "2026-04-07";
  const dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
  const metrics = encodeURIComponent(JSON.stringify(["spend","impressions","clicks","cpm"]));
  const url = `https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=${advId}&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=${dims}&metrics=${metrics}&start_date=${from}&end_date=${to}&page_size=50`;
  try {
    const response = await fetch(url, {headers: {"Access-Token": token}});
    const data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}