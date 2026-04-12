with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Add page data fetch before the final response
c = c.replace(
    '  res.setHeader("Access-Control-Allow-Origin", "*");\n  res.status(200).json({ totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns });',
    """  // Fetch page follower data
  var pageData = [];
  try {
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + metaToken);
    var pagesJson = await pagesRes.json();
    if (pagesJson.data) pageData = pagesJson.data;
  } catch (pgErr) {}

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns, pages: pageData });"""
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - pages data added to campaigns endpoint")
