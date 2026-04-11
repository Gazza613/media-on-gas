with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the entire objective assessment section
old_obj_start = '{/* \u2550\u2550\u2550 OBJECTIVE ASSESSMENT \u2550\u2550\u2550 */}'
old_obj_end = '{/* \u2550\u2550\u2550 COMMUNITY GROWTH \u2550\u2550\u2550 */}'

si = c.find(old_obj_start)
ei = c.find(old_obj_end)

if si < 0 or ei < 0:
    # Try without the unicode
    old_obj_start2 = 'OBJECTIVE ASSESSMENT'
    old_obj_end2 = 'COMMUNITY GROWTH'
    si = c.find(old_obj_start2)
    ei = c.find(old_obj_end2)
    if si > 0:
        # Go back to find the div/comment start
        si = c.rfind('{/*', 0, si)
        ei = c.rfind('{/*', 0, ei)

if si < 0 or ei < 0:
    print("ERROR: Could not find objective section markers")
    print("start:", si, "end:", ei)
else:
    before = c[:si]
    after = c[ei:]

    # Build new objective section with dynamic campaign type detection
    new_obj = """{/* OBJECTIVE ASSESSMENT */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>OBJECTIVE ASSESSMENT</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>BOTTOM OF FUNNEL, CAMPAIGN KPIs</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var hasLeads=sel.some(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("lead")>=0||n.indexOf("pos")>=0;});
              var hasClicks=sel.some(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("appinstall")>=0||n.indexOf("app install")>=0||n.indexOf("traffic")>=0;});
              var hasFollows=sel.some(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("follower")>=0;});
              var hasLikes=sel.some(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;});

              var leadCamps=sel.filter(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("lead")>=0||n.indexOf("pos")>=0;});
              var clickCamps=sel.filter(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("appinstall")>=0||n.indexOf("app install")>=0||n.indexOf("traffic")>=0;});
              var followCamps=sel.filter(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("follower")>=0;});
              var likeCamps=sel.filter(function(x){var n=(x.campaignName||"").toLowerCase();return n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;});

              var sumCamps=function(arr,field){return arr.reduce(function(a,c){return a+parseFloat(c[field]||0);},0);};

              var sections=[];

              if(hasLeads){
                var totalLeads=sumCamps(leadCamps,"leads");
                var totalLeadSpend=sumCamps(leadCamps,"spend");
                var totalLeadClicks=sumCamps(leadCamps,"clicks");
                var cpl=totalLeads>0?totalLeadSpend/totalLeads:0;
                var convRate=totalLeadClicks>0?(totalLeads/totalLeadClicks*100):0;
                sections.push(<div key="leads" style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{width:12,height:12,borderRadius:"50%",background:P.rose}}></span><span style={{fontSize:14,fontWeight:800,color:P.rose,fontFamily:ff}}>Lead Generation</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
                    <Glass accent={P.rose} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>LEADS</div><div style={{fontSize:28,fontWeight:900,color:P.rose,fontFamily:fm}}>{fmt(totalLeads)}</div></Glass>
                    <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER LEAD</div><div style={{fontSize:28,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(cpl)}</div></Glass>
                    <Glass accent={P.mint} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:28,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalLeadClicks)}</div></Glass>
                    <Glass accent={P.orchid} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CONVERSION</div><div style={{fontSize:28,fontWeight:900,color:P.orchid,fontFamily:fm}}>{convRate.toFixed(1)}%</div></Glass>
                  </div>
                  <table style={{width:"100%",borderCollapse:"collapse",marginBottom:12}}>
                    <thead><tr>{["Campaign","Platform","Clicks","Leads","CPL","Conv %"].map(function(h,i){return <th key={i} style={{padding:"10px 12px",fontSize:9,fontWeight:700,textTransform:"uppercase",color:"#FFCB05",textAlign:i===0?"left":"center",background:"#004F71",border:"1px solid #003a55",fontFamily:fm}}>{h}</th>;})}</tr></thead>
                    <tbody>{leadCamps.map(function(lc,li){var lcLeads=parseFloat(lc.leads||0);var lcClicks=parseFloat(lc.clicks||0);var lcSpend=parseFloat(lc.spend||0);var lcCpl=lcLeads>0?lcSpend/lcLeads:0;var lcConv=lcClicks>0?(lcLeads/lcClicks*100):0;return<tr key={li} style={{background:li%2===0?"rgba(249,98,3,0.04)":"transparent"}}><td title={lc.campaignName} style={{padding:"10px 12px",fontSize:11,fontWeight:600,color:P.txt,border:"1px solid "+P.rule,maxWidth:200,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lc.campaignName}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontSize:11,color:P.txt}}>{lc.platform}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.txt}}>{fmt(lcClicks)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:900,color:P.rose}}>{fmt(lcLeads)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:13,fontWeight:700,color:P.ember}}>{fR(lcCpl)}</td><td style={{padding:"10px 12px",textAlign:"center",border:"1px solid "+P.rule,fontFamily:fm,fontSize:12,color:P.orchid}}>{lcConv.toFixed(1)}%</td></tr>;})}</tbody>
                  </table>
                  <Insight title="Lead Generation" accent={P.rose} icon={Ic.target(P.rose,16)}>{(function(){var p=[];p.push("The lead generation campaigns have delivered "+fmt(totalLeads)+" leads at "+fR(cpl)+" cost per lead from "+fmt(totalLeadClicks)+" clicks, a "+convRate.toFixed(1)+"% click-to-lead conversion rate.");if(convRate>5)p.push("The conversion rate above 5% indicates strong landing page performance and audience-offer alignment.");else if(convRate>0)p.push("Consider testing landing page optimisations to improve the click-to-lead conversion rate.");p.push("Total lead campaign investment: "+fR(totalLeadSpend)+".");return p.join(" ");})()}</Insight>
                </div>);
              }

              if(hasClicks){
                var totalAppClicks=sumCamps(clickCamps,"clicks");
                var totalAppSpend=sumCamps(clickCamps,"spend");
                var appCpc=totalAppClicks>0?totalAppSpend/totalAppClicks:0;
                sections.push(<div key="clicks" style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{width:12,height:12,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:14,fontWeight:800,color:P.fb,fontFamily:ff}}>App Store Clicks</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:16}}>
                    <Glass accent={P.fb} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>CLICKS</div><div style={{fontSize:28,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(totalAppClicks)}</div></Glass>
                    <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER CLICK</div><div style={{fontSize:28,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(appCpc)}</div></Glass>
                    <Glass accent={P.solar} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:28,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(totalAppSpend)}</div></Glass>
                  </div>
                  <Insight title="App Store Click Performance" accent={P.fb} icon={Ic.bolt(P.fb,16)}>The app install campaigns have generated {fmt(totalAppClicks)} clicks to the app store at {fR(appCpc)} cost per click against {fR(totalAppSpend)} investment. Each click represents a user who has been driven to the app store listing, the final step before installation.</Insight>
                </div>);
              }

              if(hasFollows){
                var totalFollows=sumCamps(followCamps,"follows");
                var totalFollowSpend=sumCamps(followCamps,"spend");
                var cpf=totalFollows>0?totalFollowSpend/totalFollows:0;
                sections.push(<div key="follows" style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{width:12,height:12,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:14,fontWeight:800,color:P.tt,fontFamily:ff}}>Follower Growth</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:16}}>
                    <Glass accent={P.tt} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>FOLLOWS</div><div style={{fontSize:28,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(totalFollows)}</div></Glass>
                    <Glass accent={P.tt} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER FOLLOW</div><div style={{fontSize:28,fontWeight:900,color:P.tt,fontFamily:fm}}>{fR(cpf)}</div></Glass>
                    <Glass accent={P.fuchsia} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:28,fontWeight:900,color:P.fuchsia,fontFamily:fm}}>{fR(totalFollowSpend)}</div></Glass>
                  </div>
                  <Insight title="Follower Acquisition" accent={P.tt} icon={Ic.users(P.tt,16)}>The follower campaigns have acquired {fmt(totalFollows)} new followers at {fR(cpf)} cost per follow. Each follower represents a compounding organic asset that increases future content reach, provides a retargetable audience, and reduces paid media dependency over time.</Insight>
                </div>);
              }

              if(hasLikes){
                var totalLikes=sumCamps(likeCamps,"pageLikes");
                var totalLikeSpend=sumCamps(likeCamps,"spend");
                var cplk=totalLikes>0?totalLikeSpend/totalLikes:0;
                sections.push(<div key="likes" style={{marginBottom:24}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><span style={{width:12,height:12,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:14,fontWeight:800,color:P.fb,fontFamily:ff}}>Page Like Growth</span></div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:16}}>
                    <Glass accent={P.fb} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>PAGE LIKES</div><div style={{fontSize:28,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(totalLikes)}</div></Glass>
                    <Glass accent={P.ember} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>COST PER LIKE</div><div style={{fontSize:28,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(cplk)}</div></Glass>
                    <Glass accent={P.solar} hv={true} st={{padding:18,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:6}}>SPEND</div><div style={{fontSize:28,fontWeight:900,color:P.solar,fontFamily:fm}}>{fR(totalLikeSpend)}</div></Glass>
                  </div>
                  <Insight title="Page Like Performance" accent={P.fb} icon={Ic.users(P.fb,16)}>The page like campaigns have acquired {fmt(totalLikes)} new page likes at {fR(cplk)} cost per like. Facebook page likes increase organic reach and provide social proof that strengthens ad performance through higher trust signals.</Insight>
                </div>);
              }

              if(sections.length===0){
                sections.push(<div key="none" style={{padding:30,textAlign:"center",color:P.dim,fontFamily:fm}}>Select campaigns to view objective results. Objectives are detected automatically from campaign names.</div>);
              }

              return sections;
            })()}
          </div>

          """

    c = before + new_obj + after

    with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
        f.write(c)
    print("Done - objective section rebuilt with dynamic campaign detection")
