with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Make campaigns panel open by default
c = c.replace(
    'var sc=useState(false),showCampaigns=sc[0],setShowCampaigns=sc[1];',
    'var sc=useState(true),showCampaigns=sc[0],setShowCampaigns=sc[1];'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - selector open by default")
