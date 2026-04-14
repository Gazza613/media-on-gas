with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Insert before Executive Summary insight
insert_before = '              <Insight title="Executive Summary" accent={P.ember} icon={Ic.crown(P.ember,16)}>'

new_sections = """              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:1}}>ENGAGEMENT HIGHLIGHTS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>CLICK PERFORMANCE BY PLATFORM</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(computed.totalClicks)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:blCpc>0&&blCpc<1.5?P.mint:blCpc<3?P.solar:P.ember,fontFamily:fm}}>{fR(blCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{blCpc>0?benchLabel(blCpc,benchmarks.meta.cpc):""}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CTR</div><div style={{fontSize:22,fontWeight:900,color:blCtr>2?P.mint:blCtr>1?P.txt:P.warning,fontFamily:fm}}>{blCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(m.reach+t.reach+computed.gd.reach)}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}>
                  <thead><tr>{["Platform","Clicks","CPC","CTR %","CPC Benchmark","Verdict"].map(function(h,hi){return <th key={hi} style={{padding:"9px 10px",fontSize:9,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{Object.keys(platBreak).sort(function(a,b){return (platOrd4[a]||9)-(platOrd4[b]||9);}).filter(function(pl){return platBreak[pl].clicks>0;}).map(function(pl,pi){
                    var pb3=platBreak[pl];var pc6=platCol4[pl]||P.ember;var plCpc3=pb3.clicks>0?pb3.spend/pb3.clicks:0;var plCtr3=pb3.imps>0?(pb3.clicks/pb3.imps*100):0;
                    var plBm3=pl==="TikTok"?benchmarks.tiktok.cpc:pl==="Google Display"?benchmarks.google.cpc:benchmarks.meta.cpc;
                    var verdict=plCpc3>0&&plCpc3<=plBm3.low?"Excellent":plCpc3<=plBm3.mid?"Good":plCpc3<=plBm3.high?"Average":"Review";
                    var verdictCol=verdict==="Excellent"?P.mint:verdict==="Good"?P.mint:verdict==="Average"?P.solar:P.rose;
                    return <tr key={pi} style={{background:pc6+"08"}}>
                      <td style={{padding:"10px 12px",border:"1px solid "+P.rule}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{width:8,height:8,borderRadius:"50%",background:pc6}}></span><span style={{fontSize:11,fontWeight:700,color:pc6,fontFamily:ff}}>{pl}</span></div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fmt(pb3.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:verdictCol}}>{fR(plCpc3)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:plCtr3>2?P.mint:plCtr3>1?P.txt:P.warning}}>{plCtr3.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:10,color:P.sub}}>{plBm3.label}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:verdictCol,color:"#fff",fontSize:8,fontWeight:900,padding:"3px 8px",borderRadius:4}}>{verdict.toUpperCase()}</span></td>
                    </tr>;})}
                  </tbody>
                </table>
              </div>

              {adsets.length>0&&(function(){
                var selAdsets2=adsets.filter(function(a){
                  for(var si3=0;si3<sel.length;si3++){if(a.campaignName===sel[si3].campaignName||a.campaignId===(sel[si3].rawCampaignId||sel[si3].campaignId.replace(/_facebook$/,"").replace(/_instagram$/,"")))return true;}
                  return false;
                }).filter(function(a){return parseFloat(a.impressions||0)>0||parseFloat(a.spend||0)>0;});
                if(selAdsets2.length===0)return null;

                var topAdsets=selAdsets2.map(function(a){
                  var spend2=parseFloat(a.spend||0);var clicks2=parseFloat(a.clicks||0);var imps2=parseFloat(a.impressions||0);
                  var result2=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);
                  if(result2===0)result2=clicks2;
                  var costPer2=result2>0?spend2/result2:0;
                  return{name:a.adsetName,platform:a.platform,spend:spend2,clicks:clicks2,imps:imps2,result:result2,costPer:costPer2,ctr:imps2>0?(clicks2/imps2*100):0};
                }).filter(function(a){return a.result>=3&&a.spend>100;}).sort(function(a,b){
                  var aEff=a.result>0?a.result/a.spend:0;var bEff=b.result>0?b.result/b.spend:0;return bEff-aEff;
                });

                var worstAdsets=selAdsets2.map(function(a){
                  var spend2=parseFloat(a.spend||0);var clicks2=parseFloat(a.clicks||0);var imps2=parseFloat(a.impressions||0);
                  var result2=parseFloat(a.follows||0)+parseFloat(a.pageLikes||0)+parseFloat(a.leads||0);
                  if(result2===0)result2=clicks2;
                  var costPer2=result2>0?spend2/result2:0;
                  return{name:a.adsetName,platform:a.platform,spend:spend2,clicks:clicks2,imps:imps2,result:result2,costPer:costPer2,ctr:imps2>0?(clicks2/imps2*100):0};
                }).filter(function(a){return a.spend>200&&(a.result===0||(a.ctr<0.5&&a.imps>5000));}).sort(function(a,b){return b.spend-a.spend;});

                return <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.solar,fontFamily:ff,letterSpacing:1}}>TARGETING STANDOUTS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TOP & UNDERPERFORMING ADSETS</div></div>
                  {topAdsets.length>0&&<div style={{marginBottom:20}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{background:P.mint,width:10,height:10,borderRadius:"50%"}}></span><span style={{fontSize:12,fontWeight:800,color:P.mint,fontFamily:ff}}>Top Performers (by efficiency)</span></div>
                    {topAdsets.slice(0,3).map(function(ta,ti){
                      var pc7=ta.platform==="Facebook"?P.fb:ta.platform==="Instagram"?P.ig:ta.platform==="TikTok"?P.tt:P.gd;
                      return <div key={ti} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",marginBottom:8,background:P.mint+"08",borderLeft:"3px solid "+P.mint,borderRadius:"0 10px 10px 0"}}>
                        <span style={{background:pc7,color:"#fff",fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:8}}>{ta.platform==="Facebook"?"FB":ta.platform==="Instagram"?"IG":ta.platform==="TikTok"?"TT":"GD"}</span>
                        <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{ta.name}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(ta.result)+" results"}</div><div style={{fontSize:10,color:P.sub,fontFamily:fm}}>{fR(ta.costPer)+" per result"}</div></div>
                      </div>;
                    })}
                  </div>}
                  {worstAdsets.length>0&&<div>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{background:P.rose,width:10,height:10,borderRadius:"50%"}}></span><span style={{fontSize:12,fontWeight:800,color:P.rose,fontFamily:ff}}>Requiring Attention</span></div>
                    {worstAdsets.slice(0,3).map(function(wa,wi){
                      var pc8=wa.platform==="Facebook"?P.fb:wa.platform==="Instagram"?P.ig:wa.platform==="TikTok"?P.tt:P.gd;
                      return <div key={wi} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",marginBottom:8,background:P.rose+"08",borderLeft:"3px solid "+P.rose,borderRadius:"0 10px 10px 0"}}>
                        <span style={{background:pc8,color:"#fff",fontSize:8,fontWeight:700,padding:"2px 8px",borderRadius:8}}>{wa.platform==="Facebook"?"FB":wa.platform==="Instagram"?"IG":wa.platform==="TikTok"?"TT":"GD"}</span>
                        <div style={{flex:1}}><div style={{fontSize:11,fontWeight:700,color:P.txt,whiteSpace:"normal",wordBreak:"break-word",lineHeight:1.4}}>{wa.name}</div></div>
                        <div style={{textAlign:"right"}}><div style={{fontSize:14,fontWeight:900,color:P.rose,fontFamily:fm}}>{wa.result===0?"No results":wa.ctr.toFixed(2)+"% CTR"}</div><div style={{fontSize:10,color:P.sub,fontFamily:fm}}>{fR(wa.spend)+" spent"}</div></div>
                      </div>;
                    })}
                  </div>}
                </div>;
              })()}

              {(function(){
                var matchedPages3=[];var matchedIds3={};
                for(var p3=0;p3<pages.length;p3++){
                  var pg3=pages[p3];var bestSc3=0;
                  for(var s3=0;s3<sel.length;s3++){
                    var sc4=autoMatchPage(sel[s3].campaignName,pg3.name);
                    if(sc4>bestSc3)bestSc3=sc4;
                  }
                  if(bestSc3>=2&&matchedIds3[pg3.id]!==true){matchedPages3.push(pg3);matchedIds3[pg3.id]=true;}
                }
                var fbT2=0;var igT2=0;
                matchedPages3.forEach(function(mp2){fbT2+=mp2.followers_count||mp2.fan_count||0;if(mp2.instagram_business_account){igT2+=mp2.instagram_business_account.followers_count||0;}});
                var ttE2=0;sel.forEach(function(camp){if(camp.platform==="TikTok"&&(camp.campaignName||"").toLowerCase().indexOf("follower")>=0){ttE2+=parseFloat(camp.follows||0);}});
                var ttT2=getTtTotal(sel.map(function(x){return x.campaignName;}).join(" "),ttE2);
                var grandT2=fbT2+igT2+ttT2;
                var fbE2=0;var igE2=0;
                sel.forEach(function(camp){
                  var n2=(camp.campaignName||"").toLowerCase();
                  var isFl=n2.indexOf("follower")>=0||n2.indexOf("_like_")>=0||n2.indexOf("_like ")>=0||n2.indexOf("paidsocial_like")>=0||n2.indexOf("like_facebook")>=0||n2.indexOf("like_instagram")>=0;
                  if(isFl){
                    if(camp.platform==="Facebook"){fbE2+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);}
                    if(camp.platform==="Instagram"){var igG2=findIgGrowth(camp.campaignName,pages);igE2+=igG2>0?igG2:0;}
                  }
                });
                var totalE2=fbE2+igE2+ttE2;
                if(grandT2===0&&totalE2===0)return null;
                return <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                  <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:ff,letterSpacing:1}}>COMMUNITY SNAPSHOT</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TOTAL AUDIENCE & PERIOD GROWTH</div></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                    <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL COMMUNITY</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandT2)}</div></Glass>
                    <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>FACEBOOK</div><div style={{fontSize:18,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(fbT2)}</div><div style={{fontSize:9,color:P.mint,fontFamily:fm,marginTop:4}}>{fbE2>0?"+"+fmt(fbE2)+" earned":""}</div></Glass>
                    <Glass accent={P.ig} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>INSTAGRAM</div><div style={{fontSize:18,fontWeight:900,color:P.ig,fontFamily:fm}}>{fmt(igT2)}</div><div style={{fontSize:9,color:P.mint,fontFamily:fm,marginTop:4}}>{igE2>0?"+"+fmt(igE2)+" earned":""}</div></Glass>
                    <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TIKTOK</div><div style={{fontSize:18,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttT2)}</div><div style={{fontSize:9,color:P.mint,fontFamily:fm,marginTop:4}}>{ttE2>0?"+"+fmt(ttE2)+" earned":""}</div></Glass>
                  </div>
                </div>;
              })()}

"""

idx = c.find(insert_before)
if idx > 0:
    c = c[:idx] + new_sections + c[idx:]
    print("Inserted engagement highlights, targeting standouts, and community snapshot")
else:
    print("Could not find insert point")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
