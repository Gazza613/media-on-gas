var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

export default async function handler(req, res) {
  var metaToken = process.env.META_ACCESS_TOKEN;
  var ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  var ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-07";
  var allCampaigns = [];
  var seenIds = {};
  var now = new Date();
  var thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    var campaignInfo = {};

    try {
      var listUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=name,id,effective_status,created_time&filtering=[{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\"]}]&limit=100&access_token=" + metaToken;
      var listRes = await fetch(listUrl);
      var listData = await listRes.json();
      if (listData.data) {
        for (var k = 0; k < listData.data.length; k++) {
          var camp = listData.data[k];
          campaignInfo[camp.id] = { name: camp.name, status: camp.effective_status, created: new Date(camp.created_time) };
        }
      }
    } catch (err) {}

    try {
      var timeRange = JSON.stringify({since: from, until: to});
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + timeRange + "&level=campaign&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
      var response = await fetch(url);
      var data = await response.json();
      if (data.data) {
        for (var j = 0; j < data.data.length; j++) {
          var c = data.data[j];
          if (parseFloat(c.impressions) > 0 || parseFloat(c.spend) > 0) {
            var pub = c.publisher_platform || "facebook";
            var platName = "Facebook";
            if (pub === "instagram") platName = "Instagram";
            else if (pub === "audience_network") platName = "Audience Network";
            else if (pub === "messenger") platName = "Messenger";
            var uniqueId = c.campaign_id + "_" + pub;
            seenIds[c.campaign_id] = true;

            var leads = 0;
            var appInstalls = 0;
            var landingPageViews = 0;
            var pageLikes = 0;
            if (c.actions) {
              for (var a = 0; a < c.actions.length; a++) {
                var act = c.actions[a];
                if (act.action_type === "lead" || act.action_type === "onsite_web_lead" || act.action_type === "offsite_conversion.fb_pixel_lead") {
                  leads = Math.max(leads, parseInt(act.value));
                }
                if (act.action_type === "app_custom_event.fb_mobile_activate_app" || act.action_type === "app_install") {
                  appInstalls += parseInt(act.value);
                }
                if (act.action_type === "landing_page_view" || act.action_type === "omni_landing_page_view") {
                  landingPageViews = Math.max(landingPageViews, parseInt(act.value));
                }
                if (act.action_type === "like" || act.action_type === "page_engagement") {
                  pageLikes = Math.max(pageLikes, parseInt(act.value));
                }
              }
            }

            allCampaigns.push({
              platform: platName,
              metaPlatform: pub,
              accountName: account.name,
              accountId: account.id,
              campaignId: uniqueId,
              rawCampaignId: c.campaign_id,
              campaignName: c.campaign_name,
              impressions: c.impressions,
              reach: c.reach,
              frequency: c.frequency,
              spend: c.spend,
              cpm: c.cpm,
              cpc: c.cpc,
              ctr: c.ctr,
              clicks: c.clicks,
              leads: leads.toString(),
              appInstalls: appInstalls.toString(),
              landingPageViews: landingPageViews.toString(),
              pageLikes: pageLikes.toString(),
              costPerLead: leads > 0 ? (parseFloat(c.spend) / leads).toFixed(2) : "0",
              costPerInstall: appInstalls > 0 ? (parseFloat(c.spend) / appInstalls).toFixed(2) : "0",
              actions: c.actions || [],
              status: "active"
            });
          }
        }
      }
    } catch (err) {}

    Object.keys(campaignInfo).forEach(function(cid) {
      if (!seenIds[cid]) {
        var info = campaignInfo[cid];
        if (info.status === "SCHEDULED") {
          allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name, accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: info.name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "scheduled" });
        } else if (info.status === "ACTIVE" && info.created >= thirtyDaysAgo) {
          allCampaigns.push({ platform: "Facebook", metaPlatform: "facebook", accountName: account.name, accountId: account.id, campaignId: cid + "_facebook", rawCampaignId: cid, campaignName: info.name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", actions: [], status: "pending" });
        }
      }
    });
  }

  try {
    var ttNames = {};
    var ttStatuses = {};
    var ttListUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=100";
    var ttListRes = await fetch(ttListUrl, {headers: {"Access-Token": ttToken}});
    var ttListData = await ttListRes.json();
    if (ttListData.data && ttListData.data.list) {
      for (var l = 0; l < ttListData.data.list.length; l++) {
        var ttCamp = ttListData.data.list[l];
        ttNames[ttCamp.campaign_id] = ttCamp.campaign_name;
        ttStatuses[ttCamp.campaign_id] = ttCamp.operation_status;
      }
    }

    var dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    var metrics = encodeURIComponent(JSON.stringify(["spend","impressions","clicks","cpm","follows","likes","comments","shares"]));
    var ttUrl = "https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?advertiser_id=" + ttAdvId + "&report_type=BASIC&data_level=AUCTION_CAMPAIGN&dimensions=" + dims + "&metrics=" + metrics + "&start_date=" + from + "&end_date=" + to + "&page_size=50";
    var ttRes = await fetch(ttUrl, {headers: {"Access-Token": ttToken}});
    var ttRaw = await ttRes.text();
    var ttSeenIds = {};

    try {
      var ttData = JSON.parse(ttRaw);
      if (ttData.data && ttData.data.list) {
        for (var n = 0; n < ttData.data.list.length; n++) {
          var tc = ttData.data.list[n];
          var tm = tc.metrics;
          if (parseFloat(tm.impressions) > 0 || parseFloat(tm.spend) > 0) {
            ttSeenIds[tc.dimensions.campaign_id] = true;
            var ttStatus = ttStatuses[tc.dimensions.campaign_id] === "ENABLE" ? "active" : "completed";
            allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tc.dimensions.campaign_id, rawCampaignId: tc.dimensions.campaign_id, campaignName: ttNames[tc.dimensions.campaign_id] || "TikTok Campaign " + tc.dimensions.campaign_id, impressions: tm.impressions, reach: "0", frequency: "0", spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: tm.ctr || "0", clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", status: ttStatus });
          }
        }
      }
    } catch (parseErr) {}

    Object.keys(ttNames).forEach(function(tid) {
      if (!ttSeenIds[tid] && ttStatuses[tid] === "ENABLE") {
        allCampaigns.push({ platform: "TikTok", metaPlatform: "tiktok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tid, rawCampaignId: tid, campaignName: ttNames[tid], impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", follows: "0", likes: "0", leads: "0", appInstalls: "0", landingPageViews: "0", pageLikes: "0", costPerLead: "0", costPerInstall: "0", status: "active" });
      }
    });
  } catch (ttErr) {}

  allCampaigns.sort(function(a, b) { return parseFloat(b.spend) - parseFloat(a.spend); });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns });
}