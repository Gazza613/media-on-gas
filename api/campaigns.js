const activeAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

export default async function handler(req, res) {
  const token = process.env.META_ACCESS_TOKEN;
  const from = req.query.from || "2026-04-01";
  const to = req.query.to || "2026-04-07";

  try {
    const allCampaigns = [];

    for (const account of activeAccounts) {
      const url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&time_range=" + JSON.stringify({since: from, until: to}) + "&level=campaign&limit=100&access_token=" + token;
      try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.data) {
          data.data.forEach(c => {
            allCampaigns.push({
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
              actions: c.actions || [],
              dateStart: c.date_start,
              dateStop: c.date_stop
            });
          });
        }
      } catch (err) {
        // skip account if error, continue with others
      }
    }

    allCampaigns.sort((a, b) => parseFloat(b.spend) - parseFloat(a.spend));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json({
      totalCampaigns: allCampaigns.length,
      campaigns: allCampaigns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}