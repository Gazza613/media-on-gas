with open("/workspaces/media-on-gas/api/campaigns.js", "r") as f:
    c = f.read()

# Update pages fetch to include date params
c = c.replace(
    'var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + metaToken);',
    'var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,access_token,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + metaToken);'
)

# Add IG follower growth calculation to pages data
c = c.replace(
    'if (pagesJson.data) pageData = pagesJson.data;',
    """if (pagesJson.data) {
      for (var pi = 0; pi < pagesJson.data.length; pi++) {
        var pg = pagesJson.data[pi];
        var pgToken = pg.access_token || metaToken;
        if (pg.instagram_business_account) {
          try {
            var igId = pg.instagram_business_account.id;
            var since = Math.floor(new Date(from).getTime() / 1000);
            var until = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);
            var igUrl = "https://graph.facebook.com/v25.0/" + igId + "/insights?metric=follower_count&period=day&since=" + since + "&until=" + until + "&access_token=" + pgToken;
            var igRes = await fetch(igUrl);
            if (igRes.status === 200) {
              var igData = await igRes.json();
              if (igData.data && igData.data[0] && igData.data[0].values) {
                var totalGrowth = 0;
                for (var v = 0; v < igData.data[0].values.length; v++) { totalGrowth += igData.data[0].values[v].value; }
                pg.instagram_business_account.follower_growth = totalGrowth;
              }
            }
          } catch (igErr) {}
        }
        delete pg.access_token;
      }
      pageData = pagesJson.data;
    }"""
)

with open("/workspaces/media-on-gas/api/campaigns.js", "w") as f:
    f.write(c)
print("Done - campaigns endpoint includes IG follower growth")
