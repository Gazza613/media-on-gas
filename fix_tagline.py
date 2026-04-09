with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'fontSize:7,color:P.dim,letterSpacing:5,textTransform:"uppercase",fontFamily:fm,marginTop:2}}>{isClient?"Client Dashboard":"Digital Performance Intelligence"}',
    'fontSize:9,color:P.sub,letterSpacing:4,textTransform:"uppercase",fontFamily:fm,marginTop:3,fontWeight:600}}>{isClient?"Client Dashboard":"Digital Performance Intelligence"}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - tagline visibility fixed")
