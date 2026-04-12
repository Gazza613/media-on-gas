with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix Community Growth - for IG follower campaigns, use pageFollows
c = c.replace(
    'if(camp.platform==="Instagram"){igEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}',
    'if(camp.platform==="Instagram"){igEarned+=parseFloat(camp.pageFollows||camp.pageLikes||0)+parseFloat(camp.follows||0);igSpend+=parseFloat(camp.spend||0);}'
)

# Fix Objective table getResult - for Followers & Likes, IG should use pageFollows
c = c.replace(
    'if(obj==="Followers & Likes")return parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);',
    'if(obj==="Followers & Likes"){var fl=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);if(fl===0&&camp.pageFollows){fl=parseFloat(camp.pageFollows||0);}return fl;}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - IG uses pageFollows for follower campaigns")
