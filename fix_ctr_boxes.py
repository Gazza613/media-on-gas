with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add CTR glass boxes between chart and insight in engagement section
ctr_boxes = """
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
              <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FACEBOOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{pc(computed.fb.ctr)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>{fmt(computed.fb.clicks)} clicks</div></Glass>
              <Glass accent={P.ig} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>INSTAGRAM CTR</div><div style={{fontSize:22,fontWeight:900,color:P.ig,fontFamily:fm}}>{pc(computed.ig.ctr)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>{fmt(computed.ig.clicks)} clicks</div></Glass>
              <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TIKTOK CTR</div><div style={{fontSize:22,fontWeight:900,color:P.tt,fontFamily:fm}}>{pc(t.ctr)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>{fmt(t.clicks)} clicks</div></Glass>
              <Glass accent={P.gd} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>GOOGLE CTR</div><div style={{fontSize:22,fontWeight:900,color:P.gd,fontFamily:fm}}>{pc(computed.gd.ctr)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>{fmt(computed.gd.clicks)} clicks</div></Glass>
            </div>

            """

# Insert between chart and insight
c = c.replace(
    '<Insight title="Engagement Key Metrics"',
    ctr_boxes + '<Insight title="Engagement Key Metrics"'
)

print("Done - CTR glass boxes added")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
