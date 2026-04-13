with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old = """              var matchedPages2=[];var matchedIds2={};
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
              }"""

new = """              var matchedPages2=[];var matchedIds2={};
              for(var s=0;s<sel.length;s++){
                var bestPg=null;var bestSc=0;
                for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>bestSc){bestSc=sc3;bestPg=pg;}
                }
                if(bestSc<2){
                  var cn2=(sel[s].campaignName||"").toLowerCase();
                  for(var oi2=0;oi2<pageOverrides.length;oi2++){
                    if(cn2.indexOf(pageOverrides[oi2].campaign)>=0){
                      for(var p2=0;p2<pages.length;p2++){
                        if((pages[p2].name||"").toLowerCase().indexOf(pageOverrides[oi2].page)>=0){bestPg=pages[p2];bestSc=10;break;}
                      }
                    }
                  }
                }
                if(bestPg&&bestSc>=2&&matchedIds2[bestPg.id]!==true){matchedPages2.push(bestPg);matchedIds2[bestPg.id]=true;}
              }"""

if old in c:
    c = c.replace(old, new)
    print("Fixed: find ONE best page per campaign, min score 2, deduplicate")
else:
    print("Pattern not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
