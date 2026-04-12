with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add a mapping table at the top of the component, after the state declarations
# Map: campaign keyword → Facebook Page name keyword
mapping_table = """
  var clientPageMap=[
    {campaign:"momo",page:"momo from mtn za",igPage:"momofrommtnza"},
    {campaign:"psycho",page:"psycho bunny",igPage:"psychobunnyza"},
    {campaign:"willowbrook",page:"flower foundation",igPage:"flowerfoundation1963"},
    {campaign:"eden",page:"eden college",igPage:""},
    {campaign:"concord",page:"concord college",igPage:"concord_collegerandburg"},
    {campaign:"flower",page:"flower foundation",igPage:"flowerfoundation1963"},
    {campaign:"hatzolah",page:"hatzolah",igPage:"hatzolahsa"},
    {campaign:"baby city",page:"baby city",igPage:"babycityza"},
    {campaign:"dischem",page:"dis-chem",igPage:"dischem_pharmacies"},
    {campaign:"dis-chem",page:"dis-chem",igPage:"dischem_pharmacies"},
    {campaign:"superga",page:"superga",igPage:"superga_sa"},
    {campaign:"tomato",page:"tomato watches",igPage:"tomatowatchessa"},
    {campaign:"matus",page:"matus",igPage:"matustools"},
    {campaign:"gas marketing",page:"gas marketing",igPage:"gasmarketingsa"},
    {campaign:"khava",page:"mtn khava",igPage:""}
  ];
  var matchPage=function(campaignName,pageName){
    var cn=(campaignName||"").toLowerCase();
    var pn=(pageName||"").toLowerCase();
    for(var mi=0;mi<clientPageMap.length;mi++){
      var m=clientPageMap[mi];
      if(cn.indexOf(m.campaign)>=0&&pn.indexOf(m.page)>=0)return true;
    }
    return false;
  };
  var findIgGrowth=function(campaignName,pagesArr){
    var cn=(campaignName||"").toLowerCase();
    for(var mi=0;mi<clientPageMap.length;mi++){
      var m=clientPageMap[mi];
      if(cn.indexOf(m.campaign)>=0){
        for(var pi=0;pi<pagesArr.length;pi++){
          var pg=pagesArr[pi];
          if(pg.instagram_business_account&&(pg.name||"").toLowerCase().indexOf(m.page)>=0){
            return pg.instagram_business_account.follower_growth||0;
          }
        }
      }
    }
    return 0;
  };
"""

# Insert after the isClient line
c = c.replace(
    '  var isClient=window.location.pathname.indexOf("/view/")===0;',
    '  var isClient=window.location.pathname.indexOf("/view/")===0;\n' + mapping_table
)

# Now replace the complex getResult IG matching with the clean function
old_getresult = """if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.platform==="Instagram"){var cn=(camp.campaignName||"").toLowerCase();if(cn.indexOf("follower")>=0){for(var pi=0;pi<pages.length;pi++){var pg=pages[pi];if(pg.instagram_business_account&&pg.instagram_business_account.follower_growth>0){var pn=(pg.name||"").toLowerCase();if((cn.indexOf("momo")>=0&&pn.indexOf("momo")>=0)||(cn.indexOf("psycho")>=0&&pn.indexOf("psycho")>=0)||(cn.indexOf("eden")>=0&&pn.indexOf("eden")>=0)||(cn.indexOf("concord")>=0&&pn.indexOf("concord")>=0)||(cn.indexOf("willowbrook")>=0&&pn.indexOf("flower")>=0)){fl=pg.instagram_business_account.follower_growth;break;}}}}}return fl;}"""

new_getresult = """if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.platform==="Instagram"){var cn2=(camp.campaignName||"").toLowerCase();if(cn2.indexOf("follower")>=0){var igG=findIgGrowth(camp.campaignName,pages);if(igG>0)fl=igG;}}return fl;}"""

c = c.replace(old_getresult, new_getresult)

# Replace community growth IG matching
old_community = """if(camp.platform==="Instagram"&&isFollowLike){var igGrowth=0;for(var pj=0;pj<pages.length;pj++){var pgj=pages[pj];if(pgj.instagram_business_account&&pgj.instagram_business_account.follower_growth>0){var pnj=(pgj.name||"").toLowerCase();var cnj=(camp.campaignName||"").toLowerCase();if((cnj.indexOf("momo")>=0&&pnj.indexOf("momo")>=0)||(cnj.indexOf("psycho")>=0&&pnj.indexOf("psycho")>=0)||(cnj.indexOf("willowbrook")>=0&&pnj.indexOf("flower")>=0)){igGrowth=pgj.instagram_business_account.follower_growth;break;}}}igEarned+=igGrowth>0?igGrowth:parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}"""

new_community = """if(camp.platform==="Instagram"&&isFollowLike){var igGrowth2=findIgGrowth(camp.campaignName,pages);igEarned+=igGrowth2>0?igGrowth2:parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}"""

c = c.replace(old_community, new_community)

# Also fix the community growth page matching for FB total likes
old_fb_match = """for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  var pn=(pg.name||"").toLowerCase();
                  for(var s=0;s<selNames.length;s++){
                    if(selNames[s].indexOf("momo")>=0&&pn.indexOf("momo")>=0){fbPage=pg;break;}
                    if(selNames[s].indexOf("psycho")>=0&&pn.indexOf("psycho")>=0){fbPage=pg;break;}
                    if(selNames[s].indexOf("willowbrook")>=0&&pn.indexOf("flower")>=0){fbPage=pg;break;}
                    if(selNames[s].indexOf("eden")>=0&&pn.indexOf("eden")>=0){fbPage=pg;break;}
                    if(selNames[s].indexOf("concord")>=0&&pn.indexOf("concord")>=0){fbPage=pg;break;}
                  }
                  if(fbPage)break;
                }"""

new_fb_match = """for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  for(var s=0;s<selNames.length;s++){
                    if(matchPage(selNames[s],pg.name)){fbPage=pg;break;}
                  }
                  if(fbPage)break;
                }"""

c = c.replace(old_fb_match, new_fb_match)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - central mapping table for all clients")
