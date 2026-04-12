with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "r") as f:
    c = f.read()

# Only replace in the insight text sections, not in table headers or labels
# Find all insight blocks and replace abbreviations with full wording

# CPM -> Cost Per Thousand
c = c.replace(' CPM.', ' Cost Per Thousand Impressions.')
c = c.replace(' CPM,', ' Cost Per Thousand Impressions,')
c = c.replace(' CPM "', ' Cost Per Thousand Impressions "')
c = c.replace(' CPM\\\'', ' Cost Per Thousand Impressions\\\'')
c = c.replace(' CPM"', ' Cost Per Thousand Impressions"')
c = c.replace('" CPM', '" Cost Per Thousand Impressions')
c = c.replace('blended CPM of', 'blended Cost Per Thousand Impressions of')

# CPC -> Cost Per Click  
c = c.replace(' CPC.', ' Cost Per Click.')
c = c.replace(' CPC,', ' Cost Per Click,')
c = c.replace(' CPC"', ' Cost Per Click"')
c = c.replace('" CPC', '" Cost Per Click')
c = c.replace(' CPC with', ' Cost Per Click with')
c = c.replace(' CPC across', ' Cost Per Click across')
c = c.replace('blended CPC', 'blended Cost Per Click')

# CTR -> Click Through Rate
c = c.replace(' CTR.', ' Click Through Rate.')
c = c.replace(' CTR,', ' Click Through Rate,')
c = c.replace(' CTR"', ' Click Through Rate"')
c = c.replace('" CTR', '" Click Through Rate')
c = c.replace(' CTR exceeding', ' Click Through Rate exceeding')
c = c.replace(' CTR at', ' Click Through Rate at')
c = c.replace(' CTR confirms', ' Click Through Rate confirms')
c = c.replace(' CTR indicates', ' Click Through Rate indicates')
c = c.replace(' CTR places', ' Click Through Rate places')

# CPL -> Cost Per Lead
c = c.replace(' CPL"', ' Cost Per Lead"')
c = c.replace(' CPL,', ' Cost Per Lead,')
c = c.replace(' CPL.', ' Cost Per Lead.')

# CPF -> Cost Per Follow
c = c.replace(' CPF"', ' Cost Per Follow"')
c = c.replace(' CPF,', ' Cost Per Follow,')
c = c.replace(' CPF.', ' Cost Per Follow.')

# impressions -> Total Ads Served (only in insight prose, not in data references)
c = c.replace('impressions were delivered', 'Total Ads Served were delivered')
c = c.replace('impressions across', 'Total Ads Served across')
c = c.replace('of impressions', 'of Total Ads Served')
c = c.replace('impression volume', 'Total Ads Served volume')
c = c.replace('all campaign impressions', 'all campaign Total Ads Served')
c = c.replace('campaign impressions', 'campaign Total Ads Served')
c = c.replace('cost-efficient impressions', 'cost-efficient ad delivery')
c = c.replace('Per Thousand Impressions', 'Per Thousand Ads Served')
c = c.replace('awareness impressions', 'awareness ad delivery')

with open("/workspaces/media-on-gas/dashboard/src/App.jsx", "w") as f:
    f.write(c)
print("Done - full metric wording in insights")
