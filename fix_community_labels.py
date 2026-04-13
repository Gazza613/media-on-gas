with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix the community card labels - they use P.dim which is too dark
c = c.replace(
    'fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL PAGE LIKES',
    'fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL PAGE LIKES'
)
c = c.replace(
    'fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS',
    'fontSize:9,color:"rgba(255,255,255,0.6)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS'
)

print("Fixed community card labels")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
