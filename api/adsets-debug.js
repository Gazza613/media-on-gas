export default async function handler(req, res) {
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-13";
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var debug = [];

  // Test MTN MoMo
  try {
    var url = "https://graph.facebook.com/v25.0/act_8159212987434597/insights?fields=campaign_name,adset_name,impressions,spend,clicks&level=adset&time_range={\"since\":\"" + from + "\",\"until\":\"" + to + "\"}&limit=5&access_token=" + metaToken;
    var r = await fetch(url);
    var d = await r.json();
    debug.push({ account: "MTN MoMo", status: r.status, count: d.data ? d.data.length : 0, error: d.error || null, sample: d.data ? d.data[0] : null });
  } catch(e) { debug.push({ account: "MTN MoMo", error: e.message }); }

  // Test TikTok
  try {
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&dimensions=[%22adgroup_id%22,%22campaign_id%22]&data_level=AUCTION_ADGROUP&metrics=[%22campaign_name%22,%22adgroup_name%22,%22spend%22,%22impressions%22,%22clicks%22,%22follows%22]&start_date=" + from + "&end_date=" + to + "&page_size=5";
    var ttR = await fetch(ttUrl, { headers: { "Access-Token": ttToken } });
    var ttD = await ttR.json();
    debug.push({ account: "TikTok", status: ttR.status, code: ttD.code, count: ttD.data ? (ttD.data.list ? ttD.data.list.length : 0) : 0, error: ttD.message || null, sample: ttD.data && ttD.data.list ? ttD.data.list[0] : null });
  } catch(e) { debug.push({ account: "TikTok", error: e.message }); }

  res.json(debug);
}
