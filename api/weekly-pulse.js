import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import { labelFor } from "./_clientLabels.js";
import {
  ORIGIN, RECIPIENT_LIST, escapeHtml, pad2, ymd, fmtR, fmtNum, fmtShortDate, sastNow,
  redisSetIfAbsent,
  P, DISP_COLORS, COLOR_RANK, worse,
  resultMetricFor, clientKeyOf, ageDaysFor, isAwarenessObjective,
  adsManagerUrl,
  fetchCampaigns, fetchAdsByCampaign
} from "./_pulseShared.js";

// Weekly Pulse, campaign performance summary for the GAS leadership +
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
  var isResultObjective = rmY.kind === "Clicks to App Store" || rmY.kind === "Leads" || rmY.kind === "Follows + Likes" || rmY.kind === "Profile Visits";
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

  // Awareness/reach campaigns are not graded on CTR (Meta optimises
  // them for cheap reach, so soft CTR is expected, not a problem).
  var awareness = isAwarenessObjective(thisWeek);
  var ctrY = parseFloat(thisWeek.ctr || 0);
  var ctrB = parseFloat(lastWeek.ctr || 0);
  if (!awareness && ctrY > 0 && ctrB > 0) {
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
  // When the campaign's result KPI is itself a click-based metric
  // (App Install, Landing Page, Click) the CPR check above already
  // pushed "CPC R0.68 up 13% ..." into flags. Running the dedicated
  // CPC check too would push the same string a second time and the
  // operator saw duplicated lines under the campaign. Skip the
  // dedicated CPC check when costLabel is already CPC.
  var cpcAlreadyFlagged = rmY.costLabel === "CPC";
  if (!cpcAlreadyFlagged && cpcY !== null && cpcB !== null && cpcB > 0) {
    var pd = (cpcY - cpcB) / cpcB * 100;
    if (pd >= 50) { color = worse(color, "red"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd >= 25) { color = worse(color, "orange"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd >= 10) { color = worse(color, "yellow"); flags.push("CPC " + fmtR(cpcY) + " up " + pd.toFixed(0) + "% vs last week"); }
    else if (pd <= -10) { wins.push("CPC " + fmtR(cpcY) + " down " + Math.abs(pd).toFixed(0) + "% vs last week"); }
  }

  // Thin-sample handling, small prior-week samples are noisy.
  if (sample7d < 50) {
    if (color === "red" || color === "orange") color = "yellow";
    context.push("Thin baseline: " + sample7d + " " + rmY.kind.toLowerCase() + " prior week");
  }

  var tag = color === "red" ? "ACTION" : color === "orange" ? "WARNING" : color === "yellow" ? "WATCH" : "HEALTHY";
  return { color: color, tag: tag, flags: flags, wins: wins, context: context };
}

// Senior-analyst per-campaign read of the week. Now objective-aware:
// the lead sentence matches the campaign's primary KPI (reach/CPM for
// awareness, results/CPR for direct-response, profile visits for IG
// followers, page-likes for FB followers, etc.). The follow-up
// sentence covers the adjacent watched metrics — impressions, reach,
// frequency, CPM, CTR, CPC, pacing — so a reader gets the full
// performance picture without the lead burying the objective.
//
// The previous fixed-order version always led with CTR/CPC, which read
// as if clicks were the win condition on reach-objective campaigns.
function analystNote(thisWeek, lastWeek, rmY, ageDays) {
  var spendY = parseFloat(thisWeek.spend || 0);
  var impsY = parseInt(thisWeek.impressions || 0);
  var reachY = parseInt(thisWeek.reach || 0);
  var freqY = parseFloat(thisWeek.frequency || 0);
  var clicksY = parseInt(thisWeek.clicks || 0);
  var ctrY = parseFloat(thisWeek.ctr || 0);
  var cpcY = clicksY > 0 ? spendY / clicksY : null;
  var cpmY = impsY > 0 ? (spendY / impsY * 1000) : null;
  var resY = rmY.value;
  var isResultObj = rmY.kind === "Leads" || rmY.kind === "Clicks to App Store" || rmY.kind === "Follows + Likes" || rmY.kind === "Profile Visits";
  var platformLower = String(thisWeek.platform || "").toLowerCase();
  var isTikTokFollowers = rmY.kind === "Follows + Likes" && platformLower.indexOf("tiktok") >= 0;
  var isAwareness = isAwarenessObjective(thisWeek);
  var cprY = resY > 0 ? spendY / resY : null;

  var impsB = lastWeek ? parseInt(lastWeek.impressions || 0) : 0;
  var reachB = lastWeek ? parseInt(lastWeek.reach || 0) : 0;
  var ctrB = lastWeek ? parseFloat(lastWeek.ctr || 0) : 0;
  var clicksB = lastWeek ? parseInt(lastWeek.clicks || 0) : 0;
  var spendB = lastWeek ? parseFloat(lastWeek.spend || 0) : 0;
  var cpcB = clicksB > 0 ? spendB / clicksB : null;
  var cpmB = impsB > 0 ? (spendB / impsB * 1000) : null;
  var resB = lastWeek ? (resultMetricFor(lastWeek).value) : 0;
  var cprB = resB > 0 && spendB > 0 ? spendB / resB : null;
  var ctrDelta = (ctrY > 0 && ctrB > 0) ? ((ctrY - ctrB) / ctrB * 100) : null;
  var cpcDelta = (cpcY !== null && cpcB !== null && cpcB > 0) ? ((cpcY - cpcB) / cpcB * 100) : null;
  var cpmDelta = (cpmY !== null && cpmB !== null && cpmB > 0) ? ((cpmY - cpmB) / cpmB * 100) : null;
  var reachDelta = (reachY > 0 && reachB > 0) ? ((reachY - reachB) / reachB * 100) : null;
  var resDelta = (resY > 0 && resB > 0) ? ((resY - resB) / resB * 100) : null;
  var cprDelta = (cprY !== null && cprB !== null && cprB > 0) ? ((cprY - cprB) / cprB * 100) : null;

  var fmtDelta = function(d, label) {
    if (d === null || !isFinite(d)) return "";
    var sign = d >= 0 ? "up " : "down ";
    return " (" + sign + Math.abs(d).toFixed(0) + "% wow " + label + ")";
  };

  if (ageDays !== null && ageDays < 7) {
    var earlyKpi = isAwareness ? "CPM " + (cpmY !== null ? fmtR(cpmY) : "n/a") + ", frequency " + freqY.toFixed(2) + "x" : (isResultObj && cprY !== null ? rmY.costLabel + " " + fmtR(cprY) : "CTR " + ctrY.toFixed(2) + "% on " + fmtNum(clicksY) + " clicks");
    return "Week 1 of delivery, insufficient history for a defensible read. " + earlyKpi + " is the early-tell signal as the auction settles. Reach " + fmtNum(reachY) + " · impressions " + fmtNum(impsY) + " · spend " + fmtR(spendY) + " so far.";
  }

  // Result-objective break: real result-objective campaigns earning
  // clicks but converting zero is the highest-severity signal,
  // overrides objective-aware lead.
  if (isResultObj && resY === 0 && clicksY >= 200) {
    var postClick = rmY.kind === "Leads" ? "lead form (fields, friction, validation)"
      : rmY.kind === "Clicks to App Store" ? "app store listing (ratings, screenshots, description)"
      : "follow flow (profile content quality, first-impression load)";
    return fmtNum(clicksY) + " clicks at " + ctrY.toFixed(2) + "% CTR but zero " + rmY.kind.toLowerCase() + " for the week — the creative and targeting are earning attention, the breakdown is post-click. Audit " + postClick + " before allocating another week. Spend " + fmtR(spendY) + ", reach " + fmtNum(reachY) + " at " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "n/a CPM") + ".";
  }

  // ===== Awareness lead =====
  // For reach/CPM-led campaigns the read should LEAD with reach and
  // CPM efficiency, not CTR. Clicks become a creative-resonance
  // supporting signal.
  if (isAwareness) {
    var head;
    if (reachDelta !== null && cpmDelta !== null) {
      var reachStr = reachY > 0 ? fmtNum(reachY) + " unique reached" + fmtDelta(reachDelta, "reach") : "delivery building";
      var cpmStr = cpmY !== null ? fmtR(cpmY) + " CPM" + fmtDelta(cpmDelta, "CPM") : "CPM n/a";
      head = reachStr + " at " + cpmStr + ".";
    } else {
      head = fmtNum(reachY) + " unique reached at " + (cpmY !== null ? fmtR(cpmY) : "n/a") + " CPM, frequency " + freqY.toFixed(2) + "x.";
    }
    var supporting;
    if (freqY >= 3.5) supporting = " Frequency " + freqY.toFixed(2) + "x is into saturation — broader targeting or new creative is the lever to keep CPMs honest.";
    else if (cpmDelta !== null && cpmDelta >= 20) supporting = " CPM up sharply against a flat reach signature suggests auction crowding; pacing intact, watch CPM trajectory next week.";
    else if (cpmDelta !== null && cpmDelta <= -15) supporting = " CPMs compressing while reach extends — pour 15-20% more budget while the efficiency window is open.";
    else supporting = " Delivery profile steady — frequency " + freqY.toFixed(2) + "x within healthy band, no creative or bid change indicated.";
    var ctrSecondary = ctrY > 0 ? " Creative drew " + fmtNum(clicksY) + " clicks at " + ctrY.toFixed(2) + "% CTR — useful resonance signal, though clicks are not the primary objective for this brief." : "";
    return head + supporting + ctrSecondary;
  }

  // ===== Direct-response lead =====
  // Result-objective campaigns lead with results + cost-per-result,
  // CTR/CPC are supporting context.
  if (isResultObj && resY > 0 && cprY !== null) {
    var resWord = rmY.kind.replace(/s$/, "").toLowerCase();
    var lead = fmtNum(resY) + " " + rmY.kind.toLowerCase() + fmtDelta(resDelta, "results") + " at " + fmtR(cprY) + " " + rmY.costLabel.toLowerCase() + fmtDelta(cprDelta !== null ? -cprDelta : null, "efficiency");
    // TikTok follower campaigns: clicks aren't the KPI and TikTok
    // rarely surfaces meaningful click data on a follow-objective
    // ad, so "driven by 0 clicks at 0.00% CTR and n/a CPC" reads as
    // noise. Drop the clicks/CTR/CPC clause for that case; keep it
    // for Instagram (clicks = profile visits, useful) and FB / Leads
    // / App Installs (clicks ARE the proxy for the action).
    var supp = isTikTokFollowers
      ? " Reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "n/a CPM") + " · frequency " + freqY.toFixed(2) + "x."
      : " driven by " + fmtNum(clicksY) + " clicks at " + ctrY.toFixed(2) + "% CTR and " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC. Reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "n/a CPM") + " · frequency " + freqY.toFixed(2) + "x.";
    var verdict = "";
    if (cprDelta !== null && cprDelta <= -15 && resDelta !== null && resDelta >= 15) verdict = " Scale signal: efficiency improving AND volume up. Lift budget 15-20% next week.";
    else if (cprDelta !== null && cprDelta >= 25) verdict = " " + rmY.costLabel + " climbing materially — fatigue check on the creative is the first lever before another week's spend.";
    else if (freqY >= 3) verdict = " Frequency " + freqY.toFixed(2) + "x is elevated — refresh creative before " + rmY.costLabel.toLowerCase() + " compounds.";
    return lead + supp + verdict;
  }

  // ===== Mixed / engagement / fallback lead =====
  // Used when objective isn't clearly awareness or pure-response (e.g.
  // engagement objectives where clicks/CTR are the optimisation metric).
  // Lead with CTR + CPC (existing behaviour), then cover delivery.
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta <= -10 && cpcDelta >= 10) {
    return "Fatigue signature on the week — CTR down " + Math.abs(ctrDelta).toFixed(0) + "% to " + ctrY.toFixed(2) + "% while CPC climbed " + cpcDelta.toFixed(0) + "% to " + fmtR(cpcY) + ". Rotate creative before CPC compounds. Reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "") + " · frequency " + freqY.toFixed(2) + "x.";
  }
  if (ctrDelta !== null && cpcDelta !== null && ctrDelta >= 10 && cpcDelta <= -10) {
    return "Scale signal — CTR up " + ctrDelta.toFixed(0) + "% to " + ctrY.toFixed(2) + "%, CPC down " + Math.abs(cpcDelta).toFixed(0) + "% to " + fmtR(cpcY) + ". Lift budget 15-20% to extend the win. Spend " + fmtR(spendY) + " · reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "") + ".";
  }
  if (ctrDelta !== null && ctrDelta <= -20) {
    return "CTR fell " + Math.abs(ctrDelta).toFixed(0) + "% wow to " + ctrY.toFixed(2) + "% — top-of-funnel engagement is softening. Creative refresh first, broader targeting second. Reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "") + " · frequency " + freqY.toFixed(2) + "x.";
  }
  if (cpcDelta !== null && cpcDelta >= 25 && (ctrDelta === null || ctrDelta > -10)) {
    return "CPC at " + fmtR(cpcY) + fmtDelta(cpcDelta, "CPC") + " while CTR held at " + ctrY.toFixed(2) + "% — creative is still landing, the auction is just more expensive. Hold for next 7 days to confirm sustained drift. Spend " + fmtR(spendY) + " · reach " + fmtNum(reachY) + ".";
  }
  if (clicksY > 0 && ctrY > 0) {
    return ctrY.toFixed(2) + "% CTR on " + fmtNum(clicksY) + " clicks at " + (cpcY !== null ? fmtR(cpcY) : "n/a") + " CPC for the week — signals within band, no change indicated. Reach " + fmtNum(reachY) + " · " + (cpmY !== null ? fmtR(cpmY) + " CPM" : "") + " · frequency " + freqY.toFixed(2) + "x.";
  }
  return "Limited delivery this week — spend " + fmtR(spendY) + ", reach " + fmtNum(reachY) + ", impressions " + fmtNum(impsY) + ". Sample too thin to derive a confident read.";
}

