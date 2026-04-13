with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old = """              var matchedPages2=[];var matchedIds2={};
              for(var p=0;p<pages.length;p++){
                var pg=pages[p];
                for(var s=0;s<sel.length;s++){
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                }
                  for(var s2=0;s2<sel.length;s2++){
                    var cn2=(sel[s2].campaignName||"").toLowerCase();
                    for(var oi2=0;oi2<pageOverrides.length;oi2++){if(cn2.indexOf(pageOverrides[oi2].campaign)>=0&&(pg.name||"").toLowerCase().indexOf(pageOverrides[oi2].page)>=0){matchedPages2.push(pg);matchedIds2[pg.id]=true;break;}}
                    if(matchedIds2[pg.id])break;
                  }
                }
              }
              var fbTotal=0;var igTotal=0;
              if(matchedPages2.length>0){
                matchedPages2.forEach(function(mp){fbTotal+=mp.fan_count||0;if(mp.instagram_business_account){igTotal+=mp.instagram_business_account.followers_count||0;}});
                fbPage=matchedPages2[0];
                if(fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;}
              }"""

new = """              var matchedPages2=[];var matchedIds2={};
              for(var p=0;p<pages.length;p++){
                var pg=pages[p];
                var pgMatched=false;
                for(var s=0;s<sel.length;s++){
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>0){pgMatched=true;break;}
                }
                if(pgMatched&&matchedIds2[pg.id]!==true){matchedPages2.push(pg);matchedIds2[pg.id]=true;}
                if(matchedIds2[pg.id]!==true){
                  for(var s2=0;s2<sel.length;s2++){
                    var cn2=(sel[s2].campaignName||"").toLowerCase();
                    for(var oi2=0;oi2<pageOverrides.length;oi2++){if(cn2.indexOf(pageOverrides[oi2].campaign)>=0&&(pg.name||"").toLowerCase().indexOf(pageOverrides[oi2].page)>=0){matchedPages2.push(pg);matchedIds2[pg.id]=true;break;}}
                    if(matchedIds2[pg.id]===true)break;
                  }
                }
              }
              var fbTotal=0;var igTotal=0;
              if(matchedPages2.length>0){
                matchedPages2.forEach(function(mp){fbTotal+=mp.fan_count||0;if(mp.instagram_business_account){igTotal+=mp.instagram_business_account.followers_count||0;}});
                fbPage=matchedPages2[0];
                if(fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;}
              }"""

if old in c:
    c = c.replace(old, new)
    print("Fixed community page matching")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
