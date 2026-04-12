with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

c = c.replace(
    'if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.pageFollows){fl=parseFloat(camp.pageFollows||0);}return fl;}',
    'if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.platform==="Instagram"){var igFL=findIgGrowth(camp.campaignName,pages);if(igFL>0)fl=igFL;}return fl;}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - IG uses real follower growth in objectives")
