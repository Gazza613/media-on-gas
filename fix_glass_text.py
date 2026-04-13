with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Make glass box label text brighter - P.dim is too dark
# Change all glass box labels from P.dim to P.sub (which is brighter)
c = c.replace('fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4', 'fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4')

# Make glass box sub-text brighter too
c = c.replace('fontSize:9,color:P.dim,fontFamily:fm,marginTop:4', 'fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4')

# Make the smaller labels in community/engagement glass brighter
c = c.replace('fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2', 'fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:1,marginBottom:2')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - glass box text brighter")
