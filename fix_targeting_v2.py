with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find and replace the entire targeting tab
start_marker = '        {tab==="targeting"&&(<div>'
end_marker = '        </div>)}\n'

start_idx = c.find(start_marker, c.find('Targeting Performance'))
if start_idx < 0:
    start_idx = c.find(start_marker)
    
# Find the correct closing
search_from = start_idx + 100
# Count nested divs to find the right closing
depth = 0
end_idx = -1
i = start_idx
while i < len(c):
    if c[i:i+5] == '<div>' or c[i:i+11] == '<div style=':
        depth += 1
    if c[i:i+6] == '</div>':
        depth -= 1
    if depth == 0 and c[i:i+8] == '</div>)}':
        end_idx = i + 8
        break
    i += 1

if start_idx < 0 or end_idx < 0:
    # Fallback - find by next tab
    end_search = c.find('{tab==="community"', start_idx)
    if end_search > 0:
        end_idx = c.rfind('\n', start_idx, end_search) + 1
    print("Using fallback end:", end_idx)

print("Targeting section:", start_idx, "to", end_idx, "=", end_idx - start_idx, "chars")

new_targeting = r"""        {tab==="targeting"&&(<div>
          <SH icon={Ic.radar(P.solar,20)} title="Targeting Performance" sub={df+" to "+dt+" \u00b7 Adset-Level Analysis by Platform"} accent={P.solar}/>
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

            var allRows=filtered.map(function(a){
              var getObj2=function(name){var n=(name||"").toLowerCase();if(n.indexOf("appinstal")>=0||n.indexOf("app install")>=0)return "App Store Clicks";if(n.indexOf("follower")>=0)return "Followers & Likes";if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("_like_")>=0||n.indexOf("_like ")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("like_facebook")>=0||n.indexOf("like_instagram")>=0)return "Followers & Likes";if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0||n.indexOf("paidsearch")>=0)return "Landing Page Clicks";return "Traffic";};
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

            var platforms=["Facebook","Instagram","TikTok"];
            var platColors={"Facebook":P.fb,"Instagram":P.ig,"TikTok":P.tt};
            var platBadge={"Facebook":"FB","Instagram":"IG","TikTok":"TT"};

            var adsetFlags=[];

            var renderTable=function(pRows,pc2,label){
              if(pRows.length===0)return null;
              var pSpend=pRows.reduce(function(a,r){return a+r.spend;},0);
              var pImps=pRows.reduce(function(a,r){return a+r.impressions;},0);
              var pClicks=pRows.reduce(function(a,r){return a+r.clicks;},0);
              var pCtr=pImps>0?(pClicks/pImps*100):0;
              var pCpc=pClicks>0?pSpend/pClicks:0;
              var sorted2=pRows.slice().sort(function(a,b){return b.spend-a.spend;});

              sorted2.forEach(function(r){
                if(r.spend>300&&r.ctr<0.5&&r.impressions>5000){adsetFlags.push({severity:"critical",platform:r.platform,adset:r.adsetName,campaign:r.campaignName,metric:"CTR below 0.5%",value:r.ctr.toFixed(2)+"%",spend:r.spend,message:"Adset '"+r.adsetName+"' has spent "+fR(r.spend)+" with only "+r.ctr.toFixed(2)+"% CTR across "+fmt(r.impressions)+" impressions. The targeting or creative is not resonating with this audience.",recommendation:"Pause this adset and reallocate budget to higher-performing targeting segments."});}
                if(r.spend>500&&r.result===0){adsetFlags.push({severity:"critical",platform:r.platform,adset:r.adsetName,campaign:r.campaignName,metric:"Zero results with significant spend",value:fR(r.spend)+" spent, 0 results",spend:r.spend,message:"Adset '"+r.adsetName+"' has consumed "+fR(r.spend)+" budget without producing a single measurable result.",recommendation:"Immediately pause this adset. The targeting audience is not converting. Reallocate budget to proven performers."});}
                if(r.costPer>0&&pRows.filter(function(x){return x.costPer>0;}).length>1){var avgCost=pRows.filter(function(x){return x.costPer>0;}).reduce(function(a,x){return a+x.costPer;},0)/pRows.filter(function(x){return x.costPer>0;}).length;if(r.costPer>avgCost*2){adsetFlags.push({severity:"warning",platform:r.platform,adset:r.adsetName,campaign:r.campaignName,metric:"Cost per result 2x above average",value:fR(r.costPer)+" vs "+fR(avgCost)+" avg",spend:r.spend,message:"Adset '"+r.adsetName+"' is delivering at "+fR(r.costPer)+" cost per result, more than double the "+fR(avgCost)+" platform average.",recommendation:"Reduce budget allocation on this adset by 50% and monitor. If cost per result does not improve within 48 hours, pause entirely."});}}
              });

              return <div key={label} style={{marginBottom:28}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{width:12,height:12,borderRadius:"50%",background:pc2}}></span><span style={{fontSize:16,fontWeight:800,color:pc2,fontFamily:ff}}>{label}</span><span style={{fontSize:11,color:P.sub,fontFamily:fm,marginLeft:8}}>{sorted2.length} adsets</span></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={pc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>SPEND</div><div style={{fontSize:20,fontWeight:900,color:pc2,fontFamily:fm}}>{fR(pSpend)}</div></Glass>
                  <Glass accent={pc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CLICKS</div><div style={{fontSize:20,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(pClicks)}</div></Glass>
                  <Glass accent={pc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CTR</div><div style={{fontSize:20,fontWeight:900,color:pCtr>2?P.mint:pCtr>1?P.txt:P.warning,fontFamily:fm}}>{pCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={pc2} hv={true} st={{padding:14,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>CPC</div><div style={{fontSize:20,fontWeight:900,color:pCpc<2?P.mint:P.ember,fontFamily:fm}}>{fR(pCpc)}</div></Glass>
                </div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                  <thead><tr>{["Adset (Targeting)","Objective","Spend","Impressions","Clicks","Results","Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{sorted2.map(function(r,ri){
                    var isBest=ri===0&&r.result>0;
                    var isWorst=r.spend>300&&r.ctr<0.5&&r.impressions>5000;
                    return <tr key={ri} style={{background:isWorst?"rgba(244,63,94,0.08)":ri%2===0?pc2+"06":"transparent"}}>
                      <td title={r.adsetName} style={{padding:"12px",fontSize:12,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:280,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div>{isBest&&<span style={{background:P.mint,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:4,display:"inline-block"}}>BEST PERFORMER</span>}{isWorst&&<span style={{background:P.rose,color:"#fff",fontSize:7,fontWeight:900,padding:"2px 6px",borderRadius:6,marginTop:4,display:"inline-block",marginLeft:4}}>UNDERPERFORMING</span>}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:r.result>0?pc2:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"\u2014"}</td>
                    </tr>;})}
                    <tr style={{background:pc2+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:pc2,fontSize:12}}>Platform Total</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{fR(pSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{fmt(pImps)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{fmt(pClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{fmt(sorted2.reduce(function(a,r){return a+r.result;},0))}</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{pCtr.toFixed(2)+"%"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:pc2}}>{fR(pCpc)}</td></tr>
                  </tbody>
                </table>
                <Insight title={label+" Targeting Assessment"} accent={pc2} icon={Ic.radar(pc2,16)}>{(function(){var p=[];var best=sorted2[0];var worst=sorted2[sorted2.length-1];p.push(label+" has "+sorted2.length+" active adsets with "+fR(pSpend)+" total investment generating "+fmt(pClicks)+" clicks at "+pCtr.toFixed(2)+"% blended Click Through Rate.");if(best&&best.spend>0){p.push("Top adset by spend: '"+best.adsetName+"' with "+fR(best.spend)+" invested, delivering "+fmt(best.clicks)+" clicks at "+best.ctr.toFixed(2)+"% CTR"+(best.result>0?" and "+fmt(best.result)+" objective results at "+fR(best.costPer)+" cost per result":"")+". "+(best.ctr>2?"This adset shows exceptional audience-creative alignment.":best.ctr>1?"Performance is within healthy engagement parameters.":"CTR is below the 1% benchmark, indicating room for creative or targeting optimisation."));}if(sorted2.length>1){var bestCtr2=sorted2.slice().sort(function(a,b){return b.ctr-a.ctr;})[0];if(bestCtr2.adsetName!==best.adsetName&&bestCtr2.ctr>best.ctr){p.push("Highest CTR adset: '"+bestCtr2.adsetName+"' at "+bestCtr2.ctr.toFixed(2)+"%, suggesting this audience segment has the strongest creative resonance. Consider increasing budget allocation to this targeting.");}}var zeroResult=sorted2.filter(function(r){return r.spend>200&&r.result===0;});if(zeroResult.length>0){p.push("Strategy: "+zeroResult.length+" adset"+(zeroResult.length>1?"s":"")+" have spent budget without producing results. Evaluate targeting parameters and creative relevance for these segments.");}return p.join(" ");})()}</Insight>
              </div>;
            };

            var platSections=platforms.map(function(plat){
              var pRows=allRows.filter(function(r){return r.platform===plat;});
              return renderTable(pRows,platColors[plat],plat);
            }).filter(function(x){return x!==null;});

            var combinedChartData=allRows.slice().sort(function(a,b){return b.spend-a.spend;}).slice(0,10).map(function(r){
              var short=r.adsetName.length>20?r.adsetName.substring(0,17)+"...":r.adsetName;
              return{name:short,Clicks:r.clicks,CTR:r.ctr,Spend:r.spend,Platform:r.platform};
            });

            return <div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>ADSET PERFORMANCE BY PLATFORM</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TARGETING ANALYSIS</div></div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>ACTIVE ADSETS</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{allRows.length}</div></Glass>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalClicks)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>CTR: {blendedCtr.toFixed(2)+"%"}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED CPC</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(blendedCpc)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.5)",fontFamily:fm,marginTop:4}}>{fR(totalSpend)} invested</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:"rgba(255,255,255,0.55)",fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL REACH</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(totalReach)}</div></Glass>
                </div>
                {platSections}
              </div>
              <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMBINED CROSS-PLATFORM VIEW</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>ALL ADSETS RANKED BY INVESTMENT</div></div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <thead><tr>{["Adset (Targeting)","Platform","Objective","Spend","Impressions","Clicks","Results","Cost Per","CTR %","CPC"].map(function(h,hi){return <th key={hi} style={{padding:"10px 12px",fontSize:10,fontWeight:800,textTransform:"uppercase",color:"#F96203",letterSpacing:1,textAlign:hi===0?"left":"center",background:"rgba(249,98,3,0.15)",border:"1px solid rgba(249,98,3,0.3)",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                  <tbody>{allRows.slice().sort(function(a,b){return b.spend-a.spend;}).map(function(r,ri){
                    var pc3=platColors[r.platform]||P.ember;
                    return <tr key={ri} style={{background:ri%2===0?pc3+"06":"transparent"}}>
                      <td title={r.adsetName} style={{padding:"12px",fontSize:12,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:260,lineHeight:1.4}}><div style={{whiteSpace:"normal",wordBreak:"break-word"}}>{r.adsetName}</div></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule}}><span style={{background:pc3,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{platBadge[r.platform]||"?"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:10,color:P.sub}}>{r.objective}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.impressions)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:r.result>0?pc3:P.dim}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.costPer>0?P.ember:P.dim}}>{r.costPer>0?fR(r.costPer):"\u2014"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.ctr>2?P.mint:r.ctr>1?P.txt:r.ctr>0?P.warning:P.dim}}>{r.ctr.toFixed(2)+"%"}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,fontWeight:700,color:r.cpc>0&&r.cpc<2?P.mint:r.cpc>0?P.txt:P.dim}}>{r.cpc>0?fR(r.cpc):"\u2014"}</td>
                    </tr>;})}
                    <tr style={{background:"rgba(255,171,0,0.12)"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:P.solar,fontSize:12}} colSpan={3}>Grand Total ({allRows.length} adsets)</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fR(totalSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fmt(totalImps)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fmt(totalClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fmt(allRows.reduce(function(a,r){return a+r.result;},0))}</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{blendedCtr.toFixed(2)+"%"}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.solar}}>{fR(blendedCpc)}</td></tr>
                  </tbody>
                </table>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Spend by Adset (Top 10)</div><ResponsiveContainer width="100%" height={240}><BarChart data={combinedChartData} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fR(v);}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="Spend" fill={P.ember} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                  <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20}}><div style={{fontSize:10,fontWeight:800,color:"rgba(255,255,255,0.5)",letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>CTR % by Adset (Top 10)</div><ResponsiveContainer width="100%" height={240}><BarChart data={combinedChartData.slice().sort(function(a,b){return b.CTR-a.CTR;})} layout="vertical" barSize={14}><CartesianGrid strokeDasharray="3 3" stroke={P.rule}/><XAxis type="number" tick={{fontSize:10,fill:"rgba(255,255,255,0.6)",fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return v.toFixed(1)+"%";}}/><YAxis type="category" dataKey="name" width={120} tick={{fontSize:8,fill:"rgba(255,255,255,0.65)",fontFamily:fm}} stroke="transparent"/><Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/><Bar dataKey="CTR" fill={P.solar} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
                </div>
                <Insight title="Cross-Platform Targeting Assessment" accent={P.solar} icon={Ic.radar(P.solar,16)}>{(function(){var p=[];p.push("The campaign operates "+allRows.length+" adsets across "+platforms.filter(function(pl){return allRows.filter(function(r){return r.platform===pl;}).length>0;}).length+" platforms with "+fR(totalSpend)+" total investment, generating "+fmt(totalClicks)+" clicks at "+blendedCtr.toFixed(2)+"% blended Click Through Rate and "+fR(blendedCpc)+" blended Cost Per Click.");var bestOverall=allRows.slice().sort(function(a,b){return b.result-a.result;})[0];if(bestOverall&&bestOverall.result>0){p.push("The highest-performing adset across all platforms is '"+bestOverall.adsetName+"' on "+bestOverall.platform+" with "+fmt(bestOverall.result)+" results at "+fR(bestOverall.costPer)+" cost per result.");}platforms.forEach(function(pl){var pr=allRows.filter(function(r){return r.platform===pl;});if(pr.length===0)return;var pSpend2=pr.reduce(function(a,r){return a+r.spend;},0);var pct=totalSpend>0?((pSpend2/totalSpend)*100).toFixed(0):"0";p.push(pl+" receives "+pct+"% of budget ("+fR(pSpend2)+") across "+pr.length+" adsets.");});if(adsetFlags.length>0){p.push("Strategy: "+adsetFlags.filter(function(f){return f.severity==="critical";}).length+" critical and "+adsetFlags.filter(function(f){return f.severity==="warning";}).length+" warning flags have been identified. Review the Optimisation tab for detailed recommendations on underperforming adsets.");}return p.join(" ");})()}</Insight>
              </div>
              {adsetFlags.length>0&&<div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
                <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.warning,fontFamily:ff,letterSpacing:1}}>TARGETING ALERTS</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>ADSETS REQUIRING ATTENTION</div></div>
                {adsetFlags.map(function(f,fi){return <div key={fi} style={{marginBottom:12,borderLeft:"4px solid "+(f.severity==="critical"?P.rose:P.warning),background:f.severity==="critical"?"rgba(244,63,94,0.06)":"rgba(255,171,0,0.06)",borderRadius:"0 10px 10px 0",padding:"14px 18px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}><span style={{background:f.severity==="critical"?P.rose:P.warning,color:"#fff",fontSize:8,fontWeight:900,padding:"2px 8px",borderRadius:4,textTransform:"uppercase"}}>{f.severity}</span><span style={{fontSize:12,fontWeight:800,color:P.txt}}>{f.adset}</span><span style={{background:platColors[f.platform],color:"#fff",fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:8,marginLeft:"auto"}}>{platBadge[f.platform]}</span></div>
                  <div style={{fontSize:11,color:P.sub,marginBottom:4}}>{f.metric}: {f.value}</div>
                  <div style={{fontSize:12,color:P.txt,lineHeight:1.6,marginBottom:6}}>{f.message}</div>
                  <div style={{fontSize:11,color:P.ember,fontWeight:600}}>{f.recommendation}</div>
                </div>;})}
              </div>}
            </div>;
          })()}
        </div>)}"""

if start_idx > 0:
    c = c[:start_idx] + new_targeting + c[end_idx:]
    print("Targeting tab replaced successfully")
else:
    print("Could not find targeting section")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
