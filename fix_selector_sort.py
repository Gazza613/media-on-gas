with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Find the CampaignSelector component and update the rendering
# Group campaigns by accountName (client) then show platforms under each
old_selector = """var filtered=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});"""

if old_selector in c:
    new_selector = """var filtered=campaigns.filter(function(c){return c.campaignName.toLowerCase().indexOf(search.toLowerCase())>=0||c.accountName.toLowerCase().indexOf(search.toLowerCase())>=0;});
      var grouped={};filtered.forEach(function(camp){var client=camp.accountName||"Unknown";if(!grouped[client])grouped[client]=[];grouped[client].push(camp);});
      var clientOrder=Object.keys(grouped).sort();"""
    c = c.replace(old_selector, new_selector)

    # Replace the campaign list rendering to show by client group
    old_render = """{filtered.map(function(c){"""
    new_render = """{clientOrder.map(function(client){return <div key={client}><div style={{padding:"8px 14px",fontSize:10,fontWeight:800,color:P.ember,fontFamily:fm,letterSpacing:2,textTransform:"uppercase",borderBottom:"1px solid "+P.rule,marginTop:8}}>{client}</div>{grouped[client].map(function(c){"""
    
    if old_render in c:
        c = c.replace(old_render, new_render)
        
        # Find the closing of the map and add extra closing for the client group
        old_close = """return <div key={c.campaignId}"""
        # We need to close the inner map and outer map
        # Find the end of the campaign item render
        
    print("Selector grouped by client")
else:
    print("Selector text not found")

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - selector sort")
