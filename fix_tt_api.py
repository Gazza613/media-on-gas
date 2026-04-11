with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Add reach, ctr, cpc to TikTok metrics request
c = c.replace(
    '["spend","impressions","clicks","cpm","follows","likes","comments","shares"]',
    '["spend","impressions","reach","clicks","cpm","cpc","ctr","follows","likes","comments","shares"]'
)

# Update TikTok campaign data to include reach, ctr, cpc
c = c.replace(
    'impressions: tm.impressions, reach: "0", frequency: "0", spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: tm.ctr || "0", clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0"',
    'impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0"), spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: tm.ctr || "0", clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0"'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - TikTok reach/ctr/cpc added to API")
