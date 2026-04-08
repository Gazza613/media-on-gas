with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_metric = '''function Metric(props){return(<Glass accent={props.accent} hv={true} st={{padding:"20px 18px"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>{props.icon}<span style={{fontSize:10,fontWeight:700,color:P.sub,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{props.label}</span></div><div style={{fontSize:24,fontWeight:900,fontFamily:ff,lineHeight:1,color:props.accent}}>{props.value}</div>{props.sub&&<div style={{fontSize:10,color:P.dim,marginTop:8,fontFamily:fm,lineHeight:1.6}}>{props.sub}</div>}</Glass>);}'''

new_metric = '''function Metric(props){return(<Glass accent={props.accent} hv={true} st={{padding:"22px 20px"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:8}}>{props.icon}<span style={{fontSize:9,fontWeight:700,color:P.sub,letterSpacing:2.5,textTransform:"uppercase",fontFamily:fm}}>{props.label}</span></div><div style={{width:8,height:8,borderRadius:"50%",background:props.accent,boxShadow:"0 0 12px "+props.accent+"60",animation:"pulse-glow 2s ease-in-out infinite"}}></div></div><div style={{fontSize:28,fontWeight:900,fontFamily:ff,lineHeight:1,letterSpacing:-1.5,color:props.accent,marginBottom:6}}>{props.value}</div>{props.sub&&<div style={{fontSize:10,color:P.dim,marginTop:10,fontFamily:fm,lineHeight:1.7,borderTop:"1px solid "+P.rule,paddingTop:10}}>{props.sub}</div>}</Glass>);}'''

c = c.replace(old_metric, new_metric)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - metrics upgraded")
