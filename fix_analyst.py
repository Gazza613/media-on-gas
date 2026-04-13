with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_scoring = """var scored=allRows.map(function(r){
                    var score=0;var assessment="";
                    var objPeers=allRows.filter(function(x){return x.objective===r.objective&&x.result>0&&x.costPer>0;});
                    var objAvgCost=objPeers.length>0?objPeers.reduce(function(a,x){return a+x.costPer;},0)/objPeers.length:0;
                    var objBestCost=objPeers.length>0?objPeers.reduce(function(a,x){return x.costPer<a?x.costPer:a;},Infinity):0;
                    var objTotalResults=allRows.filter(function(x){return x.objective===r.objective;}).reduce(function(a,x){return a+x.result;},0);
                    var resultShare=objTotalResults>0?((r.result/objTotalResults)*100):0;
                    var spendShare=totalSpend>0?((r.spend/totalSpend)*100):0;
                    if(r.spend>500&&r.result===0){score=-3;assessment="Spending "+fR(r.spend)+" ("+spendShare.toFixed(1)+"% of budget) with no results. This audience is not converting.";}
                    else if(r.result===0&&r.spend>0&&r.spend<=500){score=-1;assessment="Early stage with "+fR(r.spend)+" spent and no results yet. Allow more data before evaluating.";}
                    else if(r.result>0&&objAvgCost>0&&r.costPer<=objBestCost*1.1){score=3;assessment="Top efficiency. Delivering "+resultShare.toFixed(0)+"% of all "+r.objective.toLowerCase()+" at "+fR(r.costPer)+" per result, the best rate in the campaign.";}
                    else if(r.result>0&&objAvgCost>0&&r.costPer<=objAvgCost){score=2;assessment="Delivering "+fmt(r.result)+" results at "+fR(r.costPer)+", "+(((objAvgCost-r.costPer)/objAvgCost)*100).toFixed(0)+"% below the "+fR(objAvgCost)+" average. Efficient targeting.";}
                    else if(r.result>0&&objAvgCost>0&&r.costPer<=objAvgCost*1.5){score=1;assessment="Delivering "+fmt(r.result)+" results at "+fR(r.costPer)+", within range of the "+fR(objAvgCost)+" average. Acceptable but could improve.";}
                    else if(r.result>0&&objAvgCost>0&&r.costPer>objAvgCost*1.5){score=-1;assessment="Cost per result "+fR(r.costPer)+" is "+(((r.costPer-objAvgCost)/objAvgCost)*100).toFixed(0)+"% above the "+fR(objAvgCost)+" average. Reduce budget or refresh creative.";}
                    else if(r.result>0){score=1;assessment="Delivering "+fmt(r.result)+" results at "+fR(r.costPer)+". "+r.ctr.toFixed(2)+"% CTR "+(r.ctr>1.5?"shows strong audience fit.":"is acceptable.");}
                    else{score=0;assessment=fR(r.spend)+" spent, "+fmt(r.clicks)+" clicks, "+r.ctr.toFixed(2)+"% CTR. Awaiting conversion data.";}
                    var status=score>=2?"strong":score>=0?"average":"weak";
                    var statusColor=score>=2?"#22c55e":score>=0?"#f59e0b":"#ef4444";
                    var statusLabel=score>=2?"Performing":score>=0?"Monitor":"Action";
                    return{row:r,score:score,status:status,statusColor:statusColor,statusLabel:statusLabel,assessment:assessment};
                  });"""

new_scoring = """var scored=allRows.map(function(r){
                    var score=0;var assessment="";
                    var objPeers=allRows.filter(function(x){return x.objective===r.objective;});
                    var objWithResults=objPeers.filter(function(x){return x.result>0&&x.costPer>0;});
                    var objAvgCost=objWithResults.length>0?objWithResults.reduce(function(a,x){return a+x.costPer;},0)/objWithResults.length:0;
                    var objBestCost=objWithResults.length>0?objWithResults.reduce(function(a,x){return x.costPer<a?x.costPer:a;},Infinity):0;
                    var objTotalResults=objPeers.reduce(function(a,x){return a+x.result;},0);
                    var objTotalSpend=objPeers.reduce(function(a,x){return a+x.spend;},0);
                    var resultShare=objTotalResults>0?((r.result/objTotalResults)*100):0;
                    var spendShare=objTotalSpend>0?((r.spend/objTotalSpend)*100):0;
                    var efficiencyRatio=spendShare>0?(resultShare/spendShare):0;
                    var convRate=r.impressions>0?((r.result/r.impressions)*100):0;
                    var platPeers=objPeers.filter(function(x){return x.platform===r.platform&&x.result>0&&x.costPer>0;});
                    var platAvgCost=platPeers.length>0?platPeers.reduce(function(a,x){return a+x.costPer;},0)/platPeers.length:0;
                    var isTopInPlatform=platPeers.length>0&&r.costPer>0&&r.costPer<=platPeers.reduce(function(a,x){return x.costPer<a?x.costPer:a;},Infinity)*1.05;
                    var a=[];
                    if(r.spend>300&&r.result===0){
                      score=-3;
                      a.push("Zero results from "+fR(r.spend)+" spend ("+spendShare.toFixed(1)+"% of "+r.objective.toLowerCase()+" budget).");
                      a.push("This audience consumed budget without converting.");
                      if(r.ctr<0.5&&r.impressions>3000){a.push("CTR at "+r.ctr.toFixed(2)+"% confirms the creative is not resonating with this targeting segment.");}
                      else if(r.clicks>0){a.push(fmt(r.clicks)+" clicks generated but none converted, suggesting a landing page or offer disconnect.");}
                    }
                    else if(r.result===0&&r.spend>0){
                      score=-1;
                      a.push("In learning phase: "+fR(r.spend)+" spent, "+fmt(r.clicks)+" clicks, no conversions yet.");
                      a.push("Insufficient data to assess. Allow 48-72 hours of additional delivery.");
                    }
                    else if(r.result>0){
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
                    }
                    else{score=0;a.push(fR(r.spend)+" invested, "+fmt(r.clicks)+" clicks at "+r.ctr.toFixed(2)+"% CTR. Conversion tracking pending.");}
                    var status=score>=2?"strong":score>=0?"average":"weak";
                    var statusColor=score>=2?"#22c55e":score>=0?"#f59e0b":"#ef4444";
                    var statusLabel=score>=2?"Performing":score>=0?"Monitor":"Action";
                    return{row:r,score:score,status:status,statusColor:statusColor,statusLabel:statusLabel,assessment:a.join(" ")};
                  });"""

c = c.replace(old_scoring, new_scoring)
print("Analyst scoring replaced")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
