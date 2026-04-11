with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# In the awareness table TikTok row, replace em dashes with styled N/A
c = c.replace(
    '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>\u2014</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>\u2014</td>''',
    '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>N/A</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{t.cpm>0?fR(t.cpm):"N/A"}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>N/A</td>'''
)

# Fix TikTok row in engagement table too
c = c.replace(
    '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>\u2014</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>\u2014</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>\u2014</td>''',
    '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>N/A</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>N/A</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>N/A</td>'''
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - TikTok N/A fixed")
