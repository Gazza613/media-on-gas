import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var ttAppId = process.env.TIKTOK_APP_ID;
  var ttSecret = process.env.TIKTOK_APP_SECRET;

  var out = {
    envCheck: {
      hasToken: !!ttToken,
      hasAdvId: !!ttAdvId,
      hasAppId: !!ttAppId,
      hasSecret: !!ttSecret,
      advId: ttAdvId,
      appId: ttAppId
    }
  };

  // 1) Get the advertiser info linked to this token (tells us which TikTok account this is)
  try {
    var url1 = "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=" + encodeURIComponent(JSON.stringify([ttAdvId]));
    var r1 = await fetch(url1, { headers: { "Access-Token": ttToken } });
    var d1 = await r1.json();
    out.advertiserInfo = { code: d1.code, message: d1.message, list: d1.data && d1.data.list };
  } catch (e) { out.advertiserInfoErr = String(e); }

  // 2) Get all advertisers this token has access to (tells us who owns the app)
  try {
    var url2 = "https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=" + ttAppId + "&secret=" + ttSecret;
    var r2 = await fetch(url2, { headers: { "Access-Token": ttToken } });
    var d2 = await r2.json();
    out.appAdvertisers = { code: d2.code, message: d2.message, list: d2.data && d2.data.list };
  } catch (e) { out.appAdvertisersErr = String(e); }

  // 3) Try /user/info/ to see what scopes/permissions this token has
  try {
    var url3 = "https://business-api.tiktok.com/open_api/v1.3/user/info/";
    var r3 = await fetch(url3, { headers: { "Access-Token": ttToken } });
    var d3 = await r3.json();
    out.userInfo = { code: d3.code, message: d3.message, data: d3.data };
  } catch (e) { out.userInfoErr = String(e); }

  // 4) Test the failing video endpoint with a dummy ID to see exact permission error
  try {
    var url4 = "https://business-api.tiktok.com/open_api/v1.3/file/video/ad/info/?advertiser_id=" + ttAdvId + "&video_ids=" + encodeURIComponent(JSON.stringify(["test"]));
    var r4 = await fetch(url4, { headers: { "Access-Token": ttToken } });
    var d4 = await r4.json();
    out.videoEndpointTest = { status: r4.status, code: d4.code, message: d4.message };
  } catch (e) { out.videoEndpointTestErr = String(e); }

  res.status(200).json(out);
}
