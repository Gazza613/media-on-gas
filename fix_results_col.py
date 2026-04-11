with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Change getResultLabel - App Store Clicks and Landing Page Clicks should say "Results" not "Clicks"
c = c.replace(
    'var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Followers & Likes")return "Follows/Likes";return "Clicks";};',
    'var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Followers & Likes")return "Follows/Likes";return "Results";};'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - second Clicks column now says Results")
