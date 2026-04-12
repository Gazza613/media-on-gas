with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Fix: cid is not defined, should be c.campaign_id
c = c.replace(
    'status: campaignInfo[cid] ? campaignInfo[cid].status.toLowerCase()',
    'status: campaignInfo[c.campaign_id] ? campaignInfo[c.campaign_id].status.toLowerCase()'
)

# Also fix cid references in the scheduled check
c = c.replace(
    'if (!seenIds[cid] && campaignInfo[cid].status',
    'if (!seenIds[cid] && campaignInfo[cid] && campaignInfo[cid].status'
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - fixed cid references")
