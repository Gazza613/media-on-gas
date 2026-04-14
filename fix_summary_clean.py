with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find entire summary tab
start = c.find('        {tab==="summary"&&(<div>')
end = c.find('        {tab==="overview"&&(<div>')

print("Summary tab:", start, "to", end, "=", end-start, "chars")

new_summary = """        {tab==="summary"&&(<div>
          <SH icon={Ic.crown(P.ember,20)} title="Campaign Summary" sub={df+" to "+dt+" \\u00b7 Executive Performance Overview"} accent={P.ember}/>
          {(function(){
            var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
            if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view summary.</div>;
            var totalDays2=Math.max(1,Math.round((new Date(dt)-new Date(df))/86400000)+1);
            var dailySpend=computed.totalSpend>0?computed.totalSpend/totalDays2:0;
            var blCpc=computed.totalClicks>0?computed.totalSpend/computed.totalClicks:0;
            var blCtr=computed.totalImps>0?(computed.totalClicks/computed.totalImps*100):0;

            var objectives4={};sel.forEach(function(camp){
              var n=(camp.campaignName||"").toLowerCase();var obj="Traffic";
              if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)obj="App Store Clicks";
              else if(n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)obj="Followers & Likes";
              else if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)obj="Leads";
              else if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)obj="Landing Page Clicks";
              if(!objectives4[obj])objectives4[obj]={spend:0,clicks:0,imps:0,results:0};
              objectives4[obj].spend+=parseFloat(camp.spend||0);objectives4[obj].clicks+=parseFloat(camp.clicks||0);objectives4[obj].imps+=parseFloat(camp.impressions||0);
              var result=obj==="Leads"?parseFloat(camp.leads||0):obj==="Followers & Likes"?parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0):parseFloat(camp.clicks||0);
              objectives4[obj].results+=result;
            });

            var platBreak={};sel.forEach(function(camp){
              var pl=camp.platform;if(!platBreak[pl])platBreak[pl]={spend:0,clicks:0,imps:0,reach:0};
              platBreak[pl].spend+=parseFloat(camp.spend||0);platBreak[pl].clicks+=parseFloat(camp.clicks||0);platBreak[pl].imps+=parseFloat(camp.impressions||0);platBreak[pl].reach+=parseFloat(camp.reach||0);
            });

            var platOrd4={"Facebook":0,"Instagram":1,"TikTok":2,"Google Display":3};
            var platCol4={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt,"Google Display":P.gd};
            var objKeys=["App Store Clicks","Landing Page Clicks","Leads","Followers & Likes"];
            var objCol4={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Followers & Likes":P.tt};
            var objCL4={"App Store Clicks":"CPC","Landing Page Clicks":"CPC","Leads":"CPL","Followers & Likes":"CPF"};

            return <div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL INVESTMENT</div><div style={{fontSize:24,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(computed.totalSpend)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(dailySpend)+"/day \\u00b7 "+totalDays2+" days"}</div></Glass>
                <Glass accent={P.cyan} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>ADS SERVED</div><div style={{fontSize:24,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(computed.totalImps)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{Object.keys(platBreak).length+" platforms"}</div></Glass>
                <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:24,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{sel.length+" campaigns"}</div></Glass>
                <Glass accent={P.orchid} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:6}}>BLENDED CPM</div><div style={{fontSize:24,fontWeight:900,color:computed.blendedCpm<12?P.mint:computed.blendedCpm<25?P.solar:P.rose,fontFamily:fm}}>{fR(computed.blendedCpm)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{benchLabel(computed.blendedCpm,benchmarks.meta.cpm)}</div></Glass>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 14px"}}><span style={{width:14,height:14,borderRadius:"50%",background:P.cyan}}></span><span style={{fontSize:16,fontWeight:900,color:P.cyan,fontFamily:ff,letterSpacing:1}}>AWARENESS</span></div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Platform","Impressions","Reach","Frequency","CPM","CPM Benchmark"].map(function(h,hi){return <th key={hi} style={{padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).map(function(pl,pi){
                    var pb=platBreak[pl];var pc=platCol4[pl]||P.ember;var plCpm=pb.imps>0?(pb.spend/pb.imps*1000):0;var plFreq=pb.reach>0?pb.imps/pb.reach:0;
                    var plBmCpm=pl==="TikTok"?benchmarks.tiktok.cpm:pl==="Google Display"?benchmarks.google.cpm:benchmarks.meta.cpm;
                    return <tr key={pi} style={{background:pc+"08"}}>
                      <td style={{padding:"10px 12px",border:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:"50%",background:pc}}></span><span style={{fontSize:11,fontWeight:700,color:pc,fontFamily:ff}}>{pl}</span></div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fmt(pb.imps)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(pb.reach)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:plFreq>4?P.rose:plFreq>3?P.warning:plFreq>2?P.mint:P.txt}}>{plFreq>0?plFreq.toFixed(2)+"x":"\\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:plCpm>0&&plCpm<=plBmCpm.mid?P.mint:plCpm>plBmCpm.high?P.rose:P.txt}}>{plCpm>0?fR(plCpm):"\\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:9,color:P.sub}}>{plBmCpm.label}</td>
                    </tr>;})}
                  </tbody>
                </table>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 14px"}}><span style={{width:14,height:14,borderRadius:"50%",background:P.mint}}></span><span style={{fontSize:16,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:1}}>ENGAGEMENT</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={P.mint} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:blCpc>0&&blCpc<1.5?P.mint:blCpc<3?P.solar:P.ember,fontFamily:fm}}>{fR(blCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{benchLabel(blCpc,benchmarks.meta.cpc)}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CTR</div><div style={{fontSize:22,fontWeight:900,color:blCtr>2?P.mint:blCtr>1?P.txt:P.warning,fontFamily:fm}}>{blCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(m.reach+t.reach+computed.gd.reach)}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr>{["Platform","Clicks","CPC","CTR %","Verdict"].map(function(h,hi){return <th key={hi} style={{padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl,pi){
                    var pb=platBreak[pl];var pc=platCol4[pl]||P.ember;var plCpc=pb.clicks>0?pb.spend/pb.clicks:0;var plCtr=pb.imps>0?(pb.clicks/pb.imps*100):0;
                    var plBm=pl==="TikTok"?benchmarks.tiktok.cpc:pl==="Google Display"?benchmarks.google.cpc:benchmarks.meta.cpc;
                    var verdict=plCpc>0&&plCpc<=plBm.low?"Excellent":plCpc<=plBm.mid?"Good":plCpc<=plBm.high?"Average":"Review";
                    var vCol=verdict==="Excellent"||verdict==="Good"?P.mint:verdict==="Average"?P.solar:P.rose;
                    return <tr key={pi} style={{background:pc+"08"}}>
                      <td style={{padding:"10px 12px",border:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:"50%",background:pc}}></span><span style={{fontSize:11,fontWeight:700,color:pc,fontFamily:ff}}>{pl}</span></div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fmt(pb.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:vCol}}>{fR(plCpc)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:plCtr>2?P.mint:plCtr>1?P.txt:P.warning}}>{plCtr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:vCol,color:"#fff",fontSize:8,fontWeight:900,padding:"3px 8px",borderRadius:4}}>{verdict.toUpperCase()}</span></td>
                    </tr>;})}
                  </tbody>
                </table>
              </div>

              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 14px"}}><span style={{width:14,height:14,borderRadius:"50%",background:P.rose}}></span><span style={{fontSize:16,fontWeight:900,color:P.rose,fontFamily:ff,letterSpacing:1}}>OBJECTIVES</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat("+Math.min(4,objKeys.filter(function(k){return objectives4[k];}).length)+",1fr)",gap:14}}>
                  {objKeys.filter(function(k){return objectives4[k];}).map(function(objName){
                    var od=objectives4[objName];var oc=objCol4[objName]||P.ember;var costPer=od.results>0?od.spend/od.results:0;
                    var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;
                    var bmStatus=costPer>0&&bm?benchLabel(costPer,bm):"";
                    var bmCol=costPer>0&&bm&&costPer<=bm.mid?P.mint:costPer>0&&bm&&costPer>bm.high?P.rose:P.solar;
                    return <div key={objName} style={{background:"rgba(0,0,0,0.2)",borderRadius:14,padding:"18px 16px",border:"1px solid "+oc+"30"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:oc}}></span><span style={{fontSize:11,fontWeight:800,color:oc,fontFamily:ff}}>{objName}</span></div>
                      <div style={{fontSize:28,fontWeight:900,color:oc,fontFamily:fm,marginBottom:4}}>{fmt(od.results)}</div>
                      <div style={{fontSize:10,color:P.sub,fontFamily:fm,marginBottom:10}}>results from {fR(od.spend)}</div>
                      <div style={{display:"flex",justifyContent:"space-between",borderTop:"1px solid "+P.rule,paddingTop:10}}>
                        <div><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>{objCL4[objName]||"COST PER"}</div><div style={{fontSize:16,fontWeight:900,color:costPer>0?P.ember:P.dim,fontFamily:fm}}>{costPer>0?fR(costPer):"\\u2014"}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.5)",fontFamily:fm,letterSpacing:1}}>BENCHMARK</div><div style={{fontSize:9,fontWeight:700,color:bmCol,fontFamily:fm,marginTop:2}}>{bmStatus||"\\u2014"}</div></div>
                      </div>
                    </div>;})}
                </div>
              </div>

              {adsets.length>0&&(function(){
                var selAdsets2=adsets.filter(function(a){
                  for(var si3=0;si3<sel.length;si3++){if(a.campaignName===sel[si3].campaignName||a.campaignId===(sel[si3].rawCampaignId||sel[si3].campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"")))return true;}
                  return false;
                }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
                if(selAdsets2.length===0)return null;
                var topAdsets=selAdsets2.map(function(a){
                  var spend2=parseFloat(a.spend||0);var clicks2=parseFloat(a.clicks||0);var imps2=parseFloat(a.impressions||0);
                  var result2=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(result2===0)result2=clicks2;
                  var costPer2=result2>0?spend2/result2:0;
                  return{name:a.adsetName,platform:a.platform,spend:spend2,result:result2,costPer:costPer2,ctr:imps2>0?(clicks2/imps2*100):0};
                }).filter(function(a){return a.result>=3&&a.spend>100;}).sort(function(a,b){return(b.result>0?b.result/b.spend:0)-(a.result>0?a.result/a.spend:0);});
                var worstAdsets=selAdsets2.map(function(a){
                  var spend2=parseFloat(a.spend||0);var clicks2=parseFloat(a.clicks||0);var imps2=parseFloat(a.impressions||0);
                  var result2=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);if(result2===0)result2=clicks2;
                  return{name:a.adsetName,platform:a.platform,spend:spend2,result:result2,ctr:imps2>0?(clicks2/imps2*100):0};
                }).filter(function(a){return a.spend>200&&(a.result===0||(a.ctr<0.5&&a.spend>300));}).sort(function(a,b){return b.spend-a.spend;});
                if(topAdsets.length===0&&worstAdsets.length===0)return null;
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 14px"}}><span style={{width:14,height:14,borderRadius:"50%",background:P.solar}}></span><span style={{fontSize:16,fontWeight:900,color:P.solar,fontFamily:ff,letterSpacing:1}}>TARGETING</span></div>
                  {topAdsets.length>0&&<div style={{marginBottom:16}}>
                    <div style={{fontSize:10,fontWeight:800,color:P.mint,fontFamily:fm,letterSpacing:2,marginBottom:10}}>TOP PERFORMERS</div>
                    {topAdsets.slice(0,3).map(function(ta,ti){
                      var pc7=ta.platform==="Facebook"?P.fb:ta.platform==="Instagram"?P.ig:ta.platform==="TikTok"?P.tt:P.gd;
                      return <div key={ti} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:6,background:P.mint+"08",borderLeft:"3px solid "+P.mint,borderRadius:"0 8px 8px 0"}}>
                        <span style={{background:pc7,color:"#fff",fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:8}}>{ta.platform==="Facebook"?"FB":ta.platform==="Instagram"?"IG":ta.platform==="TikTok"?"TT":"GD"}</span>
                        <div style={{flex:1,fontSize:11,fontWeight:600,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{ta.name}</div>
                        <div style={{fontSize:14,fontWeight:900,color:P.mint,fontFamily:fm,whiteSpace:"nowrap"}}>{fmt(ta.result)}</div>
                        <div style={{fontSize:10,color:P.sub,fontFamily:fm,whiteSpace:"nowrap"}}>{fR(ta.costPer)+"/result"}</div>
                      </div>;})}
                  </div>}
                  {worstAdsets.length>0&&<div>
                    <div style={{fontSize:10,fontWeight:800,color:P.rose,fontFamily:fm,letterSpacing:2,marginBottom:10}}>REQUIRES ATTENTION</div>
                    {worstAdsets.slice(0,3).map(function(wa,wi){
                      var pc8=wa.platform==="Facebook"?P.fb:wa.platform==="Instagram"?P.ig:wa.platform==="TikTok"?P.tt:P.gd;
                      return <div key={wi} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",marginBottom:6,background:P.rose+"08",borderLeft:"3px solid "+P.rose,borderRadius:"0 8px 8px 0"}}>
                        <span style={{background:pc8,color:"#fff",fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:8}}>{wa.platform==="Facebook"?"FB":wa.platform==="Instagram"?"IG":wa.platform==="TikTok"?"TT":"GD"}</span>
                        <div style={{flex:1,fontSize:11,fontWeight:600,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{wa.name}</div>
                        <div style={{fontSize:14,fontWeight:900,color:P.rose,fontFamily:fm,whiteSpace:"nowrap"}}>{wa.result===0?"No results":wa.ctr.toFixed(2)+"% CTR"}</div>
                        <div style={{fontSize:10,color:P.sub,fontFamily:fm,whiteSpace:"nowrap"}}>{fR(wa.spend)+" spent"}</div>
                      </div>;})}
                  </div>}
                </div>;
              })()}

              {(function(){
                var matchedPages3=[];var matchedIds3={};
                for(var s3=0;s3<sel.length;s3++){var bestPg3=null;var bestSc3=0;for(var p3=0;p3<pages.length;p3++){var sc4=autoMatchPage(sel[s3].campaignName,pages[p3].name);if(sc4>bestSc3){bestSc3=sc4;bestPg3=pages[p3];}}if(bestPg3&&bestSc3>=2&&matchedIds3[bestPg3.id]!==true){matchedPages3.push(bestPg3);matchedIds3[bestPg3.id]=true;}}
                var fbT2=0;var igT2=0;matchedPages3.forEach(function(mp){fbT2+=mp.followers_count||mp.fan_count||0;if(mp.instagram_business_account){igT2+=mp.instagram_business_account.followers_count||0;}});
                var ttE2=0;sel.forEach(function(camp){if(camp.platform==="TikTok"&&(camp.campaignName||"").toLowerCase().indexOf("follower")>=0){ttE2+=parseFloat(camp.follows||0);}});
                var ttT2=getTtTotal(sel.map(function(x){return x.campaignName;}).join(" "),ttE2);
                var grandT2=fbT2+igT2+ttT2;
                if(grandT2===0)return null;
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,padding:"18px 0 14px"}}><span style={{width:14,height:14,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:16,fontWeight:900,color:P.tt,fontFamily:ff,letterSpacing:1}}>COMMUNITY</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                    <Glass accent={P.mint} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandT2)}</div></Glass>
                    <Glass accent={P.fb} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>FACEBOOK</div><div style={{fontSize:18,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(fbT2)}</div></Glass>
                    <Glass accent={P.ig} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>INSTAGRAM</div><div style={{fontSize:18,fontWeight:900,color:P.ig,fontFamily:fm}}>{fmt(igT2)}</div></Glass>
                    <Glass accent={P.tt} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TIKTOK</div><div style={{fontSize:18,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttT2)}</div></Glass>
                  </div>
                </div>;
              })()}

              <Insight title="Executive Summary" accent={P.ember} icon={Ic.crown(P.ember,16)}>{(function(){
                var p=[];
                p.push(fR(computed.totalSpend)+" invested across "+Object.keys(platBreak).length+" platforms over "+totalDays2+" days, delivering "+fmt(computed.totalImps)+" impressions at "+fR(computed.blendedCpm)+" CPM ("+benchLabel(computed.blendedCpm,benchmarks.meta.cpm)+") and "+fmt(computed.totalClicks)+" clicks at "+fR(blCpc)+" CPC ("+benchLabel(blCpc,benchmarks.meta.cpc)+").");
                if(m.frequency>0){p.push("Meta frequency at "+m.frequency.toFixed(2)+"x is "+(freqStatus==="critical"?"above the 4x fatigue ceiling, requiring urgent creative rotation.":freqStatus==="warning"?"approaching the 3x threshold, proactive creative refresh recommended.":freqStatus==="healthy"?"within the optimal 2-3x recall window.":"in early phase with headroom to build."));}
                objKeys.forEach(function(objName){if(!objectives4[objName])return;var od=objectives4[objName];var cp=od.results>0?od.spend/od.results:0;var bm=objName==="Leads"?benchmarks.meta.cpl:objName==="Followers & Likes"?benchmarks.meta.cpf:benchmarks.meta.cpc;if(od.results>=10){p.push(objName+": "+fmt(od.results)+" results at "+fR(cp)+", "+benchLabel(cp,bm)+". Confirmed at scale.");}else if(od.results>0){p.push(objName+": "+fmt(od.results)+" results at "+fR(cp)+". Below 10-result threshold for confirmed read.");}else if(od.spend>0){p.push(objName+": "+fR(od.spend)+" invested, no results yet.");}});
                return p.join(" ");
              })()}</Insight>
            </div>;
          })()}
        </div>)}

"""

c = c[:start] + new_summary + c[end:]
print("Summary tab rebuilt clean")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
