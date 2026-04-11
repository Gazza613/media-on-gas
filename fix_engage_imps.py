with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix header - add Impressions before Reach
c = c.replace(
    '["Platform","Media Spend","Reach","Clicks","CTR %","CPC"]',
    '["Platform","Media Spend","Impressions","Reach","Clicks","CTR %","CPC"]'
)

# Fix Facebook engagement row - add impressions before reach
c = c.replace(
    'Facebook</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.fb.clicks)}',
    'Facebook</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.fb.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.fb.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.fb.clicks)}'
)

# Fix Instagram engagement row
c = c.replace(
    'Instagram</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.ig.clicks)}',
    'Instagram</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.ig.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.ig.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(computed.ig.clicks)}'
)

# Fix Meta Total engagement row
c = c.replace(
    'Meta Total</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.clicks)}',
    'Meta Total</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fR(m.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.fb,fontFamily:fm,fontSize:14,fontWeight:900}}>{fmt(m.clicks)}'
)

# Fix TikTok engagement row - add impressions before reach
c = c.replace(
    'TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}',
    'TikTok</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(t.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(t.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fmt(t.clicks)}'
)

# Fix Google Display engagement row - add impressions before reach dash
c = c.replace(
    'Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:13}}>\u2014</td>',
    'Google Display</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13,fontWeight:700}}>{fR(computed.gd.spend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.txt,fontFamily:fm,fontSize:13}}>{fmt(computed.gd.impressions)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.dim,fontFamily:fm,fontSize:13}}>\u2014</td>'
)

# Fix Grand Total engagement row - add impressions before reach
c = c.replace(
    'GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}',
    'GRAND TOTAL</span></td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalSpend)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalImps)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(computed.totalClicks)}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Impressions column added to Engagement table")
