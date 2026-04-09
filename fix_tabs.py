with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'fontSize:11,fontWeight:tab===tb.id?800:500,fontFamily:fm',
    'fontSize:13,fontWeight:tab===tb.id?800:500,fontFamily:ff,letterSpacing:0.3'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - tab font size increased")
