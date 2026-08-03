// WhatsApp diagnostic dump. Returns every action_type Meta exposes
// for a client's WhatsApp campaigns in a given date range, grouped
// by campaign and aggregated across the selection. Purpose: pin
// down which action_type is the honest "conversations opened"
// denominator when the 7-day counter looks under-representative
// versus a manually-recorded CAPI QualifiedLead outcome count.
//
// Meta returns multiple attribution windows for the same action
// (1d / 7d / 28d / lifetime) and multiple related event types
// (messaging_conversation_started, messaging_reply, messaging_
// welcome_message_view, etc.). Only three of them surface in the
// standard dashboard tile, this endpoint dumps ALL of them so
// unusual funnel ratios can be reconciled without guessing.
//
// Admin/superadmin only. No CAPI dataset events (those live in
// Meta Events Manager UI and have no Marketing API read path).
//
// URL: /api/wa-diag?client=learnalot&from=YYYY-MM-DD&to=YYYY-MM-DD

import { rateLimit } from "./_rateLimit.js";
import { checkAuth, isAdminOrSuperadmin } from "./_auth.js";

var metaAccounts = [
  { name: "MTN MoMo", id: "act_8159212987434597" },
  { name: "MTN Khava", id: "act_3600654450252189" },
  { name: "Concord College", id: "act_825253026181227" },
  { name: "Eden College", id: "act_1187886635852303" },
  { name: "Psycho Bunny ZA", id: "act_9001636663181231" },
  { name: "GAS Agency", id: "act_542990539806888" }
];

function isWhatsAppName(name) {
  var n = String(name || "").toLowerCase();
  return n.indexOf("_wapp_") >= 0 || n.indexOf("wapp_") >= 0 ||
    n.indexOf("_whatsapp_") >= 0 || n.indexOf(" whatsapp ") >= 0 ||
    n.indexOf("_wa_") >= 0 || n.indexOf("wa_msg") >= 0;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!(await rateLimit(req, res))) return;
  if (!(await checkAuth(req, res))) return;
  var principal = req.authPrincipal || { role: "admin" };
  if (!isAdminOrSuperadmin(principal)) { res.status(403).json({ error: "admin_required" }); return; }

  var client = String(req.query.client || "").toLowerCase().trim();
  var from = String(req.query.from || "").trim();
  var to = String(req.query.to || "").trim();
  if (!client) { res.status(400).json({ error: "client query param required" }); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    res.status(400).json({ error: "from and to must be YYYY-MM-DD" });
    return;
  }
  var metaToken = process.env.META_ACCESS_TOKEN;
  if (!metaToken) { res.status(500).json({ error: "META_ACCESS_TOKEN not configured" }); return; }

  var timeRange = encodeURIComponent(JSON.stringify({ since: from, until: to }));
  var out = { client: client, from: from, to: to, accounts: [], campaigns: [], aggregate: {} };

  for (var ai = 0; ai < metaAccounts.length; ai++) {
    var acc = metaAccounts[ai];
    var accBucket = { account: acc.name, matched: 0, campaigns: [] };
    try {
      // Fetch campaign-level insights with the full actions array,
      // no publisher_platform breakdown so we get one clean row per
      // campaign. Meta returns nested action counters (1d / 7d / 28d
      // / lifetime) inside each action if the fields are requested.
      var url = "https://graph.facebook.com/v25.0/" + acc.id +
        "/insights?fields=campaign_name,campaign_id,impressions,clicks,reach,spend," +
        "actions,unique_actions,action_values" +
        "&time_range=" + timeRange +
        "&level=campaign&limit=500" +
        "&access_token=" + metaToken;
      var r = await fetch(url);
      if (!r.ok) { accBucket.error = "HTTP " + r.status; out.accounts.push(accBucket); continue; }
      var d = await r.json();
      if (d.error) { accBucket.error = d.error.message || d.error.code; out.accounts.push(accBucket); continue; }
      var rows = d.data || [];
      rows.forEach(function(row) {
        var name = String(row.campaign_name || "");
        var lname = name.toLowerCase();
        if (lname.indexOf(client) < 0) return;
        if (!isWhatsAppName(name)) return;
        accBucket.matched += 1;
        // Aggregate actions array into a simple map for readability.
        var actionMap = {};
        (row.actions || []).forEach(function(a) {
          actionMap[a.action_type] = (actionMap[a.action_type] || 0) + parseFloat(a.value || 0);
          // Roll up into out.aggregate too so the top-level view
          // shows the totals across every matching campaign.
          out.aggregate[a.action_type] = (out.aggregate[a.action_type] || 0) + parseFloat(a.value || 0);
        });
        var uniqActionMap = {};
        (row.unique_actions || []).forEach(function(a) {
          uniqActionMap[a.action_type] = (uniqActionMap[a.action_type] || 0) + parseFloat(a.value || 0);
        });
        var campEntry = {
          account: acc.name,
          campaignId: row.campaign_id,
          campaignName: name,
          impressions: parseFloat(row.impressions || 0),
          clicks: parseFloat(row.clicks || 0),
          reach: parseFloat(row.reach || 0),
          spend: parseFloat(row.spend || 0),
          actions: actionMap,
          uniqueActions: uniqActionMap
        };
        accBucket.campaigns.push(campEntry);
        out.campaigns.push(campEntry);
      });
    } catch (err) {
      accBucket.error = String(err && err.message || err);
    }
    if (accBucket.matched > 0 || accBucket.error) out.accounts.push(accBucket);
  }

  // Sort aggregate action types by value DESC so the top counters
  // sit at the top of the response. Also flag likely conversation
  // / messaging counters so the reader spots them without hunting.
  var sortedAgg = {};
  Object.keys(out.aggregate)
    .sort(function(a, b) { return out.aggregate[b] - out.aggregate[a]; })
    .forEach(function(k) { sortedAgg[k] = out.aggregate[k]; });
  out.aggregate = sortedAgg;
  out.messagingCounters = {};
  Object.keys(sortedAgg).forEach(function(k) {
    if (/messag|conversation|reply|whatsapp/i.test(k)) {
      out.messagingCounters[k] = sortedAgg[k];
    }
  });

  res.status(200).json(out);
}
