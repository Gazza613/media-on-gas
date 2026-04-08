with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '<div style={{background:"#004F71",borderRadius:16,padding:"24px 24px 16px"}}>',
    '<div style={{background:"linear-gradient(135deg, #003a55 0%, #004F71 50%, #005580 100%)",borderRadius:18,padding:"28px 28px 20px",border:"1px solid rgba(255,203,5,0.15)",boxShadow:"0 8px 40px rgba(0,79,113,0.4)"}}>'
)

c = c.replace(
    'style={{marginBottom:8,padding:"14px 16px",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,borderLeft:"4px solid #FFCB05"}}',
    'style={{marginBottom:10,padding:"18px 20px",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,borderLeft:"4px solid #FFCB05",background:"rgba(255,203,5,0.03)",transition:"all 0.3s ease"}}'
)

c = c.replace(
    'style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:4,fontFamily:ff}}',
    'style={{fontSize:14,fontWeight:800,color:"#FFCB05",marginBottom:6,fontFamily:ff,letterSpacing:0.3}}'
)

c = c.replace(
    'style={{fontSize:12,color:"rgba(255,255,255,0.85)",lineHeight:1.8,fontFamily:ff}}>{ins.b}',
    'style={{fontSize:12.5,color:"rgba(255,255,255,0.88)",lineHeight:1.9,fontFamily:ff}}>{ins.b}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - key insights upgraded")
