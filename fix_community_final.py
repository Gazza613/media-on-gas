with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    lines = f.readlines()

# Replace lines 324-401 (0-indexed: 323-400)
new_section = """          {/* COMMUNITY GROWTH */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMMUNITY GROWTH</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>FOLLOWERS & LIKES EARNED THIS PERIOD</div></div>
            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var fbEarned=0;var igEarned=0;var ttEarned=0;
              var fbSpend=0;var igSpend=0;var ttSpend=0;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;
                if(isFollowLike){
                  if(camp.platform==="Facebook"){fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);fbSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="Instagram"){igEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}
                  if(camp.platform==="TikTok"){ttEarned+=parseFloat(camp.follows||0);ttSpend+=parseFloat(camp.spend||0);}
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;
              var totalSpend=fbSpend+igSpend+ttSpend;
              return <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
                  <Glass accent={P.fb} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:11,fontWeight:700,color:P.fb,fontFamily:fm}}>FACEBOOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>PAGE LIKES EARNED</div><div style={{fontSize:36,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(fbEarned)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.txt,fontFamily:fm}}>{fR(fbSpend)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER LIKE</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{fbEarned>0?fR(fbSpend/fbEarned):"\\u2014"}</div></div></div>
                  </Glass>
                  <Glass accent={P.ig} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:11,fontWeight:700,color:P.ig,fontFamily:fm}}>INSTAGRAM</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FOLLOWERS EARNED</div><div style={{fontSize:36,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(igEarned)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.txt,fontFamily:fm}}>{fR(igSpend)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{igEarned>0?fR(igSpend/igEarned):"\\u2014"}</div></div></div>
                  </Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:11,fontWeight:700,color:P.tt,fontFamily:fm}}>TIKTOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>FOLLOWS EARNED</div><div style={{fontSize:36,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(ttEarned)}</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,display:"flex",justifyContent:"space-between"}}><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>SPEND</div><div style={{fontSize:14,fontWeight:700,color:P.txt,fontFamily:fm}}>{fR(ttSpend)}</div></div><div style={{textAlign:"center",flex:1}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:1,marginBottom:2}}>COST PER FOLLOW</div><div style={{fontSize:14,fontWeight:700,color:P.ember,fontFamily:fm}}>{ttEarned>0?fR(ttSpend/ttEarned):"\\u2014"}</div></div></div>
                  </Glass>
                </div>
                <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Community Growth by Platform</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{name:"FB Page Likes",value:fbEarned},{name:"IG Followers",value:igEarned},{name:"TT Follows",value:ttEarned}]} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent"/>
                      <YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                      <Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                      <Bar dataKey="value" name="Earned" radius={[6,6,0,0]}><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL EARNED</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(totalEarned)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL SPEND</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>{fR(totalSpend)}</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>BLENDED COST PER MEMBER</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{totalEarned>0?fR(totalSpend/totalEarned):"\\u2014"}</div></Glass>
                </div>
                <Insight title="Community Growth Analysis" accent={P.mint} icon={Ic.users(P.mint,16)}>{(function(){var p=[];if(totalEarned===0){return "No follower or like campaigns are active in the selected campaigns for this period.";}p.push("The selected campaigns have grown the community by "+fmt(totalEarned)+" new members across all active platforms during this period, with "+fR(totalSpend)+" invested at a blended cost of "+fR(totalSpend/totalEarned)+" per new community member.");if(fbEarned>0){p.push("Facebook contributed "+fmt(fbEarned)+" new page likes at "+fR(fbSpend/fbEarned)+" cost per like. Each new page like permanently increases organic News Feed distribution, strengthening future campaign reach without additional paid investment.");}if(igEarned>0){p.push("Instagram delivered "+fmt(igEarned)+" new followers at "+fR(igSpend/igEarned)+" cost per follow. Instagram followers directly increase Stories, Reels, and Feed visibility, creating a compounding organic reach asset.");}if(ttEarned>0){p.push("TikTok generated "+fmt(ttEarned)+" new follows at "+fR(ttSpend/ttEarned)+" cost per follow. Each TikTok follower feeds directly into the For You page recommendation engine, increasing the probability of organic content amplification beyond the paid audience.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>
"""

# Lines 324-401 (1-indexed) = 323-400 (0-indexed)
before = lines[:323]
after = lines[400:]

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.writelines(before)
    f.write(new_section)
    f.writelines(after)

print("Done - community section replaced by line numbers")
