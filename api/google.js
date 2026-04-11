export default async function handler(req, res) {
  var clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  var clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  var refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  var devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  var managerId = process.env.GOOGLE_ADS_MANAGER_ID;
  var customerId = req.query.customer || "9587382256";
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";
  var debug = {};

  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    debug.step = "token_refresh";
    var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: "client_id=" + clientId + "&client_secret=" + clientSecret + "&refresh_token=" + refreshToken + "&grant_type=refresh_token"
    });
    var tokenData = await tokenRes.json();
    debug.tokenOk = !!tokenData.access_token;

    if (!tokenData.access_token) {
      return res.status(400).json({error: "Token refresh failed", debug: debug, tokenResponse: tokenData});
    }

    var versions = ["v17", "v16", "v15", "v14"];
    var gaqlData = null;
    var query = "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";

    for (var v = 0; v < versions.length; v++) {
      debug.step = "trying_" + versions[v];
      var url = "https://googleads.googleapis.com/" + versions[v] + "/customers/" + customerId + "/googleAds:search";

      var gaqlRes = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + tokenData.access_token,
          "developer-token": devToken,
          "login-customer-id": managerId,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({query: query})
      });

      debug.statusCode = gaqlRes.status;
      debug.version = versions[v];

      if (gaqlRes.status === 200) {
        gaqlData = await gaqlRes.json();
        break;
      } else if (gaqlRes.status !== 404) {
        var errText = await gaqlRes.text();
        debug.responsePreview = errText.substring(0, 500);
        return res.status(400).json({error: "Google Ads API error", debug: debug});
      }
    }

    if (!gaqlData) {
      return res.status(400).json({error: "No working API version found", debug: debug});
    }

    var campaigns = [];
    var results = gaqlData.results || [];
    for (var i = 0; i < results.length; i++) {
      var r = results[i];
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
        ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : "0",
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

    debug.step = "done";
    debug.campaignsFound = campaigns.length;
    return res.status(200).json({totalCampaigns: campaigns.length, debug: debug, campaigns: campaigns});
  } catch (error) {
    return res.status(500).json({error: error.message, debug: debug});
  }
}