with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add CTR to the table headers - after costLabel, before Conv %
c = c.replace(
    '["Campaign","Platform","Spend","Clicks",g[0].resultLabel,g[0].costLabel].concat(objName==="Leads"?["Conv %"]:[])',
    '["Campaign","Platform","Spend","Clicks",g[0].resultLabel,g[0].costLabel,"CTR %"].concat(objName==="Leads"?["Conv %"]:[])'
)

# Add CTR cell to each row - after costPer cell, before Conv %
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td>\n                      {objName==="Leads"',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{r.impressions>0?((r.clicks/r.impressions)*100).toFixed(2)+"%":"0"}</td>\n                      {objName==="Leads"'
)

# Add CTR to total row - after totalCostPer, before Conv %
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(totalCostPer)}</td>{objName==="Leads"',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(totalCostPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{totalClicks>0&&g.reduce(function(a,r){return a+r.impressions;},0)>0?((totalClicks/g.reduce(function(a,r){return a+r.impressions;},0))*100).toFixed(2)+"%":"0"}</td>{objName==="Leads"'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - CTR column added to objective tables")
