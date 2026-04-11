with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Try adding unique_users to the Google query
c = c.replace(
    "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM campaign",
    "SELECT campaign.name, campaign.id, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions, metrics.unique_users FROM campaign"
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done")
