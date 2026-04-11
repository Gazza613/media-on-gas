with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'if(pa!==pb)return pa-pb;return b.impressions-a.impressions;',
    'if(pa!==pb)return pa-pb;return b.clicks-a.clicks;'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - sort by platform then clicks desc")
