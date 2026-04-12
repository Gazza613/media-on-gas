export default async function handler(req, res) {
  var token = process.env.META_ACCESS_TOKEN;
  var from = req.query.from || "";
  var to = req.query.to || "";
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + token);
    var pagesData = await pagesRes.json();
    var pages = pagesData.data || [];

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      if (page.instagram_business_account && from && to) {
        try {
          var igId = page.instagram_business_account.id;
          var since = Math.floor(new Date(from).getTime() / 1000);
          var until = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);
          var igUrl = "https://graph.facebook.com/v25.0/" + igId + "/insights?metric=follower_count&period=day&since=" + since + "&until=" + until + "&access_token=" + token;
          var igRes = await fetch(igUrl);
          var igData = await igRes.json();
          if (igData.data && igData.data[0] && igData.data[0].values && igData.data[0].values.length > 0) {
            var vals = igData.data[0].values;
            var firstVal = vals[0].value;
            var lastVal = vals[vals.length - 1].value;
            page.instagram_business_account.follower_growth = lastVal - firstVal;
            page.instagram_business_account.follower_start = firstVal;
            page.instagram_business_account.follower_end = lastVal;
          }
        } catch (igErr) {
          page.instagram_business_account.follower_growth = 0;
        }
      }
    }

    res.status(200).json({data: pages});
  } catch (error) {
    res.status(500).json({error: error.message});
  }
}