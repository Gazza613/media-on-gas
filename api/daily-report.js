import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { timingSafeStrEqual } from "./_createAuth.js";
import {
  ORIGIN, RECIPIENT_LIST, escapeHtml, pad2, ymd, fmtR, fmtNum, fmtDate, sastNow,
  redisSetIfAbsent,
  P, DISP_COLORS,
  resultMetricFor,
  adsManagerUrl,
  ANOMALY_DEFS, detectAnomalies,
  fetchCampaigns
} from "./_pulseShared.js";

// Daily Anomalies, anomaly-only watchlist for the GAS media team. Fires
// every morning at 08:15 SAST (06:15 UTC) via Vercel cron. Compares the
// prior day's per-campaign metrics against the campaign's own rolling
// 7-day baseline; emits one section per anomaly type with the affected
// campaigns and the corrective procedure the team should run.
//
// This email intentionally contains ONLY anomalies. The weekly summary
// of performance ships separately as /api/weekly-pulse on Monday mornings.
// If no anomalies fire (a clean morning) the email still ships with a
// "no anomalies detected" body so the team knows the watcher ran.

function buildHtml(opts) {
  var dateLabel = opts.dateLabel;
  var anomaliesByType = opts.anomaliesByType || {};
  var totalAnomalies = opts.totalAnomalies || 0;
  var totalCampaignsWatched = opts.totalCampaignsWatched || 0;
  var logoUrl = ORIGIN + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";

  // Severity counts for the totals strip
  var critCount = 0, highCount = 0, medCount = 0;
  Object.keys(anomaliesByType).forEach(function(k) {
    var sev = (ANOMALY_DEFS[k] && ANOMALY_DEFS[k].severity) || 1;
    var n = anomaliesByType[k].length;
    if (sev === 3) critCount += n;
    else if (sev === 2) highCount += n;
    else medCount += n;
  });

  // Severity tiles strip
  var totalsStrip =
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
      '<td width="25%" style="padding:0 4px 0 0;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Campaigns watched</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + totalCampaignsWatched + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Critical</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (critCount > 0 ? P.lava : P.mint) + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + critCount + '</div></div></td>' +
      '<td width="25%" style="padding:0 2px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">High</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (highCount > 0 ? P.ember : P.mint) + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + highCount + '</div></div></td>' +
      '<td width="25%" style="padding:0 0 0 4px;">' +
        '<div style="background:rgba(255,255,255,0.04);border:1px solid ' + P.rule + ';border-radius:12px;padding:14px 12px;text-align:center;">' +
        '<div style="font-size:9px;color:' + P.caption + ';letter-spacing:2px;font-weight:800;text-transform:uppercase;margin-bottom:4px;font-family:Manrope,Helvetica,Arial,sans-serif;">Medium</div>' +
        '<div style="font-size:22px;font-weight:900;color:' + (medCount > 0 ? P.amber : P.mint) + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + medCount + '</div></div></td>' +
    '</tr></table>';

  // Empty state, render a clean "no anomalies" panel so the team knows
  // the watcher ran successfully even when nothing fired.
  var anomaliesBlock = "";
  if (totalAnomalies === 0) {
    anomaliesBlock =
      '<tr><td style="padding:32px 36px 12px;">' +
        '<div style="background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.35);border-left:4px solid ' + P.mint + ';border-radius:0 12px 12px 0;padding:22px 26px;">' +
          '<div style="font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:' + P.mint + ';font-family:Manrope,Helvetica,Arial,sans-serif;">No anomalies detected</div>' +
          '<div style="font-size:13px;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:10px;line-height:1.7;">' +
            'Every campaign\'s yesterday-vs-7d-average signals sat within the watchlist thresholds. Spend pace, CTR, CPC, frequency, and result delivery are all within band. Weekly summary lands Monday morning.' +
          '</div>' +
        '</div>' +
      '</td></tr>';
  } else {
    // Group anomalies are sorted by severity (3 > 2 > 1), then by count.
    var groupKeys = Object.keys(anomaliesByType).sort(function(a, b) {
      var sa = (ANOMALY_DEFS[a] && ANOMALY_DEFS[a].severity) || 0;
      var sb = (ANOMALY_DEFS[b] && ANOMALY_DEFS[b].severity) || 0;
      if (sb !== sa) return sb - sa;
      return anomaliesByType[b].length - anomaliesByType[a].length;
    });

    var groupsHtml = groupKeys.map(function(k) {
      var def = ANOMALY_DEFS[k] || { word: k, color: "yellow", caption: "", procedure: [] };
      var col = DISP_COLORS[def.color] || DISP_COLORS.yellow;
      var items = anomaliesByType[k];

      // Per-campaign rows. Each row leads with the campaign name + platform
      // and the one-line anomaly message; right-rail "Open in Ads Manager"
      // link deep-links into the platform-native UI for the campaign.
      var itemsHtml = items.map(function(it) {
        var link = it.adsManagerUrl ? it.adsManagerUrl : "";
        var linkHtml = link
          ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:10px;color:' + P.cyan + ';text-decoration:none;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">Open in ' + escapeHtml(it.platform || "") + ' Ads Manager &rarr;</a>'
          : '';
        return '<div style="padding:12px 16px;border-top:1px solid ' + P.rule + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
          '<div style="font-size:12px;font-weight:800;color:' + P.txt + ';line-height:1.4;word-break:break-word;">' + escapeHtml(it.campaignName) +
            ' <span style="font-size:9px;color:' + P.caption + ';font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-left:6px;">' + escapeHtml(it.platform || "") + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:' + P.label + ';margin-top:5px;line-height:1.6;">' + escapeHtml(it.message) + '</div>' +
          linkHtml +
        '</div>';
      }).join("");

      // Corrective procedure list, rendered as a numbered SOP under the
      // affected campaigns so the team can execute the fix without leaving
      // the email.
      var procHtml = (def.procedure || []).map(function(step, idx) {
        return '<div style="display:block;padding:8px 0;font-family:Manrope,Helvetica,Arial,sans-serif;">' +
          '<span style="display:inline-block;width:22px;height:22px;line-height:22px;border-radius:50%;background:' + col.fill + ';color:#0a0418;font-size:10px;font-weight:900;text-align:center;margin-right:10px;vertical-align:top;">' + (idx + 1) + '</span>' +
          '<span style="display:inline-block;font-size:12px;color:' + P.txt + ';line-height:1.6;width:calc(100% - 40px);">' + escapeHtml(step) + '</span>' +
        '</div>';
      }).join("");
      var procBlock = procHtml
        ? '<div style="border-top:1px solid ' + P.rule + ';background:rgba(0,0,0,0.20);padding:14px 18px 16px;">' +
            '<div style="font-size:10px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:' + col.fill + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-bottom:6px;">Corrective procedure</div>' +
            procHtml +
          '</div>'
        : '';

      return '<div style="margin-top:14px;border:1px solid ' + col.border + ';border-left:4px solid ' + col.fill + ';border-radius:10px;overflow:hidden;background:' + col.soft + ';">' +
        '<div style="padding:14px 18px;">' +
          '<div style="display:block;line-height:1.4;">' +
            '<span style="display:inline-block;font-size:12px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:' + col.fill + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(def.word) + '</span>' +
            '<span style="display:inline-block;margin-left:10px;padding:2px 9px;background:' + col.fill + ';color:#0a0418;font-size:10px;font-weight:900;border-radius:5px;font-family:Manrope,Helvetica,Arial,sans-serif;">' + items.length + ' campaign' + (items.length === 1 ? "" : "s") + '</span>' +
          '</div>' +
          '<div style="font-size:11px;color:' + P.caption + ';font-family:Manrope,Helvetica,Arial,sans-serif;margin-top:8px;line-height:1.6;">' + escapeHtml(def.caption) + '</div>' +
        '</div>' +
        itemsHtml +
        procBlock +
      '</div>';
    }).join("");

    anomaliesBlock =
      '<tr><td style="padding:28px 36px 0;">' +
        '<div style="font-size:18px;font-weight:900;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;letter-spacing:1px;margin-bottom:6px;">Anomalies from yesterday</div>' +
        '<div style="font-size:11px;color:' + P.label + ';font-family:Manrope,Helvetica,Arial,sans-serif;line-height:1.6;margin-bottom:14px;">Yesterday-vs-7d-average departures large enough to warrant a same-day intervention. Each card lists the affected campaigns, the specific deltas, the corrective procedure to run, and an Open in Ads Manager link straight to the platform UI.</div>' +
        groupsHtml +
      '</td></tr>';
  }

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
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Daily Anomalies</title>' +
    glowStyles +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + P.bg + ';font-family:Manrope,\'Helvetica Neue\',Helvetica,Arial,sans-serif;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + P.bg + ';padding:36px 14px;">' +
    '<tr><td align="center">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:720px;background:linear-gradient(170deg,' + P.panel + ' 0%,' + P.panel2 + ' 100%);border-radius:22px;overflow:hidden;border:1px solid ' + P.rule + ';">' +

      '<tr><td style="padding:32px 36px 24px;text-align:center;">' +
      logoBlock +
      '<div style="font-size:11px;color:' + P.ember + ';letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;font-family:Manrope,Helvetica,Arial,sans-serif;">GAS Daily Anomalies</div>' +
      '<div style="font-size:26px;font-weight:900;letter-spacing:4px;color:' + P.txt + ';font-family:Manrope,Helvetica,Arial,sans-serif;">' +
        '<span>MEDIA </span><span style="color:' + P.ember + ';">ON </span><span style="color:' + P.lava + ';">GAS</span></div>' +
      '<div style="font-size:11px;color:' + P.caption + ';letter-spacing:3px;margin-top:8px;text-transform:uppercase;font-weight:700;font-family:Manrope,Helvetica,Arial,sans-serif;">' + escapeHtml(dateLabel) + '</div>' +
      '</td></tr>' +

      '<tr><td style="padding:0 36px;"><div style="height:1px;background:linear-gradient(90deg,transparent,' + P.ember + ',transparent);"></div></td></tr>' +

      '<tr><td style="padding:24px 36px 6px;">' + totalsStrip + '</td></tr>' +

      anomaliesBlock +

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
      '<div style="font-size:10px;color:' + P.caption + ';letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;font-family:Manrope,Helvetica,Arial,sans-serif;">Daily Anomalies, 08:15 SAST</div>' +
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

  // SAST = UTC+2. "Yesterday" in SAST is the day the report describes;
  // the 7-day baseline is the prior week ending the day before that.
  var nowSast = sastNow();
  var yesterday = new Date(nowSast.getTime() - 24 * 60 * 60 * 1000);
  var baselineEnd = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
  var baselineStart = new Date(baselineEnd.getTime() - 6 * 24 * 60 * 60 * 1000);

  var yFrom = ymd(yesterday), yTo = ymd(yesterday);
  var bFrom = ymd(baselineStart), bTo = ymd(baselineEnd);
  var dateLabel = fmtDate(yesterday);

  var dashKey = process.env.DASHBOARD_API_KEY || "";
  if (!dashKey) {
    res.status(500).json({ error: "DASHBOARD_API_KEY not configured" });
    return;
  }

  var yesterdayData, baselineData;
  try {
    var pair = await Promise.all([
      fetchCampaigns(yFrom, yTo, dashKey),
      fetchCampaigns(bFrom, bTo, dashKey)
    ]);
    yesterdayData = pair[0];
    baselineData = pair[1];
  } catch (err) {
    console.error("daily-anomalies fetch failed", err);
    res.status(500).json({ error: "Upstream campaign fetch failed", message: String(err && err.message || err) });
    return;
  }

  var baseByKey = {};
  (baselineData.campaigns || []).forEach(function(c) {
    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    if (k) baseByKey[k] = c;
  });

  // Run anomaly detection per campaign, aggregate by type.
  var anomaliesByType = {};
  var watchedCount = 0;
  (yesterdayData.campaigns || []).forEach(function(c) {
    var spend = parseFloat(c.spend || 0);
    if (spend <= 0) return;
    watchedCount++;

    var k = String(c.rawCampaignId || c.campaignId || c.campaignName || "");
    var b = baseByKey[k] || null;
    var rm = resultMetricFor(c);
    var anomalies = detectAnomalies(c, b, rm);
    if (anomalies.length === 0) return;

    var amUrl = adsManagerUrl(c);
    anomalies.forEach(function(an) {
      if (!anomaliesByType[an.type]) anomaliesByType[an.type] = [];
      anomaliesByType[an.type].push({
        campaignName: c.campaignName,
        platform: c.platform,
        message: an.message,
        adsManagerUrl: amUrl
      });
    });
  });

  var totalAnomalies = Object.keys(anomaliesByType).reduce(function(a, k) { return a + anomaliesByType[k].length; }, 0);

  var html = buildHtml({
    dateLabel: dateLabel,
    anomaliesByType: anomaliesByType,
    totalAnomalies: totalAnomalies,
    totalCampaignsWatched: watchedCount
  });

  if (dryRun) {
    res.status(200).json({
      ok: true, dryRun: true, dateLabel: dateLabel,
      yFrom: yFrom, yTo: yTo, bFrom: bFrom, bTo: bTo,
      campaignsWatched: watchedCount,
      totalAnomalies: totalAnomalies,
      anomalies: Object.keys(anomaliesByType).map(function(k) {
        return { type: k, count: anomaliesByType[k].length, items: anomaliesByType[k] };
      }),
      html: html
    });
    return;
  }

  return await sendEmail(res, dateLabel, html, isCron);
}

async function sendEmail(res, dateLabel, html, isCron) {
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    res.status(200).json({ ok: false, reason: "GMAIL credentials not configured" });
    return;
  }

  if (isCron) {
    var nowSast = sastNow();
    var keyDate = ymd(new Date(nowSast.getTime() - 24 * 60 * 60 * 1000));
    var dedupKey = "daily-anomalies:sent:" + keyDate;
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
      subject: "Daily Anomalies | " + dateLabel,
      text: "GAS Daily Anomalies for " + dateLabel + ". Open the dashboard: " + ORIGIN,
      html: html
    });
    res.status(200).json({ ok: true, sent: true, to: RECIPIENT_LIST, dateLabel: dateLabel });
  } catch (err) {
    console.error("Daily anomalies send failed", err);
    res.status(500).json({ ok: false, error: String(err && err.message || err) });
  }
}
