with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace renderTable and platSections with platform-first, objective-grouped approach
# Find renderTable start
rt_start = c.find("            var renderTable=function(pRows,pc2,label){")
# Find platSections end
ps_end = c.find("}).filter(function(x){return x!==null;});", c.find("var platSections="))
ps_end = ps_end + len("}).filter(function(x){return x!==null;});")

print("renderTable from:", rt_start, "to platSections end:", ps_end)

new_block = """            var platList3=["Facebook","Instagram","TikTok","Google Display"];
            var platCol3={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var platBdg3={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD"};
            var objList3=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol3={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objRL3={"App Store Clicks":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCL3={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};
            var platOrd3={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};

            var adsetTip=function(props){if(!props.active||!props.payload||!props.payload[0])return null;var d=props.payload[0].payload;return <div style={{background:"rgba(6,2,14,0.95)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",maxWidth:320}}><div style={{fontSize:11,fontWeight:700,color:P.txt,marginBottom:6,whiteSpace:"normal",wordBreak:"break-word"}}>{d.fullName||d.name}</div>{props.payload.map(function(p,i){return <div key={i} style={{fontSize:11,color:P.sub,fontFamily:fm}}>{p.name}: {typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"?fR(p.value):p.value}</div>;})}</div>;};

            var platSections=[];
            platList3.forEach(function(plat){
              var platRows=allRows.filter(function(r){return r.platform===plat;});
              if(platRows.length===0)return;
              var pc=platCol3[plat];
              var pSpend=platRows.reduce(function(a,r){return a+r.spend;},0);
              var pClicks=platRows.reduce(function(a,r){return a+r.clicks;},0);
              var pImps=platRows.reduce(function(a,r){return a+r.impressions;},0);
              var pCtr=pImps>0?(pClicks/pImps*100):0;
              var pCpc=pClicks>0?pSpend/pClicks:0;

              var objTables=[];
              objList3.forEach(function(objName){
                var oRows=platRows.filter(function(r){return r.objective===objName;});
                if(objName==="Landing Page Clicks"){oRows=oRows.concat(platRows.filter(function(r){return r.objective==="Traffic";}));}
                if(oRows.length===0)return;
                var oc=objCol3[objName];
                var sorted6=oRows.slice().sort(function(a,b){return b.result-a.result||b.spend-a.spend;});
                var oSpend=sorted6.reduce(function(a,r){return a+r.spend;},0);
                var oClicks=sorted6.reduce(function(a,r){return a+r.clicks;},0);
                var oResults=sorted6.reduce(function(a,r){return a+r.result;},0);
                var oImps=sorted6.reduce(function(a,r){return a+r.impressions;},0);
                var oCtr=oImps>0?(oClicks/oImps*100):0;
                var oCostPer=oResults>0?oSpend/oResults:0;
                var bestAd=sorted6[0];
                var worstAd=sorted6[sorted6.length-1];
                var chartD=sorted6.map(function(r){return{name:r.adsetName.length>18?r.adsetName.substring(0,15)+"...":r.adsetName,fullName:r.adsetName,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});

                objTables.push(<div key={objName} style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}><span style={{width:10,height:10,borderRadius:"50%",background:oc}}></span><span style={{fontSize:13,fontWeight:800,color:oc,fontFamily:ff}}>{objName}</span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>{sorted6.length} adset{sorted6.length>1?"s":""}</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                    <Glass accent={oc} hv={true} st={{padding:12,textAlign:"center"}}><div style={{fontSize:7,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:3}}>SPEND</div><div style={{fontSize:16,fontWeight:900,color:oc,fontFamily:fm}}>{fR(oSpend)}</div></Glass>
                    <Glass accent={oc} hv={true} st={{padding:12,textAlign:"center"}}><div style={{fontSize:7,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:3}}>{objRL3[objName]||"RESULTS"}</div><div style={{fontSize:16,fontWeight:900,color:oc,fontFamily:fm}}>{fmt(oResults)}</div></Glass>
                    <Glass accent={oc} hv={true} st={{padding:12,textAlign:"center"}}><div style={{fontSize:7,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:3}}>{objCL3[objName]||"COST PER"}</div><div style={{fontSize:16,fontWeight:900,color:P.ember,fontFamily:fm}}>{oResults>0?fR(oCostPer):"\\u2014"}</div></Glass>
                    <Glass accent={oc} hv={true} st={{padding:12,textAlign:"center"}}><div style={{fontSize:7,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:3}}>CTR</div><div style={{fontSize:16,fontWeight:900,color:oCtr>2?P.mint:oCtr>1?P.txt:P.warning,fontFamily:fm}}>{oCtr.toFixed(2)+"%"}</div></Glass>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}>
                    <thead><tr>{["Adset (Targeting)","Spend","Impressions","Clicks",objRL3[objName]||"Results",objCL3[objName]||"Cost Per","CTR %"].map(function(h,hi){return <th key={hi} style={{padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                    <tbody>{sorted6.map(function(r,ri){
                      var isBest3=ri===0&&r.result>0;
                      return <tr key={ri} style={{background:ri%2===0?oc+"06":"transparent"}}>
                        <td title={r.adsetName} style={{padding:"10px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:300,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest3&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:3,display:"inline-block"}}>BEST</span>}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.impressions)}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.clicks)}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?oc:P.dim}}>{fmt(r.result)}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\\u2014"}</td>
                        <td style={{padding:"9px 10px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      </tr>;})}</tbody>
                  </table>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16,marginBottom:12}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Results by Adset</div><ResponsiveContainer width="100%" height={Math.max(100,chartD.length*32)}><BarChart data={chartD} layout="vertical" barSize={12}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={110} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <Insight title={objName+" on "+plat} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];p.push(plat+" "+objName.toLowerCase()+" targeting operates "+sorted6.length+" adset"+(sorted6.length>1?"s":"")+" with "+fR(oSpend)+" invested, delivering "+fmt(oResults)+" results at "+(oResults>0?fR(oCostPer):"no")+" cost per result and "+oCtr.toFixed(2)+"% Click Through Rate.");if(bestAd&&bestAd.result>0){p.push("The strongest adset is "+bestAd.adsetName+" with "+fmt(bestAd.result)+" results"+(bestAd.costPer>0?" at "+fR(bestAd.costPer)+" cost per result":"")+" and "+bestAd.ctr.toFixed(2)+"% CTR"+(bestAd.ctr>oCtr?" outperforming the objective average":"")+". "+(bestAd.ctr>3?"This audience segment demonstrates exceptional creative resonance, indicating strong alignment between the targeting parameters and the ad messaging.":bestAd.ctr>1.5?"This targeting is performing within the upper engagement band, confirming the audience definition is well-matched to the creative proposition.":"This targeting is delivering measurable results and contributing to the objective."));}if(sorted6.length>1&&worstAd.spend>100){var efficiency=bestAd.costPer>0&&worstAd.costPer>0?((worstAd.costPer/bestAd.costPer-1)*100).toFixed(0):"0";if(worstAd.result===0&&worstAd.spend>200){p.push("The adset "+worstAd.adsetName+" has invested "+fR(worstAd.spend)+" without producing a measurable result. This audience segment is not converting under the current creative and targeting configuration.");}else if(parseFloat(efficiency)>100){p.push("There is a "+efficiency+"% cost gap between the most and least efficient adsets, indicating significant performance variance across targeting segments.");}}return p.join(" ");})()}</Insight>
                </div>);
              });

              if(objTables.length>0){
                platSections.push(<div key={plat} style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:16,height:16,borderRadius:"50%",background:pc}}></span><span style={{fontSize:20,fontWeight:900,color:pc,fontFamily:ff,letterSpacing:1}}>{plat.toUpperCase()}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{platRows.length} adsets across {objTables.length} objective{objTables.length>1?"s":""}</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                    <Glass accent={pc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>SPEND</div><div style={{fontSize:20,fontWeight:900,color:pc,fontFamily:fm}}>{fR(pSpend)}</div></Glass>
                    <Glass accent={pc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CLICKS</div><div style={{fontSize:20,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(pClicks)}</div></Glass>
                    <Glass accent={pc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CTR</div><div style={{fontSize:20,fontWeight:900,color:pCtr>2?P.mint:pCtr>1?P.txt:P.warning,fontFamily:fm}}>{pCtr.toFixed(2)+"%"}</div></Glass>
                    <Glass accent={pc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CPC</div><div style={{fontSize:20,fontWeight:900,color:pCpc<2?P.mint:P.ember,fontFamily:fm}}>{fR(pCpc)}</div></Glass>
                  </div>
                  {objTables}
                </div>);
              }
            });"""

c = c[:rt_start] + new_block + c[ps_end:]
print("Replaced renderTable + platSections")

# Fix the main section title
c = c.replace('ADSET PERFORMANCE BY PLATFORM', 'ADSET PERFORMANCE BY PLATFORM & OBJECTIVE')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
