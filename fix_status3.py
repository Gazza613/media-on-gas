with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Fix: campaigns WITH data that aren't in active list = completed
c = c.replace(
    """var st = campaignStatuses[c.campaign_id];
            var status = st ? st.status.toLowerCase() : "active";
            allCampaigns.push({ platform: "Meta",""",
    """var st = campaignStatuses[c.campaign_id];
            var status = st ? "active" : "completed";
            allCampaigns.push({ platform: "Meta","""
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - completed status fixed")
