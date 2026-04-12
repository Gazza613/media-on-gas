export default async function handler(req, res) {
  var token = process.env.META_ACCESS_TOKEN;
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Get all pages the token has access to
    var pagesRes = await fetch("https://graph.facebook.com/v25.0/me/accounts?fields=name,id,fan_count,followers_count,instagram_business_account{id,username,followers_count}&limit=50&access_token=" + token);
    var pagesData = await pagesRes.json();

    res.status(200).json(pagesData);
  } catch (error) {
    res.status(500).json({error: error.message});
  }
}
