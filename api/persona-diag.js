import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { validateDates } from "./_validate.js";

// Persona diagnostic endpoint. Hits Meta and Google directly with the same
// queries the persona cards depend on, and returns row counts / platform
// distribution / failure reasons as JSON so we can see at a glance what
// data is actually flowing through for a given date range. Admin-only.
//
// Usage, open in browser:
//   https://<site>/api/persona-diag?from=2026-04-01&to=2026-04-23&api_key=<key>
// or curl with the same args. No caching, always runs live.

var META_ACCOUNTS = [
  { id: "act_8159212987434597", name: "MoMo POS" },
  { id: "act_1096547581766373", name: "MTN MoMo" },
  { id: "act_1056268262507793", name: "Willowbrook" },
  { id: "act_1056268265841126", name: "Psycho" },
  { id: "act_1056268269174459", name: "Khava" },
  { id: "act_1056268272507792", name: "Concord" }
];

async function metaBreakdown(acc, token, from, to, breakdowns) {
  try {
    var url = "https://graph.facebook.com/v25.0/" + acc.id + "/insights?level=campaign&fields=campaign_name,campaign_id,impressions,clicks,spend&breakdowns=" + encodeURIComponent(breakdowns) + "&time_range=" + encodeURIComponent(JSON.stringify({ since: from, until: to })) + "&limit=500&access_token=" + token;
    var r = await fetch(url);
    if (!r.ok) {
      var body = "";
      try { body = (await r.text() || "").slice(0, 300); } catch (_) {}
      return { error: "HTTP " + r.status, body: body, rows: [] };
    }
    var d = await r.json();
    return { error: null, rows: d.data || [] };
  } catch (e) {
    return { error: String(e && e.message || e), rows: [] };
  }
}

function summarisePlatforms(rows) {
  if (!rows || !rows.length) return { total: 0, byPlatform: {} };
  var counts = {};
  rows.forEach(function(r) {
    var p = String(r.publisher_platform || "none").toLowerCase();
    counts[p] = (counts[p] || 0) + 1;
  });
  return { total: rows.length, byPlatform: counts };
}

export default async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (!checkAuth(req, res)) return;
  if (!validateDates(req, res)) return;

  var principal = req.authPrincipal || { role: "admin" };
  if (principal.role !== "admin") {
    return res.status(403).json({ error: "Admin-only diagnostic endpoint" });
  }

  var from = req.query.from, to = req.query.to;
  if (!from || !to) return res.status(400).json({ error: "from and to required" });

  var report = {
    from: from, to: to,
    runAt: new Date().toISOString(),
    meta: {},
    googleIntent: {}
  };

  // Meta diagnostic, per account
  var metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) {
    report.meta = { error: "META_ACCESS_TOKEN not configured" };
  } else {
    report.meta.accounts = {};
    for (var i = 0; i < META_ACCOUNTS.length; i++) {
      var acc = META_ACCOUNTS[i];
      var threeDim = await metaBreakdown(acc, metaToken, from, to, "age,gender,publisher_platform");
      var agByPlat = await metaBreakdown(acc, metaToken, from, to, "age,publisher_platform");
      var genByPlat = await metaBreakdown(acc, metaToken, from, to, "gender,publisher_platform");
      var regByPlat = await metaBreakdown(acc, metaToken, from, to, "region,publisher_platform");
      var devByPlat = await metaBreakdown(acc, metaToken, from, to, "impression_device,publisher_platform");
      report.meta.accounts[acc.name] = {
        "3dim_age_gender_publisher": { error: threeDim.error, distribution: summarisePlatforms(threeDim.rows) },
        "2dim_age_publisher": { error: agByPlat.error, distribution: summarisePlatforms(agByPlat.rows) },
        "2dim_gender_publisher": { error: genByPlat.error, distribution: summarisePlatforms(genByPlat.rows) },
        "2dim_region_publisher": { error: regByPlat.error, distribution: summarisePlatforms(regByPlat.rows) },
        "2dim_device_publisher": { error: devByPlat.error, distribution: summarisePlatforms(devByPlat.rows) }
      };
    }
  }

  // Google Intent diagnostic
  var gClientId = process.env.GOOGLE_ADS_CLIENT_ID;
  var gClientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  var gRefreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  var gDevToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  var gManagerId = process.env.GOOGLE_ADS_MANAGER_ID;
  var gCustomerId = "9587382256";
  if (!gClientId || !gRefreshToken || !gDevToken) {
    report.googleIntent = { error: "Google Ads credentials not configured" };
  } else {
    try {
      var tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "client_id=" + gClientId + "&client_secret=" + gClientSecret + "&refresh_token=" + gRefreshToken + "&grant_type=refresh_token"
      });
      var tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        report.googleIntent = { error: "Google token refresh failed", body: JSON.stringify(tokenData).slice(0, 300) };
      } else {
        var authHeader = "Bearer " + tokenData.access_token;
        var runQuery = async function(label, query) {
          try {
            var r = await fetch("https://googleads.googleapis.com/v21/customers/" + gCustomerId + "/googleAds:search", {
              method: "POST",
              headers: {
                "Authorization": authHeader,
                "developer-token": gDevToken,
                "login-customer-id": gManagerId,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ query: query, pageSize: 10000 })
            });
            if (!r.ok) {
              var body = "";
              try { body = (await r.text() || "").slice(0, 400); } catch (_) {}
              return { label: label, error: "HTTP " + r.status, bodyPreview: body, rowCount: 0 };
            }
            var d = await r.json();
            var rows = d.results || [];
            return { label: label, error: null, rowCount: rows.length, sampleRow: rows[0] || null };
          } catch (err) {
            return { label: label, error: String(err && err.message || err), rowCount: 0 };
          }
        };
        var queries = [
          ["search_term_view", "SELECT search_term_view.search_term, metrics.clicks, metrics.impressions FROM search_term_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0 LIMIT 50"],
          ["age_range_view", "SELECT ad_group_criterion.age_range.type, metrics.clicks FROM age_range_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"],
          ["gender_view", "SELECT ad_group_criterion.gender.type, metrics.clicks FROM gender_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"],
          ["keyword_view", "SELECT ad_group_criterion.keyword.match_type, metrics.clicks FROM keyword_view WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"],
          ["campaign_hour", "SELECT segments.hour, metrics.clicks FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND metrics.clicks > 0"],
          ["search_campaigns_any", "SELECT campaign.name, campaign.advertising_channel_type, metrics.clicks FROM campaign WHERE segments.date BETWEEN '" + from + "' AND '" + to + "' AND campaign.advertising_channel_type = 'SEARCH'"]
        ];
        report.googleIntent.queries = {};
        for (var qi = 0; qi < queries.length; qi++) {
          var result = await runQuery(queries[qi][0], queries[qi][1]);
          report.googleIntent.queries[queries[qi][0]] = result;
        }
      }
    } catch (err) {
      report.googleIntent = { error: "Unexpected, " + String(err && err.message || err) };
    }
  }

  res.status(200).json(report);
}
