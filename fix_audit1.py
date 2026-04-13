with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()
fixes = 0

# FIX 1: Grand Total Reach in Awareness
old1 = 'color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach)}</td>'
new1 = 'color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td>'
if old1 in c:
    c = c.replace(old1, new1)
    fixes += 1
    print("FIX 1: Grand Total Reach includes Google")

# FIX 2: Grand Total Frequency
old2 = '{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\u2014"}'
new2 = '{(m.reach+t.reach)>0?((m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\u2014"}'
if old2 in c:
    c = c.replace(old2, new2)
    fixes += 1
    print("FIX 2: Grand Total Frequency includes Google imps")

# FIX 5: TikTok community card label
old5 = 'FOLLOWS EARNED</div><div style={{fontSize:36'
new5 = 'PERIOD FOLLOWS</div><div style={{fontSize:36'
if old5 in c:
    c = c.replace(old5, new5)
    fixes += 1
    print("FIX 5: TikTok label -> PERIOD FOLLOWS")

# FIX 6: Remove always-true top quartile claim
old6 = 'This positions the campaign within the top quartile of paid social CPM efficiency for the paid social market, where industry benchmarks typically range R12 to R25 Cost Per Thousand Ads Served.'
new6 = '"+(computed.blendedCpm<12?"This is well below the R12 to R25 paid social CPM benchmark range, confirming exceptional media value.":computed.blendedCpm<18?"This sits within the efficient range of R12 to R25 for the paid social market.":"This is at the upper end of the R12 to R25 paid social CPM range, reflecting the platform mix and audience targeting precision.")+"'
if old6 in c:
    c = c.replace(old6, new6)
    fixes += 1
    print("FIX 6: CPM benchmark now conditional")

# FIX 9: isFollowLike patterns
old9 = 'var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;'
new9 = 'var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0;'
if old9 in c:
    c = c.replace(old9, new9)
    fixes += 1
    print("FIX 9: isFollowLike expanded")

# FIX 11: Variable collision
if 'var sc=autoMatchPage(campaignName' in c:
    c = c.replace('var sc=autoMatchPage(campaignName', 'var matchSc=autoMatchPage(campaignName')
    c = c.replace('if(sc>bestScore){bestScore=sc;', 'if(matchSc>bestScore){bestScore=matchSc;')
    fixes += 1
    print("FIX 11: sc -> matchSc")

# FIX 12: Error logging
old12 = '.catch(function(){setLoading(false);});'
new12 = '.catch(function(err){console.error("API Error:",err);setLoading(false);});'
if old12 in c:
    c = c.replace(old12, new12)
    fixes += 1
    print("FIX 12: Error logging added")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Script 1 done, fixes:", fixes)
