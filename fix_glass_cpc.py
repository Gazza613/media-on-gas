with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    '<Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CTR</div><div style={{fontSize:18,fontWeight:900,color:oCtr>2?P.mint:oCtr>1?P.txt:P.warning,fontFamily:fm}}>{oCtr.toFixed(2)+"%"}</div></Glass>',
    '<Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CPC</div><div style={{fontSize:18,fontWeight:900,color:oCpc<2?P.mint:oCpc<5?P.txt:P.ember,fontFamily:fm}}>{fR(oCpc)}</div></Glass>'
)
print("Changed CTR glass box to CPC")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
