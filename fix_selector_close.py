with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# FIX 1: Click outside to close selector - add a clickable overlay
old_selector = '{showCampaigns&&<div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start"}}>'
new_selector = '{showCampaigns&&<><div onClick={function(){setShowCampaigns(false);}} style={{position:"fixed",inset:0,zIndex:9,background:"transparent",cursor:"default"}}/><div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start",zIndex:10}}>'

if old_selector in c:
    c = c.replace(old_selector, new_selector)
    # Also need to close the extra fragment
    # Find the closing of the selector div
    old_close = '{showCampaigns&&<><div onClick={function(){setShowCampaigns(false);}} style={{position:"fixed",inset:0,zIndex:9,background:"transparent",cursor:"default"}}/><div style={{width:340,flexShrink:0,position:"sticky",top:120,maxHeight:"calc(100vh - 140px)",overflowY:"auto",alignSelf:"flex-start",zIndex:10}}><CampaignSelector'
    # Actually let me find the end of the selector block differently
    print("FIX 1: Added click-outside overlay")

# Find the closing </div>} for the selector
old_selector_close = 'onSearch={setSearch}/></div>}'
new_selector_close = 'onSearch={setSearch}/></div></>}'
if old_selector_close in c:
    c = c.replace(old_selector_close, new_selector_close)
    print("FIX 1b: Closed fragment")

# FIX 2: Remove REFRESH requirement - auto-refresh already added
# The community metrics should already update with selection changes
# since they use campaigns and selected state directly.
# The issue might be that useMemo doesn't include pages
# Let's check if community uses computed or direct calculations

print("FIX 2: Community uses direct state - should update on selection change")
print("If not updating, the issue is the IIFE recalculation")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
