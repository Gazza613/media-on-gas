with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the header GAS circle with actual logo
c = c.replace(
    '{width:42,height:42,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse-glow 3s ease-in-out infinite"}}><span style={{fontSize:10,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:1}}>GAS</span>',
    '{width:42,height:42,borderRadius:"50%",overflow:"hidden",animation:"pulse-glow 3s ease-in-out infinite"}}><img src="https://cdn.prod.website-files.com/6716222294e7b4b6c2add1e4/672af495c21c0fb947f1a023_GAS-42.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/>'
)

# Replace the footer GAS circle too
c = c.replace(
    '{width:26,height:26,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</div>',
    '{width:26,height:26,borderRadius:"50%",overflow:"hidden"}}><img src="https://cdn.prod.website-files.com/6716222294e7b4b6c2add1e4/672af495c21c0fb947f1a023_GAS-42.png" alt="GAS" style={{width:"100%",height:"100%",objectFit:"cover"}}/></div>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - GAS logo replaced with website logo")
