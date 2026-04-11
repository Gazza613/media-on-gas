with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Add Google Display colour
c = c.replace(
    "tt:\"#00F2EA\"",
    "tt:\"#00F2EA\",gd:\"#34A853\",yt:\"#FF0000\""
)

# Update computed to include Google campaigns
c = c.replace(
    "var tc=sel.filter(function(c){return c.platform===\"TikTok\";});",
    "var tc=sel.filter(function(c){return c.platform===\"TikTok\";});\n    var gdC=sel.filter(function(c){return c.platform===\"Google Display\"||c.platform===\"YouTube\"||c.platform===\"Google Search\";});\n    var gd=calcD(sumP(gdC));"
)

# Update totals to include Google
c = c.replace(
    "var ti=mt.impressions+tt.impressions,ts2=mt.spend+tt.spend,tc2=mt.clicks+tt.clicks;",
    "var ti=mt.impressions+tt.impressions+gd.impressions,ts2=mt.spend+tt.spend+gd.spend,tc2=mt.clicks+tt.clicks+gd.clicks;"
)

# Update grand totals
c = c.replace(
    "var grand={impressions:ti,spend:ts2,clicks:tc2,reach:mt.reach+tt.reach,leads:mt.leads+tt.leads,appInstalls:mt.appInstalls+tt.appInstalls,follows:mt.follows+tt.follows,pageLikes:mt.pageLikes+tt.pageLikes,likes:mt.likes+tt.likes,landingPageViews:mt.landingPageViews+tt.landingPageViews};",
    "var grand={impressions:ti,spend:ts2,clicks:tc2,reach:mt.reach+tt.reach+gd.reach,leads:mt.leads+tt.leads+gd.leads,appInstalls:mt.appInstalls+tt.appInstalls+gd.appInstalls,follows:mt.follows+tt.follows+gd.follows,pageLikes:mt.pageLikes+tt.pageLikes+gd.pageLikes,likes:mt.likes+tt.likes+gd.likes,landingPageViews:mt.landingPageViews+tt.landingPageViews+gd.landingPageViews};"
)

# Add gd to return
c = c.replace(
    "return{fbCamps:fbC,igCamps:igC,metaCamps:mc,ttCamps:tc,",
    "return{fbCamps:fbC,igCamps:igC,metaCamps:mc,ttCamps:tc,gdCamps:gdC,gd:gd,"
)

# Add empty gd to zero state
c = c.replace(
    "tt:Object.assign({},z),",
    "tt:Object.assign({},z),gdCamps:[],gd:Object.assign({},z),"
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - Google Display added to dashboard data")
