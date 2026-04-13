with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the single page match with multi-page aggregation
old_match = """              var pageCounts={};
              for(var p=0;p<pages.length;p++){
                var pg=pages[p];
                var pgMatchCount=0;var pgTotalSpend=0;
                for(var s=0;s<sel.length;s++){
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>0){pgMatchCount++;pgTotalSpend+=parseFloat(sel[s].spend||0);}
                }
                if(pgMatchCount>0){pageCounts[pg.id]={page:pg,matches:pgMatchCount,spend:pgTotalSpend};}
              }
              var bestPageId="";var bestPageSpend=0;
              Object.keys(pageCounts).forEach(function(pid){
                if(pageCounts[pid].spend>bestPageSpend){bestPageSpend=pageCounts[pid].spend;bestPageId=pid;}
              });
              if(bestPageId&&pageCounts[bestPageId]){fbPage=pageCounts[bestPageId].page;}"""

new_match = """              var matchedPages=[];var matchedPageIds={};
              for(var p=0;p<pages.length;p++){
                var pg=pages[p];
                for(var s=0;s<sel.length;s++){
                  var sc3=autoMatchPage(sel[s].campaignName,pg.name);
                  if(sc3>0&&!matchedPageIds[pg.id]){matchedPages.push(pg);matchedPageIds[pg.id]=true;break;}
                }
              }
              if(matchedPages.length===1){fbPage=matchedPages[0];}"""

c = c.replace(old_match, new_match)
print("Fix 1: Multi-page matching")

# Replace fbTotal and igTotal to sum across all matched pages
old_totals = """              var fbTotal=fbPage?fbPage.fan_count:0;
              if(fbPage&&fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;}
              var igTotal=igAccount?igAccount.followers_count:0;"""

new_totals = """              var fbTotal=0;var igTotal=0;
              if(matchedPages.length>1){
                matchedPages.forEach(function(mp){fbTotal+=mp.fan_count||0;if(mp.instagram_business_account){igTotal+=mp.instagram_business_account.followers_count||0;}});
              }else if(fbPage){
                fbTotal=fbPage.fan_count||0;
                if(fbPage.instagram_business_account){igAccount=fbPage.instagram_business_account;igTotal=igAccount.followers_count||0;}
              }"""

c = c.replace(old_totals, new_totals)
print("Fix 2: Sum totals across all matched pages")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
