with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add impressions and ctr to row object
c = c.replace(
    'return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};',
    'var imps=parseFloat(camp.impressions||0);var ctrVal=imps>0?(clicks/imps*100):0;return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,ctr:ctrVal,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};'
)

# Fix CTR cell - currently shows r.impressions which didn't exist before, causing blank page
c = c.replace(
    '{r.impressions>0?(r.clicks/r.impressions*100).toFixed(2)+"%":"0.00%"}',
    '{r.ctr.toFixed(2)+"%"}'
)

# Fix total CTR row
c = c.replace(
    '{totalClicks>0&&g.reduce(function(a,r){return a+r.impressions;},0)>0?((totalClicks/g.reduce(function(a,r){return a+r.impressions;},0))*100).toFixed(2)+"%":"0"}',
    '{(function(){var tI=g.reduce(function(a,r){return a+(r.impressions||0);},0);return tI>0?(totalClicks/tI*100).toFixed(2)+"%":"0.00%";})()}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
print("imps found:", "var imps=parseFloat" in c)
print("ctr found:", "ctr:ctrVal" in c)
