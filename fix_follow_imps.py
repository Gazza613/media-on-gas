with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add Impressions to header - after Spend, before Engagements/Clicks
c = c.replace(
    '["Campaign","Platform","Spend",objName==="Followers & Likes"?"Engagements":"Clicks"',
    '["Campaign","Platform","Spend","Impressions",objName==="Followers & Likes"?"Engagements":"Clicks"'
)

# Add Impressions cell to each row - after Spend, before Engagements/Clicks
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.objective==="Followers & Likes"?r.engagements:r.clicks)}</td>',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.objective==="Followers & Likes"?r.engagements:r.clicks)}</td>'
)

# Add Impressions to total row - after Spend, before Engagements/Clicks
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)}</td>',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(g.reduce(function(a,r){return a+r.impressions;},0))}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)}</td>'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Impressions column added to objective tables")
