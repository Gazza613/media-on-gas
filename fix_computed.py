with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_computed = """var sel=campaigns.filter(function(c){return selected.indexOf(c.campaignId)>=0;});
    var mc=sel.filter(function(c){return c.platform==="Meta";});
    var tc=sel.filter(function(c){return c.platform==="TikTok";});
    var mt=mc.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),reach:a.reach+parseFloat(c.reach||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0)};},{impressions:0,reach:0,spend:0,clicks:0});
    mt.cpm=mt.impressions>0?(mt.spend/mt.impressions)*1000:0;mt.cpc=mt.clicks>0?mt.spend/mt.clicks:0;mt.ctr=mt.impressions>0?(mt.clicks/mt.impressions)*100:0;mt.frequency=mt.reach>0?mt.impressions/mt.reach:0;
    var tt=tc.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0),follows:a.follows+parseFloat(c.follows||0),likes:a.likes+parseFloat(c.likes||0)};},{impressions:0,spend:0,clicks:0,follows:0,likes:0});
    tt.cpm=tt.impressions>0?(tt.spend/tt.impressions)*1000:0;
    var ti=mt.impressions+tt.impressions,ts2=mt.spend+tt.spend,tc2=mt.clicks+tt.clicks;
    return{metaCamps:mc,ttCamps:tc,meta:mt,tt:tt,totalImps:ti,totalSpend:ts2,totalClicks:tc2,blendedCpm:ti>0?(ts2/ti)*1000:0,allSelected:sel};"""

new_computed = """var sel=campaigns.filter(function(c){return selected.indexOf(c.campaignId)>=0;});
    var fbC=sel.filter(function(c){return c.platform==="Facebook";});
    var igC=sel.filter(function(c){return c.platform==="Instagram";});
    var mc=sel.filter(function(c){return c.platform==="Facebook"||c.platform==="Instagram"||c.platform==="Meta";});
    var tc=sel.filter(function(c){return c.platform==="TikTok";});
    var sumP=function(arr){return arr.reduce(function(a,c){return{impressions:a.impressions+parseFloat(c.impressions||0),reach:a.reach+parseFloat(c.reach||0),spend:a.spend+parseFloat(c.spend||0),clicks:a.clicks+parseFloat(c.clicks||0),leads:a.leads+parseFloat(c.leads||0),appInstalls:a.appInstalls+parseFloat(c.appInstalls||0),landingPageViews:a.landingPageViews+parseFloat(c.landingPageViews||0),pageLikes:a.pageLikes+parseFloat(c.pageLikes||0),follows:a.follows+parseFloat(c.follows||0),likes:a.likes+parseFloat(c.likes||0)};},{impressions:0,reach:0,spend:0,clicks:0,leads:0,appInstalls:0,landingPageViews:0,pageLikes:0,follows:0,likes:0});};
    var calcD=function(d){d.cpm=d.impressions>0?(d.spend/d.impressions)*1000:0;d.cpc=d.clicks>0?d.spend/d.clicks:0;d.ctr=d.impressions>0?(d.clicks/d.impressions)*100:0;d.frequency=d.reach>0?d.impressions/d.reach:0;d.costPerLead=d.leads>0?d.spend/d.leads:0;d.costPerInstall=d.appInstalls>0?d.spend/d.appInstalls:0;return d;};
    var fb=calcD(sumP(fbC));var ig=calcD(sumP(igC));var mt=calcD(sumP(mc));var tt=calcD(sumP(tc));
    var ti=mt.impressions+tt.impressions,ts2=mt.spend+tt.spend,tc2=mt.clicks+tt.clicks;
    var grand={impressions:ti,spend:ts2,clicks:tc2,reach:mt.reach+tt.reach,leads:mt.leads+tt.leads,appInstalls:mt.appInstalls+tt.appInstalls,follows:mt.follows+tt.follows,pageLikes:mt.pageLikes+tt.pageLikes,likes:mt.likes+tt.likes,landingPageViews:mt.landingPageViews+tt.landingPageViews};
    grand.cpm=grand.impressions>0?(grand.spend/grand.impressions)*1000:0;grand.cpc=grand.clicks>0?grand.spend/grand.clicks:0;grand.ctr=grand.impressions>0?(grand.clicks/grand.impressions)*100:0;grand.frequency=grand.reach>0?grand.impressions/grand.reach:0;grand.costPerLead=grand.leads>0?grand.spend/grand.leads:0;
    return{fbCamps:fbC,igCamps:igC,metaCamps:mc,ttCamps:tc,fb:fb,ig:ig,meta:mt,tt:tt,grand:grand,totalImps:ti,totalSpend:ts2,totalClicks:tc2,blendedCpm:ti>0?(ts2/ti)*1000:0,allSelected:sel};"""

c = c.replace(old_computed, new_computed)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - computed updated with FB/IG split")
print("fbCamps found:", "fbCamps" in c)
