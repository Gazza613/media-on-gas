export default async function handler(req, res) {
  var token = process.env.META_ACCESS_TOKEN;
  var account = req.query.account || "act_8159212987434597";
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";
  var level = req.query.level || "campaign";
  var fields = "campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions";
  var timeRange = JSON.stringify({since: from, until: to});
  var url = "https://graph.facebook.com/v25.0/" + account + "/insights?fields=" + fields + "&time_range=" + timeRange + "&level=" + level + "&breakdowns=publisher_platform&limit=500&access_token=" + token;
  try {
    var response = await fetch(url);
    var data = await response.json();
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}