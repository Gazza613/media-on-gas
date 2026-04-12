with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    lines = f.readlines()

# Find community section
start = None
end = None
for i, line in enumerate(lines):
    if '{tab==="community"' in line:
        start = i
    if start and i > start and '</div>)}' in line:
        end = i + 1
        break

if start is None or end is None:
    print("ERROR: community section not found", start, end)
else:
    print("Found community section lines", start+1, "to", end+1)

    new_section = """        {tab==="community"&&(<div>
          <SH icon={Ic.users(P.mint,20)} title="Community Growth" sub={df+" to "+dt+" \\u00b7 Followers & Likes by Platform"} accent={P.mint}/>
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMMUNITY GROWTH</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>TOTAL COMMUNITY & PERIOD GROWTH</div></div>
            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var fbEarned=0;var ttEarned=0;var igEarned=0;
              var fbSpend=0;var ttSpend=0;var igSpend=0;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;
                if(isFollowLike){
                  if(camp.platform==="Facebook"){fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);fbSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="Instagram"){var igG=findIgGrowth(camp.campaignName,pages);igEarned+=igG>0?igG:0;igSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="TikTok"){ttEarned+=parseFloat(camp.follows||0);ttSpend+=parseFloat(camp.spend||0);}
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;
              var totalSpend=fbSpend+igSpend+ttSpend;
              var fbPage=null;var igAccount=null;
              var bestScore3=0;
              for(var p=0;p<pages.length;p++){
                var pg=pages[p];
                for(var s=0;s<sel.length;s++){
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>bestScore3){bestScore3=sc3;fbPage=pg;}
                }
              }
              var fbTotal=fbPage?fbPage.fan_count:0;
              if(fbPage&&fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;}
              var igTotal=igAccount?igAccount.followers_count:0;
              var grandTotal=fbTotal+igTotal;
              return <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
                  <Glass accent={P.fb} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:11,fontWeight:700,color:P.fb,fontFamily:fm}}>FACEBOOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL PAGE LIKES</div><div style={{fontSize:36,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(fbTotal)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(fbEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER LIKE</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{fbEarned>0?fR(fbSpend/fbEarned):"\\u2014"}</div></div></div>
                  </Glass>
                  <Glass accent={P.ig} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:11,fontWeight:700,color:P.ig,fontFamily:fm}}>INSTAGRAM</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.ig,fontFamily:fm}}>{fmt(igTotal)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(igEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{igEarned>0?fR(igSpend/igEarned):"\\u2014"}</div></div></div>
                  </Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:11,fontWeight:700,color:P.tt,fontFamily:fm}}>TIKTOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FOLLOWS EARNED</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttEarned)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>EARNED THIS PERIOD</div><div style={{fontSize:18,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(ttEarned)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{ttEarned>0?fR(ttSpend/ttEarned):"\\u2014"}</div></div></div>
                  </Glass>
                </div>
                <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Period Growth by Platform</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{name:"FB Likes",value:fbEarned},{name:"IG Followers",value:igEarned},{name:"TT Follows",value:ttEarned}]} barSize={50}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent"/>
                      <YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                      <Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                      <Bar dataKey="value" name="Earned" radius={[6,6,0,0]}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL COMMUNITY</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(grandTotal)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>+{fmt(totalEarned)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>GROWTH RATE</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{grandTotal>0?(totalEarned/grandTotal*100).toFixed(1)+"%":"\\u2014"}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>COST PER MEMBER</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{totalEarned>0?fR(totalSpend/totalEarned):"\\u2014"}</div></Glass>
                </div>
                <Insight title="Community Growth Analysis" accent={P.mint} icon={Ic.users(P.mint,16)}>{(function(){var p=[];if(totalEarned===0&&grandTotal===0){return "No community data available for the selected campaigns.";}if(grandTotal>0){p.push("The brand\\'s total social community stands at "+fmt(grandTotal)+" members across Facebook and Instagram.");}if(totalEarned>0){p.push("During the selected period, the community grew by "+fmt(totalEarned)+" new members with "+fR(totalSpend)+" invested at a blended cost of "+fR(totalSpend/totalEarned)+" per new member.");}if(fbTotal>0){p.push("Facebook leads with "+fmt(fbTotal)+" total page likes"+(fbEarned>0?", adding "+fmt(fbEarned)+" new likes at "+fR(fbSpend/fbEarned)+" cost per like during this period":"")+". Each page like permanently increases organic News Feed distribution.");}if(igTotal>0){p.push("Instagram has "+fmt(igTotal)+" total followers"+(igEarned>0?", growing by "+fmt(igEarned)+" followers during this period":"")+". Instagram followers directly increase Stories, Reels, and Feed visibility.");}if(ttEarned>0){p.push("TikTok campaigns generated "+fmt(ttEarned)+" new follows at "+fR(ttSpend/ttEarned)+" cost per follow. Each TikTok follower feeds into the For You page recommendation engine, amplifying organic reach.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>
        </div>)}
"""

    before = lines[:start]
    after = lines[end:]
    
    with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
        f.writelines(before)
        f.write(new_section)
        f.writelines(after)
    print("Done - full community growth with totals and period growth")
