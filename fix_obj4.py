with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

start = c.find('{/* OBJECTIVE ASSESSMENT */}')
end = c.find('{/* \\u2550\\u2550\\u2550 COMMUNITY GROWTH')

print("start:", start)
print("end:", end)

if start < 0 or end < 0:
    print("ERROR: markers not found")
else:
    before = c[:start]
    after = c[end:]

    new_obj = """{/* OBJECTIVE ASSESSMENT */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE ASSESSMENT</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>BOTTOM OF FUNNEL, CAMPAIGN KPIs</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              if(sel.length===0)return <div style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view objective results.</div>;

              var getObj=function(name){
                var n=(name||"").toLowerCase();
                if(n.indexOf("lead")>=0||n.indexOf("pos")>=0)return "Leads";
                if(n.indexOf("follower")>=0)return "Follows";
                if(n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0)return "Page Likes";
                if(n.indexOf("appinstall")>=0||n.indexOf("app install")>=0)return "App Store Clicks";
                if(n.indexOf("homeloan")>=0||n.indexOf("traffic")>=0)return "Landing Page Clicks";
                return "Traffic";
              };

              var getResult=function(camp,obj){
                if(obj==="Leads")return parseFloat(camp.leads||0);
                if(obj==="Follows")return parseFloat(camp.follows||0);
                if(obj==="Page Likes")return parseFloat(camp.pageLikes||0);
                return parseFloat(camp.clicks||0);
              };

              var getResultLabel=function(obj){if(obj==="Leads")return "Leads";if(obj==="Follows")return "Follows";if(obj==="Page Likes")return "Likes";return "Clicks";};
              var getCostLabel=function(obj){if(obj==="Leads")return "CPL";if(obj==="Follows")return "CPF";if(obj==="Page Likes")return "CPL";return "CPC";};

              var rows=sel.map(function(camp){
                var obj=getObj(camp.campaignName);var result=getResult(camp,obj);var spend=parseFloat(camp.spend||0);var clicks=parseFloat(camp.clicks||0);var costPer=result>0?spend/result:0;var convRate=clicks>0&&obj==="Leads"?(parseFloat(camp.leads||0)/clicks*100):0;
                return{name:camp.campaignName,platform:camp.platform,objective:obj,spend:spend,clicks:clicks,result:result,resultLabel:getResultLabel(obj),costPer:costPer,costLabel:getCostLabel(obj),convRate:convRate};
              });

              var objectives=["App Store Clicks","Landing Page Clicks","Leads","Follows","Page Likes"];
              var groups={};objectives.forEach(function(o){groups[o]=rows.filter(function(r){return r.objective===o;});});
              var trafficRows=rows.filter(function(r){return r.objective==="Traffic";});
              if(trafficRows.length>0){groups["Landing Page Clicks"]=groups["Landing Page Clicks"].concat(trafficRows);}

              var objColors={"App Store Clicks":P.fb,"Landing Page Clicks":P.cyan,"Leads":P.rose,"Follows":P.tt,"Page Likes":P.fb};
              var sections=[];

              objectives.forEach(function(objName){
                var g=groups[objName];if(!g||g.length===0)return;
                var totalSpend=g.reduce(function(a,r){return a+r.spend;},0);var totalClicks=g.reduce(function(a,r){return a+r.clicks;},0);var totalResults=g.reduce(function(a,r){return a+r.result;},0);var totalCostPer=totalResults>0?totalSpend/totalResults:0;var totalConv=totalClicks>0&&objName==="Leads"?(totalResults/totalClicks*100):0;var oc=objColors[objName]||P.ember;

                sections.push(<div key={objName} style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{width:12,height:12,borderRadius:"50%",background:oc}}></span><span style={{fontSize:14,fontWeight:800,color:oc,fontFamily:ff}}>{objName}</span></div>
                  <table style={{width:"100%",borderCollapse:"collapse",marginBottom:14}}>
                    <thead><tr>{["Campaign","Platform","Spend","Clicks",g[0].resultLabel,g[0].costLabel].concat(objName==="Leads"?["Conv %"]:[]).map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#FFCB05",textAlign:i===0?"left":"center",background:"#004F71",border:"1px solid #003a55",fontFamily:fm,letterSpacing:1}}>{h}</th>;})}</tr></thead>
                    <tbody>{g.map(function(r,ri){return <tr key={ri} style={{background:ri%2===0?oc+"08":"transparent"}}>
                      <td title={r.name} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:200,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.name}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:11}}><span style={{background:r.platform==="Facebook"?P.fb:r.platform==="Instagram"?P.ig:P.tt,color:"#fff",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:10}}>{r.platform==="Facebook"?"FB":r.platform==="Instagram"?"IG":"TT"}</span></td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fR(r.spend)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(r.clicks)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(r.result)}</td>
                      <td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(r.costPer)}</td>
                      {objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:r.convRate>0?P.orchid:P.dim}}>{r.convRate>0?r.convRate.toFixed(1)+"%":"0"}</td>}
                    </tr>;})}
                    <tr style={{background:oc+"15"}}><td style={{padding:"10px 12px",border:"1px solid "+P.rule,fontWeight:900,color:oc,fontSize:12}}>Total</td><td style={{padding:"10px 12px",border:"1px solid "+P.rule}}></td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fR(totalSpend)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:oc}}>{fmt(totalClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:oc}}>{fmt(totalResults)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:14,fontWeight:900,color:P.ember}}>{fR(totalCostPer)}</td>{objName==="Leads"&&<td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.orchid}}>{totalConv>0?totalConv.toFixed(1)+"%":"0"}</td>}</tr>
                    </tbody>
                  </table>
                </div>);
              });

              if(sections.length===0)sections.push(<div key="none" style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>No objective data found for the selected campaigns.</div>);

              var tLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.result;},0);
              var tFollows=rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.result;},0);
              var tLikes=rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.result;},0);
              var tApp=rows.filter(function(r){return r.objective==="App Store Clicks";}).reduce(function(a,r){return a+r.result;},0);
              var tLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.result;},0);
              var sLeads=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.spend;},0);
              var sFollows=rows.filter(function(r){return r.objective==="Follows";}).reduce(function(a,r){return a+r.spend;},0);
              var sLikes=rows.filter(function(r){return r.objective==="Page Likes";}).reduce(function(a,r){return a+r.spend;},0);
              var sApp=rows.filter(function(r){return r.objective==="App Store Clicks";}).reduce(function(a,r){return a+r.spend;},0);
              var sLp=rows.filter(function(r){return r.objective==="Landing Page Clicks"||r.objective==="Traffic";}).reduce(function(a,r){return a+r.spend;},0);
              var allSpend=rows.reduce(function(a,r){return a+r.spend;},0);
              var allClicks=rows.reduce(function(a,r){return a+r.clicks;},0);

              return <div>
                {sections}
                <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:16}}>
                  <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>APP STORE CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(tApp)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPC: {fR(tApp>0?sApp/tApp:0)}</div></Glass>
                  <Glass accent={P.cyan} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>LP CLICKS</div><div style={{fontSize:22,fontWeight:900,color:P.cyan,fontFamily:fm}}>{fmt(tLp)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPC: {fR(tLp>0?sLp/tLp:0)}</div></Glass>
                  <Glass accent={P.rose} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>LEADS</div><div style={{fontSize:22,fontWeight:900,color:P.rose,fontFamily:fm}}>{fmt(tLeads)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPL: {fR(tLeads>0?sLeads/tLeads:0)}</div></Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FOLLOWS</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(tFollows)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPF: {fR(tFollows>0?sFollows/tFollows:0)}</div></Glass>
                  <Glass accent={P.fb} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>PAGE LIKES</div><div style={{fontSize:22,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(tLikes)}</div><div style={{fontSize:9,color:P.dim,fontFamily:fm,marginTop:4}}>CPL: {fR(tLikes>0?sLikes/tLikes:0)}</div></Glass>
                </div>
                <Insight title="Objective Performance" accent={P.rose} icon={Ic.target(P.rose,16)}>{(function(){var p=[];p.push("The selected campaigns invested "+fR(allSpend)+" generating "+fmt(allClicks)+" total clicks across all objectives.");if(tApp>0)p.push("App Store click campaigns delivered "+fmt(tApp)+" clicks at "+fR(sApp/tApp)+" CPC.");if(tLp>0)p.push("Landing page campaigns drove "+fmt(tLp)+" clicks at "+fR(sLp/tLp)+" CPC.");if(tLeads>0){var lClicks=rows.filter(function(r){return r.objective==="Leads";}).reduce(function(a,r){return a+r.clicks;},0);p.push("Lead generation produced "+fmt(tLeads)+" leads at "+fR(sLeads/tLeads)+" CPL"+(lClicks>0?", a "+(tLeads/lClicks*100).toFixed(1)+"% conversion rate.":"."));}if(tFollows>0)p.push("Follower campaigns acquired "+fmt(tFollows)+" new followers at "+fR(sFollows/tFollows)+" CPF.");if(tLikes>0)p.push("Page like campaigns earned "+fmt(tLikes)+" new likes at "+fR(sLikes/tLikes)+" cost per like.");return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>

          """

    c = before + new_obj + after
    with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
        f.write(c)
    print("Done - objective section rebuilt")
    print("OBJECTIVE found:", "OBJECTIVE ASSESSMENT" in c)
