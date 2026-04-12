with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the debug log and fix the total CTR calculation
# The issue is likely tI is wrong - let's make it explicit
c = c.replace(
    "var tE=objName==='Followers & Likes'?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;console.log('TOTAL CTR CHECK ['+objName+'] engagements/clicks:',tE,'impressions:',tI,'CTR:',(tI>0?(tE/tI*100).toFixed(2):'0')+'%');return tI>0?(tE/tI*100).toFixed(2)+'%':'0.00%';",
    "var tE=objName==='Followers & Likes'?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;var tImp=g.reduce(function(a,r){return a+(r.impressions||0);},0);return tImp>0?(tE/tImp*100).toFixed(2)+'%':'0.00%';"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - total CTR recalculated from group impressions")
