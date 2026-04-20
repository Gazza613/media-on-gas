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

  // Map AN / Messenger / Oculus into Facebook family and Threads into
  // Instagram. Matches /api/campaigns.js so dashboard totals line up.
  var mapPubToPlat = function(p) {
    p = (p || "facebook").toLowerCase();
    if (p === "instagram" || p === "threads") return "Instagram";
    if (p === "facebook" || p === "audience_network" || p === "messenger" || p === "oculus") return "Facebook";
    return null;
  };

  // META ADSETS
  for (var i = 0; i < metaAccounts.length; i++) {
    var account = metaAccounts[i];
    try {
      var timeRange = "{\"since\":\"" + from + "\",\"until\":\"" + to + "\"}";
      var url = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=campaign_name,campaign_id,adset_name,adset_id,impressions,reach,frequency,spend,cpm,cpc,ctr,clicks,actions&level=adset&time_range=" + timeRange + "&breakdowns=publisher_platform&limit=200&access_token=" + metaToken;
      // Collect all breakdown rows for this account first (paginated) so we
      // can run the no-breakdown authoritative totals pass below and scale
      // spend / impressions per adset to match. Without this, Meta's
      // publisher_platform breakdown drops any spend it cannot cleanly
      // attribute to a single publisher (Advantage+ cross-placement quirk),
      // and the Audience Targeting tab drifts below campaign totals.
      var breakdownRows = [];
      var page = await fetch(url);
      var pageData = await page.json();
      var pGuard = 0;
      while (pageData && pageData.data && pGuard < 10) {
        pGuard++;
        for (var j = 0; j < pageData.data.length; j++) {
          var d = pageData.data[j];
          var pub = d.publisher_platform || "facebook";
          var platform = mapPubToPlat(pub);
          if (!platform) continue;
          var leads = 0, appInstalls = 0, pageLikes = 0, landingPageViews = 0, follows = 0;
          if (d.actions) {
            for (var k = 0; k < d.actions.length; k++) {
              var a = d.actions[k];
              if (a.action_type === "lead") leads += parseInt(a.value || 0);
              if (a.action_type === "omni_app_install" || a.action_type === "app_install") appInstalls += parseInt(a.value || 0);
              // Use the unambiguous "page_like" action. "like" at ad/adset
              // level is post reactions on non-follower placements and would
              // inflate adset pageLikes, polluting the Audience tab's
              // follower-objective rollup.
              if (a.action_type === "page_like") pageLikes += parseInt(a.value || 0);
              if (a.action_type === "landing_page_view" || a.action_type === "omni_landing_page_view") landingPageViews += parseInt(a.value || 0);
              if (a.action_type === "onsite_conversion.messaging_first_reply") follows += parseInt(a.value || 0);
            }
          }
          breakdownRows.push({
            platform: platform,
            accountName: account.name,
            campaignName: d.campaign_name,
            campaignId: d.campaign_id,
            adsetName: d.adset_name,
            adsetId: d.adset_id + "_" + pub,
            rawAdsetId: d.adset_id,
            publisherRaw: pub,
            _spend: parseFloat(d.spend || 0),
            _impressions: parseInt(d.impressions || 0),
            _clicks: parseInt(d.clicks || 0),
            _reach: parseInt(d.reach || 0),
            frequency: d.frequency || "0",
            cpm: d.cpm || "0",
            cpc: d.cpc || "0",
            ctr: d.ctr || "0",
            leads: leads.toString(),
            appInstalls: appInstalls.toString(),
            pageLikes: pageLikes.toString(),
            landingPageViews: landingPageViews.toString(),
            follows: follows.toString()
          });
        }
        if (!(pageData.paging && pageData.paging.next)) break;
        var nextR = await fetch(pageData.paging.next);
        pageData = await nextR.json();
      }

      // Authoritative per-adset totals, no breakdown. Fetch once per account
      // and key by adset_id. These are the numbers the Meta Ads Manager
      // Reports tab shows, they always match campaign aggregates.
      var trueByAdset = {};
      try {
        var trueUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=adset_id,spend,impressions,clicks&level=adset&time_range=" + timeRange + "&limit=500&access_token=" + metaToken;
        var trueNext = trueUrl;
        var trueGuard = 0;
        while (trueNext && trueGuard < 10) {
          trueGuard++;
          var tR = await fetch(trueNext);
          if (!tR.ok) break;
          var tJ = await tR.json();
          (tJ.data || []).forEach(function(row) {
            trueByAdset[row.adset_id] = {
              spend: parseFloat(row.spend || 0),
              impressions: parseInt(row.impressions || 0),
              clicks: parseInt(row.clicks || 0)
            };
          });
          trueNext = tJ.paging && tJ.paging.next ? tJ.paging.next : null;
        }
      } catch (_) { /* non-fatal, falls back to breakdown sums */ }

      // Group breakdown rows by raw adset id, scale each row's spend /
      // impressions / clicks by the true total to breakdown-sum ratio.
      var byAdset = {};
      breakdownRows.forEach(function(r) {
        if (!byAdset[r.rawAdsetId]) byAdset[r.rawAdsetId] = { rows: [], sumSpend: 0, sumImps: 0, sumClicks: 0 };
        byAdset[r.rawAdsetId].rows.push(r);
        byAdset[r.rawAdsetId].sumSpend += r._spend;
        byAdset[r.rawAdsetId].sumImps += r._impressions;
        byAdset[r.rawAdsetId].sumClicks += r._clicks;
      });
      Object.keys(byAdset).forEach(function(aid) {
        var bucket = byAdset[aid];
        var truth = trueByAdset[aid];
        var spendScale = (truth && bucket.sumSpend > 0) ? (truth.spend / bucket.sumSpend) : 1;
        var impsScale = (truth && bucket.sumImps > 0) ? (truth.impressions / bucket.sumImps) : 1;
        var clicksScale = (truth && bucket.sumClicks > 0) ? (truth.clicks / bucket.sumClicks) : 1;
        // Only scale UP, never down. If breakdown already matches (or exceeds)
        // the truth, leave it, Meta occasionally reports breakdown higher
        // than no-breakdown for reach-related metrics.
        if (spendScale < 1) spendScale = 1;
        if (impsScale < 1) impsScale = 1;
        if (clicksScale < 1) clicksScale = 1;
        bucket.rows.forEach(function(r) {
          var spend = (r._spend * spendScale);
          var imps = Math.round(r._impressions * impsScale);
          var clicks = Math.round(r._clicks * clicksScale);
          allAdsets.push({
            platform: r.platform,
            accountName: r.accountName,
            campaignName: r.campaignName,
            campaignId: r.campaignId,
            adsetName: r.adsetName,
            adsetId: r.adsetId,
            impressions: imps.toString(),
            reach: r._reach.toString(),
            frequency: r.frequency,
            spend: spend.toFixed(2),
            cpm: r.cpm,
            cpc: r.cpc,
            ctr: r.ctr,
            clicks: clicks.toString(),
            leads: r.leads,
            appInstalls: r.appInstalls,
            pageLikes: r.pageLikes,
            landingPageViews: r.landingPageViews,
            follows: r.follows
          });
        });
      });
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

  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role === "client") {
    var ids = principal.allowedCampaignIds || [];
    var names = principal.allowedCampaignNames || [];
    allAdsets = allAdsets.filter(function(a) {
      var cid = String(a.campaignId || "");
      if (ids.indexOf(cid) >= 0) return true;
      if (names.indexOf(a.campaignName || "") >= 0) return true;
      return false;
    });
  }
  res.json({ adsets: allAdsets, total: allAdsets.length });
}
