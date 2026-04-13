with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add TikTok baseline config after the autoMatchPage functions
old_anchor = '  var findBestPage=function'
new_config = """  var ttBaselines={"momo":{followers:123995,asOf:"2026-03-31"}};
  var getTtTotal=function(campaignName,earnedFollows){
    var cn=(campaignName||"").toLowerCase();
    var keys=Object.keys(ttBaselines);
    for(var ki=0;ki<keys.length;ki++){if(cn.indexOf(keys[ki])>=0)return ttBaselines[keys[ki]].followers+earnedFollows;}
    return earnedFollows;
  };
  """

if old_anchor in c:
    c = c.replace(old_anchor, new_config + old_anchor)
    print("Added TikTok baseline config")

# Update Community tab to use baseline for TikTok total
old_tt_card = 'PERIOD FOLLOWS</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttEarned)}</div>'
new_tt_card = 'TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt((function(){var selNames=sel.map(function(x){return x.campaignName;}).join(" ");return getTtTotal(selNames,ttEarned);})())}</div>'

if old_tt_card in c:
    c = c.replace(old_tt_card, new_tt_card)
    print("TikTok card now shows baseline + earned")

# Update the grandTotal to include TikTok baseline
old_grand = 'var grandTotal=fbTotal+igTotal;'
new_grand = 'var ttTotal=(function(){var selNames2=sel.map(function(x){return x.campaignName;}).join(" ");return getTtTotal(selNames2,ttEarned);})();var grandTotal=fbTotal+igTotal+ttTotal;'

if old_grand in c:
    c = c.replace(old_grand, new_grand)
    print("Grand total includes TikTok baseline")

# Update community insight to include TikTok total
old_insight = 'if(ttEarned>0){p.push("TikTok campaigns generated "+fmt(ttEarned)+" new follows'
new_insight = 'if(ttEarned>0){p.push("TikTok has "+fmt(ttTotal)+" total followers, growing by "+fmt(ttEarned)+" new follows this period'

if old_insight in c:
    c = c.replace(old_insight, new_insight)
    print("Community insight includes TikTok total")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
