with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the entire scoring block
old_scoring = """var scored=allRows.map(function(r){
                    var score=0;var signals=[];
                    var objAvgCost=0;var objAvgCtr=0;var objPeers=allRows.filter(function(x){return x.objective===r.objective;});
                    if(objPeers.length>0){
                      var peerResults=objPeers.filter(function(x){return x.costPer>0;});
                      if(peerResults.length>0)objAvgCost=peerResults.reduce(function(a,x){return a+x.costPer;},0)/peerResults.length;
                      var peerCtr=objPeers.filter(function(x){return x.ctr>0;});
                      if(peerCtr.length>0)objAvgCtr=peerCtr.reduce(function(a,x){return a+x.ctr;},0)/peerCtr.length;
                    }
                    if(r.result>0&&r.costPer>0&&objAvgCost>0&&r.costPer<=objAvgCost){score+=2;signals.push("Cost per result "+fR(r.costPer)+" is at or below the "+fR(objAvgCost)+" objective average");}
                    else if(r.result>0&&r.costPer>0&&objAvgCost>0&&r.costPer<=objAvgCost*1.5){score+=1;signals.push("Cost per result "+fR(r.costPer)+" is within 1.5x of the "+fR(objAvgCost)+" average");}
                    else if(r.costPer>objAvgCost*1.5&&objAvgCost>0){score-=1;signals.push("Cost per result "+fR(r.costPer)+" is more than 1.5x the "+fR(objAvgCost)+" average");}
                    if(r.ctr>2){score+=2;signals.push("CTR at "+r.ctr.toFixed(2)+"% shows strong creative resonance");}
                    else if(r.ctr>1){score+=1;signals.push("CTR at "+r.ctr.toFixed(2)+"% is within healthy range");}
                    else if(r.ctr>0&&r.ctr<0.5&&r.impressions>5000){score-=2;signals.push("CTR at "+r.ctr.toFixed(2)+"% is critically low across "+fmt(r.impressions)+" impressions");}
                    else if(r.ctr>0&&r.ctr<1){score-=0;signals.push("CTR at "+r.ctr.toFixed(2)+"% is below the 1% engagement benchmark");}
                    if(r.spend>500&&r.result===0){score-=3;signals.push(fR(r.spend)+" invested with zero measurable results");}
                    if(r.result>0&&r.spend>0){score+=1;}
                    var status=score>=2?"strong":score>=0?"average":"weak";
                    var statusColor=score>=2?"#22c55e":score>=0?"#f59e0b":"#ef4444";
                    var statusLabel=score>=2?"Strong":score>=0?"Monitor":"Action";
                    return{row:r,score:score,status:status,statusColor:statusColor,statusLabel:statusLabel,signals:signals};
                  });"""

new_scoring = """var scored=allRows.map(function(r){
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

c = c.replace(old_scoring, new_scoring)
print("Scoring logic replaced")

# Fix the assessment cell to use single assessment string instead of signals array
old_cell = '{s.signals.slice(0,2).join(". ")}'
new_cell = '{s.assessment}'
c = c.replace(old_cell, new_cell)
print("Assessment cell fixed")

# Fix the insight to not reference signals
old_insight_weak = 'weak.slice(0,2).map(function(s){return s.signals[0];}).join("; ")'
new_insight_weak = 'weak.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform;}).join("; ")'
c = c.replace(old_insight_weak, new_insight_weak)
print("Insight fixed")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("All assessment fixes applied")
