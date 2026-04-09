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

  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    var campaignStatuses = {};

    try {
      var listUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=name,id,effective_status&filtering=[{\"field\":\"effective_status\",\"operator\":\"IN\",\"value\":[\"ACTIVE\",\"SCHEDULED\",\"PAUSED\",\"COMPLETED\"]}]&limit=100&access_token=" + metaToken;
      var listRes = await fetch(listUrl);
      var listData = await listRes.json();
      if (listData.data) {
        for (var k = 0; k < listData.data.length; k++) {
          campaignStatuses[listData.data[k].id] = { name: listData.data[k].name, status: listData.data[k].effective_status };
        }
      }
    } catch (err) {}

    try {
      var timeRange = JSON.stringify({since: from, until: to});
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + timeRange + "&level=campaign&limit=100&access_token=" + metaToken;
      var response = await fetch(url);
      var data = await response.json();
      if (data.data) {
        for (var j = 0; j < data.data.length; j++) {
          var c = data.data[j];
          if (parseFloat(c.impressions) > 0 || parseFloat(c.spend) > 0) {
            seenIds[c.campaign_id] = true;
            var st = campaignStatuses[c.campaign_id];
            var status = st ? st.status.toLowerCase() : "active";
            if (status === "completed") status = "completed";
            allCampaigns.push({ platform: "Meta", accountName: account.name, accountId: account.id, campaignId: c.campaign_id, campaignName: c.campaign_name, impressions: c.impressions, reach: c.reach, frequency: c.frequency, spend: c.spend, cpm: c.cpm, cpc: c.cpc, ctr: c.ctr, clicks: c.clicks, actions: c.actions || [], status: status });
          }
        }
      }
    } catch (err) {}

    Object.keys(campaignStatuses).forEach(function(cid) {
      if (!seenIds[cid] && campaignStatuses[cid].status === "SCHEDULED") {
        allCampaigns.push({ platform: "Meta", accountName: account.name, accountId: account.id, campaignId: cid, campaignName: campaignStatuses[cid].name, impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", actions: [], status: "scheduled" });
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
    var metrics = encodeURIComponent(JSON.stringify(["spend","impressions","clicks","cpm","follows","likes"]));
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
            allCampaigns.push({ platform: "TikTok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tc.dimensions.campaign_id, campaignName: ttNames[tc.dimensions.campaign_id] || "TikTok Campaign " + tc.dimensions.campaign_id, impressions: tm.impressions, reach: "0", frequency: "0", spend: tm.spend, cpm: tm.cpm || "0", cpc: tm.cpc || "0", ctr: tm.ctr || "0", clicks: tm.clicks, follows: tm.follows || "0", likes: tm.likes || "0", status: ttStatus });
          }
        }
      }
    } catch (parseErr) {}

    Object.keys(ttNames).forEach(function(tid) {
      if (!ttSeenIds[tid] && ttStatuses[tid] === "ENABLE") {
        allCampaigns.push({ platform: "TikTok", accountName: "MTN MoMo TikTok", accountId: ttAdvId, campaignId: tid, campaignName: ttNames[tid], impressions: "0", reach: "0", frequency: "0", spend: "0", cpm: "0", cpc: "0", ctr: "0", clicks: "0", follows: "0", likes: "0", status: "active" });
      }
    });
  } catch (ttErr) {}

  allCampaigns.sort(function(a, b) { return parseFloat(b.spend) - parseFloat(a.spend); });

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.status(200).json({ totalCampaigns: allCampaigns.length, dateFrom: from, dateTo: to, campaigns: allCampaigns });
}