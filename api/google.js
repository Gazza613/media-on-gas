export default async function handler(req, res) {
  var clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  var devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  var managerId = process.env.GOOGLE_ADS_MANAGER_ID;
  var customerId = req.query.customer || "9587382256";
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";

  try {
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: "client_id=" + clientId + "&client_secret=" + clientSecret + "&refresh_token=" + refreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      res.status(400).json({error: "Token refresh failed", details: tokenData});
      return;
    }

    var query = "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, metrics.average_cpm FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";

    var gaqlRes = await fetch("https://googleads.googleapis.com/v18/customers/" + customerId + "/googleAds:searchStream", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + tokenData.access_token,
        "developer-token": devToken,
        "login-customer-id": managerId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({query: query})
    })
cat > /workspaces/media-on-gas/api/google.js << 'DONE'
export default async function handler(req, res) {
  var clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  var devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  var managerId = process.env.GOOGLE_ADS_MANAGER_ID;
  var customerId = req.query.customer || "9587382256";
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";

  try {
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: "client_id=" + clientId + "&client_secret=" + clientSecret + "&refresh_token=" + refreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      res.status(400).json({error: "Token refresh failed", details: tokenData});
      return;
    }

    var query = "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.cost_per_conversion, metrics.average_cpm FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";

    var gaqlRes = await fetch("https://googleads.googleapis.com/v18/customers/" + customerId + "/googleAds:searchStream", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + tokenData.access_token,
        "developer-token": devToken,
        "login-customer-id": managerId,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({query: query})
    });

    var gaqlData = await gaqlRes.json();

    var campaigns = [];
    if (gaqlData && gaqlData[0] && gaqlData[0].results) {
      for (var i = 0; i < gaqlData[0].results.length; i++) {
        var r = gaqlData[0].results[i];
        var c = r.campaign;
        var m = r.metrics;
        var spend = parseFloat(m.costMicros || 0) / 1000000;
        var clicks = parseInt(m.clicks || 0);
        var impressions = parseInt(m.impressions || 0);
        var conversions = parseFloat(m.conversions || 0);
        campaigns.push({
          platform: "Google Display",
          accountName: "MTN MoMo Google",
          campaignId: "google_" + c.id,
          rawCampaignId: c.id,
          campaignName: c.name,
          status: c.status === "ENABLED" ? "active" : c.status.toLowerCase(),
          impressions: impressions.toString(),
          reach: "0",
          frequency: "0",
          spend: spend.toFixed(2),
          cpm: impressions > 0 ? ((spend / impressions) * 1000).toFixed(2) : "0",
          cpc: clicks > 0 ? (spend / clicks).toFixed(2) : "0",
          ctr: m.ctr ? (parseFloat(m.ctr) * 100).toFixed(2) : "0",
          clicks: clicks.toString(),
          conversions: conversions.toString(),
          costPerConversion: conversions > 0 ? (spend / conversions).toFixed(2) : "0",
          leads: "0",
          appInstalls: "0",
          landingPageViews: "0",
          pageLikes: "0",
          follows: "0",
          likes: "0",
          costPerLead: "0",
          costPerInstall: "0"
        });
      }
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({totalCampaigns: campaigns.length, raw: gaqlData, campaigns: campaigns});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
}
