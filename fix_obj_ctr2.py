with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Check if impressions is in the row object
if "impressions:parseFloat(camp.impressions||0)" in c:
    print("impressions IS in row object")
else:
    print("impressions NOT in row object - adding it")

# The CTR cell uses r.impressions but let's check actual value
# Replace the CTR cell to use the camp's CTR directly instead of calculating
c = c.replace(
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{r.impressions>0?((r.clicks/r.impressions)*100).toFixed(2)+"%":"0"}</td>',
    '<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{r.impressions>0?(r.clicks/r.impressions*100).toFixed(2)+"%":"0.00%"}</td>'
)

# Actually let me check - maybe impressions is there but zero for some reason
# Let's add ctr directly to the row object instead
c = c.replace(
    'return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,impressions:parseFloat(camp.impressions||0),result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};',
    'var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,ctr:ctrVal,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};'
)

# Now use r.ctr directly
c = c.replace(
    '{r.impressions>0?(r.clicks/r.impressions*100).toFixed(2)+"%":"0.00%"}',
    '{r.ctr.toFixed(2)+"%"}'
)

# Fix total CTR row too
c = c.replace(
    '{totalClicks>0&&g.reduce(function(a,r){return a+r.impressions;},0)>0?((totalClicks/g.reduce(function(a,r){return a+r.impressions;},0))*100).toFixed(2)+"%":"0"}',
    '{(function(){var tImps=g.reduce(function(a,r){return a+r.impressions;},0);return tImps>0?(totalClicks/tImps*100).toFixed(2)+"%":"0.00%";})()}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - CTR using direct calculation")
