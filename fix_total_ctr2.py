with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'var tImps=g.reduce(function(a,r){return a+r.impressions;},0);return tImps>0?(totalClicks/tImps*100).toFixed(2)+"%":"0.00%";',
    'var tImps=g.reduce(function(a,r){return a+r.impressions;},0);var tEng=objName==="Followers & Likes"?g.reduce(function(a,r){return a+r.engagements;},0):totalClicks;return tImps>0?(tEng/tImps*100).toFixed(2)+"%":"0.00%";'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - total CTR uses engagements for Followers & Likes")
