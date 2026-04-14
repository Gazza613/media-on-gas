import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";
export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";
  var metaToken = process.env.META_ACCESS_TOKEN;
  var metaAccounts = [
    { id: "act_8159212987434597", name: "MTN MoMo Meta" },
    { id: "act_3600654450252189", name: "MTN Khava" },
    { id: "act_825253026181227", name: "Concord College" },
    { id: "act_1187886635852303", name: "Eden College" },
    { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
    { id: "act_542990539806888", name: "GAS Agency" }
  ];
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var allAdsets = [];

  // META ADSETS
  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    try {
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,adset_name,adset_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&level=adset&time_range={\"since\":\"" + from + "\",\"until\":\"" + to + "\"}&breakdowns=publisher_platform&limit=200&access_token=" + metaToken;
      var r = await fetch(url);
      var data = await r.json();
      if (data.data) {
        for (var j = 0; j < data.data.length; j++) {
          var d = data.data[j];
          var pub = d.publisher_platform || "facebook";
          if (pub === "audience_network" || pub === "messenger" || pub === "threads") continue;
          var platform = pub === "instagram" ? "Instagram" : "Facebook";
          var leads = 0, appInstalls = 0, pageLikes = 0, landingPageViews = 0, follows = 0;
          if (d.actions) {
            for (var k = 0; k < d.actions.length; k++) {
              var a = d.actions[k];
              if (a.action_type === "lead") leads += parseInt(a.value || 0);
              if (a.action_type === "omni_app_install" || a.action_type === "app_install") appInstalls += parseInt(a.value || 0);
              if (a.action_type === "like") pageLikes += parseInt(a.value || 0);
              if (a.action_type === "landing_page_view" || a.action_type === "omni_landing_page_view") landingPageViews += parseInt(a.value || 0);
              if (a.action_type === "onsite_conversion.messaging_first_reply") follows += parseInt(a.value || 0);
            }
          }
          allAdsets.push({
            platform: platform,
            accountName: account.name,
            campaignName: d.campaign_name,
            campaignId: d.campaign_id,
            adsetName: d.adset_name,
            adsetId: d.adset_id + "_" + pub,
            impressions: d.impressions || "0",
            reach: d.reach || "0",
            frequency: d.frequency || "0",
            spend: d.spend || "0",
            cpm: d.cpm || "0",
            cpc: d.cpc || "0",
            ctr: d.ctr || "0",
            clicks: d.clicks || "0",
            leads: leads.toString(),
            appInstalls: appInstalls.toString(),
            pageLikes: pageLikes.toString(),
            landingPageViews: landingPageViews.toString(),
            follows: follows.toString()
          });
        }
      }
      // Check for pagination
      while (data.paging && data.paging.next) {
        var nextR = await fetch(data.paging.next);
        data = await nextR.json();
        if (data.data) {
          for (var j2 = 0; j2 < data.data.length; j2++) {
            var d2 = data.data[j2];
            var pub2 = d2.publisher_platform || "facebook";
            if (pub2 === "audience_network" || pub2 === "messenger" || pub2 === "threads") continue;
            var platform2 = pub2 === "instagram" ? "Instagram" : "Facebook";
            var leads2 = 0, appInstalls2 = 0, pageLikes2 = 0, landingPageViews2 = 0, follows2 = 0;
            if (d2.actions) {
              for (var k2 = 0; k2 < d2.actions.length; k2++) {
                var a2 = d2.actions[k2];
                if (a2.action_type === "lead") leads2 += parseInt(a2.value || 0);
                if (a2.action_type === "omni_app_install" || a2.action_type === "app_install") appInstalls2 += parseInt(a2.value || 0);
                if (a2.action_type === "like") pageLikes2 += parseInt(a2.value || 0);
                if (a2.action_type === "landing_page_view" || a2.action_type === "omni_landing_page_view") landingPageViews2 += parseInt(a2.value || 0);
                if (a2.action_type === "onsite_conversion.messaging_first_reply") follows2 += parseInt(a2.value || 0);
              }
            }
            allAdsets.push({
              platform: platform2,
              accountName: account.name,
              campaignName: d2.campaign_name,
              campaignId: d2.campaign_id,
              adsetName: d2.adset_name,
              adsetId: d2.adset_id + "_" + pub2,
              impressions: d2.impressions || "0",
              reach: d2.reach || "0",
              frequency: d2.frequency || "0",
              spend: d2.spend || "0",
              cpm: d2.cpm || "0",
              cpc: d2.cpc || "0",
              ctr: d2.ctr || "0",
              clicks: d2.clicks || "0",
              leads: leads2.toString(),
              appInstalls: appInstalls2.toString(),
              pageLikes: pageLikes2.toString(),
              landingPageViews: landingPageViews2.toString(),
              follows: follows2.toString()
            });
          }
        }
      }
    } catch (err) { console.error("Meta adsets error for", account.name, err); }
  }

  // TIKTOK ADSETS
  try {
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&dimensions=[%22adgroup_id%22]&data_level=AUCTION_ADGROUP&metrics=[%22campaign_name%22,%22adgroup_name%22,%22campaign_id%22,%22spend%22,%22impressions%22,%22reach%22,%22clicks%22,%22ctr%22,%22cpc%22,%22cpm%22,%22follows%22,%22likes%22,%22profile_visits%22]&start_date=" + from + "&end_date=" + to + "&page_size=200";
    var ttR = await fetch(ttUrl, { headers: { "Access-Token": ttToken } });
    var ttData = await ttR.json();
    if (ttData.data && ttData.data.list) {
      for (var ti = 0; ti < ttData.data.list.length; ti++) {
        var tt = ttData.data.list[ti];
        var ttM = tt.metrics;
        var ttD = tt.dimensions;
        if (parseFloat(ttM.spend || 0) === 0 && parseFloat(ttM.impressions || 0) === 0) continue;
        allAdsets.push({
          platform: "TikTok",
          accountName: "MTN MoMo TikTok",
          campaignName: ttM.campaign_name || "",
          campaignId: ttM.campaign_id || "",
          adsetName: ttM.adgroup_name || "",
          adsetId: ttD.adgroup_id,
          impressions: ttM.impressions || "0",
          reach: ttM.reach || "0",
          frequency: "0",
          spend: ttM.spend || "0",
          cpm: ttM.cpm || "0",
          cpc: ttM.cpc || "0",
          ctr: ttM.ctr || "0",
          clicks: ttM.clicks || "0",
          leads: "0",
          appInstalls: "0",
          pageLikes: "0",
          landingPageViews: "0",
          follows: ttM.follows || "0",
          likes: ttM.likes || "0"
        });
      }
    }
  } catch (err) { console.error("TikTok adsets error", err); }

  // GOOGLE ADS AD GROUPS
  try {
    var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
    var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
    var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
    var gCustomerId = "9587382256";
    if (gClientId && gRefreshToken && gDevToken) {
      var gTokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var gTokenData = await gTokenRes.json();
      if (gTokenData.access_token) {
        var gQuery = "SELECT campaign.name, campaign.id, ad_group.name, ad_group.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.status != 'REMOVED' AND ad_group.status != 'REMOVED' ORDER BY metrics.cost_micros DESC";
        var gRes = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + gTokenData.access_token,
            "developer-token": gDevToken,
            "login-customer-id": gManagerId,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({query: gQuery})
        });
        if (gRes.status === 200) {
          var gData = await gRes.json();
          var gResults = gData.results || [];
          for (var gi = 0; gi < gResults.length; gi++) {
            var gr = gResults[gi];
            var gSpend = parseFloat(gr.metrics.costMicros || 0) / 1000000;
            var gImps = parseInt(gr.metrics.impressions || 0);
            var gClicks = parseInt(gr.metrics.clicks || 0);
            var gConv = parseFloat(gr.metrics.conversions || 0);
            if (gImps > 0 || gSpend > 0) {
              var gPlatform = "Google Display";
              var gCampName = gr.campaign.name || "";
              if (gCampName.toLowerCase().indexOf("youtube") >= 0) gPlatform = "YouTube";
              allAdsets.push({
                platform: gPlatform,
                accountName: "MTN MoMo Google",
                campaignName: gCampName,
                campaignId: gr.campaign.id,
                adsetName: gr.adGroup.name || gCampName,
                adsetId: "google_" + gr.adGroup.id,
                impressions: gImps.toString(),
                reach: "0",
                frequency: "0",
                spend: gSpend.toFixed(2),
                cpm: gImps > 0 ? ((gSpend / gImps) * 1000).toFixed(2) : "0",
                cpc: gClicks > 0 ? (gSpend / gClicks).toFixed(2) : "0",
                ctr: gImps > 0 ? ((gClicks / gImps) * 100).toFixed(2) : "0",
                clicks: gClicks.toString(),
                leads: Math.round(gConv).toString(),
                appInstalls: "0",
                pageLikes: "0",
                landingPageViews: gClicks.toString(),
                follows: "0"
              });
            }
          }
        }
      }
    }
  } catch (err) { console.error("Google Ads adsets error", err); }

  res.json({ adsets: allAdsets, total: allAdsets.length });
}
