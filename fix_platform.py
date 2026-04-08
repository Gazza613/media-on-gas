with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_ph = '''function PH(props){var bg=props.platform==="Facebook"?P.fb:props.platform==="Instagram"?"linear-gradient(135deg,#e1306c,#833ab4)":props.platform==="TikTok"?"#1e1e2e":P.ember;return(<div style={{background:bg,padding:"12px 22px",borderRadius:10,marginBottom:16}}><span style={{fontSize:14,fontWeight:800,color:"#fff",fontFamily:ff}}>{props.platform}{props.suffix?" \\u00B7 "+props.suffix:""}</span></div>);}'''

new_ph = '''function PH(props){var bg=props.platform==="Facebook"?P.fb:props.platform==="Instagram"?"linear-gradient(135deg,#e1306c,#833ab4)":props.platform==="TikTok"?"#1e1e2e":P.ember;var dot=props.platform==="Facebook"?"#fff":props.platform==="TikTok"?P.tt:"#fff";return(<div style={{background:bg,padding:"14px 24px",borderRadius:12,marginBottom:18,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{width:10,height:10,borderRadius:"50%",background:dot,boxShadow:"0 0 10px "+dot}}></span><span style={{fontSize:15,fontWeight:800,color:"#fff",fontFamily:ff,letterSpacing:0.5}}>{props.platform}</span>{props.suffix&&<span style={{fontSize:12,fontWeight:400,color:"rgba(255,255,255,0.6)",fontFamily:fm}}>\\u00B7 {props.suffix}</span>}</div><div style={{fontSize:10,fontWeight:700,color:"rgba(255,255,255,0.4)",fontFamily:fm,letterSpacing:2,textTransform:"uppercase"}}>LIVE DATA</div></div>);}'''

c = c.replace(old_ph, new_ph)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - platform headers upgraded")
