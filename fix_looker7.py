with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

idx = c.find('<Glass accent={P.cyan} st={{padding:0,overflow:"hidden",marginBottom:24,borderRadius:16}}>')
if idx > 0:
    end_idx = c.find('</Glass>', idx) + len('</Glass>')
    old_block = c[idx:end_idx]
    new_block = '<Glass accent={P.cyan} st={{padding:"36px 32px",marginBottom:24}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}><div style={{padding:24,background:P.fb+"08",border:"1px solid "+P.fb+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEMOGRAPHICS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Age, Gender, Location</div><div style={{fontSize:11,color:P.sub}}>Audience composition breakdown</div></div><div style={{padding:24,background:P.tt+"08",border:"1px solid "+P.tt+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.tt,letterSpacing:2,fontFamily:fm,marginBottom:8}}>CREATIVE</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Ad Thumbnails & Performance</div><div style={{fontSize:11,color:P.sub}}>Visual creative ranking</div></div><div style={{padding:24,background:P.orchid+"08",border:"1px solid "+P.orchid+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:8}}>PLACEMENTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Feed, Stories, Reels</div><div style={{fontSize:11,color:P.sub}}>Delivery by placement</div></div><div style={{padding:24,background:P.mint+"08",border:"1px solid "+P.mint+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.mint,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEVICES</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Mobile, Desktop, Tablet</div><div style={{fontSize:11,color:P.sub}}>Device-level data</div></div></div><div style={{textAlign:"center"}}><button onClick={function(){window.open("https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","_blank");}} style={{background:gEmber,border:"none",borderRadius:14,padding:"16px 48px",color:"#fff",fontSize:15,fontWeight:800,fontFamily:ff,cursor:"pointer",boxShadow:"0 4px 24px "+P.ember+"40",display:"inline-flex",alignItems:"center",gap:10}}>Open Interactive Report {Ic.share("#fff",18)}</button><div style={{fontSize:11,color:P.dim,fontFamily:fm,marginTop:14}}>Opens Looker Studio in a new tab with full drill-down analysis</div></div></Glass>'
    c = c.replace(old_block, new_block)
    print("Done - button version restored")
else:
    print("Block not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
