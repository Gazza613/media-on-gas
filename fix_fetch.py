with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix: d is not available in the adsets callback
old = '}).catch(function(){});fetch(API+"/api/adsets?from="+df+"&to="+dt).then(function(r){return r.json();}).then(function(d2){if(d2.adsets){setAdsets(d2.adsets);}if(d.ttCumulativeFollows!==undefined){window._ttCumFollows=d.ttCumulativeFollows;}setLoading(false);}).catch(function(err){console.error("API Error:",err);setLoading(false);});'

new = 'if(d.ttCumulativeFollows!==undefined){window._ttCumFollows=d.ttCumulativeFollows;}setLoading(false);}).catch(function(err){console.error("API Error:",err);setLoading(false);});fetch(API+"/api/adsets?from="+df+"&to="+dt).then(function(r){return r.json();}).then(function(d2){if(d2.adsets){setAdsets(d2.adsets);}}).catch(function(){});'

if old in c:
    c = c.replace(old, new)
    print("Fixed: moved ttCumulativeFollows back to campaigns callback, adsets independent")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
