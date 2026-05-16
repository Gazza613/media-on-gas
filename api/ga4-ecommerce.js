// GA4 ecommerce summary for a client whose KPI profile has ecommerce
// enabled (currently Psycho Bunny only). Pulls, for the date range:
//   - site totals (users, sessions, page views)
//   - ecommerce totals (transactions, revenue, AOV, conv rate)
//   - newsletter sign-ups (configured GA4 event name)
//   - top products by revenue (the "sales winners")
//   - the slice of revenue/transactions attributed to Paid Social
//     (Meta), so the email/Summary can show total + our contribution
//   - the property's top event names (so the team can confirm the
//     real newsletter event name in Settings)
//
// Auth: OAuth2 refresh-token flow (GA4_OAUTH_CLIENT_ID/SECRET +
// GA4_REFRESH_TOKEN), same shape as the Google Ads refresh in
// campaigns.js. The GA4 property ID + newsletter event name are read
// SERVER-SIDE from the client KPI profile, never user-supplied, so a
// client view can't point this at another property.
//
//   GET /api/ga4-ecommerce?client=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// For a client-role principal the client is forced to their own
// share-token slug; the ?client= param is honoured for admins only.

import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { getKpiProfile } from "./_clientKpiProfiles.js";

var GA4 = "https://analyticsdata.googleapis.com/v1beta";

var cache = {};
var TTL_MS = 30 * 60 * 1000;

function ymd(d) {
  var p = function(n){ return n < 10 ? "0" + n : "" + n; };
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

async function getAccessToken() {
  var id = process.env.GA4_OAUTH_CLIENT_ID;
  var secret = process.env.GA4_OAUTH_CLIENT_SECRET;
  var refresh = process.env.GA4_REFRESH_TOKEN;
  if (!id || !secret || !refresh) return { error: "GA4 OAuth env vars not configured" };
  try {
    var r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "client_id=" + encodeURIComponent(id) +
        "&client_secret=" + encodeURIComponent(secret) +
        "&refresh_token=" + encodeURIComponent(refresh) +
        "&grant_type=refresh_token"
    });
    var d = await r.json();
    if (!r.ok || !d.access_token) return { error: (d && d.error_description) || "Token refresh failed" };
    return { token: d.access_token };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
}

