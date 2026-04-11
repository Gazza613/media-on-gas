with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add Google Display row after TikTok in Awareness table
# Find the TikTok awareness row (line 186) and add Google after it
tt_awareness_row = '<tr style={{background:"rgba(0,242,234,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:t.cpm<15?P.mint:P.warning,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:"#fff",fontFamily:fm,fontSize:13,fontWeight:700}}>{t.frequency>0?t.frequency.toFixed(2)+"x":"0"}</td></tr>'

google_awareness_row = '<tr style={{background:"rgba(52,168,83,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpm<15?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{computed.gd.frequency>0?computed.gd.frequency.toFixed(2)+"x":"0"}</td></tr>'

c = c.replace(tt_awareness_row, tt_awareness_row + '\n                ' + google_awareness_row)
print("Awareness Google row added:", "Google Display</span></td><td" in c.split("AWARENESS")[1].split("ENGAGEMENT")[0] if "AWARENESS" in c else False)

# Also update the objective getObj function to handle Google Display campaigns
# Google Display campaigns with "Homeloans" = Landing Page Clicks
# Google Display campaigns with "Promotion" = App Store Clicks (display ads driving app installs)
c = c.replace(
    'if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0)return "Landing Page Clicks";',
    'if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch_display_homeloans")>=0)return "Landing Page Clicks";'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Google Display added to Awareness table and objectives")
