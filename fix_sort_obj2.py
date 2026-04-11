with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add sort inside each objective group before rendering
c = c.replace(
    'var totalSpend=g.reduce(function(a,r){return a+r.spend;},0);',
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};g.sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.result-a.result;});var totalSpend=g.reduce(function(a,r){return a+r.spend;},0);'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - each objective group sorted by platform then result desc")
