with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the platSections block and replace with objective-first
rt_start = c.find("            var platList3=")
ps_end = c.find("            });", c.find("platSections.push(", rt_start))
ps_end = c.find("\n", ps_end) + 1

print("Block from:", rt_start, "to:", ps_end)

new_block = """            var platList3=["Facebook","Instagram","TikTok","Google Display"];
            var platCol3={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var platBdg3={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD"};
            var objList3=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol3={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objRL3={"App Store Clicks":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCL3={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};
            var platOrd3={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};

            var adsetTip=function(props){if(!props.active||!props.payload||!props.payload[0])return null;var d=props.payload[0].payload;return <div style={{background:"rgba(6,2,14,0.95)",border:"1px solid "+P.rule,borderRadius:10,padding:"10px 14px",maxWidth:360}}><div style={{fontSize:12,fontWeight:700,color:P.txt,marginBottom:6,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.5}}>{d.fullName||d.name}</div><div style={{fontSize:10,color:P.sub,marginBottom:2}}>{d.platform||""}</div>{props.payload.map(function(p,i){return <div key={i} style={{fontSize:11,color:P.ember,fontFamily:fm,fontWeight:700}}>{p.name}: {typeof p.value==="number"&&p.name.indexOf("CTR")>=0?p.value.toFixed(2)+"%":typeof p.value==="number"?fR(p.value):p.value}</div>;})}</div>;};

            var platSections=[];
            objList3.forEach(function(objName){
              var objRows=allRows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){objRows=objRows.concat(allRows.filter(function(r){return r.objective==="Traffic";}));}
              if(objRows.length===0)return;
              var oc=objCol3[objName];
              var sorted6=objRows.slice().sort(function(a,b){var po=(platOrd3[a.platform]||9)-(platOrd3[b.platform]||9);if(po!==0)return po;return b.result-a.result||b.spend-a.spend;});
              var oSpend=sorted6.reduce(function(a,r){return a+r.spend;},0);
              var oClicks=sorted6.reduce(function(a,r){return a+r.clicks;},0);
              var oResults=sorted6.reduce(function(a,r){return a+r.result;},0);
              var oImps=sorted6.reduce(function(a,r){return a+r.impressions;},0);
              var oCtr=oImps>0?(oClicks/oImps*100):0;
              var oCpc=oClicks>0?oSpend/oClicks:0;
              var oCostPer=oResults>0?oSpend/oResults:0;
              var bestAd=sorted6.reduce(function(a,r){return r.result>a.result?r:a;},{result:0,adsetName:"",platform:"",costPer:0,ctr:0,spend:0});
              var chartD=sorted6.map(function(r){return{name:r.adsetName.length>30?r.adsetName.substring(0,27)+"...":r.adsetName,fullName:r.adsetName,platform:r.platform,Results:r.result,CostPer:r.costPer,CTR:r.ctr};});

              var platGrp={};sorted6.forEach(function(r){if(!platGrp[r.platform])platGrp[r.platform]={rows:[],spend:0,clicks:0,imps:0,results:0};platGrp[r.platform].rows.push(r);platGrp[r.platform].spend+=r.spend;platGrp[r.platform].clicks+=r.clicks;platGrp[r.platform].imps+=r.impressions;platGrp[r.platform].results+=r.result;});

              platSections.push(<div key={objName} style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:16,height:16,borderRadius:"50%",background:oc}}></span><span style={{fontSize:20,fontWeight:900,color:oc,fontFamily:ff,letterSpacing:1}}>{objName.toUpperCase()}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{sorted6.length} adsets across {Object.keys(platGrp).length} platform{Object.keys(platGrp).length>1?"s":""}</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>SPEND</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fR(oSpend)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>IMPRESSIONS</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(oImps)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objRL3[objName]||"RESULTS"}</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fmt(oResults)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objCL3[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm}}>{oResults>0?fR(oCostPer):"\\u2014"}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CTR</div><div style={{fontSize:18,fontWeight:900,color:oCtr>2?P.mint:oCtr>1?P.txt:P.warning,fontFamily:fm}}>{oCtr.toFixed(2)+"%"}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset (Targeting)","Platform","Spend","Impressions","Clicks",objRL3[objName]||"Results",objCL3[objName]||"Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted6.map(function(r,ri){
                    var pc=platCol3[r.platform]||P.ember;
                    var isBest=r.adsetName===bestAd.adsetName&&r.result>0;
                    return <tr key={ri} style={{background:ri%2===0?pc+"06":"transparent",borderTop:ri>0&&r.platform!==sorted6[ri-1].platform?"3px solid "+pc+"30":"none"}}>
                      <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:300,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:3,display:"inline-block"}}>BEST</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg3[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:900,color:r.result>0?oc:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:11,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"\\u2014"}</td>
                    </tr>;})}</tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:14}}>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Results by Adset</div><ResponsiveContainer width="100%" height={Math.max(120,chartD.length*36)}><BarChart data={chartD} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={160} tick={{fontSize:9,fill:"rgba(255,255,255,0.75)",fontFamily:fm}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.12)",borderRadius:10,padding:16}}><div style={{fontSize:9,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:10}}>Cost Per Result</div><ResponsiveContainer width="100%" height={Math.max(120,chartD.filter(function(x){return x.CostPer>0;}).length*36)}><BarChart data={chartD.filter(function(x){return x.CostPer>0;}).sort(function(a,b){return a.CostPer-b.CostPer;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={160} tick={{fontSize:9,fill:"rgba(255,255,255,0.75)",fontFamily:fm}} stroke="transparent"/><Tooltip content={adsetTip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CostPer" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title={objName+" Targeting Assessment"} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];p.push(objName+" targeting operates "+sorted6.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results"+(oResults>0?" at "+fR(oCostPer)+" blended cost per result":"")+" and "+oCtr.toFixed(2)+"% Click Through Rate.");Object.keys(platGrp).sort(function(a,b){return (platOrd3[a]||9)-(platOrd3[b]||9);}).forEach(function(plat){var pg=platGrp[plat];var pgCtr=pg.imps>0?(pg.clicks/pg.imps*100):0;var pgCost=pg.results>0?pg.spend/pg.results:0;p.push(plat+" contributes "+fmt(pg.results)+" results from "+pg.rows.length+" adset"+(pg.rows.length>1?"s":"")+" at "+fR(pg.spend)+" spend"+(pg.results>0?" with "+fR(pgCost)+" cost per result":"")+" and "+pgCtr.toFixed(2)+"% CTR.");if(pg.rows.length>1){var pBest=pg.rows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});if(pBest.result>0){p.push("The strongest "+plat+" adset is "+pBest.adsetName+" delivering "+fmt(pBest.result)+" results"+(pBest.costPer>0?" at "+fR(pBest.costPer)+" cost per result":"")+".");}}});if(bestAd.result>0){p.push("Overall top performer across all platforms: "+bestAd.adsetName+" on "+bestAd.platform+" with "+fmt(bestAd.result)+" results"+(bestAd.costPer>0?" at "+fR(bestAd.costPer)+" cost per result":"")+" and "+bestAd.ctr.toFixed(2)+"% CTR. "+(bestAd.ctr>3?"This audience segment demonstrates exceptional creative resonance.":bestAd.ctr>1.5?"This targeting is performing within the upper engagement band.":"This adset is the primary results driver for this objective."));}var zeroSpend=sorted6.filter(function(r){return r.spend>200&&r.result===0;});if(zeroSpend.length>0){p.push(zeroSpend.length+" adset"+(zeroSpend.length>1?"s have":" has")+" invested budget without producing results. These segments are not converting under the current configuration.");}return p.join(" ");})()}</Insight>
              </div>);
            });
"""

c = c[:rt_start] + new_block + c[ps_end:]

# Update title
c = c.replace('ADSET PERFORMANCE BY PLATFORM & OBJECTIVE', 'ADSET PERFORMANCE BY OBJECTIVE')

print("Done - objective-first with all platforms in each table")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
