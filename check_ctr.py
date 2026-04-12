# Let's add a console.log to verify the total CTR calculation
with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    "var tE=objName==='Followers & Likes'?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;return tI>0?(tE/tI*100).toFixed(2)+'%':'0.00%';",
    "var tE=objName==='Followers & Likes'?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;console.log('TOTAL CTR CHECK ['+objName+'] engagements/clicks:',tE,'impressions:',tI,'CTR:',(tI>0?(tE/tI*100).toFixed(2):'0')+'%');return tI>0?(tE/tI*100).toFixed(2)+'%':'0.00%';"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - debug log added")
