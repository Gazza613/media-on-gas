with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# The issue is the Campaigns button in the header doesn't toggle properly
# Let's check if there's a state issue
# Make sure showCampaigns persists and the button always toggles
old_btn = '{!isClient&&<button onClick={function(){setShowCampaigns(!showCampaigns);}}'
if old_btn in c:
    print("Toggle button found - checking surrounding code")
else:
    print("Toggle button not in expected form - searching...")
    import re
    m = re.search(r'setShowCampaigns\(!showCampaigns\)', c)
    if m:
        print("Found at position:", m.start())
    else:
        print("NOT FOUND AT ALL")

# The real issue might be that clicking a tab resets the layout
# Let's make the campaign button a proper toggle that stays open
# Replace the button to use a more explicit toggle
c = c.replace(
    'onClick={function(){setShowCampaigns(!showCampaigns);}}',
    'onClick={function(e){e.stopPropagation();setShowCampaigns(function(prev){return !prev;});}}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - toggle button fixed")
