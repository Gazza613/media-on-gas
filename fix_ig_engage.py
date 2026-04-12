with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix engagements to use real IG data instead of pageFollows
c = c.replace(
    'var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0)+(camp.pageFollows?parseFloat(camp.pageFollows):0);',
    'var engagements=parseFloat(camp.follows||0)+parseFloat(camp.likes||0)+parseFloat(camp.pageLikes||0);if(engagements===0&&camp.platform==="Instagram"){var igEng=findIgGrowth(camp.campaignName,pages);if(igEng>0)engagements=igEng;}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - engagements uses real IG data")
