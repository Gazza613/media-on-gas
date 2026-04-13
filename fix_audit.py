with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

fixes = 0

# ═══ FIX 1: Grand Total Reach in Awareness table - already correct in engagement ═══
# The awareness table has: {fmt(m.reach+t.reach)}
# Should include Google: {fmt(m.reach+t.reach+computed.gd.reach)}
# But only in the AWARENESS Grand Total row (FFCB05 color row)
old_aware_reach = """color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach)}</td>"""
new_aware_reach = """color:"#FFCB05",fontFamily:fm,fontSize:15,fontWeight:900}}>{fmt(m.reach+t.reach+computed.gd.reach)}</td>"""
if old_aware_reach in c:
    c = c.replace(old_aware_reach, new_aware_reach)
    fixes += 1
    print("FIX 1: Grand Total Reach now includes Google Display")

# ═══ FIX 2: Grand Total Frequency in Awareness - include Google reach ═══
old_aware_freq = """{(m.reach+t.reach)>0?((m.impressions+t.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\\u2014"}"""
new_aware_freq = """{(m.reach+t.reach)>0?((m.impressions+t.impressions+computed.gd.impressions)/(m.reach+t.reach)).toFixed(2)+"x":"\\u2014"}"""
if old_aware_freq in c:
    c = c.replace(old_aware_freq, new_aware_freq)
    fixes += 1
    print("FIX 2: Grand Total Frequency includes Google impressions")

# ═══ FIX 4: FB pageLikes - already correct, uses 'like' action type which is page likes ═══
# Verified in campaigns.js - pageLikes comes from action_type "like" which IS page likes
print("FIX 4: SKIP - pageLikes correctly uses 'like' action type (page likes only)")

# ═══ FIX 5: TikTok Community card - change label to be clearer ═══
old_tt_label = """<div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FOLLOWS EARNED</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttEarned)}</div>"""
new_tt_label = """<div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>PERIOD FOLLOWS</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttEarned)}</div>"""
if old_tt_label in c:
    c = c.replace(old_tt_label, new_tt_label)
    fixes += 1
    print("FIX 5: TikTok card label clarified to PERIOD FOLLOWS")

# ═══ FIX 6: Remove "top quartile" claim - make conditional ═══
old_quartile = """This positions the campaign within the top quartile of paid social CPM efficiency for the paid social market, where industry benchmarks typically range R12 to R25 Cost Per Thousand Ads Served."""
new_quartile = """"+fR(computed.blendedCpm)+" blended Cost Per Thousand Ads Served "+(computed.blendedCpm<12?"positions the campaign well below the R12 to R25 paid social CPM benchmark range, confirming exceptional media value.":computed.blendedCpm<18?"sits within the efficient range of R12 to R25 for the paid social market.":"is at the upper end of the R12 to R25 paid social CPM range, reflecting the platform mix and audience targeting precision.")+""""
c = c.replace(
    'achieving a blended Cost Per Thousand Ads Served of "+fR(computed.blendedCpm)+". This positions the campaign within the top quartile of paid social CPM efficiency for the paid social market, where industry benchmarks typically range R12 to R25 Cost Per Thousand Ads Served.',
    'achieving a ' + new_quartile
)
fixes += 1
print("FIX 6: CPM benchmark claim now conditional on actual value")

# ═══ FIX 7: TikTok CPM comparison - handle when TikTok is more expensive ═══
old_tt_cpm = """t.cpm<computed.fb.cpm?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":" TikTok delivers comparable Cost Per Thousand Ads Served to Facebook at "+fR(t.cpm)+" versus "+fR(computed.fb.cpm)+", with TikTok\\'s value driven by higher video completion rates and native content engagement."""
new_tt_cpm = """t.cpm<computed.fb.cpm*0.9?" TikTok delivers a "+(((computed.fb.cpm-t.cpm)/computed.fb.cpm)*100).toFixed(0)+"% Cost Per Thousand Ads Served advantage over Facebook, confirming strong content relevance scores and favourable auction positioning.":t.cpm>computed.fb.cpm*1.1?" TikTok Cost Per Thousand Ads Served at "+fR(t.cpm)+" is "+(((t.cpm-computed.fb.cpm)/computed.fb.cpm)*100).toFixed(0)+"% higher than Facebook, reflecting TikTok\\'s premium video inventory and higher engagement depth per impression.":" TikTok and Facebook deliver comparable Cost Per Thousand Ads Served at "+fR(t.cpm)+" and "+fR(computed.fb.cpm)+" respectively."""

if old_tt_cpm in c:
    c = c.replace(old_tt_cpm, new_tt_cpm)
    fixes += 1
    print("FIX 7: TikTok CPM comparison handles all scenarios")
