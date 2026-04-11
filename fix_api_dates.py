with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Remove the pending campaign logic entirely - only show campaigns with delivery data
# or campaigns with SCHEDULED status
old_pending = """Object.keys(campaignInfo).forEach(function(cid) {
      if (!seenIds[cid]) {
        var info = campaignInfo[cid];
        if (info.status === "SCHEDULED") {
          allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name, accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: info.name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled" });
        } else if (info.status === "ACTIVE" && info.created >= new Date(from)) {
          allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name, accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: info.name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "pending" });
        }
      }
    });"""

new_pending = """Object.keys(campaignInfo).forEach(function(cid) {
      if (!seenIds[cid] && campaignInfo[cid].status === "SCHEDULED") {
        allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name, accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: campaignInfo[cid].name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled" });
      }
    });"""

c = c.replace(old_pending, new_pending)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - only data campaigns and scheduled shown")
