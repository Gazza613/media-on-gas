with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add pages state
c = c.replace(
    'var fs=useState([]),flags=fs[0],setFlags=fs[1];',
    'var fs=useState([]),flags=fs[0],setFlags=fs[1];\n  var ps=useState([]),pages=ps[0],setPages=ps[1];'
)

# Store pages data from API response
c = c.replace(
    'if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.map(function(c){return c.campaignId;}));}',
    'if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.map(function(c){return c.campaignId;}));}if(d.pages){setPages(d.pages);}'
)

# Now replace the Community Growth section
start = c.find('{/* \\u2550\\u2550\\u2550 COMMUNITY GROWTH')
if start < 0:
    start = c.find('COMMUNITY GROWTH')
    if start > 0:
        start = c.rfind('{/*', 0, start)

# Find the end - it's followed by the closing </div> for the overview tab
end = c.find('</div>)}\n\n        ', start)
if end < 0:
    end = c.find("</div>)}\n\n        {tab==", start)

if start < 0 or end < 0:
    print("ERROR: Community Growth markers not found", start, end)
else:
    before = c[:start]
    after = c[end:]

    new_community = """{/* COMMUNITY GROWTH */}
          <div style={{background:P.glass,borderRadius:18,padding:"6px 24px 24px",marginBottom:28,border:"1px solid "+P.rule}}>
            <div style={{textAlign:"center",padding:"18px 0 16px"}}><span style={{fontSize:18,fontWeight:900,color:P.txt,fontFamily:ff,letterSpacing:1}}>COMMUNITY GROWTH</span><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4,letterSpacing:3}}>PAGE LIKES, FOLLOWERS & FOLLOWS BY PLATFORM</div></div>

            {(function(){
              var sel=campaigns.filter(function(x){return selected.indexOf(x.campaignId)>=0;});
              var campPageLikes=sel.reduce(function(a,c){return a+parseFloat(c.pageLikes||0);},0);
              var campFollows=sel.filter(function(c){return c.platform==="TikTok";}).reduce(function(a,c){return a+parseFloat(c.follows||0);},0);

              var fbPages=pages.filter(function(p){
                var selNames=sel.map(function(s){return(s.accountName||"").toLowerCase();});
                var pName=(p.name||"").toLowerCase();
                return selNames.some(function(n){return pName.indexOf("momo")>=0&&n.indexOf("momo")>=0||pName.indexOf("psycho")>=0&&n.indexOf("psycho")>=0||pName.indexOf("concord")>=0&&n.indexOf("concord")>=0||pName.indexOf("eden")>=0&&n.indexOf("eden")>=0||pName.indexOf("flower")>=0&&(n.indexOf("flower")>=0||n.indexOf("gas agency")>=0)||pName.indexOf("willowbrook")>=0&&n.indexOf("gas agency")>=0||pName===n;});
              });

              var fbLikes=0;var igFollowers=0;var pageName="";var igName="";
              if(fbPages.length>0){
                fbLikes=fbPages[0].fan_count||0;
                pageName=fbPages[0].name||"";
                if(fbPages[0].instagram_business_account){
                  igFollowers=fbPages[0].instagram_business_account.followers_count||0;
                  igName="@"+(fbPages[0].instagram_business_account.username||"");
                }
              }

              var fbEarned=sel.filter(function(c){return c.platform==="Facebook";}).reduce(function(a,c){return a+parseFloat(c.pageLikes||0);},0);
              var igEarned=sel.filter(function(c){return c.platform==="Instagram";}).reduce(function(a,c){return a+parseFloat(c.pageLikes||0);},0);
              var ttEarned=campFollows;
              var totalEarned=fbEarned+igEarned+ttEarned;

              return <div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24}}>
                  <Glass accent={P.fb} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.fb}}></span><span style={{fontSize:11,fontWeight:700,color:P.fb,fontFamily:fm}}>FACEBOOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL PAGE LIKES</div><div style={{fontSize:36,fontWeight:900,color:P.fb,fontFamily:fm}}>{fmt(fbLikes)}</div>{pageName&&<div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4}}>{pageName}</div>}</div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(fbEarned)}</div></div>
                  </Glass>
                  <Glass accent={P.ig} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.ig}}></span><span style={{fontSize:11,fontWeight:700,color:P.ig,fontFamily:fm}}>INSTAGRAM</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWERS</div><div style={{fontSize:36,fontWeight:900,color:P.ig,fontFamily:fm}}>{fmt(igFollowers)}</div>{igName&&<div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4}}>{igName}</div>}</div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(igEarned)}</div></div>
                  </Glass>
                  <Glass accent={P.tt} hv={true} st={{padding:22}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:14}}><span style={{width:10,height:10,borderRadius:"50%",background:P.tt}}></span><span style={{fontSize:11,fontWeight:700,color:P.tt,fontFamily:fm}}>TIKTOK</span></div>
                    <div style={{textAlign:"center",marginBottom:14}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL FOLLOWS</div><div style={{fontSize:36,fontWeight:900,color:P.tt,fontFamily:fm}}>{fmt(ttEarned)}</div><div style={{fontSize:10,color:P.sub,fontFamily:fm,marginTop:4}}>Campaign period</div></div>
                    <div style={{borderTop:"1px solid "+P.rule,paddingTop:12,textAlign:"center"}}><div style={{fontSize:9,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>+{fmt(ttEarned)}</div></div>
                  </Glass>
                </div>

                <div style={{background:"rgba(0,0,0,0.15)",borderRadius:12,padding:20,marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:800,color:P.sub,letterSpacing:3,fontFamily:fm,textTransform:"uppercase",marginBottom:14}}>Community Growth by Platform</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={[{name:"FB Page Likes",Current:fbLikes,Earned:fbEarned,fill:P.fb},{name:"IG Followers",Current:igFollowers,Earned:igEarned,fill:P.ig},{name:"TT Follows",Current:0,Earned:ttEarned,fill:P.tt}]} barSize={30}>
                      <CartesianGrid strokeDasharray="3 3" stroke={P.rule}/>
                      <XAxis dataKey="name" tick={{fontSize:11,fill:P.txt,fontFamily:fm}} stroke="transparent"/>
                      <YAxis tick={{fontSize:10,fill:P.dim,fontFamily:fm}} stroke="transparent" tickFormatter={function(v){return fmt(v);}}/>
                      <Tooltip content={Tip} cursor={{fill:"rgba(255,255,255,0.05)"}}/>
                      <Bar dataKey="Current" name="Total Current" radius={[6,6,0,0]} stackId="a"><Cell fill={P.fb+"80"}/><Cell fill={P.ig+"80"}/><Cell fill={P.tt+"80"}/></Bar>
                      <Bar dataKey="Earned" name="Earned This Period" radius={[6,6,0,0]} stackId="a"><Cell fill={P.fb}/><Cell fill={P.ig}/><Cell fill={P.tt}/></Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",justifyContent:"center",gap:16,marginTop:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:"rgba(255,255,255,0.3)"}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Total Current</span></div>
                    <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:8,height:8,borderRadius:2,background:P.mint}}></span><span style={{fontSize:10,color:P.sub,fontFamily:fm}}>Earned This Period</span></div>
                  </div>
                </div>

                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                  <Glass accent={P.mint} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>TOTAL COMMUNITY</div><div style={{fontSize:22,fontWeight:900,color:P.mint,fontFamily:fm}}>{fmt(fbLikes+igFollowers+ttEarned)}</div></Glass>
                  <Glass accent={P.ember} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>EARNED THIS PERIOD</div><div style={{fontSize:22,fontWeight:900,color:P.ember,fontFamily:fm}}>+{fmt(totalEarned)}</div></Glass>
                  <Glass accent={P.orchid} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>GROWTH RATE</div><div style={{fontSize:22,fontWeight:900,color:P.orchid,fontFamily:fm}}>{(fbLikes+igFollowers)>0?((totalEarned/(fbLikes+igFollowers-totalEarned))*100).toFixed(1):0}%</div></Glass>
                  <Glass accent={P.solar} hv={true} st={{padding:16,textAlign:"center"}}><div style={{fontSize:8,color:P.dim,fontFamily:fm,letterSpacing:2,marginBottom:4}}>COST PER MEMBER</div><div style={{fontSize:22,fontWeight:900,color:P.solar,fontFamily:fm}}>{totalEarned>0?fR(computed.totalSpend/totalEarned):"0"}</div></Glass>
                </div>

                <Insight title="Community Growth Analysis" accent={P.mint} icon={Ic.users(P.mint,16)}>{(function(){var p=[];p.push("The campaign has grown the combined community by "+fmt(totalEarned)+" new members across all platforms during the selected period.");if(fbLikes>0&&fbEarned>0){p.push("The Facebook page \\'"+pageName+"\\' now has "+fmt(fbLikes)+" total page likes, having earned "+fmt(fbEarned)+" new likes through the campaign. Each page like increases organic content distribution through Facebook\\'s News Feed algorithm, strengthening future campaign reach without additional paid investment.");}if(igFollowers>0&&igEarned>0){p.push("The Instagram account "+igName+" has grown to "+fmt(igFollowers)+" total followers, with "+fmt(igEarned)+" new followers acquired during this period. Instagram followers directly increase Stories, Reels, and Feed visibility, creating a compounding organic reach asset.");}if(ttEarned>0){p.push("TikTok follower campaigns delivered "+fmt(ttEarned)+" new follows. Each TikTok follower feeds directly into the For You page recommendation engine, increasing the probability of organic content amplification beyond the paid audience.");}if(totalEarned>0){p.push("The blended cost per community member of "+fR(computed.totalSpend/totalEarned)+" represents the investment required to add each new organic distribution channel across the brand\\'s social ecosystem.");}return p.join(" ");})()}</Insight>
              </div>;
            })()}
          </div>

        """

    c = before + new_community + after
    with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
        f.write(c)
    print("Done - Community Growth section built")
    print("COMMUNITY found:", "COMMUNITY GROWTH" in c)
