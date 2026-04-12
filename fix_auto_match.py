with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Replace the hardcoded mapping table and functions with auto-matching
old_mapping = """  var clientPageMap=[
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
  };"""

new_mapping = """  var autoMatchPage=function(campaignName,pageName){
    var cn=(campaignName||"").toLowerCase().replace(/[|_\\-]/g," ");
    var pn=(pageName||"").toLowerCase().replace(/[|_\\-]/g," ");
    var cWords=cn.split(/\\s+/).filter(function(w){return w.length>2&&["gas","the","and","for","from","apr","mar","may","jun","jul","aug","sep","oct","nov","dec","jan","feb","2026","2025","paid","social","facebook","instagram","tiktok","campaign","funnel","cycle","leads","lead","follower","like","appinstall","traffic","cold","warm","display","search"].indexOf(w)<0;});
    var score=0;
    for(var wi=0;wi<cWords.length;wi++){
      if(pn.indexOf(cWords[wi])>=0)score++;
    }
    return score;
  };
  var matchPage=function(campaignName,pageName){
    return autoMatchPage(campaignName,pageName)>0;
  };
  var findBestPage=function(campaignName,pagesArr){
    var bestPage=null;var bestScore=0;
    for(var pi=0;pi<pagesArr.length;pi++){
      var sc=autoMatchPage(campaignName,pagesArr[pi].name);
      if(sc>bestScore){bestScore=sc;bestPage=pagesArr[pi];}
    }
    return bestPage;
  };
  var findIgGrowth=function(campaignName,pagesArr){
    var pg=findBestPage(campaignName,pagesArr);
    if(pg&&pg.instagram_business_account){return pg.instagram_business_account.follower_growth||0;}
    return 0;
  };"""

c = c.replace(old_mapping, new_mapping)

# Also fix the community growth FB page matching to use auto-match
c = c.replace(
    """for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  for(var s=0;s<selNames.length;s++){
                    if(matchPage(selNames[s],pg.name)){fbPage=pg;break;}
                  }
                  if(fbPage)break;
                }""",
    """var bestScore2=0;
                for(var p=0;p<pages.length;p++){
                  var pg=pages[p];
                  for(var s=0;s<selNames.length;s++){
                    var sc2=autoMatchPage(selNames[s],pg.name);
                    if(sc2>bestScore2){bestScore2=sc2;fbPage=pg;}
                  }
                }"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - fully automatic client-page matching")
