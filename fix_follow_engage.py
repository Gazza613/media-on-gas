with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# In the row object, add engagements field
c = c.replace(
    'var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;return{name:camp.campaignName,',
    'var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0);return{name:camp.campaignName,engagements:engagements,'
)

# In the table header, swap "Clicks" for "Engagements" when Followers & Likes
c = c.replace(
    '["Campaign","Platform","Spend","Clicks",g[0].resultLabel,g[0].costLabel,"CTR %"]',
    '["Campaign","Platform","Spend",objName==="Followers & Likes"?"Engagements":"Clicks",g[0].resultLabel,g[0].costLabel,"CTR %"]'
)

# In the table row, swap clicks for engagements when Followers & Likes
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.objective==="Followers & Likes"?r.engagements:r.clicks)}</td>'
)

# In the total row, swap totalClicks for total engagements when Followers & Likes
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(totalClicks)}</td>',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks)}</td>'
)

# Fix CTR for followers - use engagements/impressions instead of clicks/impressions
c = c.replace(
    'var ctrVal=imps>0?(clicks/imps*100):0;',
    'var ctrVal=imps>0?(clicks/imps*100):0;var engCtr=imps>0?((parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0))/imps*100):0;'
)

c = c.replace(
    '{r.ctr.toFixed(2)+"%"}',
    '{(r.objective==="Followers & Likes"?r.engCtr.toFixed(2):r.ctr.toFixed(2))+"%"}'
)

# Add engCtr to row object
c = c.replace(
    'engagements:engagements,',
    'engagements:engagements,engCtr:imps>0?(engagements/imps*100):0,'
)

# Fix total CTR row for followers
c = c.replace(
    "return tI>0?(totalClicks/tI*100).toFixed(2)+'%':'0.00%';",
    "var tE=objName==='Followers & Likes'?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;return tI>0?(tE/tI*100).toFixed(2)+'%':'0.00%';"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Followers & Likes uses Engagements column")
