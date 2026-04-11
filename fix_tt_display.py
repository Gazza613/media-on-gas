with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix Awareness table TikTok row - show real reach and frequency
old_tt_awareness = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>0</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"rgba(255,255,255,0.3)",fontFamily:fm,fontSize:11}}>0</td>'''

new_tt_awareness = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}</td>'''

c = c.replace(old_tt_awareness, new_tt_awareness)

# Fix Engagement table TikTok row - show real reach, CTR, CPC
old_tt_engagement = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>0</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>0</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:11}}>0</td>'''

new_tt_engagement = '''TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(t.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpc)}</td>'''

c = c.replace(old_tt_engagement, new_tt_engagement)

# Fix the bar chart to include TikTok reach
c = c.replace(
    '{name:"TikTok",Impressions:t.impressions,Reach:0}',
    '{name:"TikTok",Impressions:t.impressions,Reach:t.reach}'
)

# Fix the engagement chart to include TikTok CPC
c = c.replace(
    '{name:"TikTok",Clicks:t.clicks,CPC:t.clicks>0?t.spend/t.clicks:0}',
    '{name:"TikTok",Clicks:t.clicks,CPC:t.cpc}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - TikTok display data fixed")
