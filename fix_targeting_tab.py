with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# STEP 1: Add adsets state and fetch
old_pages_state = 'var ps=useState([]),pages=ps[0],setPages=ps[1];'
new_pages_state = 'var ps=useState([]),pages=ps[0],setPages=ps[1];\n  var as2=useState([]),adsets=as2[0],setAdsets=as2[1];'
c = c.replace(old_pages_state, new_pages_state)

# STEP 2: Fetch adsets in fetchData
old_fetch_end = 'if(d.pages){setPages(d.pages);}'
new_fetch_end = 'if(d.pages){setPages(d.pages);}}).catch(function(){});fetch(API+"/api/adsets?from="+df+"&to="+dt).then(function(r){return r.json();}).then(function(d2){if(d2.adsets){setAdsets(d2.adsets);}'
c = c.replace(old_fetch_end, new_fetch_end)

# STEP 3: Add Targeting tab to tab list
old_tabs = '{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)}'
new_tabs = '{id:"bof",label:"Objectives",icon:Ic.target(P.rose,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}'
c = c.replace(old_tabs, new_tabs)

# STEP 4: Add Targeting tab content before community tab
targeting_tab = r"""
        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" \u00b7 Adset-Level Analysis"} accent={P.solar}/>
          {(function(){
            var selIds=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;}).map(function(x){return x.rawCampaignId||x.campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"");});
            var filtered=adsets.filter(function(a){
              for(var si=0;si<selIds.length;si++){if(a.campaignId===selIds[si])return true;}
              return false;
            }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
            if(filtered.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view adset targeting performance.</div>;

            var sorted=filtered.slice().sort(function(a,b){return parseFloat(b.spend||0)-parseFloat(a.spend||0);});
            var totalSpend=sorted.reduce(function(a,r){return a+parseFloat(r.spend||0);},0);
            var totalImps=sorted.reduce(function(a,r){return a+parseFloat(r.impressions||0);},0);
            var totalClicks=sorted.reduce(function(a,r){return a+parseFloat(r.clicks||0);},0);
            var totalReach=sorted.reduce(function(a,r){return a+parseFloat(r.reach||0);},0);
            var blendedCtr=totalImps>0?(totalClicks/totalImps*100):0;
            var blendedCpc=totalClicks>0?totalSpend/totalClicks:0;

            var getObj=function(name){
              var n=(name||"").toLowerCase();
              if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";
              if(n.indexOf("follower")>=0)return "Followers & Likes";
              if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";
              if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
              if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";
              return "Traffic";
            };

            var getResult=function(a,obj){
              if(obj==="Leads")return parseFloat(a.leads||0);
              if(obj==="Followers & Likes")return parseFloat(a.follows||0)+parseFloat(a.pageLikes||0);
              if(obj==="Landing Page Clicks")return parseFloat(a.landingPageViews||0)>0?parseFloat(a.landingPageViews||0):parseFloat(a.clicks||0);
              return parseFloat(a.clicks||0);
            };

            var rows=sorted.map(function(a){
              var obj=getObj(a.campaignName);
              var result=getResult(a,obj);
              var spend=parseFloat(a.spend||0);
              var clicks=parseFloat(a.clicks||0);
              var imps=parseFloat(a.impressions||0);
              var ctr=imps>0?(clicks/imps*100):0;
              var cpc=clicks>0?spend/clicks:0;
              var costPer=result>0?spend/result:0;
              return{adsetName:a.adsetName,campaignName:a.campaignName,platform:a.platform,objective:obj,spend:spend,clicks:clicks,impressions:imps,reach:parseFloat(a.reach||0),ctr:ctr,cpc:cpc,result:result,costPer:costPer,follows:parseFloat(a.follows||0),pageLikes:parseFloat(a.pageLikes||0),leads:parseFloat(a.leads||0)};
            });

            var chartData=rows.slice(0,10).map(function(r){
              var short=r.adsetName.length>25?r.adsetName.substring(0,22)+"...":r.adsetName;
              return{name:short,Clicks:r.clicks,CPC:r.cpc,CTR:r.ctr,Spend:r.spend};
            });

            var objectives=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objColors={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};

            var objSections=[];
            objectives.forEach(function(objName){
              var objRows=rows.filter(function(r){return r.objective===objName;});
              if(objName==="Landing Page Clicks"){var tr=rows.filter(function(r){return r.objective==="Traffic";});objRows=objRows.concat(tr);}
              if(objRows.length===0)return;
              var oc=objColors[objName]||P.ember;
              var oSpend=objRows.reduce(function(a,r){return a+r.spend;},0);
              var oClicks=objRows.reduce(function(a,r){return a+r.clicks;},0);
              var oResults=objRows.reduce(function(a,r){return a+r.result;},0);
              var oCostPer=oResults>0?oSpend/oResults:0;
              var oImps=objRows.reduce(function(a,r){return a+r.impressions;},0);
              var oCtr=oImps>0?(oClicks/oImps*100):0;

              var bestAdset=objRows.reduce(function(a,r){return r.result>a.result?r:a;},{result:0});
              var cheapest=objRows.filter(function(r){return r.costPer>0;}).reduce(function(a,r){return r.costPer<a.costPer?r:a;},{costPer:Infinity});

              objSections.push(<div key={objName} style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{width:12,height:12,borderRadius:"50%",background:oc}}></span><span style={{fontSize:14,fontWeight:800,color:oc,fontFamily:ff}}>{objName+" by Adset"}</span></div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset","Platform","Spend","Impressions","Clicks",objName==="Followers & Likes"?"Follows/Likes":objName==="Leads"?"Leads":"Results","Cost Per","CTR %"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{objRows.sort(function(a,b){return b.result-a.result;}).map(function(r,ri){var isBest=ri===0&&r.result>0;return <tr key={ri} style={{background:ri%2===0?oc+"08":"transparent"}}>
                    <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:220,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.adsetName}{isBest&&<span style={{background:oc,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginLeft:6}}>BEST</span>}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":"TT"}</span></td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fR(r.spend)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(r.result)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{r.ctr.toFixed(2)+"%"}</td>
                  </tr>;})}
                  <tr style={{background:oc+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc,fontSize:12}}>Total</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fR(oSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(oImps)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(oClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc}}>{fmt(oResults)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(oCostPer)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.txt}}>{oCtr.toFixed(2)+"%"}</td></tr>
                  </tbody>
                </table>
                <Insight title={objName+" Targeting Analysis"} accent={oc} icon={Ic.radar(oc,16)}>{(function(){var p=[];p.push(objName+" campaigns have "+objRows.length+" active adsets with "+fR(oSpend)+" total investment delivering "+fmt(oResults)+" results at "+fR(oCostPer)+" blended cost per result.");if(bestAdset.result>0){p.push("The top performing adset is '"+bestAdset.adsetName+"' on "+bestAdset.platform+" with "+fmt(bestAdset.result)+" results at "+fR(bestAdset.costPer)+" cost per result.");}if(cheapest.costPer<Infinity&&cheapest.adsetName!==bestAdset.adsetName){p.push("The most cost-efficient adset is '"+cheapest.adsetName+"' at "+fR(cheapest.costPer)+" cost per result.");}var underperformers=objRows.filter(function(r){return r.spend>500&&r.result===0;});if(underperformers.length>0){p.push("Strategy: "+underperformers.length+" adset"+(underperformers.length>1?"s":"")+" with spend above R500 have produced zero results. Consider pausing these and reallocating budget to the top performers.");}else if(objRows.length>2){var avgCost=oCostPer;var expensive=objRows.filter(function(r){return r.costPer>avgCost*1.5&&r.result>0;});if(expensive.length>0){p.push("Strategy: "+expensive.length+" adset"+(expensive.length>1?"s":"")+" are delivering results at more than 1.5x the average cost. Consider reducing budget on these and shifting to more efficient adsets.");}}return p.join(" ");})()}</Insight>
              </div>);
            });

            return <div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ENGAGEMENT BY ADSET</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TARGETING PERFORMANCE ANALYSIS</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{sorted.length}</div></Glass>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} spend</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <thead><tr>{["Adset","Platform","Campaign","Spend","Impressions","Clicks","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted.map(function(r,ri){var best=ri===0;return <tr key={ri} style={{background:ri%2===0?"rgba(255,171,0,0.04)":"transparent"}}>
                    <td title={r.adsetName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:200,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.adsetName}{best&&<span style={{background:P.solar,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginLeft:6}}>TOP SPEND</span>}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:r.platform==="Google Display"?P.gd:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":r.platform==="Google Display"?"GD":"TT"}</span></td>
                    <td title={r.campaignName} style={{padding:"10px 12px",fontSize:10,color:P.sub,border:"1px solid "+P.rule,maxWidth:160,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.campaignName}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fmt(r.clicks)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.cpc<2?P.mint:P.txt}}>{fR(r.cpc)}</td>
                  </tr>;})}
                  <tr style={{background:"rgba(255,171,0,0.12)"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:P.solar,fontSize:12}} colSpan={3}>Total ({sorted.length} adsets)</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fR(totalSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fmt(totalImps)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fmt(totalClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{blendedCtr.toFixed(2)+"%"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fR(blendedCpc)}</td></tr>
                  </tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Clicks by Adset (Top 10)</div><ResponsiveContainer width="100%" height={220}><BarChart data={chartData} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><YAxis type="category" dataKey="name" width={130} tick={{fontSize:9,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Clicks" fill={P.mint} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>CTR % by Adset (Top 10)</div><ResponsiveContainer width="100%" height={220}><BarChart data={chartData} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return v.toFixed(1)+"%";}}/><YAxis type="category" dataKey="name" width={130} tick={{fontSize:9,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CTR" fill={P.solar} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title="Adset Engagement Analysis" accent={P.solar} icon={Ic.radar(P.solar,16)}>{(function(){var p=[];p.push("Across "+sorted.length+" active adsets, the campaign generated "+fmt(totalClicks)+" clicks from "+fmt(totalImps)+" impressions at "+blendedCtr.toFixed(2)+"% blended Click Through Rate and "+fR(blendedCpc)+" blended Cost Per Click.");var top3=sorted.slice(0,3);if(top3.length>0){p.push("The top 3 adsets by spend are: "+top3.map(function(r){return "'"+r.adsetName+"' ("+r.platform+", "+fR(r.spend)+", "+r.ctr.toFixed(2)+"% CTR)";}).join(", ")+".");}var highCtr=sorted.filter(function(r){return r.clicks>50;}).sort(function(a,b){return b.ctr-a.ctr;}).slice(0,3);if(highCtr.length>0&&highCtr[0].ctr>blendedCtr){p.push("The highest Click Through Rate adsets are: "+highCtr.map(function(r){return "'"+r.adsetName+"' at "+r.ctr.toFixed(2)+"%";}).join(", ")+". These audiences show the strongest creative resonance.");}var lowPerf=sorted.filter(function(r){return r.spend>300&&r.ctr<0.5&&r.impressions>5000;});if(lowPerf.length>0){p.push("Strategy: "+lowPerf.length+" adset"+(lowPerf.length>1?"s":"")+" with meaningful spend are delivering below 0.5% Click Through Rate. Review targeting and creative alignment for these audiences, or consider pausing and reallocating to higher-performing adsets.");}return p.join(" ");})()}</Insight>
              </div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE RESULTS BY ADSET</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TARGETING EFFICIENCY PER OBJECTIVE</div></div>
                {objSections}
              </div>
            </div>;
          })()}
        </div>)}
"""

# Insert before community tab
community_marker = '{tab==="community"&&(<div>'
idx = c.find(community_marker)
if idx > 0:
    c = c[:idx] + targeting_tab + "\n\n        " + c[idx:]
    print("Targeting tab added")
else:
    print("Could not find community tab marker")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
