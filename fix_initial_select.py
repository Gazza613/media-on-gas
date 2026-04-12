with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Fix initial selection to only select campaigns with data
c = c.replace(
    'if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.map(function(c){return c.campaignId;}));}',
    'if(d.campaigns){setCampaigns(d.campaigns);setSelected(d.campaigns.filter(function(c){return parseFloat(c.impressions||0)>0||parseFloat(c.spend||0)>0;}).map(function(c){return c.campaignId;}));}'
)

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - initial selection filters zero-data campaigns")
