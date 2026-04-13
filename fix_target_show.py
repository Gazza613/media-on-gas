with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the debug return that blocks the actual content
old_debug = 'return <div style={{padding:30,textAlign:"center",color:P.sub,fontFamily:fm}}><div>Adsets in state: {adsets.length}</div><div>Selected campaigns: {selCamps.length}</div><div>Filtered adsets: {filtered.length}</div><div style={{marginTop:10,fontSize:10,color:P.dim}}>IDs trying: {selIds.slice(0,3).join(", ")}</div><div style={{fontSize:10,color:P.dim}}>Names trying: {selNames.slice(0,2).join(", ")}</div>{filtered.length===0&&adsets.length>0&&<div style={{marginTop:10,fontSize:10,color:P.dim}}>Adset IDs: {adsets.slice(0,3).map(function(a){return a.campaignId;}).join(", ")}</div>}{filtered.length===0&&adsets.length>0&&<div style={{fontSize:10,color:P.dim}}>Adset names: {adsets.slice(0,3).map(function(a){return a.campaignName;}).join(", ")}</div>}</div>;'

new_debug = 'if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;'

if old_debug in c:
    c = c.replace(old_debug, new_debug)
    print("Debug removed, normal flow restored")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
