with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

start_marker = '        {tab==="targeting"&&(<div>'
start_idx = c.find(start_marker)

# Find end by looking for next tab
end_search = c.find('{tab==="community"', start_idx + 100)
end_idx = c.rfind('\n', start_idx, end_search)

if start_idx < 0 or end_idx < 0:
    print("Could not find targeting section")
else:
    print("Found targeting:", start_idx, "to", end_idx)

    new_targeting = r"""        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" \u00b7 Adset-Level Analysis by Objective"} accent={P.solar}/>
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

            var getObj2=function(name){var n=(name||"").toLowerCase();if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";if(n.indexOf("follower")>=0)return "Followers & Likes";if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";return "Traffic";};

            var allRows=filtered.map(function(a){
              var obj=getObj2(a.campaignName);
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

            var platOrder2={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3,"YouTube":4};
            var platColors2={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var platBadge2={"Facebook":"FB","Instagram":"IG","TikTok":"TT","Google Display":"GD"};

            var objectives2=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objColors2={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objResultLabel={"App Store Clicks":"App Clicks","Landing Page Clicks":"LP Clicks","Leads":"Leads","Followers & Likes":"Follows/Likes"};
            var objCostLabel={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};

            var objSections2=[];
            objectives2.forEach(function(objName){
              var objRows2=allRows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){var tr2=allRows.filter(function(r){return r.objective==="Traffic";});objRows2=objRows2.concat(tr2);}
              if(objRows2.length===0)return;
              var oc2=objColors2[objName]||P.ember;

              var sorted3=objRows2.slice().sort(function(a,b){var po=((platOrder2[a.platform]||9)-(platOrder2[b.platform]||9));if(po!==0)return po;return b.spend-a.spend;});

              var oSpend2=sorted3.reduce(function(a,r){return a+r.spend;},0);
              var oClicks2=sorted3.reduce(function(a,r){return a+r.clicks;},0);
              var oResults2=sorted3.reduce(function(a,r){return a+r.result;},0);
              var oImps2=sorted3.reduce(function(a,r){return a+r.impressions;},0);
              var oCtr2=oImps2>0?(oClicks2/oImps2*100):0;
              var oCpc2=oClicks2>0?oSpend2/oClicks2:0;
              var oCostPer2=oResults2>0?oSpend2/oResults2:0;

              var platGroups={};sorted3.forEach(function(r){if(!platGroups[r.platform])platGroups[r.platform]={rows:[],spend:0,clicks:0,imps:0,results:0};platGroups[r.platform].rows.push(r);platGroups[r.platform].spend+=r.spend;platGroups[r.platform].clicks+=r.clicks;platGroups[r.platform].imps+=r.impressions;platGroups[r.platform].results+=r.result;});

              var chartRows=sorted3.slice(0,8).map(function(r){var short=r.adsetName.length>22?r.adsetName.substring(0,19)+"...":r.adsetName;return{name:short,Results:r.result,Spend:r.spend,CostPer:r.costPer};});

              objSections2.push(<div key={objName} style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 16px"}}><span style={{width:14,height:14,borderRadius:"50%",background:oc2}}></span><span style={{fontSize:18,fontWeight:900,color:oc2,fontFamily:ff,letterSpacing:1}}>{objName.toUpperCase()}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{sorted3.length} adsets</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={oc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>SPEND</div><div style={{fontSize:18,fontWeight:900,color:oc2,fontFamily:fm}}>{fR(oSpend2)}</div></Glass>
                  <Glass accent={oc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>IMPRESSIONS</div><div style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:fm}}>{fmt(oImps2)}</div></Glass>
                  <Glass accent={oc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CLICKS</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(oClicks2)}</div></Glass>
                  <Glass accent={oc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objResultLabel[objName]||"RESULTS"}</div><div style={{fontSize:18,fontWeight:900,color:oc2,fontFamily:fm}}>{fmt(oResults2)}</div></Glass>
                  <Glass accent={oc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>{objCostLabel[objName]||"COST PER"}</div><div style={{fontSize:18,fontWeight:900,color:P.ember,fontFamily:fm}}>{oResults2>0?fR(oCostPer2):"\u2014"}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset (Targeting)","Platform","Spend","Impressions","Clicks",objResultLabel[objName]||"Results",objCostLabel[objName]||"Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted3.map(function(r,ri){
                    var pc3=platColors2[r.platform]||P.ember;
                    var isBest2=r===sorted3.reduce(function(a,x){return x.result>a.result?x:a;},{result:-1})&&r.result>0;
                    var prevPlat=ri>0?sorted3[ri-1].platform:null;
                    var showDivider=ri>0&&r.platform!==prevPlat;
                    return [showDivider&&<tr key={"div"+ri}><td colSpan={9} style={{padding:0,border:"none",height:3,background:"linear-gradient(90deg,"+pc3+"40,transparent)"}}></td></tr>,
                    <tr key={ri} style={{background:ri%2===0?pc3+"06":"transparent"}}>
                      <td title={r.adsetName} style={{padding:"12px",fontSize:12,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:280,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest2&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:4,display:"inline-block"}}>BEST</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc3,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBadge2[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:r.result>0?oc2:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"\u2014"}</td>
                    </tr>];})}.flat())}
                    <tr style={{background:oc2+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc2,fontSize:12}} colSpan={2}>Total</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc2}}>{fR(oSpend2)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc2}}>{fmt(oImps2)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc2}}>{fmt(oClicks2)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc2}}>{fmt(oResults2)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{oResults2>0?fR(oCostPer2):"\u2014"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{oCtr2.toFixed(2)+"%"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{fR(oCpc2)}</td></tr>
                  </tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Results by Adset</div><ResponsiveContainer width="100%" height={Math.max(160,chartRows.length*28)}><BarChart data={chartRows} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={oc2} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Cost Per Result by Adset</div><ResponsiveContainer width="100%" height={Math.max(160,chartRows.length*28)}><BarChart data={chartRows.filter(function(x){return x.CostPer>0;}).sort(function(a,b){return a.CostPer-b.CostPer;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CostPer" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title={objName+" Targeting Assessment"} accent={oc2} icon={Ic.radar(oc2,16)}>{(function(){var p=[];var bestAdset2=sorted3.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});var cheapest2=sorted3.filter(function(r){return r.costPer>0;}).reduce(function(a,r){return r.costPer<a.costPer?r:a;},{costPer:Infinity,adsetName:""});p.push(objName+" campaigns operate "+sorted3.length+" adsets across "+(function(){var pp=[];Object.keys(platGroups).forEach(function(k){pp.push(k+" ("+platGroups[k].rows.length+")");});return pp.join(", ");})()+" with "+fR(oSpend2)+" total investment delivering "+fmt(oResults2)+" results at "+fR(oCostPer2)+" blended cost per result.");Object.keys(platGroups).sort(function(a,b){return (platOrder2[a]||9)-(platOrder2[b]||9);}).forEach(function(plat){var pg=platGroups[plat];var pgCtr=pg.imps>0?(pg.clicks/pg.imps*100):0;var pgCostPer=pg.results>0?pg.spend/pg.results:0;p.push(plat+" contributes "+fmt(pg.results)+" results from "+pg.rows.length+" adsets at "+fR(pg.spend)+" spend"+(pg.results>0?" with "+fR(pgCostPer)+" cost per result":"")+" and "+pgCtr.toFixed(2)+"% Click Through Rate.");var platBest=pg.rows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});if(platBest.result>0&&pg.rows.length>1){p.push("The strongest "+plat+" adset is '"+platBest.adsetName+"' delivering "+fmt(platBest.result)+" results at "+fR(platBest.costPer)+" cost per result, "+(platBest.costPer<pgCostPer?"outperforming the "+plat+" average by "+(((pgCostPer-platBest.costPer)/pgCostPer)*100).toFixed(0)+"%.":"in line with the platform average."));}});if(bestAdset2.result>0){p.push("Overall, '"+bestAdset2.adsetName+"' on "+bestAdset2.platform+" is the top performer by volume with "+fmt(bestAdset2.result)+" results.");}if(cheapest2.costPer<Infinity&&cheapest2.adsetName!==bestAdset2.adsetName){p.push("The most cost-efficient adset is '"+cheapest2.adsetName+"' at "+fR(cheapest2.costPer)+" per result, representing the strongest return on investment within this objective.");}return p.join(" ");})()}</Insight>
              </div>);
            });

            return <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{allRows.length}</div></Glass>
                <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} invested</div></Glass>
                <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
              </div>
              {objSections2}
            </div>;
          })()}
        </div>)}

"""

    c = c[:start_idx] + new_targeting + c[end_idx:]
    print("Targeting tab v3 replaced")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
