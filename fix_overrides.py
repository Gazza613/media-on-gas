with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add manual overrides before autoMatchPage
old_auto = '  var autoMatchPage=function(campaignName,pageName){'
new_auto = """  var pageOverrides=[
    {campaign:"willowbrook",page:"flower foundation"},
    {campaign:"flower",page:"flower foundation"}
  ];
  var autoMatchPage=function(campaignName,pageName){
    var cn=(campaignName||"").toLowerCase();
    var pn=(pageName||"").toLowerCase();
    for(var oi=0;oi<pageOverrides.length;oi++){if(cn.indexOf(pageOverrides[oi].campaign)>=0&&pn.indexOf(pageOverrides[oi].page)>=0)return 10;}"""

if old_auto in c:
    c = c.replace(old_auto, new_auto)
    print("Added page overrides for non-matching names")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
