import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";

// Admin-only debug. Dumps every raw Meta action_type + value per ad for any
// campaign whose name matches the search term (default: "Like" + "Follower").
// Use this to confirm which action_type keys Meta actually returns for
// Page Like + Instagram Follower campaigns at the ad level, then cross-check
// against our current detection rules in api/ads.js.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MTN MoMo Meta" },
  { id: "act_3600654450252189", name: "MTN Khava" },
  { id: "act_825253026181227", name: "Concord College" },
  { id: "act_1187886635852303", name: "Eden College" },
  { id: "act_9001636663181231", name: "Psycho Bunny ZA" },
  { id: "act_542990539806888", name: "GAS Agency" }
];

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;
  if (!checkAuth(req, res)) return;
  if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }

  var metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN missing" }); return; }

  var search = ((req.query.search || "like,follower") + "").toLowerCase().split(",").map(function(s) { return s.trim(); }).filter(Boolean);
  var from = req.query.from || "2026-04-01";
  var to = req.query.to || "2026-04-30";

  var out = [];

  for (var i = 0; i < META_ACCOUNTS.length; i++) {
    var account = META_ACCOUNTS[i];
    try {
      // First, list campaigns in the account and filter by name match
      var campsUrl = "https://graph.facebook.com/v25.0/" + account.id + "/campaigns?fields=id,name,objective,effective_status&limit=500&access_token=" + metaToken;
      var campsRes = await fetch(campsUrl);
      var campsData = await campsRes.json();
      var camps = (campsData.data || []).filter(function(c) {
        var n = (c.name || "").toLowerCase();
        return search.some(function(s) { return n.indexOf(s) >= 0; });
      });
      if (camps.length === 0) continue;

      for (var ci = 0; ci < camps.length; ci++) {
        var camp = camps[ci];
        // Fetch ad-level insights for this campaign with NO breakdowns
        var insUrl = "https://graph.facebook.com/v25.0/" + camp.id + "/insights?fields=ad_id,ad_name,impressions,clicks,spend,actions,action_values&time_range={\"since\":\"" + from + "\",\"until\":\"" + to + "\"}&level=ad&limit=500&access_function=" + metaToken;
        // fix param typo
        insUrl = insUrl.replace("access_function=", "access_token=");
        var insRes = await fetch(insUrl);
        var insData = await insRes.json();
        var ads = (insData.data || []).map(function(r) {
          var actionsMap = {};
          (r.actions || []).forEach(function(a) {
            actionsMap[a.action_type] = parseInt(a.value || 0);
          });
          return {
            adId: r.ad_id,
            adName: r.ad_name,
            impressions: r.impressions,
            clicks: r.clicks,
            spend: r.spend,
            actions: actionsMap
          };
        });
        // Also fetch campaign-level aggregate for comparison
        var campInsUrl = "https://graph.facebook.com/v25.0/" + camp.id + "/insights?fields=impressions,clicks,spend,actions&time_range={\"since\":\"" + from + "\",\"until\":\"" + to + "\"}&level=campaign&limit=1&access_token=" + metaToken;
        var campInsRes = await fetch(campInsUrl);
        var campInsData = await campInsRes.json();
        var campAgg = {};
        if (campInsData.data && campInsData.data[0] && campInsData.data[0].actions) {
          campInsData.data[0].actions.forEach(function(a) { campAgg[a.action_type] = parseInt(a.value || 0); });
        }
        out.push({
          account: account.name,
          campaignId: camp.id,
          campaignName: camp.name,
          apiObjective: camp.objective,
          status: camp.effective_status,
          campaignActionsAggregate: campAgg,
          ads: ads
        });
      }
    } catch (err) {
      out.push({ account: account.name, error: String(err && err.message || err) });
    }
  }

  res.status(200).json({ from: from, to: to, search: search, campaigns: out });
}
