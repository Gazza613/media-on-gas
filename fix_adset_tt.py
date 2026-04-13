with open("/workspaces/media-on-gas/api/adsets.js", "r") as f:
    c = f.read()

# Fix TikTok dimensions - can't use campaign_id with AUCTION_ADGROUP
old_tt = '&dimensions=[%22adgroup_id%22,%22campaign_id%22]&data_level=AUCTION_ADGROUP&metrics=[%22campaign_name%22,%22adgroup_name%22,%22spend%22,%22impressions%22,%22reach%22,%22clicks%22,%22ctr%22,%22cpc%22,%22cpm%22,%22follows%22,%22likes%22,%22profile_visits%22]'
new_tt = '&dimensions=[%22adgroup_id%22]&data_level=AUCTION_ADGROUP&metrics=[%22campaign_name%22,%22adgroup_name%22,%22campaign_id%22,%22spend%22,%22impressions%22,%22reach%22,%22clicks%22,%22ctr%22,%22cpc%22,%22cpm%22,%22follows%22,%22likes%22,%22profile_visits%22]'

if old_tt in c:
    c = c.replace(old_tt, new_tt)
    print("Fixed TikTok dimensions")

# Also fix the TikTok campaign_id reference since it moved to metrics
old_tt_cid = 'campaignId: ttD.campaign_id,'
new_tt_cid = 'campaignId: ttM.campaign_id || ttD.adgroup_id,'
if old_tt_cid in c:
    c = c.replace(old_tt_cid, new_tt_cid)
    print("Fixed TikTok campaign_id reference")

# Also fix the main Meta endpoint - remove breakdowns to get all data first
# The breakdowns=publisher_platform splits by FB/IG but may filter some
# Actually keep breakdowns but make sure we're not filtering incorrectly

with open("/workspaces/media-on-gas/api/adsets.js", "w") as f:
    f.write(c)
