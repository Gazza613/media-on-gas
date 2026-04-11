with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Check what metrics are being requested
if '"reach"' in c.split('metrics')[1].split(']')[0] if 'metrics' in c else '':
    print("reach already in TikTok metrics request")
else:
    print("Need to add reach to TikTok metrics")

# Let's just do a clean replace of the TikTok metrics line
c = c.replace(
    '["spend","impressions","clicks","cpm","follows","likes","comments","shares"]',
    '["spend","impressions","reach","clicks","cpm","cpc","ctr","follows","likes","comments","shares"]'
)
c = c.replace(
    '["spend","impressions","reach","reach","clicks","cpm","cpc","cpc","ctr","ctr","follows","likes","comments","shares"]',
    '["spend","impressions","reach","clicks","cpm","cpc","ctr","follows","likes","comments","shares"]'
)

# Fix TikTok data mapping to use reach from API
# Find the TikTok campaign push and update reach/frequency/ctr/cpc
old_tt_push = 'impressions: tm.impressions, reach: "0", frequency: "0"'
new_tt_push = 'impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach||0)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0")'

if old_tt_push in c:
    c = c.replace(old_tt_push, new_tt_push)
    print("Fixed TikTok reach/frequency mapping")
else:
    # Maybe already partially fixed
    old2 = 'impressions: tm.impressions, reach: tm.reach || "0", frequency: (parseFloat(tm.reach)>0?(parseFloat(tm.impressions)/parseFloat(tm.reach)).toFixed(2):"0")'
    if old2 in c:
        c = c.replace(old2, new_tt_push)
        print("Re-fixed TikTok reach/frequency mapping")
    else:
        print("WARNING: Could not find TikTok push pattern")

# Also fix ctr and cpc for TikTok
old_ctr = "ctr: tm.ctr || \"0\", clicks: tm.clicks"
new_ctr = "ctr: (parseFloat(tm.impressions||0)>0?(parseFloat(tm.clicks||0)/parseFloat(tm.impressions)*100).toFixed(2):\"0\"), clicks: tm.clicks"
if old_ctr in c:
    c = c.replace(old_ctr, new_ctr, 1)
    print("Fixed TikTok CTR calculation")

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - TikTok API metrics fixed")
