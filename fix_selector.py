with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix the group header color to be dynamic based on platforms in the group
c = c.replace(
    'var gc=gr.platform==="TikTok"?P.tt:P.fb;',
    'var gc=gr.campaigns[0].platform==="TikTok"?P.tt:gr.campaigns[0].platform==="Google Display"?P.gd:gr.campaigns[0].platform==="Instagram"?P.ig:P.fb;'
)

# Fix selectAll to use all filtered campaigns not just visible ones
c = c.replace(
    'var selectAll=function(){var f=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});setSelected(f.map(function(c){return c.campaignId;}));};',
    'var selectAll=function(){var f=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});setSelected(f.map(function(c){return c.campaignId;}));};'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done")
