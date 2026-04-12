with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Remove the old getObj version
c = c.replace(
    """sel.forEach(function(camp){
                var n=(camp.campaignName||"").toLowerCase();
                var obj=getObj(camp.campaignName);
                if(obj==="Followers & Likes"){
                  var result=getResult(camp,obj);
                  if(camp.platform==="Facebook") fbEarned+=result;
                  if(camp.platform==="Instagram") igEarned+=result;
                  if(camp.platform==="TikTok") ttEarned+=result;
                }
              });""",
    ""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - removed old getObj reference")
print("getObj still in community:", "getObj" in c[c.find("COMMUNITY"):] if "COMMUNITY" in c else "no community found")
