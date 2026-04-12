with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Fix 1: Meta - include PAUSED and COMPLETED campaigns
c = c.replace(
    '"value":["ACTIVE","SCHEDULED"]',
    '"value":["ACTIVE","SCHEDULED","PAUSED","CAMPAIGN_PAUSED","ADSET_PAUSED","COMPLETED","ARCHIVED"]'
)

# Fix 2: TikTok - include non-ENABLE campaigns that have data
c = c.replace(
    'if (!ttSeenIds[tid] && ttStatuses[tid] === "ENABLE") {',
    'if (!ttSeenIds[tid]) {'
)

# Fix 3: Set proper status on Meta campaigns
c = c.replace(
    "status: \"active\"\n            });",
    "status: campaignInfo[cid] ? campaignInfo[cid].status.toLowerCase().replace('campaign_paused','paused').replace('adset_paused','paused') : \"active\"\n            });"
)

# Fix 4: TikTok status - show actual status
c = c.replace(
    'var ttStatus = ttStatuses[tc.dimensions.campaign_id] === "ENABLE" ? "active" : "completed";',
    'var ttStatus = ttStatuses[tc.dimensions.campaign_id] === "ENABLE" ? "active" : ttStatuses[tc.dimensions.campaign_id] === "DISABLE" ? "paused" : "completed";'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - all campaign statuses included")
