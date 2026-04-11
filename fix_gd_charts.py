with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# In the Impressions & Reach chart, set Google reach to null so bar doesn't render
c = c.replace(
    '{name:"Google",Impressions:computed.gd.impressions,Reach:computed.gd.reach}',
    '{name:"Google",Impressions:computed.gd.impressions,Reach:null}'
)

# In the Engagement chart, keep Google clicks but set CPC properly
# This should already work since CPC has real data

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Google reach null in charts")
