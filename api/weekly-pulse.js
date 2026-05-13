import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { labelFor } from "./_clientLabels.js";
import {
  ORIGIN, RECIPIENT_LIST, escapeHtml, pad2, ymd, fmtR, fmtNum, fmtShortDate, sastNow,
  redisSetIfAbsent,
  P, DISP_COLORS, COLOR_RANK, worse,
  resultMetricFor, clientKeyOf, ageDaysFor,
  adsManagerUrl,
  fetchCampaigns, fetchAdsByCampaign
} from "./_pulseShared.js";

// Weekly Pulse — campaign performance summary for the GAS leadership +
// media team. Fires every Monday at 08:00 SAST (06:00 UTC) via Vercel
// cron, covering the prior 7 calendar days (Mon-Sun) compared against
// the 7 days before that.
//
// Anomalies have moved to a dedicated daily email (/api/daily-report).
// This email is the considered, week-in-review read: per-client blocks,
// per-campaign analyst commentary, ads-manager deep links, and a single
// disposition chip (ACTION / WARNING / WATCH / HEALTHY / BASELINING)
// per campaign so a leader can scan the agency's posture in one pass.

function dispositionFor(thisWeek, lastWeek, ageDays) {
  var spendY = parseFloat(thisWeek.spend || 0);
  var rmY = resultMetricFor(thisWeek);
  var rmB = lastWeek ? resultMetricFor(lastWeek) : null;
  var sample7d = rmB ? rmB.value : 0;

  var ZERO_RESULT_FLOOR = 700; // ~R100/day for a 7-day window
  var isResultObjective = rmY.kind === "Clicks to App Store" || rmY.kind === "Leads" || rmY.kind === "Follows + Likes";
  if (isResultObjective && rmY.value === 0 && spendY >= ZERO_RESULT_FLOOR) {
    return {
      color: "red", tag: "ACTION",
      flags: ["Zero " + rmY.kind.toLowerCase() + " on " + fmtR(spendY) + " spend this week"],
      wins: [],
      context: sample7d > 0 ? ["Prior week: " + sample7d + " " + rmY.kind.toLowerCase()] : []
    };
  }

  // Campaigns younger than 7 days only get baseline status if their start
  // date falls inside the reporting week. Older campaigns that simply lack
  // a prior-week baseline (newly added to the account) are handled below.
  if (ageDays !== null && ageDays < 7) {
    return { color: "yellow", tag: "BASELINING", flags: [], wins: [], context: ["Day " + (ageDays + 1) + " of 7, establishing baseline"] };
  }
  if (!lastWeek) {
    return { color: "yellow", tag: "BASELINING", flags: [], wins: [], context: ["No prior-week baseline yet"] };
  }

  var color = "green";
  var flags = [], wins = [], context = [];

  var cprY = rmY.value > 0 ? spendY / rmY.value : null;
  var cprB = rmB && rmB.value > 0 ? parseFloat(lastWeek.spend) / rmB.value : null;
  if (cprY !== null && cprB !== null && cprB > 0) {
    var d = (cprY - cprB) / cprB * 100;
    if (d >= 50) { color = worse(color, "red"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs last week"); }
    else if (d >= 25) { color = worse(color, "orange"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs last week"); }
    else if (d >= 10) { color = worse(color, "yellow"); flags.push(rmY.costLabel + " " + fmtR(cprY) + " up " + d.toFixed(0) + "% vs last week"); }
    else if (d <= -10) { wins.push(rmY.costLabel + " " + fmtR(cprY) + " down " + Math.abs(d).toFixed(0) + "% vs last week"); }
  }

  var freq = parseFloat(thisWeek.frequency || 0);
  var platform = String(thisWeek.platform || "").toLowerCase();
  if (freq > 0 && (platform.indexOf("facebook") >= 0 || platform.indexOf("instagram") >= 0)) {
    if (freq > 4) { color = worse(color, "red"); flags.push("Frequency " + freq.toFixed(2) + "x, saturation"); }
    else if (freq >= 3.5) { color = worse(color, "orange"); flags.push("Frequency " + freq.toFixed(2) + "x, approaching ceiling"); }
    else if (freq >= 3) { color = worse(color, "yellow"); flags.push("Frequency " + freq.toFixed(2) + "x, elevated"); }
  }

  var ctrY = parseFloat(thisWeek.ctr || 0);
  var ctrB = parseFloat(lastWeek.ctr || 0);
  if (ctrY > 0 && ctrB > 0) {
    var cd = (ctrY - ctrB) / ctrB * 100;
    if (cd <= -40) { color = worse(color, "red"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs last week"); }
    else if (cd <= -20) { color = worse(color, "orange"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs last week"); }
    else if (cd <= -10) { color = worse(color, "yellow"); flags.push("CTR " + ctrY.toFixed(2) + "% down " + Math.abs(cd).toFixed(0) + "% vs last week"); }
    else if (cd >= 10) { wins.push("CTR " + ctrY.toFixed(2) + "% up " + cd.toFixed(0) + "% vs last week"); }
  }

  var clicksY = parseInt(thisWeek.clicks || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var clicksB = parseInt(lastWeek.clicks || 0);
  var cpcB = clicksB > 0 ? parseFloat(lastWeek.spend || 0) / clicksB : null;
  if (cpcY !== null && cpcB !== null && cpcB > 0) {
    var pd = (cpcY - cpcB) / cpcB * 100;
    if (pd >= 50) { color = worse(color, "red"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd >= 25) { color = worse(color, "orange"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd >= 10) { color = worse(color, "yellow"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd <= -10) { wins.push("CPC " + fmtR(cpcY) + " down " + Math.abs(pd).toFixed(0) + "% vs last week"); }
  }

  // Thin-sample handling — small prior-week samples are noisy.
  if (sample7d < 50) {
    if (color === "red" || color === "orange") color = "yellow";
    context.push("Thin baseline: " + sample7d + " " + rmY.kind.toLowerCase() + " prior week");
  }

  var tag = color === "red" ? "ACTION" : color === "orange" ? "WARNING" : color === "yellow" ? "WATCH" : "HEALTHY";
  return { color: color, tag: tag, flags: flags, wins: wins, context: context };
}

// Senior-analyst per-campaign read of the week — synthesised from the
// week's spend, CTR, CPC, and objective-aligned result vs the prior week.
function analystNote(thisWeek, lastWeek, rmY, ageDays) {
  var spendY = parseFloat(thisWeek.spend || 0);
  var clicksY = parseInt(thisWeek.clicks || 0);
  var ctrY = parseFloat(thisWeek.ctr || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var resY = rmY.value;
  var isResultObj = rmY.kind === "Leads" || rmY.kind === "Clicks to App Store" || rmY.kind === "Follows + Likes";
  var cprY = resY > 0 ? spendY / resY : null;

  var ctrB = lastWeek ? parseFloat(lastWeek.ctr || 0) : 0;
  var clicksB = lastWeek ? parseInt(lastWeek.clicks || 0) : 0;
  var spendB = lastWeek ? parseFloat(lastWeek.spend || 0) : 0;
  var cpcB = clicksB > 0 ? spendB / clicksB : null;
  var ctrDelta = (ctrY > 0 && ctrB > 0) ? ((ctrY - ctrB) / ctrB * 100) : null;
  var cpcDelta = (cpcY !== null && cpcB !== null && cpcB > 0) ? ((cpcY - cpcB) / cpcB * 100) : null;

  if (ageDays !== null && ageDays < 7) {
    return "Week 1 of delivery, insufficient history for a defensible read. CTR " + ctrY.toFixed(2) + "% and CPC " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " are the early-tell signals to watch as the auction settles.";
  }

  if (isResultObj && resY === 0 && clicksY >= 200) {
    var postClick = rmY.kind === "Leads" ? "lead form (fields, friction, validation)"
      : rmY.kind === "Clicks to App Store" ? "app store listing (ratings, screenshots, description)"
      : "follow flow (profile content quality, first-impression load)";
    return fmtNum(clicksY) + " clicks but zero " + rmY.kind.toLowerCase() + " for the week. The creative and targeting are earning attention; the breakdown is post-click. Audit " + postClick + " before allocating another week of spend.";
  }

  if (ctrDelta !== null && cpcDelta !== null && ctrDelta >= 5 && cpcDelta >= 20) {
    return "CTR held at " + ctrY.toFixed(2) + "% (up " + ctrDelta.toFixed(0) + "% wow) but CPC climbed " + cpcDelta.toFixed(0) + "% to " + fmtR(cpcY) + ". Creative is still winning attention, the auction is just more crowded. Layer lookalike expansion or shift to Advantage+ placements to cheapen inventory without touching what works.";
  }
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta <= -10 && cpcDelta >= 10) {
    return "Fatigue signature on the week: CTR down " + Math.abs(ctrDelta).toFixed(0) + "% to " + ctrY.toFixed(2) + "% while CPC climbed " + cpcDelta.toFixed(0) + "% to " + fmtR(cpcY) + ". Rotate creative going into next week before CPC compounds further.";
  }
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta >= 10 && cpcDelta <= -10) {
    return "Both efficiency vectors moving the right way: CTR up " + ctrDelta.toFixed(0) + "% to " + ctrY.toFixed(2) + "%, CPC down " + Math.abs(cpcDelta).toFixed(0) + "% to " + fmtR(cpcY) + ". This is the scale signal — lift the weekly budget 15-20% and let the algorithm extend the win.";
  }
  if (ctrDelta !== null && ctrDelta <= -20) {
    return "CTR fell " + Math.abs(ctrDelta).toFixed(0) + "% wow to " + ctrY.toFixed(2) + "%. Top-of-funnel engagement is softening, which compresses downstream economics. Creative refresh is the first lever, broader targeting second.";
  }
  if (cpcDelta !== null && cpcDelta >= 25 && (ctrDelta === null || ctrDelta > -10)) {
    return "CPC at " + fmtR(cpcY) + " is " + cpcDelta.toFixed(0) + "% above last week while CTR held at " + ctrY.toFixed(2) + "%. Creative is still landing, the auction is just more expensive. Hold for next 7 days to confirm sustained drift before rebidding.";
  }
  if (isResultObj && resY > 0 && cprY !== null) {
    var resWord = rmY.kind.replace(/s$/, "").toLowerCase();
    return fmtNum(resY) + " " + rmY.kind.toLowerCase() + " for the week at " + fmtR(cprY) + " per " + resWord + ", driven by " + fmtNum(clicksY) + " clicks at " + ctrY.toFixed(2) + "% CTR and " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC. Click-to-" + resWord + " conversion " + (clicksY > 0 ? (resY / clicksY * 100).toFixed(2) : "0.00") + "%, delivery profile steady.";
  }
  if (clicksY > 0 && ctrY > 0) {
    return ctrY.toFixed(2) + "% CTR on " + fmtNum(clicksY) + " clicks at " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC for the week. Signals sit within band of last week — no creative or bid change indicated.";
  }
  return "Limited delivery this week, sample too thin to derive a confident read.";
}

function buildCampaignRows(thisWeekCampaigns, lastWeekCampaigns, adsByCampaign) {
  var baseByKey = {};
  lastWeekCampaigns.forEach(function(c) {
    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    if (k) baseByKey[k] = c;
  });

  var rows = [];
  thisWeekCampaigns.forEach(function(c) {
    var spend = parseFloat(c.spend || 0);
    if (spend <= 0) return;

    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    var b = baseByKey[k] || null;
    var age = ageDaysFor(c);
    var disp = dispositionFor(c, b, age);
    var rm = resultMetricFor(c);
    var note = analystNote(c, b, rm, age);
    var topAd = (adsByCampaign && adsByCampaign[String(c.rawCampaignId || "")]) || null;

    var clicksY = parseInt(c.clicks || 0);
    var cpcY = clicksY > 0 ? spend / clicksY : null;

    rows.push({
      campaignName: c.campaignName,
      platform: c.platform,
      objective: c.objective,
      spend: spend,
      results: rm.value,
      resultsKind: rm.kind,
      cprLabel: rm.costLabel,
      cpr: rm.value > 0 ? spend / rm.value : null,
      frequency: parseFloat(c.frequency || 0),
      ctr: parseFloat(c.ctr || 0),
      cpc: cpcY,
      clicks: clicksY,
      disposition: disp,
      analystNote: note,
      adsManagerUrl: adsManagerUrl(c),
      thumbnail: topAd ? topAd.thumbnail : "",
      previewUrl: topAd ? topAd.previewUrl : ""
    });
  });
  return rows;
}

function groupByClient(rows) {
  var buckets = {};
  rows.forEach(function(r) {
    var key = clientKeyOf(r.campaignName);
    if (!buckets[key]) {
      var lf = labelFor(key);
      buckets[key] = { key: key, label: lf.label, known: lf.known, rows: [] };
    }
    buckets[key].rows.push(r);
  });
  Object.keys(buckets).forEach(function(k) {
    buckets[k].rows.sort(function(a, b) {
      var sa = COLOR_RANK[a.disposition.color] || 0;
      var sb = COLOR_RANK[b.disposition.color] || 0;
      if (sb !== sa) return sb - sa;
      return b.spend - a.spend;
    });
  });
  return Object.keys(buckets).map(function(k) { return buckets[k]; }).sort(function(a, b) {
    var sa = a.rows[0] ? COLOR_RANK[a.rows[0].disposition.color] : -1;
    var sb = b.rows[0] ? COLOR_RANK[b.rows[0].disposition.color] : -1;
    if (sb !== sa) return sb - sa;
    var spendA = a.rows.reduce(function(x, r) { return x + r.spend; }, 0);
    var spendB = b.rows.reduce(function(x, r) { return x + r.spend; }, 0);
    return spendB - spendA;
  });
}

function dispChip(disp) {
  var c = DISP_COLORS[disp.color] || DISP_COLORS.green;
  var word = disp.tag || c.word;
  return '<span style="display:inline-block;background:' + c.soft + ';border:1px solid ' + c.border + ';color:' + c.fill + ';font-size:9px;font-weight:900;padding:3px 9px;border-radius:6px;letter-spacing:1.5px;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(word) + '</span>';
}

function buildHtml(opts) {
  var weekLabel = opts.weekLabel;
  var clients = opts.clients;
  var totals = opts.totals;
  var logoUrl = ORIGIN + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";

  var totalAction = 0, totalWarning = 0, totalWatch = 0, totalHealthy = 0;
  clients.forEach(function(b) {
    b.rows.forEach(function(r) {
      if (r.disposition.color === "red") totalAction++;
      else if (r.disposition.color === "orange") totalWarning++;
      else if (r.disposition.color === "yellow") totalWatch++;
      else totalHealthy++;
    });
  });

  function clientBlock(b) {
    var spend = b.rows.reduce(function(a, r) { return a + r.spend; }, 0);
    var results = b.rows.reduce(function(a, r) { return a + r.results; }, 0);
    var t = { red:0, orange:0, yellow:0, green:0 };
    b.rows.forEach(function(r) { t[r.disposition.color]++; });

    var pillsHtml = ["red","orange","yellow","green"].filter(function(k){return t[k]>0;}).map(function(k) {
      var c = DISP_COLORS[k];
      return '<span style="display:inline-block;background:' + c.soft + ';border:1px solid ' + c.border + ';color:' + c.fill + ';font-size:10px;font-weight:800;padding:3px 9px;border-radius:6px;margin-right:6px;font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">' + t[k] + ' ' + c.word + '</span>';
    }).join("");

    var rowsHtml = b.rows.map(function(r) {
      var c = DISP_COLORS[r.disposition.color] || DISP_COLORS.green;
      var flags = r.disposition.flags || [];
      var wins = r.disposition.wins || [];
      var context = r.disposition.context || [];

      var thumbHtml = r.thumbnail
        ? '<img src="' + escapeHtml(r.thumbnail) + '" alt="ad creative" width="64" height="64" style="width:64px;height:64px;display:block;border-radius:10px;object-fit:cover;border:1px solid ' + P.rule + ';"/>'
        : '<div style="width:64px;height:64px;display:block;border-radius:10px;background:linear-gradient(135deg,' + P.ember + '40,' + P.lava + '40);border:1px solid ' + P.rule + ';"></div>';

      var analystHtml = r.analystNote ?
        '<div style="margin-top:8px;padding:9px 11px;background:rgba(255,255,255,0.04);border-left:3px solid ' + P.amber + ';border-radius:0 8px 8px 0;font-size:11px;color:' + P.label + ';line-height:1.6;font-family:Manrope,Helvetica,Arial,sans-serif;font-style:italic;">' +
        escapeHtml(r.analystNote) + '</div>' : '';

      var flagsHtml = flags.length === 0 ? "" :
        '<div style="font-size:11px;color:' + DISP_COLORS.red.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;">' +
        flags.map(function(f) { return '<span style="margin-right:6px;">&#9888;</span>' + escapeHtml(f); }).join('<br/>') + '</div>';
      var winsHtml = wins.length === 0 ? "" :
        '<div style="font-size:11px;color:' + DISP_COLORS.green.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;">' +
        wins.map(function(w) { return '<span style="margin-right:6px;">&#10003;</span>' + escapeHtml(w); }).join('<br/>') + '</div>';
      var contextHtml = context.length === 0 ? "" :
        '<div style="font-size:10px;color:' + P.caption + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-style:italic;">' +
        context.map(escapeHtml).join(' &middot; ') + '</div>';
      var noSignalHtml = (flags.length === 0 && wins.length === 0 && context.length === 0)
        ? '<div style="font-size:11px;color:' + DISP_COLORS.green.fill + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.55;font-weight:700;"><span style="margin-right:6px;">&#10003;</span>All signals within band</div>'
        : "";

      var amLink = r.adsManagerUrl
        ? '<a href="' + escapeHtml(r.adsManagerUrl) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:10px;color:' + P.cyan + ';text-decoration:none;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">Open in ' + escapeHtml(r.platform || "") + ' Ads Manager &rarr;</a>'
        : '';

      var ctrTxt = r.ctr > 0 ? r.ctr.toFixed(2) + "%" : '<span style="color:' + P.caption + ';">-</span>';
      var cpcTxt = r.cpc !== null ? escapeHtml(fmtR(r.cpc)) : '<span style="color:' + P.caption + ';">-</span>';
      var cprStack = r.cpr !== null
        ? '<div style="font-size:9px;color:' + P.mint + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:4px;font-weight:800;">' + escapeHtml(fmtR(r.cpr)) + ' ' + escapeHtml(r.cprLabel) + '</div>'
        : '';

      return '<tr>' +
        '<td style="padding:12px 0 12px 14px;border-bottom:1px solid ' + P.rule + ';border-left:3px solid ' + c.fill + ';background:' + c.soft + ';width:78px;vertical-align:top;">' + thumbHtml + '</td>' +
        '<td style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';background:' + c.soft + ';vertical-align:top;">' +
          '<div style="margin-bottom:4px;line-height:1.6;">' +
            dispChip(r.disposition) +
            '<span style="display:inline-block;margin-left:10px;padding:2px 0;font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">' + escapeHtml(r.platform || "") + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.35;word-break:break-word;">' + escapeHtml(r.campaignName) + '</div>' +
          analystHtml + flagsHtml + winsHtml + contextHtml + noSignalHtml + amLink +
        '</td>' +
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.ember + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtR(r.spend)) + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">spend</div>' +
        '</td>' +
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + ctrTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CTR</div>' +
        '</td>' +
        '<td style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.amber + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + cpcTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CPC</div>' +
        '</td>' +
        '<td style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.cyan + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtNum(r.results)) + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">' + escapeHtml(r.resultsKind) + '</div>' +
          cprStack +
        '</td>' +
      '</tr>';
    }).join("");

    return '<tr><td style="padding:24px 36px 0;">' +
      '<div style="display:block;margin-bottom:14px;">' +
        '<div style="font-size:18px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">' + escapeHtml(b.label) + '</div>' +
        '<div style="margin-top:6px;font-size:11px;color:' + P.label + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
          '<strong style="color:' + P.txt + ';">' + escapeHtml(fmtR(spend)) + '</strong> spend &middot; ' +
          '<strong style="color:' + P.cyan + ';">' + escapeHtml(fmtNum(results)) + '</strong> results &middot; ' +
          b.rows.length + ' active campaign' + (b.rows.length === 1 ? "" : "s") +
        '</div>' +
        '<div style="margin-top:8px;">' + pillsHtml + '</div>' +
      '</div>' +
      '<div style="border:1px solid ' + P.rule + ';border-radius:12px;overflow:hidden;background:rgba(0,0,0,0.20);">' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">' + rowsHtml + '</table>' +
      '</div>' +
    '</td></tr>';
  }

  var clientBlocks = clients.map(clientBlock).join("");

  var totalsStrip =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
      '<td width="25%" style="padding:0 4px 0 0;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Spend this week</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.ember + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtR(totals.spend)) + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Campaigns</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totals.activeCampaigns + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Action required</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (totalAction > 0 ? P.lava : P.mint) + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totalAction + '</div></div></td>' +
      '<td width="25%" style="padding:0 0 0 4px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Healthy</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.mint + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totalHealthy + '</div></div></td>' +
    '</tr></table>';

  var methodology =
    '<div style="font-size:10px;color:' + P.caption + ';line-height:1.7;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<div style="font-size:10px;color:' + P.label + ';font-weight:800;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">How dispositions are derived</div>' +
      '<div style="margin-bottom:4px;">Every campaign is read on four signals: <strong>spend</strong>, <strong>CTR</strong>, <strong>CPC</strong>, and the <strong>objective-aligned result</strong> (Leads, Clicks to App Store, Follows + Likes, or Clicks for traffic-style campaigns). Comparisons are this-week vs last-week per campaign, never against a global benchmark.</div>' +
      '<div style="margin-bottom:4px;margin-top:8px;"><span style="color:' + DISP_COLORS.red.fill + ';font-weight:900;">ACTION</span> &middot; zero results on R700+ weekly spend, CPR up 50%+ vs last week, CPC up 50%+, frequency &gt;4.0x, or CTR down 40%+</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.orange.fill + ';font-weight:900;">WARNING</span> &middot; CPR up 25-50%, CPC up 25-50%, frequency 3.5-4.0x, or CTR down 20-40%</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.yellow.fill + ';font-weight:900;">WATCH</span> &middot; smaller deviations, thin baseline (&lt;50 results last week), or campaign younger than 7 days (BASELINING)</div>' +
      '<div style="margin-bottom:4px;"><span style="color:' + DISP_COLORS.green.fill + ';font-weight:900;">HEALTHY</span> &middot; all signals within &plusmn;10% of last week, frequency under 3.0x</div>' +
      '<div style="margin-top:10px;color:' + P.caption + ';">The italic note under each campaign is the senior-analyst read. <span style="color:' + DISP_COLORS.red.fill + ';">&#9888;</span> red lines explain the disposition, <span style="color:' + DISP_COLORS.green.fill + ';">&#10003;</span> green lines are wins vs last week, italic lines flag thin baselines or campaign age.</div>' +
      '<div style="margin-top:6px;color:' + P.caption + ';">Same-day anomalies (sudden CPL spikes, lead-volume drops, conversion path breaks) ship in a separate Daily Anomalies email each morning, not here. This pulse is the week-in-review.</div>' +
    '</div>';

  var glowStyles =
    '<style>' +
    '@keyframes gasGlow {' +
      '0%, 100% { box-shadow: 0 0 18px rgba(249,98,3,0.35), 0 0 38px rgba(255,61,0,0.22); }' +
      '50% { box-shadow: 0 0 28px rgba(249,98,3,0.55), 0 0 60px rgba(255,61,0,0.35); }' +
    '}' +
    '.gas-logo-glow { animation: gasGlow 2.6s ease-in-out infinite; }' +
    '</style>';

  var logoBlock =
    '<div style="text-align:center;margin-bottom:18px;">' +
      '<img class="gas-logo-glow" src="' + logoUrl + '" alt="GAS Marketing" width="84" height="84" border="0" style="width:84px;height:84px;display:inline-block;border-radius:50%;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;box-shadow:0 0 24px rgba(249,98,3,0.45),0 0 50px rgba(255,61,0,0.28);"/>' +
    '</div>';

  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Weekly Pulse</title>' +
    glowStyles + '</head>' +
    '<body style="margin:0;padding:0;background:' + P.bg + ';font-family:Manrope,\'Helvetica Neue\',Helvetica,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + P.bg + ';padding:36px 14px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;background:linear-gradient(170deg,' + P.panel + ' 0%,' + P.panel2 + ' 100%);border-radius:22px;overflow:hidden;border:1px solid ' + P.rule + ';">' +

      '<tr><td style="padding:32px 36px 24px;text-align:center;">' +
      logoBlock +
      '<div style="font-size:11px;color:' + P.ember + ';letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">GAS Weekly Pulse</div>' +
      '<div style="font-size:26px;font-weight:900;letter-spacing:4px;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
        '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:11px;color:' + P.caption + ';letter-spacing:3px;margin-top:8px;text-transform:uppercase;font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(weekLabel) + '</div>' +
      '</td></tr>' +

      '<tr><td style="padding:0 36px;"><div style="height:1px;background:linear-gradient(90deg,transparent,' + P.ember + ',transparent);"></div></td></tr>' +

      '<tr><td style="padding:24px 36px 6px;">' + totalsStrip + '</td></tr>' +
      clientBlocks +

      '<tr><td style="padding:32px 36px 8px;">' +
      '<div style="background:rgba(0,0,0,0.22);border:1px solid ' + P.rule + ';border-left:4px solid ' + P.amber + ';border-radius:0 12px 12px 0;padding:18px 22px;">' +
        methodology +
      '</div></td></tr>' +

      '<tr><td style="padding:24px 36px 8px;" align="center">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td align="center" style="background:linear-gradient(135deg,' + P.lava + ',' + P.solar + ');border-radius:12px;">' +
      '<a href="' + ORIGIN + '" style="display:inline-block;padding:14px 38px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">Open Dashboard</a>' +
      '</td></tr></table></td></tr>' +

      '<tr><td style="padding:28px 36px 4px;">' +
      '<div style="font-size:13px;color:' + P.txt + ';font-weight:800;font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;">SAMI</div>' +
      '<div style="font-size:11px;color:' + P.ember + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1.5px;text-transform:uppercase;">AI Expert Agent</div>' +
      '<div style="font-size:10px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;">Media Department</div>' +
      '</td></tr>' +

      '<tr><td style="padding:24px 36px 8px;"><div style="height:1px;background:' + P.rule + ';"></div></td></tr>' +
      '<tr><td style="padding:18px 36px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
      '<tr><td valign="middle" style="width:54px;padding-right:14px;">' +
      '<img src="' + logoUrl + '" alt="GAS Marketing" width="46" height="46" border="0" style="width:46px;height:46px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>' +
      '</td><td valign="middle">' +
      '<div style="font-size:12px;color:' + P.txt + ';font-weight:800;letter-spacing:3px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:10px;color:' + P.caption + ';letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;font-family:Manrope,Helvetica,Arial,sans-serif;">Weekly Pulse, Monday 08:00 SAST</div>' +
      '<div style="font-size:11px;color:' + P.caption + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<a href="mailto:grow@gasmarketing.co.za" style="color:' + P.caption + ';text-decoration:none;">grow@gasmarketing.co.za</a></div>' +
      '</td></tr></table></td></tr>' +
    '</table></td></tr></table></body></html>';
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = !!(cronSecret && timingSafeStrEqual(authHeader, "Bearer " + cronSecret));

  if (!isCron) {
    if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    if (!apiKey || !expectedKey || apiKey !== expectedKey) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  var dryRun = req.query.dryRun === "1" || req.query.dry === "1";

  // "Last week" = the 7-day window ending yesterday (SAST). Baseline =
  // the 7 days before that. So for a Monday morning run:
  //   thisWeek  = previous Mon → previous Sun (Mon-7 .. Mon-1)
  //   lastWeek  = Mon-14 .. Mon-8
  var nowSast = sastNow();
  var thisWeekEnd = new Date(nowSast.getTime() - 24 * 60 * 60 * 1000);
  var thisWeekStart = new Date(thisWeekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);
  var lastWeekEnd = new Date(thisWeekStart.getTime() - 24 * 60 * 60 * 1000);
  var lastWeekStart = new Date(lastWeekEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

  var tFrom = ymd(thisWeekStart), tTo = ymd(thisWeekEnd);
  var lFrom = ymd(lastWeekStart), lTo = ymd(lastWeekEnd);
  var weekLabel = fmtShortDate(thisWeekStart) + " to " + fmtShortDate(thisWeekEnd);

  var dashKey = process.env.DASHBOARD_API_KEY || "";
  if (!dashKey) {
    res.status(500).json({ error: "DASHBOARD_API_KEY not configured" });
    return;
  }

  var thisWeekData, lastWeekData, adsByCampaign;
  try {
    var triple = await Promise.all([
      fetchCampaigns(tFrom, tTo, dashKey),
      fetchCampaigns(lFrom, lTo, dashKey),
      fetchAdsByCampaign(tFrom, tTo, dashKey)
    ]);
    thisWeekData = triple[0];
    lastWeekData = triple[1];
    adsByCampaign = triple[2] || {};
  } catch (err) {
    console.error("weekly-pulse fetch failed", err);
    res.status(500).json({ error: "Upstream campaign fetch failed", message: String(err && err.message || err) });
    return;
  }

  var rows = buildCampaignRows(thisWeekData.campaigns || [], lastWeekData.campaigns || [], adsByCampaign);
  var clients = groupByClient(rows);
  var totals = {
    spend: rows.reduce(function(a, r) { return a + r.spend; }, 0),
    activeCampaigns: rows.length
  };

  if (rows.length === 0) {
    var emptyHtml = buildHtml({
      weekLabel: weekLabel + " (no active spend this week)",
      clients: [], totals: totals
    });
    if (dryRun) { res.status(200).json({ ok: true, dryRun: true, weekLabel: weekLabel, rows: 0, html: emptyHtml }); return; }
    return await sendEmail(res, weekLabel, emptyHtml, isCron);
  }

  var html = buildHtml({ weekLabel: weekLabel, clients: clients, totals: totals });

  if (dryRun) {
    res.status(200).json({
      ok: true, dryRun: true, weekLabel: weekLabel,
      tFrom: tFrom, tTo: tTo, lFrom: lFrom, lTo: lTo,
      campaigns: rows.length,
      clients: clients.map(function(b) { return { key: b.key, label: b.label, count: b.rows.length }; }),
      html: html
    });
    return;
  }

  return await sendEmail(res, weekLabel, html, isCron);
}

async function sendEmail(res, weekLabel, html, isCron) {
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(200).json({ ok: false, reason: "GMAIL credentials not configured" });
    return;
  }

  if (isCron) {
    var nowSast = sastNow();
    var keyDate = ymd(new Date(nowSast.getTime() - 24 * 60 * 60 * 1000));
    var dedupKey = "weekly-pulse:sent:" + keyDate;
    var firstFire = await redisSetIfAbsent(dedupKey, 36 * 60 * 60);
    if (firstFire === false) {
      res.status(200).json({ ok: true, deduped: true, key: dedupKey });
      return;
    }
  }

  var transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  });

  try {
    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: RECIPIENT_LIST,
      subject: "Weekly Pulse | " + weekLabel,
      text: "GAS Weekly Pulse for " + weekLabel + ". Open the dashboard: " + ORIGIN,
      html: html
    });
    res.status(200).json({ ok: true, sent: true, to: RECIPIENT_LIST, weekLabel: weekLabel });
  } catch (err) {
    console.error("Weekly pulse send failed", err);
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
}
