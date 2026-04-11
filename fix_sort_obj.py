with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Update the sort order to include Google Display
c = c.replace(
    'var platOrder={"Facebook":0,"Instagram":1,"TikTok":2};',
    'var platOrder={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};'
)

# Sort by platform first, then by result descending within each platform
c = c.replace(
    'rows.sort(function(a,b){var p=platOrder[a.platform]||9;var q=platOrder[b.platform]||9;if(p!==q)return p-q;return (objOrder[a.objective]||9)-(objOrder[b.objective]||9);});',
    'rows.sort(function(a,b){var p=platOrder[a.platform]||9;var q=platOrder[b.platform]||9;if(p!==q)return p-q;return b.result-a.result;});'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - sorted by platform then highest result")
