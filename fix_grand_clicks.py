with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix engagement grand total clicks and CTR to include Google
c = c.replace(
    '{fmt(m.clicks+t.clicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{pc(computed.totalImps>0?((m.clicks+t.clicks)/computed.totalImps)*100:0)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR((m.clicks+t.clicks)>0?computed.totalSpend/(m.clicks+t.clicks):0)}',
    '{fmt(computed.totalClicks)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{pc(computed.totalImps>0?(computed.totalClicks/computed.totalImps)*100:0)}</td><td style={{padding:"12px",textAlign:"center",border:"1px solid "+P.rule,color:P.ember,fontFamily:fm,fontSize:15,fontWeight:900}}>{fR(computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0)}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - grand totals include Google")
