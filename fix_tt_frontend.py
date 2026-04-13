with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Store ttCumulativeFollows from API response
old_pages = 'if(d.pages){setPages(d.pages);}'
new_pages = 'if(d.pages){setPages(d.pages);}if(d.ttCumulativeFollows!==undefined){window._ttCumFollows=d.ttCumulativeFollows;}'
if old_pages in c:
    c = c.replace(old_pages, new_pages)
    print("Store ttCumulativeFollows")

# Update getTtTotal to use cumulative instead of period earned
old_getTt = """  var getTtTotal=function(campaignName,earnedFollows){
    var cn=(campaignName||"").toLowerCase();
    var keys=Object.keys(ttBaselines);
    for(var ki=0;ki<keys.length;ki++){if(cn.indexOf(keys[ki])>=0)return ttBaselines[keys[ki]].followers+earnedFollows;}
    return earnedFollows;
  };"""

new_getTt = """  var getTtTotal=function(campaignName,earnedFollows){
    var cn=(campaignName||"").toLowerCase();
    var cumFollows=window._ttCumFollows||0;
    var keys=Object.keys(ttBaselines);
    for(var ki=0;ki<keys.length;ki++){if(cn.indexOf(keys[ki])>=0)return ttBaselines[keys[ki]].followers+(cumFollows>0?cumFollows:earnedFollows);}
    return earnedFollows;
  };"""

if old_getTt in c:
    c = c.replace(old_getTt, new_getTt)
    print("getTtTotal uses cumulative follows")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
