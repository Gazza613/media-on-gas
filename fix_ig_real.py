with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix getResult for Instagram Followers & Likes - use pages follower_growth data
# The pages data is available in the component scope
c = c.replace(
    "if(obj===\"Followers & Likes\"){return parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);}",
    """if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.platform==="Instagram"){var cn=(camp.campaignName||"").toLowerCase();if(cn.indexOf("follower")>=0){for(var pi=0;pi<pages.length;pi++){var pg=pages[pi];if(pg.instagram_business_account&&pg.instagram_business_account.follower_growth>0){var pn=(pg.name||"").toLowerCase();if((cn.indexOf("momo")>=0&&pn.indexOf("momo")>=0)||(cn.indexOf("psycho")>=0&&pn.indexOf("psycho")>=0)||(cn.indexOf("eden")>=0&&pn.indexOf("eden")>=0)||(cn.indexOf("concord")>=0&&pn.indexOf("concord")>=0)){fl=pg.instagram_business_account.follower_growth;break;}}}}}return fl;}"""
)

# Fix community growth IG earned to also use pages data
c = c.replace(
    "if(camp.platform===\"Instagram\"){igEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}",
    """if(camp.platform==="Instagram"&&isFollowLike){var igGrowth=0;for(var pj=0;pj<pages.length;pj++){var pgj=pages[pj];if(pgj.instagram_business_account&&pgj.instagram_business_account.follower_growth>0){var pnj=(pgj.name||"").toLowerCase();var cnj=(camp.campaignName||"").toLowerCase();if((cnj.indexOf("momo")>=0&&pnj.indexOf("momo")>=0)||(cnj.indexOf("psycho")>=0&&pnj.indexOf("psycho")>=0)){igGrowth=pgj.instagram_business_account.follower_growth;break;}}}igEarned+=igGrowth>0?igGrowth:parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - IG uses real follower growth from Insights API")
