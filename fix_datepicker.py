with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Make FROM/TO labels lighter
c = c.replace(
    'fontSize:7,color:P.dim,fontFamily:fm,letterSpacing:2}}>FROM</span>',
    'fontSize:8,color:P.sub,fontFamily:fm,letterSpacing:2,fontWeight:700}}>FROM</span>'
)

c = c.replace(
    'fontSize:7,color:P.dim,fontFamily:fm,letterSpacing:2}}>TO</span>',
    'fontSize:8,color:P.sub,fontFamily:fm,letterSpacing:2,fontWeight:700}}>TO</span>'
)

# Make date input text brighter
c = c.replace(
    'background:"transparent",border:"none",color:P.txt,fontSize:11,fontFamily:fm,outline:"none",width:105}}/>',
    'background:"transparent",border:"none",color:"#fff",fontSize:12,fontFamily:fm,outline:"none",width:105,fontWeight:500}}/>',
    2  # replace both FROM and TO inputs
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - date picker visibility fixed")
