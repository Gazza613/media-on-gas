with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add deepdive content right before the optimise tab content
c = c.replace(
    '{tab==="optimise"&&!isClient&&(<div>',
    """{tab==="deepdive"&&(<div>
          <SH icon={Ic.eye(P.cyan,20)} title="Deep Dive" sub="Demographics, Creative Performance & Placement Analysis" accent={P.cyan}/>
          <Glass accent={P.cyan} st={{padding:"36px 32px",marginBottom:24}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}>
              <div style={{padding:24,background:P.fb+"08",border:"1px solid "+P.fb+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.fb,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEMOGRAPHICS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Age, Gender, Location</div><div style={{fontSize:11,color:P.sub}}>Audience composition breakdown</div></div>
              <div style={{padding:24,background:P.tt+"08",border:"1px solid "+P.tt+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.tt,letterSpacing:2,fontFamily:fm,marginBottom:8}}>CREATIVE</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Ad Thumbnails & Performance</div><div style={{fontSize:11,color:P.sub}}>Visual creative ranking with metrics</div></div>
              <div style={{padding:24,background:P.orchid+"08",border:"1px solid "+P.orchid+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.orchid,letterSpacing:2,fontFamily:fm,marginBottom:8}}>PLACEMENTS</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Feed, Stories, Reels, Network</div><div style={{fontSize:11,color:P.sub}}>Delivery by placement type</div></div>
              <div style={{padding:24,background:P.mint+"08",border:"1px solid "+P.mint+"20",borderRadius:14,textAlign:"center"}}><div style={{fontSize:9,fontWeight:700,color:P.mint,letterSpacing:2,fontFamily:fm,marginBottom:8}}>DEVICES</div><div style={{fontSize:14,fontWeight:700,color:P.txt,marginBottom:4}}>Mobile, Desktop, Tablet</div><div style={{fontSize:11,color:P.sub}}>Device-level performance data</div></div>
            </div>
            <div style={{textAlign:"center"}}><button onClick={function(){window.open("https://lookerstudio.google.com/reporting/823fd5fa-b39d-4dc3-b623-549197d0341f/page/p_2upnicpx0d","_blank");}} style={{background:gEmber,border:"none",borderRadius:14,padding:"16px 48px",color:"#fff",fontSize:15,fontWeight:800,fontFamily:ff,cursor:"pointer",boxShadow:"0 4px 24px "+P.ember+"40",display:"inline-flex",alignItems:"center",gap:10}}>Open Interactive Report {Ic.share("#fff",18)}</button><div style={{fontSize:11,color:P.dim,fontFamily:fm,marginTop:14}}>Opens Looker Studio in a new tab with full interactive drill-down analysis</div></div>
          </Glass>
          <Insight title="Deep Dive Analysis" accent={P.cyan} icon={Ic.eye(P.cyan,16)}>The Looker Studio report provides granular campaign analysis that complements the dashboard metrics above. It includes audience demographic breakdowns by age, gender, and geographic region, individual ad creative performance with visual thumbnails ranked by key metrics, placement-level delivery analysis across Feed, Stories, Reels, and Audience Network, and device-level performance data showing mobile versus desktop engagement patterns. Use the interactive filters within the report to drill into specific campaigns, date ranges, and audience segments.</Insight>
        </div>)}

        {tab==="optimise"&&!isClient&&(<div>"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - deepdive button content added")
print("iframe count:", c.count("iframe"))
print("deepdive count:", c.count("deepdive"))
