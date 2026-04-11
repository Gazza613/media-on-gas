with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the objective section
start = c.find('{/* OBJECTIVE ASSESSMENT */}')
end = c.find('{/* COMMUNITY GROWTH')

if start < 0:
    start = c.find('OBJECTIVE ASSESSMENT')
    if start > 0:
        start = c.rfind('{/*', 0, start)

if end < 0:
    end = c.find('COMMUNITY GROWTH')
    if end > 0:
        end = c.rfind('{/*', 0, end)

if start < 0 or end < 0:
    print("ERROR: markers not found", start, end)
else:
    before = c[:start]
    after = c[end:]

    new_obj = """{/* OBJECTIVE ASSESSMENT */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE ASSESSMENT</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>BOTTOM OF FUNNEL, CAMPAIGN KPIs</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view objective results.</div>;

              var rows=sel.map(function(camp){
                var name=(camp.campaignName||"").toLowerCase();
                var obj="Traffic";var result=parseFloat(camp.clicks||0);var resultLabel="Clicks";var costPer=result>0?parseFloat(camp.spend)/result:0;var costLabel="CPC";
                if(name.indexOf("lead")>=0||name.indexOf("pos")>=0){obj="Leads";result=parseFloat(camp.leads||0);resultLabel="Leads";costPer=result>0?parseFloat(camp.spend)/result:0;costLabel="CPL";}
                else if(name.indexOf("follower")>=0){obj="Follows";result=parseFloat(camp.follows||0);resultLabel="Follows";costPer=result>0?parseFloat(camp.spend)/result:0;costLabel="CPF";}
                else if(name.indexOf("page like")>=0||name.indexOf("pagelikes")>=0){obj="Page Likes";result=parseFloat(camp.pageLikes||0);resultLabel="Likes";costPer=result>0?parseFloat(camp.spend)/result:0;costLabel="CPL";}
                else if(name.indexOf("appinstall")>=0||name.indexOf("app install")>=0){obj="App Clicks";result=parseFloat(camp.clicks||0);resultLabel="Clicks";costPer=result>0?parseFloat(camp.spend)/result:0;costLabel="CPC";}
                var clicks=parseFloat(camp.clicks||0);var leads=parseFloat(camp.leads||0);var convRate=clicks>0&&leads>0?(leads/clicks*100):0;
                return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:parseFloat(camp.spend||0),clicks:clicks,result:result,resultLabel:resultLabel,costPer:costPer,costLabel:costLabel,leads:leads,convRate:convRate};
              });

              var totals={spend:0,clicks:0,leads:0,follows:0,pageLikes:0};
              rows.forEach(function(r){totals.spend+=r.spend;totals.clicks+=r.clicks;if(r.objective==="Leads")totals.leads+=r.result;if(r.objective==="Follows")totals.follows+=r.result;if(r.objective==="Page Likes")totals.pageLikes+=r.result;});

              return <div>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <thead><tr>{["Campaign","Platform","Objective","Spend","Clicks","Results","Cost/Result","Conv %"].map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#FFCB05",textAlign:i===0?"left":"center",background:"#004F71",border:"1px solid #003a55",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
                  <tbody>{rows.map(function(r,ri){return <tr key={ri} style={{background:ri%2===0?"rgba(249,98,3,0.04)":"transparent"}}>
                    <td title={r.name} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:180,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:11,color:P.txt}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":"TT"}</span></td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:11,color:r.objective==="Leads"?P.rose:r.objective==="Follows"?P.tt:r.objective==="Page Likes"?P.fb:P.mint,fontWeight:700}}>{r.objective}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fR(r.spend)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:r.objective==="Leads"?P.rose:r.objective==="Follows"?P.mint:P.fb}}>{fmt(r.result)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td>
                    <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:r.convRate>0?P.orchid:P.dim}}>{r.objective==="Leads"&&r.convRate>0?r.convRate.toFixed(1)+"%":"0"}</td>
                  </tr>;})}</tbody>
                </table>

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
                  {totals.leads>0&&<Glass accent={P.rose} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL LEADS</div><div style={{fontSize:26,fontWeight:900,color:P.rose,fontFamily:fm}}>{fmt(totals.leads)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm,marginTop:4}}>CPL: {fR(totals.leads>0?totals.spend/rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.spend;},0)/totals.leads:0)}</div></Glass>}
                  {totals.follows>0&&<Glass accent={P.tt} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL FOLLOWS</div><div style={{fontSize:26,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totals.follows)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm,marginTop:4}}>CPF: {fR(totals.follows>0?rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.spend;},0)/totals.follows:0)}</div></Glass>}
                  {totals.pageLikes>0&&<Glass accent={P.fb} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>PAGE LIKES</div><div style={{fontSize:26,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(totals.pageLikes)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm,marginTop:4}}>CPL: {fR(totals.pageLikes>0?rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.spend;},0)/totals.pageLikes:0)}</div></Glass>}
                  <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>TOTAL CLICKS</div><div style={{fontSize:26,fontWeight:900,color:P.ember,fontFamily:fm}}>{fmt(totals.clicks)}</div><div style={{fontSize:10,color:P.dim,fontFamily:fm,marginTop:4}}>CPC: {fR(totals.clicks>0?totals.spend/totals.clicks:0)}</div></Glass>
                </div>

                <Insight title="Objective Performance" accent={P.rose} icon={Ic.target(P.rose,16)}>{(function(){var p=[];p.push("The selected campaigns have invested "+fR(totals.spend)+" generating "+fmt(totals.clicks)+" total clicks.");if(totals.leads>0){var leadSpend=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.spend;},0);p.push("Lead generation campaigns delivered "+fmt(totals.leads)+" leads at "+fR(leadSpend/totals.leads)+" cost per lead.");}if(totals.follows>0){var followSpend=rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.spend;},0);p.push("Follower campaigns acquired "+fmt(totals.follows)+" new followers at "+fR(followSpend/totals.follows)+" cost per follow.");}if(totals.pageLikes>0){var likeSpend=rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.spend;},0);p.push("Page like campaigns earned "+fmt(totals.pageLikes)+" new likes at "+fR(likeSpend/totals.pageLikes)+" cost per like.");}if(p.length===1)p.push("Select campaigns with specific objectives (leads, follows, app installs) to see detailed KPI analysis.");return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>

          """

    c = before + new_obj + after

    with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
        f.write(c)
    print("Done - unified objective table built")
    print("OBJECTIVE found:", "OBJECTIVE ASSESSMENT" in c)
