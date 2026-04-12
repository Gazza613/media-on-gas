with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

old_earned = """var fbEarned=0;var igEarned=0;var ttEarned=campFollows;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                if(camp.platform==="Facebook"){
                  if(n.indexOf("_like_")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("paidsocial_like")>=0){
                    fbEarned+=parseFloat(camp.pageLikes||0);
                  }
                }
                if(camp.platform==="Instagram"){
                  if(n.indexOf("follower")>=0){
                    igEarned+=parseFloat(camp.pageLikes||0);
                  }
                }
                if(camp.platform==="Facebook"&&n.indexOf("follower")>=0){
                  fbEarned+=parseFloat(camp.pageLikes||0);
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;"""

new_earned = """var fbEarned=0;var igEarned=0;var ttEarned=campFollows;
              sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                if(camp.platform==="Facebook"){
                  if(n.indexOf("_like_")>=0||n.indexOf("page like")>=0||n.indexOf("pagelikes")>=0||n.indexOf("paidsocial_like")>=0){
                    fbEarned+=parseFloat(camp.pageLikes||0);
                  }
                  if(n.indexOf("follower")>=0){
                    fbEarned+=parseFloat(camp.pageLikes||0);
                  }
                }
                if(camp.platform==="Instagram"){
                  if(n.indexOf("follower")>=0){
                    igEarned+=parseFloat(camp.pageFollows||0);
                  }
                }
              });
              var totalEarned=fbEarned+igEarned+ttEarned;"""

c = c.replace(old_earned, new_earned)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - community growth uses correct fields per platform")
