with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the sort + reduce line with a proper new sorted array
c = c.replace(
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};g.sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.clicks-a.clicks;});var totalSpend=g.reduce',
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};g=[].concat(g).sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.clicks-a.clicks;});var totalSpend=g.reduce'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - using new sorted array")
