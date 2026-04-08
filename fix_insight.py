with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_insight = '''function Insight(props){var a=props.accent||P.ember;return(<div style={{marginTop:20,padding:"18px 22px",background:"linear-gradient(135deg,"+a+"06,"+a+"02)",border:"1px solid "+a+"18",borderLeft:"4px solid "+a,borderRadius:"0 12px 12px 0"}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>{props.icon||Ic.bolt(a,16)}<span style={{fontSize:10,fontWeight:800,color:a,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{props.title||"Campaign Read"}</span></div><div style={{fontSize:13,color:P.txt,lineHeight:2,fontFamily:ff}}>{props.children}</div></div>);}'''

new_insight = '''function Insight(props){var a=props.accent||P.ember;return(<div style={{marginTop:24,padding:"22px 26px",background:"linear-gradient(135deg,"+a+"08 0%,"+a+"03 50%, transparent 100%)",border:"1px solid "+a+"20",borderLeft:"4px solid "+a,borderRadius:"0 14px 14px 0",position:"relative",overflow:"hidden"}}><div style={{position:"absolute",top:0,left:4,width:120,height:"100%",background:"linear-gradient(90deg,"+a+"06, transparent)",pointerEvents:"none"}}></div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,position:"relative"}}>{props.icon||Ic.bolt(a,16)}<span style={{fontSize:10,fontWeight:800,color:a,letterSpacing:3,fontFamily:fm,textTransform:"uppercase"}}>{props.title||"Campaign Read"}</span><div style={{flex:1,height:1,background:"linear-gradient(90deg,"+a+"30, transparent)",marginLeft:8}}></div></div><div style={{fontSize:13.5,color:P.txt,lineHeight:2.1,fontFamily:ff,position:"relative",letterSpacing:0.2}}>{props.children}</div></div>);}'''

c = c.replace(old_insight, new_insight)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - insights upgraded")
