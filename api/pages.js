import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";
export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;
  // Admin-only, this endpoint enumerates every Meta page + IG business account
  // attached to the admin token across all configured ad accounts. Clients
  // have no legitimate reason to hit it and should not see other clients' pages.
  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin") {
    res.status(403).json({ error: "Admin-only endpoint" });
    return;
  }
  var token = process.env.META_ACCESS_TOKEN;
  var from = req.query.from || "";
  var to = req.query.to || "";


  try {
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,access_token,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + token);
    var pagesData = await pagesRes.json();
    var pages = pagesData.data || [];
    var debug = [];

    for (var i = 0; i < pages.length; i++) {
      var page = pages[i];
      var pageToken = page.access_token || token;
      
      if (page.instagram_business_account && from && to) {
        try {
          var igId = page.instagram_business_account.id;
          var since = Math.floor(new Date(from).getTime() / 1000);
          var until = Math.floor(new Date(to + "T23:59:59").getTime() / 1000);
          var igUrl = "https://graph.facebook.com/v25.0/" + igId + "/insights?metric=follower_count&period=day&since=" + since + "&until=" + until + "&access_token=" + pageToken;
          var igRes = await fetch(igUrl);
          var igText = await igRes.text();
          debug.push({page: page.name, igId: igId, status: igRes.status, response: igText.substring(0, 500)});
          
          var igData = JSON.parse(igText);
          if (igData.data && igData.data[0] && igData.data[0].values && igData.data[0].values.length > 0) {
            var vals = igData.data[0].values;
            var totalGrowth = 0;
            for (var v = 0; v < vals.length; v++) { totalGrowth += vals[v].value; }
            page.instagram_business_account.follower_growth = totalGrowth;
          }
        } catch (igErr) {
          console.error("IG insights error for", page.name, igErr);
          page.instagram_business_account.follower_growth = 0;
        }
      }
      delete page.access_token;
    }

    res.status(200).json({data: pages});
  } catch (error) {
    console.error(error);
    res.status(500).json({error: "Internal server error"});
  }
}
