import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Diagnostic: list the top 20 Facebook Lead Gen ads across all Meta accounts with
// their exact lead counts, impressions, spend and CPL so we can verify which
// campaigns/advertisers are actually contributing Facebook-served leads.

var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

function detectObjective(n) {
  n = (n || "").toLowerCase();
  if (n.indexOf("appinstal") >= 0 || n.indexOf("app install") >= 0) return "appinstall";
  if (n.indexOf("follower") >= 0 || n.indexOf("_like_") >= 0 || n.indexOf("paidsocial_like") >= 0) return "followers";
  if (n.indexOf("lead") >= 0 || n.indexOf("pos") >= 0) return "leads";
  if (n.indexOf("homeloan") >= 0 || n.indexOf("traffic") >= 0 || n.indexOf("paidsearch") >= 0) return "landingpage";
  return "landingpage";
}
function mapMetaObjective(o) {
  if (!o) return null;
  o = String(o).toUpperCase();
  if (o === "LEAD_GENERATION" || o === "OUTCOME_LEADS" || o === "CONVERSIONS" || o === "OUTCOME_SALES") return "leads";
  if (o.indexOf("APP_INSTALL") >= 0 || o.indexOf("APP_PROMOTION") >= 0) return "appinstall";
  if (o === "PAGE_LIKES" || o === "POST_ENGAGEMENT" || o === "OUTCOME_ENGAGEMENT") return "followers";
  return null;
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;

  var metaToken = process.env.META_ACCESS_TOKEN;
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";
  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not set" }); return; }

  var out = { from: from, to: to, leadsByAccount: {}, allLeadAds: [] };
  try {
    for (var i = 0; i < metaAccounts.length; i++) {
      var account = metaAccounts[i];
      var accountSummary = { total_leads_facebook: 0, total_leads_instagram: 0, ad_count: 0 };
      try {
        // Fetch campaign objectives so we know which ones are lead gen
        var campObjMap = {};
        try {
          var campUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,name,objective&limit=500&access_token=" + metaToken;
          var campRes = await fetch(campUrl);
          var campData = await campRes.json();
          (campData.data || []).forEach(function(c) { campObjMap[c.id] = { obj: c.objective, name: c.name }; });
        } catch (e) {}

        var timeRange = encodeURIComponent(JSON.stringify({ since: from, until: to }));
        var insUrl = "https://graph.facebook.com/v25.0/" + account.id + "/insights?fields=ad_id,ad_name,campaign_id,campaign_name,impressions,clicks,spend,actions&time_range=" + timeRange + "&level=ad&breakdowns=publisher_platform&limit=500&access_token=" + metaToken;
        var insRes = await fetch(insUrl);
        var insData = await insRes.json();
        (insData.data || []).forEach(function(row) {
          var pub = row.publisher_platform || "facebook";
          if (pub !== "facebook" && pub !== "instagram") return;
          var objMeta = (campObjMap[row.campaign_id] && campObjMap[row.campaign_id].obj) || null;
          var objective = mapMetaObjective(objMeta) || detectObjective(row.campaign_name);
          if (objective !== "leads") return;
          // Count leads from actions
          var leads = 0;
          (row.actions || []).forEach(function(a) {
            var at = String(a.action_type || "").toLowerCase();
            var v = parseInt(a.value || 0);
            if (at === "lead" || at === "onsite_web_lead" || at.indexOf("fb_pixel_lead") >= 0 || at.indexOf("onsite_conversion.lead") >= 0 || at === "complete_registration" || (at.indexOf("lead") >= 0 && at.indexOf("install") < 0 && at.indexOf("video") < 0)) {
              leads = Math.max(leads, v);
            }
          });
          var spend = parseFloat(row.spend || 0);
          var imps = parseInt(row.impressions || 0);
          var clk = parseInt(row.clicks || 0);
          if (pub === "facebook") accountSummary.total_leads_facebook += leads;
          else accountSummary.total_leads_instagram += leads;
          accountSummary.ad_count++;
          out.allLeadAds.push({
            account: account.name,
            platform: pub === "instagram" ? "Instagram" : "Facebook",
            ad_id: row.ad_id,
            ad_name: row.ad_name,
            campaign: row.campaign_name,
            leads: leads,
            impressions: imps,
            clicks: clk,
            spend: spend,
            cpl: leads > 0 ? (spend / leads).toFixed(2) : null,
            ctr: imps > 0 ? ((clk / imps) * 100).toFixed(2) : null
          });
        });
      } catch (e) { accountSummary.error = String(e); }
      out.leadsByAccount[account.name] = accountSummary;
    }

    // Sort all lead ads by leads DESC, filter Facebook only
    var fbLeadAds = out.allLeadAds.filter(function(a) { return a.platform === "Facebook"; }).sort(function(a, b) { return b.leads - a.leads; });
    var igLeadAds = out.allLeadAds.filter(function(a) { return a.platform === "Instagram"; }).sort(function(a, b) { return b.leads - a.leads; });

    out.top20_facebook_lead_ads = fbLeadAds.slice(0, 20);
    out.top20_instagram_lead_ads = igLeadAds.slice(0, 20);
    out.facebook_total_lead_ads = fbLeadAds.length;
    out.instagram_total_lead_ads = igLeadAds.length;
    delete out.allLeadAds; // trim response

    res.status(200).json(out);
  } catch (err) {
    out.error = String(err);
    res.status(500).json(out);
  }
}
