with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add debug info to targeting tab
old = 'if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;'

new = 'if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>{"Adsets loaded: "+adsets.length+" | Selected campaigns: "+selCamps.length+" | IDs: "+selIds.slice(0,3).join(", ")+" | Names: "+selNames.slice(0,2).join(", ")}</div>;'

if old in c:
    c = c.replace(old, new)
    print("Added debug info to targeting tab")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
