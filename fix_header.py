with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '{width:42,height:42,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 20px "+P.ember+"50"}',
    '{width:42,height:42,borderRadius:"50%",background:gFire,display:"flex",alignItems:"center",justifyContent:"center",animation:"pulse-glow 3s ease-in-out infinite"}'
)

c = c.replace(
    '<span style={{fontSize:10,fontWeight:900,color:"#fff",fontFamily:fm}}>GAS</span>',
    '<span style={{fontSize:10,fontWeight:900,color:"#fff",fontFamily:fm,letterSpacing:1}}>GAS</span>'
)

c = c.replace(
    'Pulling live data from Meta and TikTok...',
    'Pulling live data from Meta and TikTok\u2026'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - header upgraded")
