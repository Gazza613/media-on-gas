with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

target = "} catch (ttErr) {}\n\n  allCampaigns.sort"

replacement = """} catch (ttErr) {}

  // Google Ads
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
        var gQuery = "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";
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
          for (var g = 0; g < gResults.length; g++) {
            var gr = gResults[g];
            var gc = gr.campaign;
            var gm = gr.metrics;
            var gSpend = parseFloat(gm.costMicros || 0) / 1000000;
            var gClicks = parseInt(gm.clicks || 0);
            var gImps = parseInt(gm.impressions || 0);
            var gConv = parseFloat(gm.conversions || 0);
            if (gImps > 0 || gSpend > 0) {
              var gPlatform = "Google Display";
              var gName = gc.name || "";
              if (gName.toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
              allCampaigns.push({
                platform: gPlatform,
                metaPlatform: "google",
                accountName: "MTN MoMo Google",
                accountId: gCustomerId,
                campaignId: "google_" + gc.id,
                rawCampaignId: gc.id,
                campaignName: gName,
                impressions: gImps.toString(),
                reach: "0",
                frequency: "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                conversions: gConv.toFixed(0),
                leads: "0",
                appInstalls: "0",
                landingPageViews: "0",
                pageLikes: "0",
                follows: "0",
                likes: "0",
                costPerLead: "0",
                costPerInstall: "0",
                actions: [],
                status: gc.status === "ENABLED" ? "active" : "paused"
              });
            }
          }
        }
      }
    }
  } catch (gErr) {}

  allCampaigns.sort"""

print("Target found:", target in c)
c = c.replace(target, replacement)
print("googleads in file:", "googleads" in c)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done")