// Pull a metric value out of a single-row report (totals-style).
function firstRowMetrics(report) {
  var out = {};
  if (!report || !report.metricHeaders) return out;
  var row = (report.rows && report.rows[0]) || null;
  report.metricHeaders.forEach(function(h, i) {
    out[h.name] = row && row.metricValues && row.metricValues[i] ? parseFloat(row.metricValues[i].value || 0) : 0;
  });
  return out;
}

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
  if (!(await checkAuth(req, res))) return;

  var principal = req.authPrincipal || { role: "admin" };
  // Client role: lock to their own slug. Admin: trust the param.
  var clientName = principal.role === "client"
    ? String(principal.clientSlug || "")
    : String(req.query.client || "").trim();
  if (!clientName) { res.status(400).json({ error: "client required" }); return; }

  var profile = await getKpiProfile(clientName);
  if (!profile || !profile.ecommerce || !profile.ecommerce.enabled) {
    res.status(200).json({ ok: false, enabled: false, reason: "Ecommerce is not enabled for this client." });
    return;
  }
  var propertyId = String(profile.ecommerce.ga4PropertyId || "").replace(/[^0-9]/g, "");
  if (!propertyId) {
    res.status(200).json({ ok: false, enabled: true, reason: "No GA4 property ID set on this client's KPI profile." });
    return;
  }
  var newsletterEvent = String(profile.ecommerce.newsletterEvent || "").trim();
  // Preferred signal: page views of the post-signup thank-you page.
  // Deterministic (you only land there after completing the signup),
  // so it overrides the event-name path when set.
  var newsletterPath = String(profile.ecommerce.newsletterPagePath || "").trim();

  var from = String(req.query.from || "").trim();
  var to = String(req.query.to || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    var now = new Date();
    to = ymd(now);
    from = ymd(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  }
  // The team sets a full calendar-month range (e.g. to 2026-05-31) while
  // the month is still running. This GA4 property reports in USD but the
  // store transacts in ZAR, so every revenue metric needs a daily
  // currency-exchange rate. GA4 has NO rate for today or any future day,
  // and one missing day fails the ENTIRE batched report ("Future
  // currency exchange rate not exist"). Clamp the end to yesterday (the
  // last fully-settled, rate-available day); an ecommerce summary never
  // needs the current partial day. String compare is safe on YYYY-MM-DD.
  var yest = ymd(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (to > yest) to = yest;
  if (from > to) from = to;

  var cacheKey = propertyId + "|" + from + "|" + to + "|" + newsletterEvent + "|" + newsletterPath;
  var hit = cache[cacheKey];
  if (hit && Date.now() - hit.ts < TTL_MS) { res.status(200).json(hit.payload); return; }

  var auth = await getAccessToken();
  if (auth.error) { res.status(503).json({ error: "GA4 auth failed", message: auth.error }); return; }

  var dateRanges = [{ startDate: from, endDate: to }];

  // One batched call, 5 report requests (GA4 batch cap).
  var batchBody = {
    requests: [
      // 0. Site + ecommerce totals
      {
        dateRanges: dateRanges,
        metrics: [
          { name: "activeUsers" }, { name: "sessions" }, { name: "screenPageViews" },
          { name: "ecommercePurchases" }, { name: "purchaseRevenue" }
        ]
      },
      // 1. Newsletter signups. Preferred: views of the post-signup
      //    thank-you page (deterministic). Fallback: count of the
      //    configured GA4 event.
      newsletterPath ? {
        dateRanges: dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        dimensionFilter: {
          filter: { fieldName: "pagePath", stringFilter: { matchType: "CONTAINS", value: newsletterPath } }
        },
        limit: 20
      } : {
        dateRanges: dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: newsletterEvent ? {
          filter: { fieldName: "eventName", stringFilter: { matchType: "EXACT", value: newsletterEvent } }
        } : undefined,
        limit: 5
      },
      // 2. Top products by revenue (sales winners)
      {
        dateRanges: dateRanges,
        dimensions: [{ name: "itemName" }],
        metrics: [{ name: "itemRevenue" }, { name: "itemsPurchased" }],
        orderBys: [{ metric: { metricName: "itemRevenue" }, desc: true }],
        limit: 8
      },
      // 3. Paid Social attributed revenue/transactions
      {
        dateRanges: dateRanges,
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [{ name: "ecommercePurchases" }, { name: "purchaseRevenue" }, { name: "sessions" }],
        dimensionFilter: {
          filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Paid Social" } }
        },
        limit: 5
      },
      // 4. Top event names (so the team can confirm the newsletter event)
      {
        dateRanges: dateRanges,
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: 25
      }
    ]
  };

  var reports;
  try {
    var r = await fetch(GA4 + "/properties/" + propertyId + ":batchRunReports", {
      method: "POST",
      headers: { "Authorization": "Bearer " + auth.token, "Content-Type": "application/json" },
      body: JSON.stringify(batchBody)
    });
    var d = await r.json();
    if (!r.ok || d.error) {
      // GA4 error messages can be a multi-KB protobuf debug dump. Never
      // surface that verbatim (it rendered as a wall of text in the UI).
      // Map the known classes to a human sentence, else a short snippet.
      var rawMsg = String((d.error && d.error.message) || "GA4 report request failed").replace(/\s+/g, " ").trim();
      var reason = rawMsg;
      if (/currency exchange/i.test(rawMsg)) reason = "GA4 could not convert revenue for part of this date range (currency exchange rate unavailable for recent/future days). Try a date range that ends before today.";
      else if (/permission|PERMISSION_DENIED|insufficient/i.test(rawMsg)) reason = "GA4 access was denied for this property. Re-check the connected account's permission on property " + propertyId + ".";
      else if (rawMsg.length > 180) reason = rawMsg.slice(0, 180) + "…";
      res.status(200).json({ ok: false, enabled: true, reason: reason });
      return;
    }
    reports = d.reports || [];
  } catch (e) {
    res.status(500).json({ error: "GA4 request failed", message: String(e && e.message || e) });
    return;
  }

  var totals = firstRowMetrics(reports[0]);
  var purchases = totals.ecommercePurchases || 0;
  var revenue = totals.purchaseRevenue || 0;

  // Newsletter signups. Page-path mode: GA4 already filtered to the
  // thank-you path, so sum screenPageViews across whatever path variants
  // came back (trailing slash, query string, etc). Event mode: sum the
  // (filtered) eventCount rows as before.
  var newsletterCount = 0;
  if (reports[1] && reports[1].rows) {
    if (newsletterPath) {
      reports[1].rows.forEach(function(row) {
        newsletterCount += parseFloat((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || 0);
      });
    } else {
      reports[1].rows.forEach(function(row) {
        var name = row.dimensionValues && row.dimensionValues[0] ? row.dimensionValues[0].value : "";
        if (!newsletterEvent || name === newsletterEvent) {
          newsletterCount += parseFloat((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || 0);
        }
      });
    }
  }

  var topProducts = [];
  if (reports[2] && reports[2].rows) {
    topProducts = reports[2].rows.map(function(row) {
      return {
        name: (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || "(unknown)",
        revenue: parseFloat((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || 0),
        units: parseInt((row.metricValues && row.metricValues[1] && row.metricValues[1].value) || 0, 10)
      };
    }).filter(function(p) { return p.revenue > 0 || p.units > 0; });
  }

  var paidSocial = { purchases: 0, revenue: 0, sessions: 0 };
  if (reports[3] && reports[3].rows && reports[3].rows[0]) {
    var pr = reports[3].rows[0].metricValues || [];
    paidSocial.purchases = parseFloat((pr[0] && pr[0].value) || 0);
    paidSocial.revenue = parseFloat((pr[1] && pr[1].value) || 0);
    paidSocial.sessions = parseFloat((pr[2] && pr[2].value) || 0);
  }

  var eventNames = [];
  if (reports[4] && reports[4].rows) {
    eventNames = reports[4].rows.map(function(row) {
      return {
        event: (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || "",
        count: parseInt((row.metricValues && row.metricValues[0] && row.metricValues[0].value) || 0, 10)
      };
    });
  }

  // Second batched call: acquisition + audience breakdowns (where
  // visits/sales come from, device split, geography). GA4 caps a batch
  // at 5 reports and the first batch already uses all 5, so this is a
  // separate call. Enrichment only: if it fails the core payload still
  // returns, the breakdown sections just don't render.
  var channels = [], devices = [], countries = [];
  try {
    var r2body = {
      requests: [
        // 0. Channel: where visits AND sales come from, one report.
        {
          dateRanges: dateRanges,
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "activeUsers" }, { name: "purchaseRevenue" }, { name: "ecommercePurchases" }],
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: 12
        },
        // 1. Device category split.
        {
          dateRanges: dateRanges,
          dimensions: [{ name: "deviceCategory" }],
          metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "purchaseRevenue" }, { name: "ecommercePurchases" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 5
        },
        // 2. Top countries by users (with their revenue).
        {
          dateRanges: dateRanges,
          dimensions: [{ name: "country" }],
          metrics: [{ name: "activeUsers" }, { name: "purchaseRevenue" }, { name: "ecommercePurchases" }],
          orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
          limit: 8
        }
      ]
    };
    var rr = await fetch(GA4 + "/properties/" + propertyId + ":batchRunReports", {
      method: "POST",
      headers: { "Authorization": "Bearer " + auth.token, "Content-Type": "application/json" },
      body: JSON.stringify(r2body)
    });
    var dd = await rr.json();
    var rep2 = (rr.ok && !dd.error && dd.reports) ? dd.reports : [];
    var dim0 = function(row) { return (row.dimensionValues && row.dimensionValues[0] && row.dimensionValues[0].value) || "(unknown)"; };
    var mv = function(row, i) { return parseFloat((row.metricValues && row.metricValues[i] && row.metricValues[i].value) || 0); };
    if (rep2[0] && rep2[0].rows) {
      channels = rep2[0].rows.map(function(row) {
        return { channel: dim0(row), sessions: Math.round(mv(row, 0)), users: Math.round(mv(row, 1)), revenue: parseFloat(mv(row, 2).toFixed(2)), transactions: Math.round(mv(row, 3)) };
      }).filter(function(c) { return c.sessions > 0 || c.revenue > 0; });
    }
    if (rep2[1] && rep2[1].rows) {
      devices = rep2[1].rows.map(function(row) {
        return { device: dim0(row), users: Math.round(mv(row, 0)), sessions: Math.round(mv(row, 1)), revenue: parseFloat(mv(row, 2).toFixed(2)), transactions: Math.round(mv(row, 3)) };
      }).filter(function(d2) { return d2.users > 0; });
    }
    if (rep2[2] && rep2[2].rows) {
      countries = rep2[2].rows.map(function(row) {
        return { country: dim0(row), users: Math.round(mv(row, 0)), revenue: parseFloat(mv(row, 1).toFixed(2)), transactions: Math.round(mv(row, 2)) };
      }).filter(function(c) { return c.users > 0; });
    }
  } catch (_) { /* enrichment is best-effort */ }

  var payload = {
    ok: true, enabled: true,
    client: clientName, propertyId: propertyId, from: from, to: to,
    channels: channels, devices: devices, countries: countries,
    newsletterEvent: newsletterEvent || null,
    newsletterPagePath: newsletterPath || null,
    newsletterSource: newsletterPath ? "pagePath" : (newsletterEvent ? "event" : "none"),
    site: {
      users: Math.round(totals.activeUsers || 0),
      sessions: Math.round(totals.sessions || 0),
      pageViews: Math.round(totals.screenPageViews || 0)
    },
    ecommerce: {
      transactions: Math.round(purchases),
      revenue: parseFloat(revenue.toFixed(2)),
      aov: purchases > 0 ? parseFloat((revenue / purchases).toFixed(2)) : 0,
      conversionRate: totals.sessions > 0 ? parseFloat((purchases / totals.sessions * 100).toFixed(2)) : 0
    },
    newsletterSignups: Math.round(newsletterCount),
    topProducts: topProducts,
    paidSocial: {
      transactions: Math.round(paidSocial.purchases),
      revenue: parseFloat(paidSocial.revenue.toFixed(2)),
      sessions: Math.round(paidSocial.sessions),
      // assisted share of total revenue
      revenueSharePct: revenue > 0 ? parseFloat((paidSocial.revenue / revenue * 100).toFixed(2)) : 0
    },
    discoveredEvents: eventNames,
    note: "Total-site figures are everything GA4 records for the property. The Paid Social line is the slice GA4 attributes to paid social sessions. For an awareness campaign treat that attribution as assisted/view-through, a directional signal, not the campaign's optimisation target."
  };
  cache[cacheKey] = { ts: Date.now(), payload: payload };
  res.status(200).json(payload);
}
