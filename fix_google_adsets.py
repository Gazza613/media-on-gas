with open("/workspaces/media-on-gas/api/adsets.js", "r") as f:
    c = f.read()

# Add Google Ads ad group query before the return
old_return = '  res.json({ adsets: allAdsets, total: allAdsets.length });'

new_google = """  // GOOGLE ADS AD GROUPS
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (gClientId && gRefreshToken && gDevToken) {
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (gTokenData.access_token) {
        var gQuery = "SELECT campaign.name, campaign.id, ad_group.name, ad_group.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";
        var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + gTokenData.access_token,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({query: gQuery})
        });
        if (gRes.status === 200) {
          var gData = await gRes.json();
          var gResults = gData.results || [];
          for (var gi = 0; gi < gResults.length; gi++) {
            var gr = gResults[gi];
            var gSpend = parseFloat(gr.metrics.costMicros || 0) / 1000000;
            var gImps = parseInt(gr.metrics.impressions || 0);
            var gClicks = parseInt(gr.metrics.clicks || 0);
            var gConv = parseFloat(gr.metrics.conversions || 0);
            if (gImps > 0 || gSpend > 0) {
              var gPlatform = "Google Display";
              var gCampName = gr.campaign.name || "";
              if (gCampName.toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
              allAdsets.push({
                platform: gPlatform,
                accountName: "MTN MoMo Google",
                campaignName: gCampName,
                campaignId: gr.campaign.id,
                adsetName: gr.adGroup.name || gCampName,
                adsetId: "google_" + gr.adGroup.id,
                impressions: gImps.toString(),
                reach: "0",
                frequency: "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                leads: Math.round(gConv).toString(),
                appInstalls: "0",
                pageLikes: "0",
                landingPageViews: gClicks.toString(),
                follows: "0"
              });
            }
          }
        }
      }
    }
  } catch (err) {}

  res.json({ adsets: allAdsets, total: allAdsets.length });"""

c = c.replace(old_return, new_google)
print("Added Google ad groups to adsets API")

with open("/workspaces/media-on-gas/api/adsets.js", "r") as f:
    verify = f.read()

with open("/workspaces/media-on-gas/api/adsets.js", "w") as f:
    f.write(c)
print("Done")