function buildCampaignRows(thisWeekCampaigns, lastWeekCampaigns, adsByCampaign) {
  var baseByKey = {};
  lastWeekCampaigns.forEach(function(c) {
    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    if (k) baseByKey[k] = c;
  });

  // Spend floor for the Weekly Pulse. Campaigns under R500 across the
  // 7-day window were skewing the HEALTHY count — a campaign that
  // barely delivered (R50 / 2K impressions) shows "all signals within
  // band" because every metric is effectively noise. Excluding them
  // here makes the disposition mix actually mean something. The
  // operator's mental model: focus on ads that have meaningful reach
  // and impressions; sub-R500 weekly spend isn't a meaningful read.
  var MIN_WEEKLY_SPEND = 500;
  var rows = [];
  thisWeekCampaigns.forEach(function(c) {
    var spend = parseFloat(c.spend || 0);
    if (spend < MIN_WEEKLY_SPEND) return;

    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    var b = baseByKey[k] || null;
    var age = ageDaysFor(c);
    var disp = dispositionFor(c, b, age);
    var rm = resultMetricFor(c);
    var note = analystNote(c, b, rm, age);
    var topAd = (adsByCampaign && adsByCampaign[String(c.rawCampaignId || "")]) || null;

    var clicksY = parseInt(c.clicks || 0);
    var cpcY = clicksY > 0 ? spend / clicksY : null;
    // Awareness result: cost-per-result reads as CPM (spend per 1000
    // impressions). For every other objective the existing
    // spend/result formula is correct.
    var imps = parseInt(c.impressions || 0);
    var cprComputed = rm.awareness
      ? (imps > 0 ? spend / imps * 1000 : null)
      : (rm.value > 0 ? spend / rm.value : null);

    rows.push({
      campaignName: c.campaignName,
      platform: c.platform,
      objective: c.objective,
      spend: spend,
      results: rm.value,
      resultsKind: rm.kind,
      cprLabel: rm.costLabel,
      cpr: cprComputed,
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
        '<div class="pulse-analyst" style="margin-top:8px;padding:9px 11px;background:rgba(255,255,255,0.04);border-left:3px solid ' + P.amber + ';border-radius:0 8px 8px 0;font-size:11px;color:' + P.label + ';line-height:1.6;font-family:Manrope,Helvetica,Arial,sans-serif;font-style:italic;">' +
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
        '<td class="pulse-row-thumb" style="padding:12px 0 12px 14px;border-bottom:1px solid ' + P.rule + ';border-left:3px solid ' + c.fill + ';background:' + c.soft + ';width:78px;vertical-align:top;">' + thumbHtml + '</td>' +
        '<td class="pulse-row-name" style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';background:' + c.soft + ';vertical-align:top;">' +
          '<div style="margin-bottom:4px;line-height:1.6;">' +
            dispChip(r.disposition) +
            '<span style="display:inline-block;margin-left:10px;padding:2px 0;font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">' + escapeHtml(r.platform || "") + '</span>' +
          '</div>' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.35;word-break:break-word;">' + escapeHtml(r.campaignName) + '</div>' +
          analystHtml + flagsHtml + winsHtml + contextHtml + noSignalHtml + amLink +
        '</td>' +
        '<td class="pulse-row-metric" style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.ember + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(fmtR(r.spend)) + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">spend</div>' +
        '</td>' +
        '<td class="pulse-row-metric" style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.txt + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + ctrTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CTR</div>' +
        '</td>' +
        '<td class="pulse-row-metric" style="padding:12px 12px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
          '<div style="font-size:13px;color:' + P.amber + ';font-weight:900;font-family:Manrope,Helvetica,Arial,sans-serif;">' + cpcTxt + '</div>' +
          '<div style="font-size:9px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px;">CPC</div>' +
        '</td>' +
        '<td class="pulse-row-metric" style="padding:12px 14px;border-bottom:1px solid ' + P.rule + ';text-align:right;vertical-align:top;white-space:nowrap;">' +
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
    '<table role="presentation" class="pulse-totals" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
      '<td width="25%" style="padding:0 4px 0 0;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Total Media Spend</div>' +
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
    // Resets to keep Gmail / iOS Mail / Outlook from inheriting host page styles
    'body,table,td,p,a,div{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}' +
    'table,td{mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;}' +
    'img{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}' +
    'a{text-decoration:none;}' +
    '@keyframes gasGlow {' +
      '0%, 100% { box-shadow: 0 0 18px rgba(249,98,3,0.35), 0 0 38px rgba(255,61,0,0.22); }' +
      '50% { box-shadow: 0 0 28px rgba(249,98,3,0.55), 0 0 60px rgba(255,61,0,0.35); }' +
    '}' +
    '.gas-logo-glow { animation: gasGlow 2.6s ease-in-out infinite; }' +
    // Mobile responsive — applies in Apple Mail, iOS Mail, Gmail mobile,
    // Outlook iOS. Outlook desktop ignores media queries and uses its
    // fixed-width MSO table at 720px, which is fine at desktop sizes.
    '@media only screen and (max-width:600px) {' +
      '.pulse-container { width:100% !important; max-width:100% !important; border-radius:14px !important; }' +
      '.pulse-pad { padding-left:18px !important; padding-right:18px !important; }' +
      '.pulse-headline { font-size:22px !important; letter-spacing:3px !important; }' +
      '.pulse-eyebrow { letter-spacing:3px !important; }' +
      '.pulse-totals td { display:block !important; width:100% !important; padding:0 0 8px 0 !important; }' +
      '.pulse-row-thumb { width:56px !important; padding:10px 0 10px 10px !important; }' +
      '.pulse-row-thumb img, .pulse-row-thumb > div { width:48px !important; height:48px !important; }' +
      '.pulse-row-name { padding:10px 12px !important; }' +
      '.pulse-row-metric { padding:6px 12px !important; text-align:left !important; white-space:normal !important; display:inline-block !important; width:auto !important; }' +
      '.pulse-analyst { font-size:11px !important; line-height:1.6 !important; }' +
      '.cta-btn { display:block !important; padding:14px 28px !important; }' +
      '.pulse-footer-row { display:block !important; width:100% !important; padding:0 0 10px 0 !important; text-align:center !important; }' +
      '.pulse-footer-row img { margin:0 auto !important; }' +
    '}' +
    '</style>';

  var logoBlock =
    '<div style="text-align:center;margin-bottom:18px;">' +
      '<img class="gas-logo-glow" src="' + logoUrl + '" alt="GAS Marketing" width="84" height="84" border="0" style="width:84px;height:84px;display:inline-block;border-radius:50%;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;box-shadow:0 0 24px rgba(249,98,3,0.45),0 0 50px rgba(255,61,0,0.28);"/>' +
    '</div>';

  var preheader = "Weekly Pulse for " + weekLabel + ", " + totalAction + " action / " + totalHealthy + " healthy across the agency.";
  return '<!DOCTYPE html>' +
    '<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">' +
    '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">' +
    '<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light">' +
    '<title>Weekly Pulse</title>' +
    '<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml><![endif]-->' +
    glowStyles + '</head>' +
    '<body style="margin:0;padding:0;background:' + P.bg + ';font-family:Manrope,\'Helvetica Neue\',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">' +
    '<div style="display:none;font-size:1px;color:' + P.bg + ';line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">' + escapeHtml(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + P.bg + ';padding:32px 12px;">' +
    '<tr><td align="center">' +
    '<!--[if mso]><table role="presentation" align="center" width="720" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
    '<table role="presentation" class="pulse-container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;background-color:' + P.panel + ';background-image:linear-gradient(170deg,' + P.panel + ' 0%,' + P.panel2 + ' 100%);border-radius:22px;overflow:hidden;border:1px solid ' + P.rule + ';">' +

      '<tr><td class="pulse-pad" style="padding:32px 36px 24px;text-align:center;">' +
      logoBlock +
      '<div class="pulse-eyebrow" style="font-size:11px;color:' + P.ember + ';letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">GAS Weekly Pulse</div>' +
      '<div class="pulse-headline" style="font-size:26px;font-weight:900;letter-spacing:4px;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
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
      // Outlook bulletproof button (VML) — Outlook strips
      // background:linear-gradient and border-radius from TDs, so the
      // old gradient-TD pattern rendered as plain white text on the
      // dark email. VML <v:roundrect> with conditional comments gives
      // Outlook a solid orange button with proper rounded corners.
      // Modern clients (Gmail, Apple Mail, mobile) get the gradient
      // <a>. Same pattern as the nudge / share emails.
      '<!--[if mso]>' +
      '<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="' + ORIGIN + '" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="25%" stroke="f" fillcolor="#FF5A1F">' +
      '<w:anchorlock/>' +
      '<center style="color:#ffffff;font-family:Manrope,Helvetica,Arial,sans-serif;font-size:13px;font-weight:900;letter-spacing:3px;text-transform:uppercase;">OPEN DASHBOARD</center>' +
      '</v:roundrect>' +
      '<![endif]-->' +
      '<!--[if !mso]><!-->' +
      '<a href="' + ORIGIN + '" class="cta-btn" style="background-color:#FF5A1F;background-image:linear-gradient(135deg,' + P.lava + ',' + P.solar + ');border-radius:12px;color:#ffffff;display:inline-block;font-family:Manrope,Helvetica,Arial,sans-serif;font-size:13px;font-weight:900;letter-spacing:3px;padding:14px 38px;text-decoration:none;text-transform:uppercase;mso-hide:all;">Open Dashboard</a>' +
      '<!--<![endif]-->' +
      '</td></tr>' +

      '<tr><td style="padding:28px 36px 4px;">' +
      '<div style="font-size:13px;color:' + P.txt + ';font-weight:800;font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">SAMI</div>' +
      '<div style="font-size:11px;color:' + P.ember + ';font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">AI EXPERT AGENT</div>' +
      '<div style="font-size:10px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">GAS MEDIA DEPARTMENT</div>' +
      '</td></tr>' +

      '<tr><td style="padding:24px 36px 8px;"><div style="height:1px;background:' + P.rule + ';line-height:1px;font-size:1px;">&nbsp;</div></td></tr>' +
      '<tr><td style="padding:18px 36px 30px;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
      '<tr><td class="pulse-footer-row" valign="middle" style="width:54px;padding-right:14px;">' +
      '<img src="' + logoUrl + '" alt="GAS Marketing" width="46" height="46" border="0" style="width:46px;height:46px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>' +
      '</td><td class="pulse-footer-row" valign="middle">' +
      '<div style="font-size:12px;color:' + P.txt + ';font-weight:800;letter-spacing:3px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:10px;color:' + P.caption + ';letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;font-family:Manrope,Helvetica,Arial,sans-serif;">Weekly Pulse, Monday 08:00 SAST</div>' +
      '<div style="font-size:11px;color:' + P.caption + ';margin-top:6px;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
      '<a href="mailto:grow@gasmarketing.co.za" style="color:' + P.caption + ';text-decoration:none;">grow@gasmarketing.co.za</a></div>' +
      '</td></tr></table></td></tr>' +
    '</table>' +
    '<!--[if mso]></td></tr></table><![endif]-->' +
    '</td></tr></table></body></html>';
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var isCron = !!(cronSecret && timingSafeStrEqual(authHeader, "Bearer " + cronSecret));

  if (!isCron) {
    if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    if (!apiKey || !expectedKey || !timingSafeStrEqual(String(apiKey), expectedKey)) {
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
