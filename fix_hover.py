with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '<div style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.campaignName}</div>',
    '<div title={c.campaignName} style={{fontSize:11,fontWeight:600,color:s?P.txt:P.sub,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",cursor:"help"}}>{c.campaignName}</div>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - hover tooltip added")
