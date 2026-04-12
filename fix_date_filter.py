with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Filter campaigns in selector to only show those with data (impressions > 0 or spend > 0)
c = c.replace(
    'var f=cs.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});',
    'var f=cs.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0);});'
)

# Also update the selectAll to use same filter
c = c.replace(
    'var selectAll=function(){var f=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});',
    'var selectAll=function(){var f=campaigns.filter(function(c){return (parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0)&&(c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0);});'
)

# Add status badge showing completed/paused in the campaign item
c = c.replace(
    """{c.status&&c.status!=="active"&&<span style={{color:c.status==="scheduled"?P.solar:c.status==="pending"?P.cyan:c.status==="completed"?P.sub:P.warning,fontWeight:700,textTransform:"uppercase",marginLeft:4}}>{c.status}</span>}""",
    """{c.status&&c.status!=="active"&&<span style={{background:c.status==="scheduled"?P.solar+"20":c.status==="paused"?P.warning+"20":c.status==="completed"?P.sub+"20":P.dim+"20",color:c.status==="scheduled"?P.solar:c.status==="paused"?P.warning:c.status==="completed"?P.sub:P.dim,fontWeight:700,textTransform:"uppercase",marginLeft:4,fontSize:7,padding:"2px 6px",borderRadius:4,letterSpacing:1}}>{c.status}</span>}"""
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - date filtered selector with status badges")
