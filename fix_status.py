with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '<div style={{fontSize:9,color:P.dim,fontFamily:fm}}>{fmt(c.impressions)} imps \\u00B7 {fR(parseFloat(c.spend))}</div>',
    '<div style={{fontSize:9,color:P.dim,fontFamily:fm}}>{fmt(c.impressions)} imps \\u00B7 {fR(parseFloat(c.spend))}{c.status&&c.status!=="active"?" \\u00B7 ":""}{c.status&&c.status!=="active"&&<span style={{color:c.status==="scheduled"?P.solar:c.status==="paused"?P.warning:P.sub,fontWeight:700,textTransform:"uppercase"}}>{c.status}</span>}</div>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - status badges added")
