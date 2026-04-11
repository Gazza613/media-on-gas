with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the duplicate sort that's overriding our manual platform order
c = c.replace(
    'var pOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};g.sort(function(a,b){var pa=pOrd[a.platform]||9;var pb=pOrd[b.platform]||9;if(pa!==pb)return pa-pb;return b.result-a.result;});var totalSpend=g.reduce',
    'var totalSpend=g.reduce'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - duplicate sort removed")
print("Remaining g.sort:", c.count("g.sort"))
