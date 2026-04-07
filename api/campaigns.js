const metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

export default async function handler(req, res) {
  const metaToken = process.env.META_ACCESS_TOKEN;
  const ttToken = process.env.TIKTOK_ACCESS_TOKEN;
  const ttAdvId = process.env.TIKTOK_ADVERTISER_ID;
  const from = req.query.from || "2026-04-01";
  const to = req.query.to || "2026-04-07";
  const allCampaigns = [];

  for (const account of metaAccounts) {
    try {
      const timeRange = JSON.stringify({since: from, until: to});
      const url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + timeRange + "&level=campaign&limit=100&access_token=" + metaToken;
      const response = await fetch(url);
      const data = await response.json();
      if (data.data) {
        data.data.forEach(function(c) {
          if (parseFloat(c.impressions) > 0 || parseFloat(c.spend) > 0) {
            allCampaigns.push({
              platform: "Meta",
              accountName: account.name,
              accountId: account.id,
              campaignId: c.campaign_id,
              campaignName: c.campaign_name,
              impressions: c.impressions,
              reach: c.reach,
              frequency: c.frequency,
              spend: c.spend,
              cpm: c.cpm,
              cpc: c.cpc,
              ctr: c.ctr,
              clicks: c.clicks,
              actions: c.actions || []
            });
          }
        });
      }
    } catch (err) {}
  }

  try {
    const ttListUrl = "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=" + ttAdvId + "&page_size=100";
    const ttListRes = await fetch(ttListUrl, {headers: {"Access-Token": ttToken}});
    const ttListData = await ttListRes.json();
    const ttCampaigns = {};
    if (ttListData.data && ttListData.data.list) {
      ttListData.data.list.forEach(function(c) {
        ttCampaigns[c.campaign_id] = c.campaign_name;
      });
    }

    const dims = encodeURIComponent(JSON.stringify(["campaign_id"]));
    const metrics = encodeURIComponent(JSON.stringify(["spend","impressions","clicks","cpm","cpc","ctr","video_views_p100","