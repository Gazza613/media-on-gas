export default async function handler(req, res) {
  var token = process.env.TIKTOK_ACCESS_TOKEN;
  var advId = process.env.TIKTOK_ADVERTISER_ID;
  var results = {};
  try {
    var url1 = "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=[%22" + advId + "%22]";
    var r1 = await fetch(url1, { headers: { "Access-Token": token } });
    results.advertiser = await r1.json();
  } catch(e) { results.advertiser_error = e.message; }
  try {
    var url2 = "https://business-api.tiktok.com/open_api/v1.3/identity/get/?advertiser_id=" + advId;
    var r2 = await fetch(url2, { headers: { "Access-Token": token } });
    results.identity = await r2.json();
  } catch(e) { results.identity_error = e.message; }
  try {
    var url3 = "https://business-api.tiktok.com/open_api/v1.3/tt_user/info/?advertiser_id=" + advId;
    var r3 = await fetch(url3, { headers: { "Access-Token": token } });
    results.tt_user = await r3.json();
  } catch(e) { results.tt_user_error = e.message; }
  res.json(results);
}
