with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

fixes = 0

# FIX 1: Auto-refresh on date change without resetting selection
# Add useEffect that watches df and dt, but preserves selection
# First, make fetchData preserve existing selection
old_fetch = 'if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.filter(function(c){return parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0;}).map(function(c){return c.campaignId;}));}'
new_fetch = 'if(d.campaigns){var prev=selected;setCampaigns(d.campaigns);if(prev.length>0){var validIds=d.campaigns.map(function(x){return x.campaignId;});var kept=prev.filter(function(id){return validIds.indexOf(id)>=0;});setSelected(kept.length>0?kept:d.campaigns.filter(function(x){return parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0;}).map(function(x){return x.campaignId;}));}else{setSelected(d.campaigns.filter(function(x){return parseFloat(x.impressions||0)>0||parseFloat(x.spend||0)>0;}).map(function(x){return x.campaignId;}));}}'
if old_fetch in c:
    c = c.replace(old_fetch, new_fetch)
    fixes += 1
    print("FIX 1: fetchData preserves existing selection")

# FIX 2: Auto-refresh when dates change (no need to click REFRESH)
old_effect = "useEffect(function(){fetchData();},[]);"
new_effect = "useEffect(function(){fetchData();},[df,dt]);"
if old_effect in c:
    c = c.replace(old_effect, new_effect)
    fixes += 1
    print("FIX 2: Auto-refresh on date change")

# FIX 3: Make campaign selector sticky/floating
old_selector_div = '{showCampaigns&&<div style={{width:340,flexShrink:0}}>'
new_selector_div = '{showCampaigns&&<div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start"}}>'
if old_selector_div in c:
    c = c.replace(old_selector_div, new_selector_div)
    fixes += 1
    print("FIX 3: Campaign selector is now sticky/floating")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Total fixes:", fixes)
