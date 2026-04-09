with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '{fmt(c.impressions)} imps',
    '{fmt(c.impressions)} imps {c.status&&c.status!=="active"&&<span style={{color:c.status==="scheduled"?P.solar:c.status==="completed"?P.sub:P.warning,fontWeight:700,textTransform:"uppercase",marginLeft:4}}>{c.status}</span>}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
