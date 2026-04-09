cat > /workspaces/media-on-gas/fix_scheduled.py << 'DONE'
with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Change: add ACTIVE campaigns with no delivery data too (not just SCHEDULED)
c = c.replace(
    """Object.keys(campaignStatuses).forEach(function(cid) {
      if (!seenIds[cid] && campaignStatuses[cid].status === "SCHEDULED") {
        allCampaigns.push({ platform: "Meta", accountName: account.name, accountId: account.id, campaignId: cid, campaignName: campaignStatuses[cid].name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", actions: [], status: "scheduled" });
      }
    });""",
    """Object.keys(campaignStatuses).forEach(function(cid) {
      if (!seenIds[cid]) {
        var campStatus = campaignStatuses[cid].status;
        if (campStatus === "SCHEDULED" || campStatus === "ACTIVE") {
          var displayStatus = campStatus === "SCHEDULED" ? "scheduled" : "pending";
          allCampaigns.push({ platform: "Meta", accountName: account.name, accountId: account.id, campaignId: cid, campaignName: campaignStatuses[cid].name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", actions: [], status: displayStatus });
        }
      }
    });"""
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - active campaigns with no data now show as pending")
DONE