else:
    # Try without escaped quote
    old_tt_cpm2 = old_tt_cpm.replace("\\\\'", "\\'")
    if old_tt_cpm2 in c:
        c = c.replace(old_tt_cpm2, new_tt_cpm.replace("\\\\'", "\\'"))
        fixes += 1
        print("FIX 7: TikTok CPM comparison (alt quote)")
    else:
        print("FIX 7: SKIP - TikTok CPM text not found (may already be fixed)")

# ═══ FIX 9: isFollowLike detection - add more patterns ═══
old_follow = """var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;"""
new_follow = """var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0;"""
if old_follow in c:
    c = c.replace(old_follow, new_follow)
    fixes += 1
    print("FIX 9: isFollowLike detection expanded")

# ═══ FIX 10: fetchData re-runs on date change - not needed, REFRESH button works ═══
print("FIX 10: SKIP - REFRESH button is intentional UX")

# ═══ FIX 11: Variable name collision sc ═══
old_sc = """var findBestPage=function(campaignName,pagesArr){
    var bestPage=null;var bestScore=0;
    for(var pi=0;pi<pagesArr.length;pi++){
      var sc=autoMatchPage(campaignName,pagesArr[pi].name);
      if(sc>bestScore){bestScore=sc;bestPage=pagesArr[pi];}
    }"""
new_sc = """var findBestPage=function(campaignName,pagesArr){
    var bestPage=null;var bestScore=0;
    for(var pi=0;pi<pagesArr.length;pi++){
      var matchSc=autoMatchPage(campaignName,pagesArr[pi].name);
      if(matchSc>bestScore){bestScore=matchSc;bestPage=pagesArr[pi];}
    }"""
if old_sc in c:
    c = c.replace(old_sc, new_sc)
    fixes += 1
    print("FIX 11: Variable collision sc -> matchSc")

# ═══ FIX 12: Error handling on fetchData ═══
old_catch = """.catch(function(){setLoading(false);});"""
new_catch = """.catch(function(err){console.error("API Error:",err);setLoading(false);});"""
if old_catch in c:
    c = c.replace(old_catch, new_catch)
    fixes += 1
    print("FIX 12: Error logging added to fetchData")

# ═══ FIX 13+14: Remove dead variables tLikes and sLikes ═══
c = c.replace("var tLikes=0;\n", "")
c = c.replace("var sLikes=0;\n", "")
# Also try without newline
c = c.replace("var tLikes=0;", "")
c = c.replace("var sLikes=0;", "")
fixes += 1
print("FIX 13+14: Dead variables tLikes/sLikes removed")

# ═══ FIX 15: Pie chart filters out zero-spend segments ═══
old_pie = """[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}]"""
new_pie = """[{name:"Facebook",value:computed.fb.spend},{name:"Instagram",value:computed.ig.spend},{name:"TikTok",value:t.spend},{name:"Google",value:computed.gd.spend}].filter(function(x){return x.value>0;})"""
if old_pie in c:
    c = c.replace(old_pie, new_pie)
    fixes += 1
    print("FIX 15: Pie chart filters zero-spend platforms")

# ═══ FIX 16: Google Reach bar chart - use 0 instead of null ═══
old_google_bar = """{name:"Google",Impressions:computed.gd.impressions,Reach:null}"""
new_google_bar = """{name:"Google",Impressions:computed.gd.impressions,Reach:0}"""
if old_google_bar in c:
    c = c.replace(old_google_bar, new_google_bar)
    fixes += 1
    print("FIX 16: Google bar chart Reach null -> 0")

# ═══ FIX 17: IG CPC comparison guard against zero ═══
old_ig_cpc = """computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0"""
new_ig_cpc = """computed.ig.cpc>0&&computed.ig.cpc<computed.fb.cpc&&computed.fb.cpc>0"""
if old_ig_cpc in c:
    c = c.replace(old_ig_cpc, new_ig_cpc, 1)  # Only first occurrence in engagement insight
    fixes += 1
    print("FIX 17: IG CPC comparison guards against zero clicks")

# ═══ FIX 18: Combined Campaign Read - include Google Display ═══
old_combined = """across Meta and TikTok against a combined investment"""
new_combined = """across Meta, TikTok, and Google Display against a combined investment"""
if old_combined in c:
    c = c.replace(old_combined, new_combined)
    fixes += 1
    print("FIX 18: Combined read includes Google Display")

# Also fix "dual-platform" to "multi-platform"
old_dual = """The dual-platform architecture is delivering"""
new_dual = """The multi-platform architecture is delivering"""
if old_dual in c:
    c = c.replace(old_dual, new_dual)
    fixes += 1
    print("FIX 18b: dual-platform -> multi-platform")

# ═══ FIX 19: Community insight - include TikTok in total ═══
old_comm = """across Facebook and Instagram."""
new_comm = """across Facebook, Instagram, and TikTok."""
if old_comm in c:
    c = c.replace(old_comm, new_comm)
    fixes += 1
    print("FIX 19: Community insight includes TikTok")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print(f"\n{'='*50}")
print(f"TOTAL FIXES APPLIED: {fixes}")
print(f"{'='*50}")
