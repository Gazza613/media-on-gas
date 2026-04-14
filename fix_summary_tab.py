with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Step 1: Add Summary as first tab
old_tabs = 'var tabs=[{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}]'
new_tabs = 'var tabs=[{id:"summary",label:"Summary",icon:Ic.crown(P.ember,16)},{id:"overview",label:"Reporting",icon:Ic.chart(P.orchid,16)},{id:"community",label:"Community",icon:Ic.users(P.mint,16)},{id:"targeting",label:"Targeting",icon:Ic.radar(P.solar,16)}]'
c = c.replace(old_tabs, new_tabs)
print("Step 1: Summary tab added as first")

# Step 2: Default to summary tab
old_default = 'var ts2=useState("overview")'
new_default = 'var ts2=useState("summary")'
if old_default in c:
    c = c.replace(old_default, new_default)
    print("Step 2: Default tab set to summary")
else:
    print("Step 2: Could not find default tab state")

# Step 3: Insert Summary tab content before overview tab
insert_point = c.find('        {tab==="overview"&&(<div>')

summary_tab = """        {tab==="summary"&&(<div>
          <SH icon={Ic.crown(P.ember,20)} title="Campaign Summary" sub={df+" to "+dt+" \\u00b7 Executive Performance Overview"} accent={P.ember}/>
          {(function(){
            var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view summary.</div>;
            var totalDays2=Math.max(1,Math.round((new Date(dt)-new Date(df))/86400000)+1);
            var dailySpend=computed.totalSpend>0?computed.totalSpend/totalDays2:0;
            var dailyClicks=computed.totalClicks>0?computed.totalClicks/totalDays2:0;
            var dailyImps=computed.totalImps>0?computed.totalImps/totalDays2:0;

            var objectives4={};sel.forEach(function(camp){
              var n=(camp.campaignName||"").toLowerCase();
              var obj="Traffic";
              if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)obj="App Store Clicks";
              else if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)obj="Followers & Likes";
              else if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)obj="Leads";
              else if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)obj="Landing Page Clicks";
              if(!objectives4[obj])objectives4[obj]={spend:0,clicks:0,imps:0,results:0,campaigns:0};
              objectives4[obj].spend+=parseFloat(camp.spend||0);
              objectives4[obj].clicks+=parseFloat(camp.clicks||0);
              objectives4[obj].imps+=parseFloat(camp.impressions||0);
              objectives4[obj].campaigns+=1;
              var result=obj==="Leads"?parseFloat(camp.leads||0):obj==="Followers & Likes"?parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0):parseFloat(camp.clicks||0);
              objectives4[obj].results+=result;
            });

            var platBreak={};sel.forEach(function(camp){
              var pl=camp.platform;
              if(!platBreak[pl])platBreak[pl]={spend:0,clicks:0,imps:0,reach:0};
              platBreak[pl].spend+=parseFloat(camp.spend||0);
              platBreak[pl].clicks+=parseFloat(camp.clicks||0);
              platBreak[pl].imps+=parseFloat(camp.impressions||0);
              platBreak[pl].reach+=parseFloat(camp.reach||0);
            });

            var topObj=Object.keys(objectives4).sort(function(a,b){return objectives4[b].results-objectives4[a].results;})[0];
            var topPlat=Object.keys(platBreak).sort(function(a,b){return platBreak[b].spend-platBreak[a].spend;})[0];
            var cheapestPlat=Object.keys(platBreak).filter(function(k){return platBreak[k].clicks>50;}).sort(function(a,b){var aCpc=platBreak[a].clicks>0?platBreak[a].spend/platBreak[a].clicks:Infinity;var bCpc=platBreak[b].clicks>0?platBreak[b].spend/platBreak[b].clicks:Infinity;return aCpc-bCpc;})[0]||"";

            var standouts=[];
            if(computed.blendedCpm>0&&computed.blendedCpm<12)standouts.push({label:"CPM",value:fR(computed.blendedCpm),note:"Below SA benchmark",color:P.mint,icon:"down"});
            else if(computed.blendedCpm>=12&&computed.blendedCpm<=25)standouts.push({label:"CPM",value:fR(computed.blendedCpm),note:"Within SA benchmark",color:P.solar,icon:"ok"});
            else if(computed.blendedCpm>25)standouts.push({label:"CPM",value:fR(computed.blendedCpm),note:"Above SA benchmark",color:P.rose,icon:"up"});

            var blCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;
            if(blCpc>0&&blCpc<1.5)standouts.push({label:"CPC",value:fR(blCpc),note:"Strong efficiency",color:P.mint,icon:"down"});
            else if(blCpc>=1.5&&blCpc<=3)standouts.push({label:"CPC",value:fR(blCpc),note:"Within range",color:P.solar,icon:"ok"});
            else if(blCpc>3)standouts.push({label:"CPC",value:fR(blCpc),note:"Above benchmark",color:P.rose,icon:"up"});

            if(m.frequency>0){
              if(m.frequency>4)standouts.push({label:"FREQUENCY",value:m.frequency.toFixed(2)+"x",note:"Fatigue ceiling breached",color:P.rose,icon:"up"});
              else if(m.frequency>3)standouts.push({label:"FREQUENCY",value:m.frequency.toFixed(2)+"x",note:"Approaching fatigue",color:P.warning,icon:"up"});
              else if(m.frequency>=2)standouts.push({label:"FREQUENCY",value:m.frequency.toFixed(2)+"x",note:"Optimal recall window",color:P.mint,icon:"ok"});
              else standouts.push({label:"FREQUENCY",value:m.frequency.toFixed(2)+"x",note:"Early phase",color:P.cyan,icon:"ok"});
            }

            var blCtr=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;
            if(blCtr>2)standouts.push({label:"CTR",value:blCtr.toFixed(2)+"%",note:"Above 2% benchmark",color:P.mint,icon:"up"});
            else if(blCtr>=1)standouts.push({label:"CTR",value:blCtr.toFixed(2)+"%",note:"Within healthy range",color:P.solar,icon:"ok"});
            else if(blCtr>0)standouts.push({label:"CTR",value:blCtr.toFixed(2)+"%",note:"Below 1% benchmark",color:P.rose,icon:"down"});

            var objKeys=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol4={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objCL4={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};

            var platOrd4={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};
            var platCol4={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};

            var platChartData=Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).map(function(pl){return{name:pl,Spend:platBreak[pl].spend,Impressions:platBreak[pl].imps,Clicks:platBreak[pl].clicks};});

            var objChartData=objKeys.filter(function(k){return objectives4[k]&&objectives4[k].results>0;}).map(function(k){return{name:k,Results:objectives4[k].results,Spend:objectives4[k].spend,CostPer:objectives4[k].results>0?objectives4[k].spend/objectives4[k].results:0};});

            return <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL INVESTMENT</div><div style={{fontSize:24,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(computed.totalSpend)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(dailySpend)+"/day across "+totalDays2+" days"}</div></Glass>
                <Glass accent={P.cyan} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>ADS SERVED</div><div style={{fontSize:24,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(computed.totalImps)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(Math.round(dailyImps))+"/day"}</div></Glass>
                <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fmt(Math.round(dailyClicks))+"/day"}</div></Glass>
                <Glass accent={P.orchid} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>PLATFORMS</div><div style={{fontSize:24,fontWeight:900,color:P.orchid,fontFamily:fm}}>{Object.keys(platBreak).length}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{sel.length+" campaigns"}</div></Glass>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>PERFORMANCE SIGNALS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>KEY METRICS VS SA INDUSTRY BENCHMARKS</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat("+standouts.length+",1fr)",gap:14,marginBottom:16}}>
                  {standouts.map(function(s,si){return <div key={si} style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"20px 16px",textAlign:"center",border:"1px solid "+s.color+"30"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:8}}>{s.label}</div><div style={{fontSize:28,fontWeight:900,color:s.color,fontFamily:fm}}>{s.value}</div><div style={{fontSize:10,color:s.color,fontFamily:fm,marginTop:8,fontWeight:700}}>{s.note}</div></div>;})}
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:28}}>
                <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",border:"1px solid "+P.rule}}>
                  <div style={{textAlign:"center",padding:"18px 0 14px"}}><span style={{fontSize:14,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>SPEND BY PLATFORM</span></div>
                  <ResponsiveContainer width="100%" height={200}><BarChart data={platChartData} barSize={40}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:10,fill:"rgba(255,255,255,0.7)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Spend" fill={P.ember} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
                </div>
                <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",border:"1px solid "+P.rule}}>
                  <div style={{textAlign:"center",padding:"18px 0 14px"}}><span style={{fontSize:14,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>RESULTS BY OBJECTIVE</span></div>
                  <ResponsiveContainer width="100%" height={200}><BarChart data={objChartData} barSize={40}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis dataKey="name" tick={{fontSize:9,fill:"rgba(255,255,255,0.7)",fontFamily:fm}} stroke="transparent"/><YAxis tick={{fontSize:9,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Results" fill={P.mint} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
                </div>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE PERFORMANCE</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>RESULTS BY CAMPAIGN OBJECTIVE</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(4,objKeys.filter(function(k){return objectives4[k];}).length)+",1fr)",gap:14,marginBottom:16}}>
                  {objKeys.filter(function(k){return objectives4[k];}).map(function(objName){
                    var od=objectives4[objName];var oc4=objCol4[objName]||P.ember;var costPer=od.results>0?od.spend/od.results:0;
                    var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                    var bmStatus=costPer>0?benchLabel(costPer,bm):"";
                    return <div key={objName} style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"18px 16px",border:"1px solid "+oc4+"30"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12}}><span style={{width:10,height:10,borderRadius:"50%",background:oc4}}></span><span style={{fontSize:11,fontWeight:800,color:oc4,fontFamily:ff}}>{objName}</span></div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                        <div><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>RESULTS</div><div style={{fontSize:20,fontWeight:900,color:oc4,fontFamily:fm}}>{fmt(od.results)}</div></div>
                        <div><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>{objCL4[objName]||"COST PER"}</div><div style={{fontSize:20,fontWeight:900,color:costPer>0?P.ember:P.dim,fontFamily:fm}}>{costPer>0?fR(costPer):"\\u2014"}</div></div>
                        <div><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>SPEND</div><div style={{fontSize:12,fontWeight:700,color:P.txt,fontFamily:fm}}>{fR(od.spend)}</div></div>
                        <div><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>BENCHMARK</div><div style={{fontSize:9,fontWeight:600,color:costPer>0&&bm&&costPer<=bm.mid?P.mint:costPer>bm.high?P.rose:P.solar,fontFamily:fm}}>{bmStatus||"\\u2014"}</div></div>
                      </div>
                    </div>;})}
                </div>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>PLATFORM CONTRIBUTION</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>INVESTMENT & EFFICIENCY BY PLATFORM</div></div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <thead><tr>{["Platform","Spend","Share","Impressions","Clicks","CPC","CTR %","CPM"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).map(function(pl,pi){
                    var pb=platBreak[pl];var pc5=platCol4[pl]||P.ember;var plCpc=pb.clicks>0?pb.spend/pb.clicks:0;var plCtr=pb.imps>0?(pb.clicks/pb.imps*100):0;var plCpm=pb.imps>0?(pb.spend/pb.imps*1000):0;var share=computed.totalSpend>0?((pb.spend/computed.totalSpend)*100):0;
                    var plBmCpc=pl==="TikTok"?benchmarks.tiktok.cpc:pl==="Google Display"?benchmarks.google.cpc:benchmarks.meta.cpc;
                    var plBmCpm=pl==="TikTok"?benchmarks.tiktok.cpm:pl==="Google Display"?benchmarks.google.cpm:benchmarks.meta.cpm;
                    return <tr key={pi} style={{background:pc5+"08"}}>
                      <td style={{padding:"12px",border:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:10,height:10,borderRadius:"50%",background:pc5}}></span><span style={{fontSize:12,fontWeight:700,color:pc5,fontFamily:ff}}>{pl}</span></div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(pb.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{share.toFixed(0)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(pb.imps)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(pb.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:plCpc>0&&plCpc<=plBmCpc.mid?P.mint:plCpc>plBmCpc.high?P.rose:P.txt}}>{plCpc>0?fR(plCpc):"\\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:plCtr>2?P.mint:plCtr>1?P.txt:plCtr>0?P.warning:P.dim}}>{plCtr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:plCpm>0&&plCpm<=plBmCpm.mid?P.mint:plCpm>plBmCpm.high?P.rose:P.txt}}>{plCpm>0?fR(plCpm):"\\u2014"}</td>
                    </tr>;})}
                  </tbody>
                </table>
              </div>

              <Insight title="Executive Summary" accent={P.ember} icon={Ic.crown(P.ember,16)}>{(function(){
                var p=[];
                p.push("Campaign period: "+df+" to "+dt+" ("+totalDays2+" days). Total investment: "+fR(computed.totalSpend)+" across "+Object.keys(platBreak).length+" platforms and "+sel.length+" campaigns.");

                p.push("The campaign delivered "+fmt(computed.totalImps)+" impressions at "+fR(computed.blendedCpm)+" blended CPM, "+benchLabel(computed.blendedCpm,benchmarks.meta.cpm)+". "+fmt(computed.totalClicks)+" clicks were generated at "+fR(blCpc)+" blended CPC"+(blCpc>0?", "+benchLabel(blCpc,benchmarks.meta.cpc):"")+", with "+blCtr.toFixed(2)+"% blended CTR.");

                if(m.impressions>0&&m.frequency>0){
                  p.push("Meta reached "+fmt(m.reach)+" unique individuals at "+m.frequency.toFixed(2)+"x frequency."+(freqStatus==="critical"?" Frequency has breached the 4x fatigue ceiling, meaning the audience is being overserved. Creative rotation and audience expansion are needed urgently to prevent further CTR decay and cost inflation.":freqStatus==="warning"?" Frequency is approaching the 3x fatigue threshold. Proactive creative rotation within 48 hours is recommended to maintain performance.":freqStatus==="healthy"?" Frequency sits within the optimal 2-3x recall-building window, balancing reach depth with efficient delivery.":" Frequency indicates early-stage delivery with headroom to deepen reach."));
                }

                Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).forEach(function(pl){
                  var pb2=platBreak[pl];var plShare=computed.totalSpend>0?((pb2.spend/computed.totalSpend)*100).toFixed(0):"0";var plImpShare=computed.totalImps>0?((pb2.imps/computed.totalImps)*100).toFixed(0):"0";var plCpc2=pb2.clicks>0?pb2.spend/pb2.clicks:0;var plCpm2=pb2.imps>0?(pb2.spend/pb2.imps*1000):0;
                  var plBm=pl==="TikTok"?benchmarks.tiktok:pl==="Google Display"?benchmarks.google:benchmarks.meta;
                  if(pb2.spend>0&&pb2.imps>=5000){
                    p.push(pl+" receives "+plShare+"% of budget ("+fR(pb2.spend)+") delivering "+plImpShare+"% of impressions ("+fmt(pb2.imps)+") at "+fR(plCpm2)+" CPM, "+benchLabel(plCpm2,plBm.cpm)+"."+(pb2.clicks>=50?" "+fmt(pb2.clicks)+" clicks at "+fR(plCpc2)+" CPC, "+benchLabel(plCpc2,plBm.cpc)+".":""));
                  }else if(pb2.spend>0){
                    p.push(pl+" has "+fR(pb2.spend)+" invested ("+plShare+"% of budget) with "+fmt(pb2.imps)+" impressions. Volume is insufficient for a reliable performance assessment.");
                  }
                });

                objKeys.forEach(function(objName){
                  if(!objectives4[objName])return;
                  var od2=objectives4[objName];var costPer2=od2.results>0?od2.spend/od2.results:0;
                  var bm2=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                  if(od2.results>=10){
                    p.push(objName+": "+fmt(od2.results)+" results at "+fR(costPer2)+" cost per result from "+fR(od2.spend)+" investment, "+benchLabel(costPer2,bm2)+". This is confirmed at scale with meaningful volume.");
                  }else if(od2.results>0){
                    p.push(objName+": "+fmt(od2.results)+" results at "+fR(costPer2)+" cost per result from "+fR(od2.spend)+" investment. Volume is below the 10-result threshold for a confirmed performance read.");
                  }else if(od2.spend>0){
                    p.push(objName+": "+fR(od2.spend)+" invested with no measurable results yet. Requires further delivery or conversion tracking review.");
                  }
                });

                if(adsets.length>0){
                  var selAdsets=adsets.filter(function(a){
                    for(var si2=0;si2<sel.length;si2++){if(a.campaignName===sel[si2].campaignName||a.campaignId===(sel[si2].rawCampaignId||sel[si2].campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"")))return true;}
                    return false;
                  });
                  var zeroAdsets=selAdsets.filter(function(a){return parseFloat(a.spend||0)>200&&(parseFloat(a.clicks||0)===0||(parseFloat(a.leads||0)===0&&parseFloat(a.follows||0)===0&&parseFloat(a.pageLikes||0)===0));});
                  if(zeroAdsets.length>0){
                    var zeroSpend2=zeroAdsets.reduce(function(a,r){return a+parseFloat(r.spend||0);},0);
                    p.push("Targeting: "+zeroAdsets.length+" adset"+(zeroAdsets.length>1?"s":"")+" have consumed "+fR(zeroSpend2)+" without producing measurable results. This represents potential budget misallocation that should be reviewed in the Targeting tab.");
                  }
                }

                return p.join(" ");
              })()}</Insight>
            </div>;
          })()}
        </div>)}

"""

c = c[:insert_point] + summary_tab + c[insert_point:]
print("Step 3: Summary tab content inserted")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
