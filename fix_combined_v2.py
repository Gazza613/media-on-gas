with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the combined section
start = c.find('<div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMBINED ADSET PERFORMANCE')
end = c.find('<Insight title="Cross-Platform Targeting Assessment"')

# Find the end of that Insight
insight_end = c.find('</Insight>', end) + len('</Insight>')
# Then close the div
section_end = c.find('</div>', insight_end) + 6

print("Combined section:", start, "to", section_end)

new_combined = """<div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>TARGETING HEALTH SCORECARD</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>ALL ADSETS RANKED BY PERFORMANCE</div></div>
                <div style={{display:"flex",gap:16,marginBottom:16,justifyContent:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#22c55e"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Strong performer</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#f59e0b"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Average / Monitor</span></div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{width:12,height:12,borderRadius:"50%",background:"#ef4444"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Underperforming / Action needed</span></div>
                </div>
                {(function(){
                  var scored=allRows.map(function(r){
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
                  });
                  scored.sort(function(a,b){return b.score-a.score;});

                  return <div>
                    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                      <thead><tr>{["Status","Adset (Targeting)","Platform","Objective","Spend","Results","Cost Per","CTR %","Assessment"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===1?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                      <tbody>{scored.map(function(s,si){
                        var r=s.row;var pc4=platCol3[r.platform]||P.ember;
                        return <tr key={si} style={{background:s.status==="weak"?"rgba(239,68,68,0.06)":s.status==="strong"?"rgba(34,197,94,0.04)":"transparent"}}>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:s.statusColor,color:"#fff",fontSize:8,fontWeight:900,padding:"3px 8px",borderRadius:4,textTransform:"uppercase"}}>{s.statusLabel}</span></td>
                          <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:260,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc4,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?s.statusColor:P.dim}}>{fmt(r.result)}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\\u2014"}</td>
                          <td style={{padding:"10px 8px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                          <td style={{padding:"10px 10px",border:"1px solid "+P.rule,fontSize:10,color:P.sub,lineHeight:1.5,maxWidth:220}}>{s.signals.slice(0,2).join(". ")}</td>
                        </tr>;})}</tbody>
                    </table>
                    <Insight title="Targeting Health Summary" accent={P.solar} icon={Ic.radar(P.solar,16)}>{(function(){var strong=scored.filter(function(s){return s.status==="strong";});var avg=scored.filter(function(s){return s.status==="average";});var weak=scored.filter(function(s){return s.status==="weak";});var p=[];p.push("Across "+scored.length+" active adsets: "+strong.length+" are performing strongly (green), "+avg.length+" require monitoring (orange), and "+weak.length+" need immediate attention (red).");if(strong.length>0){p.push("Top performers include "+strong.slice(0,2).map(function(s){return s.row.adsetName+" on "+s.row.platform+" ("+fmt(s.row.result)+" results at "+fR(s.row.costPer)+")";}).join(" and ")+". These adsets demonstrate strong audience-creative alignment and should be considered for increased budget allocation.");}if(weak.length>0){var weakSpend=weak.reduce(function(a,s){return a+s.row.spend;},0);p.push(weak.length+" adset"+(weak.length>1?"s":"")+" flagged for action represent"+( weakSpend>0?" "+fR(weakSpend)+" of potentially misallocated budget.":". ")+" "+(weak.length>0?"The primary issues are: "+weak.slice(0,2).map(function(s){return s.signals[0];}).join("; ")+".":""));}if(strong.length>0&&weak.length>0){p.push("Reallocating budget from underperforming (red) adsets to proven (green) performers would improve overall campaign Return On Investment without increasing total media spend.");}return p.join(" ");})()}</Insight>
                  </div>;
                })()}"""

c = c[:start] + new_combined + c[section_end:]
print("Combined table replaced with Targeting Health Scorecard")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
