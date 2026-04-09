with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the button version with the proper iframe embed
c = c.replace(
    '<Glass accent={P.cyan} st={{padding:"40px 32px",textAlign:"center",marginBottom:24}}><div style={{marginBottom:24}}>{Ic.eye(P.cyan,48)}</div><div style={{fontSize:20,fontWeight:800,color:P.txt,fontFamily:ff,marginBottom:10}}>Looker Studio Report</div><div style={{fontSize:13,color:P.sub,lineHeight:1.8,maxWidth:500,margin:"0 auto 28px"}}>Access the full interactive report with audience demographics, ad creative thumbnails, placement breakdowns, geographic data, and device-level analysis.</div><button onClick={function(){window.open("https://lookerstudio.google.com/u/0/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","_blank");}} style={{background:gEmber,border:"none",borderRadius:12,padding:"14px 36px",color:"#fff",fontSize:14,fontWeight:800,fontFamily:fm,cursor:"pointer",letterSpacing:1,boxShadow:"0 4px 24px "+P.ember+"40"}}>Open Full Report</button></Glass>',
    '<Glass accent={P.cyan} st={{padding:0,overflow:"hidden",marginBottom:24,borderRadius:16}}><iframe width="100%" height="800" src="https://lookerstudio.google.com/embed/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d" frameBorder="0" style={{border:"none",borderRadius:16}} allowFullScreen sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></Glass>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Looker iframe fixed")
