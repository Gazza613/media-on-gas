with open("/workspaces/media-on-gas/api/adsets.js", "r") as f:
    c = f.read()

# Fix TikTok - campaign_id is in metrics not dimensions
old_ref = 'campaignId: ttM.campaign_id || ttD.adgroup_id,'
new_ref = 'campaignId: ttM.campaign_id || "",'
if old_ref in c:
    c = c.replace(old_ref, new_ref)
    print("Fixed campaign_id reference")

# Check current TikTok URL
if 'campaign_id%22]&data_level=AUCTION_ADGROUP' in c:
    print("TikTok URL still has old dimensions format")
    c = c.replace(
        'dimensions=[%22adgroup_id%22,%22campaign_id%22]&data_level=AUCTION_ADGROUP',
        'dimensions=[%22adgroup_id%22]&data_level=AUCTION_ADGROUP'
    )
    print("Fixed TikTok dimensions")
elif 'dimensions=[%22adgroup_id%22]&data_level=AUCTION_ADGROUP' in c:
    print("TikTok dimensions already correct")

# Make sure campaign_id is in metrics
if 'campaign_id%22,%22spend' not in c and 'campaign_name%22,%22campaign_id' not in c:
    c = c.replace(
        'metrics=[%22campaign_name%22,%22adgroup_name%22,%22spend',
        'metrics=[%22campaign_name%22,%22adgroup_name%22,%22campaign_id%22,%22spend'
    )
    print("Added campaign_id to TikTok metrics")

with open("/workspaces/media-on-gas/api/adsets.js", "w") as f:
    f.write(c)
