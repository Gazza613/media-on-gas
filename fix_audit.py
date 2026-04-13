with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# ============ FIX 1: BEST tag in targeting tab objective tables ============
# Current: picks first per platform if result>0. Wrong - 1 result at R2969 is NOT best.
# New: BEST only if result>=10 AND costPer is at or below objective average AND has meaningful spend
old_best = 'var isBest=false;if(r.result>0){var firstInPlat=true;for(var bi=0;bi<ri;bi++){if(sorted6[bi].platform===r.platform){firstInPlat=false;break;}}isBest=firstInPlat;}'

new_best = """var isBest=false;if(r.result>=10&&r.costPer>0&&r.spend>=oSpend*0.03){
                        var platRows2=sorted6.filter(function(x){return x.platform===r.platform&&x.result>=10;});
                        if(platRows2.length>0){
                          var platBestCost=platRows2.reduce(function(a2,x2){return x2.costPer>0&&x2.costPer<a2?x2.costPer:a2;},Infinity);
                          if(r.costPer<=platBestCost*1.05){
                            var alreadyBest=false;for(var bi=0;bi<ri;bi++){if(sorted6[bi].platform===r.platform){var prevR=sorted6[bi];if(prevR.result>=10&&prevR.costPer>0&&prevR.costPer<=platBestCost*1.05){alreadyBest=true;break;}}}
                            if(!alreadyBest)isBest=true;
                          }
                        }
                      }"""

c = c.replace(old_best, new_best)
print("Fix 1: BEST tag requires 10+ results, best cost per in platform, 3%+ spend share")

# ============ FIX 2: bestAd selection for insight text ============
# Current: just picks highest result count regardless of efficiency
old_bestAd = 'var bestAd=sorted6.reduce(function(a,r){return r.result>a.result?r:a;},{result:0,adsetName:"",platform:"",costPer:0,ctr:0,spend:0});'

new_bestAd = """var qualifiedAds=sorted6.filter(function(r){return r.result>=10&&r.costPer>0&&r.spend>=oSpend*0.03;});
              var bestAd=qualifiedAds.length>0?qualifiedAds.reduce(function(a,r){var aScore=a.result>0?(a.result/a.spend):0;var rScore=r.result>0?(r.result/r.spend):0;return rScore>aScore?r:a;}):sorted6.reduce(function(a,r){return r.result>a.result?r:a;},{result:0,adsetName:"",platform:"",costPer:0,ctr:0,spend:0});"""

c = c.replace(old_bestAd, new_bestAd)
print("Fix 2: bestAd uses results-per-rand efficiency, min 10 results")

# ============ FIX 3: Scorecard assessment - fix for 1 result edge cases ============
# The efficiency ratio breaks with tiny numbers. Add guards.
old_promising = 'a.push("Promising early signal: "+fmt(r.result)+" results at "+fR(r.costPer)+" from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget).");'
new_promising = 'a.push("Early signal only: "+fmt(r.result)+" result"+(r.result>1?"s":"")+" at "+fR(r.costPer)+" from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget). Not statistically meaningful.");'
c = c.replace(old_promising, new_promising)
print("Fix 3a: Promising -> Early signal for low volume")

# Fix the "Proven efficiency leader" to need 10+ results
old_proven = 'if(hasScale&&efficiencyRatio>=1.5){'
new_proven = 'if(hasScale&&efficiencyRatio>=1.5&&r.result>=10){'
c = c.replace(old_proven, new_proven)
print("Fix 3b: Proven leader needs 10+ results")

# Fix "Strong performer" to need 5+ results
old_strong = 'else if(hasScale&&efficiencyRatio>=1.0){'
new_strong = 'else if(hasScale&&efficiencyRatio>=1.0&&r.result>=5){'
c = c.replace(old_strong, new_strong)
print("Fix 3c: Strong performer needs 5+ results")

# Fix "Above average" with some scale
old_above = 'else if(hasSomeScale&&efficiencyRatio>=1.0){'
new_above = 'else if(hasSomeScale&&efficiencyRatio>=1.0&&r.result>=3){'
c = c.replace(old_above, new_above)
print("Fix 3d: Above average needs 3+ results")

# ============ FIX 4: Scorecard status - 1 result with high cost should be red ============
# Add check: if costPer > 3x objective average, it's weak regardless
old_status = "var status=score>=2?\"strong\":score>=0?\"average\":\"weak\";"
new_status = """var status=score>=2?"strong":score>=0?"average":"weak";
                    if(r.result>0&&r.result<3&&r.costPer>0&&objAvgCost>0&&r.costPer>objAvgCost*3){status="weak";statusColor="#ef4444";statusLabel="Action";assessment="Only "+fmt(r.result)+" result"+(r.result>1?"s":"")+" at "+fR(r.costPer)+" cost per result, which is "+((r.costPer/objAvgCost)).toFixed(0)+"x the "+fR(objAvgCost)+" objective average. Insufficient volume at excessive cost.";}
                    if(r.result>=1&&r.result<3&&r.spend>500){status=status==="strong"?"average":status;if(status!=="weak"){statusColor="#f59e0b";statusLabel="Monitor";assessment="Only "+fmt(r.result)+" result"+(r.result>1?"s":"")+" from "+fR(r.spend)+" spend. Sample size too small to validate performance. Requires more data before drawing conclusions.";}}"""

c = c.replace(old_status, new_status)
print("Fix 4: 1-2 results with high cost = red, 1-2 results with big spend = monitor")

# ============ FIX 5: Targeting insight - bestAd must be qualified ============
old_bestAd_insight = 'if(bestAd.result>0&&bestAd.spend>=oSpend*0.05&&bestAd.impressions>=5000){p.push("Overall top performer with proven scale:'
new_bestAd_insight = 'if(bestAd.result>=10&&bestAd.spend>=oSpend*0.05&&bestAd.impressions>=5000){p.push("Overall top performer with proven scale:'
c = c.replace(old_bestAd_insight, new_bestAd_insight)
print("Fix 5: Targeting insight bestAd needs 10+ results")

old_bestAd_else = 'else if(bestAd.result>0){p.push("Highest result count is "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results, though at "+fR(bestAd.spend)+" spend this requires further volume to confirm sustained efficiency.");}'
new_bestAd_else = 'else if(bestAd.result>=3){p.push("Highest result count is "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results at "+fR(bestAd.costPer)+" cost per result. "+(bestAd.result<10?"Volume is below the 10-result threshold for a confirmed performance read.":""));}else if(bestAd.result>0){p.push("No adset has yet reached the 10-result minimum required for a confirmed performance assessment. The highest count is "+fmt(bestAd.result)+" from "+bestAd.adsetName+" on "+bestAd.platform+".");}'
c = c.replace(old_bestAd_else, new_bestAd_else)
print("Fix 6: Insight caveats for low-result bestAd")

# ============ FIX 7: Reporting tab - platform insights with confidence ============
# Fix scale platform insights - add result count check
old_scale_eff = 'This platform delivers "+effR+"x more results per rand than its budget share, confirming strong efficiency at scale.'
new_scale_eff = 'This platform delivers "+effR+"x more results per rand than its budget share"+(parseInt(pb.result)>=10?", confirmed across "+fmt(pb.imps)+" impressions and "+fmt(pb.result)+" results.":", though with "+fmt(pb.result)+" results this trend needs further volume to confirm.")+"'
c = c.replace(old_scale_eff, new_scale_eff)
print("Fix 7: Platform efficiency claim needs result count check")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("FULL AUDIT COMPLETE")
