with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add Google Display row AFTER TikTok row in Awareness table
google_awareness_row = """
                <tr style={{background:"rgba(52,168,83,0.08)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpm<15?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpm)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{computed.gd.frequency>0?computed.gd.frequency.toFixed(2)+"x":"0"}</td></tr>"""

# Find TikTok awareness row end and insert Google after it
tt_aware_end = c.find('GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40"')
if tt_aware_end > 0:
    # Go back to find the <tr that contains GRAND TOTAL
    grand_tr = c.rfind('<tr style={{background:"rgba(255,107,0', 0, tt_aware_end)
    c = c[:grand_tr] + google_awareness_row + "\n                " + c[grand_tr:]
    print("Added Google row to awareness table")

# Add Google Display row to Engagement table
google_engage_row = """
                <tr style={{background:"rgba(52,168,83,0.06)"}}><td style={{padding:"12px",border:"1px solid "+P.rule,display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:P.gd}}></span><span style={{fontSize:12,fontWeight:700,color:P.txt}}>Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.gd.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.ctr>2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{pc(computed.gd.ctr)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:computed.gd.cpc<2?P.mint:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.cpc)}</td></tr>"""

# Find the engagement GRAND TOTAL row
engage_grand = c.find('GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember')
if engage_grand > 0:
    grand_tr2 = c.rfind('<tr style={{background:"rgba(255,107,0', 0, engage_grand)
    c = c[:grand_tr2] + google_engage_row + "\n                " + c[grand_tr2:]
    print("Added Google row to engagement table")

# Update grand total calculations to include Google
c = c.replace(
    '{fmt(m.reach+t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#FFCB05"',
    '{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid #002a40",color:"#FFCB05"'
)

c = c.replace(
    '{fmt(m.reach+t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember',
    '{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember'
)

# Update charts to include Google
c = c.replace(
    '{name:"TikTok",Impressions:t.impressions,Reach:t.reach}',
    '{name:"TikTok",Impressions:t.impressions,Reach:t.reach},{name:"Google",Impressions:computed.gd.impressions,Reach:computed.gd.reach}'
)

# Update pie chart
c = c.replace(
    'data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend}]}',
    'data={[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}]}'
)

c = c.replace(
    '<Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Pie>',
    '<Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/><Cell fill={P.gd}/></Pie>'
)

# Update pie legend
c = c.replace(
    'var total=computed.fb.spend+computed.ig.spend+t.spend;',
    'var total=computed.fb.spend+computed.ig.spend+t.spend+computed.gd.spend;'
)

c = c.replace(
    '{n:"TT",v:t.spend,c:P.tt}]',
    '{n:"TT",v:t.spend,c:P.tt},{n:"GD",v:computed.gd.spend,c:P.gd}]'
)

# Add Google to engagement chart
c = c.replace(
    '{name:"TikTok",Clicks:t.clicks,CPC:t.cpc}',
    '{name:"TikTok",Clicks:t.clicks,CPC:t.cpc},{name:"Google",Clicks:computed.gd.clicks,CPC:computed.gd.cpc}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Google Display in all tables and charts")
