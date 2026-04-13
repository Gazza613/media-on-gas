with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix 1: Tab order - remove Ad Serving, Engagement, Objectives
old_tabs = c[c.find('var tabs=['):c.find('];', c.find('var tabs=['))+2]
new_tabs = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}]'
c = c.replace(old_tabs, new_tabs)
print("Tabs fixed")

# Fix 2: Replace targeting tab content
start = c.find('        {tab==="targeting"&&(<div>')
end_search = c.find('{tab==="community"', start + 100)
end = c.rfind('\n', start, end_search) + 1

old_targeting = c[start:end]
print("Old targeting:", len(old_targeting), "chars")

new_targeting = '''        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" \\u00b7 Adset-Level Analysis by Objective"} accent={P.solar}/>
          {(function(){
            var selCamps=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            var selIds=selCamps.map(function(x){return x.rawCampaignId||x.campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"");});
            var selNames=selCamps.map(function(x){return x.campaignName;});
            var filtered=adsets.filter(function(a){
              for(var si=0;si<selIds.length;si++){if(a.campaignId===selIds[si])return true;}
              for(var sn=0;sn<selNames.length;sn++){if(a.campaignName===selNames[sn])return true;}
              return false;
            }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
            if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;

            var getObj3=function(name){var n=(name||"").toLowerCase();if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";if(n.indexOf("follower")>=0)return "Followers & Likes";if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";return "Traffic";};

            var allRows=filtered.map(function(a){
              var obj=getObj3(a.campaignName);
              var result=obj==="Leads"?parseFloat(a.leads||0):obj==="Followers & Likes"?parseFloat(a.follows||0)+parseFloat(a.pageLikes||0):parseFloat(a.clicks||0);
              var spend=parseFloat(a.spend||0);var clicks=parseFloat(a.clicks||0);var imps=parseFloat(a.impressions||0);
              var ctr=imps>0?(clicks/imps*100):0;var cpc=clicks>0?spend/clicks:0;var costPer=result>0?spend/result:0;
              return{adsetName:a.adsetName,campaignName:a.campaignName,platform:a.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,reach:parseFloat(a.reach||0),ctr:ctr,cpc:cpc,result:result,costPer:costPer,follows:parseFloat(a.follows||0),pageLikes:parseFloat(a.pageLikes||0),leads:parseFloat(a.leads||0)};
            });

            var totalSpend=allRows.reduce(function(a,r){return a+r.spend;},0);
            var totalImps=allRows.reduce(function(a,r){return a+r.impressions;},0);
            var totalClicks=allRows.reduce(function(a,r){return a+r.clicks;},0);
            var totalReach=allRows.reduce(function(a,r){return a+r.reach;},0);
            var blendedCtr=totalImps>0?(totalClicks/totalImps*100):0;
            var blendedCpc=totalClicks>0?totalSpend/totalClicks:0;

            var platOrd={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};
            var platCol={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var platBdg={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD"};
            var objectives3=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objRL={"App Store Clicks":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCL={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};

            var objSections3=[];
            objectives3.forEach(function(objName){
              var objRows=allRows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){objRows=objRows.concat(allRows.filter(function(r){return r.objective==="Traffic";}));}
              if(objRows.length===0)return;
              var oc=objCol[objName]||P.ember;
              var sorted4=objRows.slice().sort(function(a,b){var po=(platOrd[a.platform]||9)-(platOrd[b.platform]||9);if(po!==0)return po;return b.spend-a.spend;});
              var oSpend=sorted4.reduce(function(a,r){return a+r.spend;},0);
              var oClicks=sorted4.reduce(function(a,r){return a+r.clicks;},0);
              var oResults=sorted4.reduce(function(a,r){return a+r.result;},0);
              var oImps=sorted4.reduce(function(a,r){return a+r.impressions;},0);
              var oCtr=oImps>0?(oClicks/oImps*100):0;
              var oCpc=oClicks>0?oSpend/oClicks:0;
              var oCostPer=oResults>0?oSpend/oResults:0;
              var bestRow=sorted4.reduce(function(a,r){return r.result>a.result?r:a;},{result:0,adsetName:"",platform:"",costPer:0});
              var cheapRow=sorted4.filter(function(r){return r.costPer>0;}).reduce(function(a,r){return r.costPer<a.costPer?r:a;},{costPer:Infinity,adsetName:""});

              var chartR=sorted4.slice(0,8).map(function(r){return{name:r.adsetName.length>22?r.adsetName.substring(0,19)+"...":r.adsetName,Results:r.result,CostPer:r.costPer};});

              var platGrp={};sorted4.forEach(function(r){if(!platGrp[r.platform])platGrp[r.platform]={rows:[],spend:0,clicks:0,imps:0,results:0};platGrp[r.platform].rows.push(r);platGrp[r.platform].spend+=r.spend;platGrp[r.platform].clicks+=r.clicks;platGrp[r.platform].imps+=r.impressions;platGrp[r.platform].results+=r.result;});

              objSections3.push(<div key={objName} style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:14,height:14,borderRadius:"50%",background:oc}}></span><span style={{fontSize:18,fontWeight:900,color:oc,fontFamily:ff,letterSpacing:1}}>{objName.toUpperCase()}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{sorted4.length} adsets</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>SPEND</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fR(oSpend)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>IMPRESSIONS</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(oImps)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CLICKS</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(oClicks)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objRL[objName]||"RESULTS"}</div><div style={{fontSize:18,fontWeight:900,color:oc,fontFamily:fm}}>{fmt(oResults)}</div></Glass>
                  <Glass accent={oc} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objCL[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm}}>{oResults>0?fR(oCostPer):"\\u2014"}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset (Targeting)","Platform","Spend","Impressions","Clicks",objRL[objName]||"Results",objCL[objName]||"Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted4.map(function(r,ri){
                    var pc=platCol[r.platform]||P.ember;
                    var isBest=r.adsetName===bestRow.adsetName&&r.result>0;
                    return <tr key={ri} style={{background:ri%2===0?pc+"06":"transparent",borderTop:ri>0&&r.platform!==sorted4[ri-1].platform?"3px solid "+pc+"40":"none"}}>
                      <td title={r.adsetName} style={{padding:"12px",fontSize:12,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:280,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:4,display:"inline-block"}}>BEST</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBdg[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:r.result>0?oc:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"\\u2014"}</td>
                    </tr>;})}
                    <tr style={{background:oc+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc,fontSize:12}} colSpan={2}>Total</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fR(oSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(oImps)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(oClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc}}>{fmt(oResults)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{oResults>0?fR(oCostPer):"\\u2014"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{oCtr.toFixed(2)+"%"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{fR(oCpc)}</td></tr>
                  </tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Results by Adset</div><ResponsiveContainer width="100%" height={Math.max(160,chartR.length*28)}><BarChart data={chartR} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Cost Per Result</div><ResponsiveContainer width="100%" height={Math.max(160,chartR.length*28)}><BarChart data={chartR.filter(function(x){return x.CostPer>0;}).sort(function(a,b){return a.CostPer-b.CostPer;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CostPer" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title={objName+" Targeting Assessment"} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];p.push(objName+" campaigns operate "+sorted4.length+" adsets across "+Object.keys(platGrp).join(", ")+" with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results at "+(oResults>0?fR(oCostPer):"no")+" blended cost per result and "+oCtr.toFixed(2)+"% Click Through Rate.");Object.keys(platGrp).sort(function(a,b){return (platOrd[a]||9)-(platOrd[b]||9);}).forEach(function(plat){var pg=platGrp[plat];var pgCtr=pg.imps>0?(pg.clicks/pg.imps*100):0;var pgCost=pg.results>0?pg.spend/pg.results:0;p.push(plat+" contributes "+fmt(pg.results)+" results from "+pg.rows.length+" adset"+(pg.rows.length>1?"s":"")+" at "+fR(pg.spend)+" spend"+(pg.results>0?" with "+fR(pgCost)+" cost per result":"")+" and "+pgCtr.toFixed(2)+"% CTR.");if(pg.rows.length>1){var platBest=pg.rows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});if(platBest.result>0){p.push("The strongest "+plat+" adset is \\'"+platBest.adsetName+"\\' delivering "+fmt(platBest.result)+" results"+(platBest.costPer>0?" at "+fR(platBest.costPer)+" cost per result":"")+".");}}});if(bestRow.result>0){p.push("Overall top performer: \\'"+bestRow.adsetName+"\\' on "+bestRow.platform+" with "+fmt(bestRow.result)+" results"+(bestRow.costPer>0?" at "+fR(bestRow.costPer)+" cost per result":"")+".");}if(cheapRow.costPer<Infinity&&cheapRow.adsetName!==bestRow.adsetName){p.push("Most cost-efficient: \\'"+cheapRow.adsetName+"\\' at "+fR(cheapRow.costPer)+" per result.");}return p.join(" ");})()}</Insight>
              </div>);
            });

            return <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{allRows.length}</div></Glass>
                <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} invested</div></Glass>
                <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
              </div>
              {objSections3}
            </div>;
          })()}
        </div>)}

'''

c = c[:start] + new_targeting + c[end:]
print("Targeting v3 inserted")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
