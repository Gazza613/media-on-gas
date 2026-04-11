with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>0</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{t.cpm>0?fR(t.cpm):"0"}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>0</td>'''

new = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}</td>'''

c = c.replace(old, new)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - TikTok awareness row fixed")
print("Replaced:", old[:40] not in c)
