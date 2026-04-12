with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old = """var fbEarned=0;var igEarned=0;var ttEarned=0;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;
                if(isFollowLike){
                  if(camp.platform==="Facebook"){
                    fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);
                  }
                  if(camp.platform==="Instagram"){
                    fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);
                  }
                  if(camp.platform==="TikTok"){
                    ttEarned+=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);
                  }
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;"""

new = """var fbEarned=0;var igEarned=0;var ttEarned=0;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var isFollowLike=n.indexOf("follower")>=0||n.indexOf("_like_")>=0||n.indexOf("paidsocial_like")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0;
                if(isFollowLike){
                  if(camp.platform==="Facebook"){
                    fbEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);
                  }
                  if(camp.platform==="Instagram"){
                    igEarned+=parseFloat(camp.pageLikes||0)+parseFloat(camp.follows||0);
                  }
                  if(camp.platform==="TikTok"){
                    ttEarned+=parseFloat(camp.follows||0)+parseFloat(camp.pageLikes||0);
                  }
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;"""

c = c.replace(old, new)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - correct platform assignment")
