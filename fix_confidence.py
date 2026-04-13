with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the scoring section after result>0
old_result_block = """else if(r.result>0){
                      if(efficiencyRatio>=1.5){
                        score=3;
                        a.push("Efficiency leader: delivers "+resultShare.toFixed(0)+"% of results using only "+spendShare.toFixed(0)+"% of budget ("+efficiencyRatio.toFixed(1)+"x return ratio).");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" objective average ("+((1-r.costPer/objAvgCost)*100).toFixed(0)+"% more efficient).":"."));
                        if(isTopInPlatform){a.push("Best performer on "+r.platform+".");}
                      }
                      else if(efficiencyRatio>=1.0){
                        score=2;
                        a.push("Above average: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+((1-r.costPer/objAvgCost)*100).toFixed(0)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                        if(r.ctr>2){a.push("Strong "+r.ctr.toFixed(2)+"% CTR confirms audience-creative alignment.");}
                      }
                      else if(efficiencyRatio>=0.7){
                        score=1;
                        a.push("Average efficiency: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" average.":"."));
                        if(r.ctr<1){a.push("CTR at "+r.ctr.toFixed(2)+"% suggests creative fatigue or audience mismatch.");}
                      }
                      else{
                        score=-1;
                        a.push("Below average: consuming "+spendShare.toFixed(0)+"% of budget but only delivering "+resultShare.toFixed(0)+"% of results.");
                        a.push(fR(r.costPer)+" cost per result is "+(objAvgCost>0?(((r.costPer-objAvgCost)/objAvgCost)*100).toFixed(0)+"% above the "+fR(objAvgCost)+" average.":"above average."));
                        if(r.ctr<0.5){a.push("Low "+r.ctr.toFixed(2)+"% CTR indicates poor audience-creative fit.");}
                      }
                    }"""

new_result_block = """else if(r.result>0){
                      var hasScale=spendShare>=5&&r.impressions>=5000&&r.result>=10;
                      var hasSomeScale=spendShare>=2&&r.impressions>=2000&&r.result>=3;
                      if(hasScale&&efficiencyRatio>=1.5){
                        score=3;
                        a.push("Proven efficiency leader at scale: delivers "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget ("+efficiencyRatio.toFixed(1)+"x return ratio) across "+fmt(r.impressions)+" impressions.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" objective average ("+((1-r.costPer/objAvgCost)*100).toFixed(0)+"% more efficient).":"."));
                        if(isTopInPlatform){a.push("Best performer on "+r.platform+".");}
                      }
                      else if(hasScale&&efficiencyRatio>=1.0){
                        score=2;
                        a.push("Strong performer at scale: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget across "+fmt(r.impressions)+" impressions.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(0)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                        if(r.ctr>2){a.push("Strong "+r.ctr.toFixed(2)+"% CTR confirms audience-creative alignment.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio>=1.0){
                        score=1;
                        a.push("Promising early signal: "+fmt(r.result)+" results at "+fR(r.costPer)+" from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget).");
                        a.push("Insufficient volume to confirm performance. Needs more delivery before scaling — currently only "+fmt(r.impressions)+" impressions.");
                      }
                      else if(hasSomeScale&&efficiencyRatio>=1.0){
                        score=2;
                        a.push("Above average: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fmt(r.result)+" results at "+fR(r.costPer)+(objAvgCost>0?" ("+Math.abs(((1-r.costPer/objAvgCost)*100)).toFixed(0)+"% "+(r.costPer<objAvgCost?"below":"above")+" the "+fR(objAvgCost)+" average).":"."));
                      }
                      else if(hasSomeScale&&efficiencyRatio>=0.7){
                        score=1;
                        a.push("Average efficiency: "+resultShare.toFixed(0)+"% of results from "+spendShare.toFixed(0)+"% of budget.");
                        a.push(fR(r.costPer)+" cost per result"+(objAvgCost>0?" vs "+fR(objAvgCost)+" average.":"."));
                        if(r.ctr<1&&r.impressions>5000){a.push("CTR at "+r.ctr.toFixed(2)+"% across "+fmt(r.impressions)+" impressions suggests creative fatigue or audience mismatch.");}
                      }
                      else if(!hasSomeScale&&efficiencyRatio<1.0){
                        score=0;
                        a.push("Low volume: "+fmt(r.result)+" results from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of objective budget).");
                        a.push("Sample too small to draw conclusions. "+fmt(r.impressions)+" impressions is insufficient for a reliable performance read.");
                      }
                      else{
                        score=-1;
                        a.push("Below average at scale: consuming "+spendShare.toFixed(0)+"% of budget but only delivering "+resultShare.toFixed(0)+"% of results ("+efficiencyRatio.toFixed(1)+"x ratio).");
                        a.push(fR(r.costPer)+" cost per result is "+(objAvgCost>0?(((r.costPer-objAvgCost)/objAvgCost)*100).toFixed(0)+"% above the "+fR(objAvgCost)+" average.":"above average."));
                        if(r.ctr<0.5&&r.impressions>5000){a.push("Low "+r.ctr.toFixed(2)+"% CTR across "+fmt(r.impressions)+" impressions confirms poor audience-creative fit.");}
                      }
                    }"""

c = c.replace(old_result_block, new_result_block)
print("Confidence thresholds added")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
