with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Add a cumulative TikTok follows query from baseline date to end date
# Find where TikTok data is processed and add cumulative field
old_return = '  return res.json({ campaigns: allCampaigns'
new_return = """  // Calculate cumulative TikTok follows from baseline date
  var ttCumulativeFollows = 0;
  try {
    var ttBaselineDate = "2026-04-01";
    var cumUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&dimensions=[%22campaign_id%22]&data_level=AUCTION_CAMPAIGN&metrics=[%22follows%22]&start_date=" + ttBaselineDate + "&end_date=" + to + "&page_size=100";
    var cumRes = await fetch(cumUrl, { headers: { "Access-Token": ttToken } });
    var cumData = await cumRes.json();
    if (cumData.data && cumData.data.list) {
      for (var ci = 0; ci < cumData.data.list.length; ci++) {
        ttCumulativeFollows += parseInt(cumData.data.list[ci].metrics.follows || 0);
      }
    }
  } catch(e) {}

  return res.json({ campaigns: allCampaigns"""

if old_return in c:
    c = c.replace(old_return, new_return)
    print("Added cumulative TikTok follows query")

# Add ttCumulativeFollows to the response
old_response_end = "campaigns: allCampaigns, totalCampaigns: allCampaigns.length"
new_response_end = "campaigns: allCampaigns, totalCampaigns: allCampaigns.length, ttCumulativeFollows: ttCumulativeFollows"
if old_response_end in c:
    c = c.replace(old_response_end, new_response_end)
    print("Added ttCumulativeFollows to response")

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
