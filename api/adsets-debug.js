export default async function handler(req, res) {
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-13";
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  try {
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&dimensions=[%22adgroup_id%22]&data_level=AUCTION_ADGROUP&metrics=[%22campaign_name%22,%22adgroup_name%22,%22campaign_id%22,%22spend%22,%22impressions%22,%22clicks%22,%22follows%22,%22likes%22]&start_date=" + from + "&end_date=" + to + "&page_size=10";
    var ttR = await fetch(ttUrl, { headers: { "Access-Token": ttToken } });
    var ttD = await ttR.json();
    res.json({ status: ttR.status, code: ttD.code, message: ttD.message, count: ttD.data && ttD.data.list ? ttD.data.list.length : 0, sample: ttD.data && ttD.data.list ? ttD.data.list.slice(0, 3) : null });
  } catch(e) { res.json({ error: e.message }); }
}
