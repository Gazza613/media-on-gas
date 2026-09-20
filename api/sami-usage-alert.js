// Sami Hub credit low-balance alert.
//
// Cron endpoint that emails the owner when this month's Markifact
// MCP-tool consumption crosses the alert threshold (4,800 of the
// 5,000-credit PRO plan), so extra credits can be topped up before
// Sami starts refusing writes mid-conversation.
//
// Runs 4x per day via Vercel cron. Deduplicates via a per-calendar-
// month Redis flag so exactly one email per month, even if Sami hits
// 4,800 mid-morning and stays over for the rest of the day.
//
// Fires re-arm on 25th of each month when Markifact resets: the flag
// is namespaced by YYYY-MM, so a new month starts a fresh alert
// window automatically.

import nodemailer from "nodemailer";
import { readUsageDaily, sumMonth } from "./_samiUsage.js";

var ALERT_TO = process.env.SAMI_USAGE_ALERT_TO || "gary@gasmarketing.co.za";
var PLAN = { creditsLimit: 5000, alertAt: 4800, resetDay: 25 };

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (_) { return null; }
}

export default async function handler(req, res) {
  // Cron endpoints on Vercel are reached by the platform; we allow
  // GET without further auth (as with the other cron endpoints), but
  // if DASHBOARD_API_KEY is configured we honour an x-api-key match
  // for a manual "check now" call from the terminal.
  var expectedKey = process.env.DASHBOARD_API_KEY || "";
  if (expectedKey && req.headers["x-api-key"] && req.headers["x-api-key"] !== expectedKey) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    var daily = await readUsageDaily(31);
    var month = sumMonth(daily);
    var now = new Date();
    var yyyymm = now.toISOString().slice(0, 7);
    var flagKey = "sami:usage:alert-sent:" + yyyymm;

    // Not yet at threshold: nothing to do.
    if (month.total < PLAN.alertAt) {
      res.status(200).json({ status: "below-threshold", used: month.total, threshold: PLAN.alertAt, month: yyyymm });
      return;
    }

    // Threshold reached: dedupe on the per-month flag so we alert once.
    var flag = await redisCmd(["GET", flagKey]);
    if (flag && flag.result) {
      res.status(200).json({ status: "already-sent-this-month", used: month.total, threshold: PLAN.alertAt, month: yyyymm });
      return;
    }

    // Compose + send.
    var gmailUser = process.env.GMAIL_USER;
    var gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      res.status(503).json({ status: "no-mailer", used: month.total, threshold: PLAN.alertAt });
      return;
    }
    var transporter = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: gmailUser, pass: gmailPass }
    });

    var pct = ((month.total / PLAN.creditsLimit) * 100).toFixed(1);
    var byUserRows = Object.keys(month.byUser || {})
      .sort(function (a, b) { return (month.byUser[b] || 0) - (month.byUser[a] || 0); })
      .map(function (u) { return "<tr><td style=\"padding:4px 12px;color:#8B7FA3;text-transform:capitalize\">" + u + "</td><td style=\"padding:4px 12px;text-align:right;color:#fff;font-weight:700\">" + month.byUser[u].toLocaleString("en-ZA") + "</td></tr>"; })
      .join("");

    var html = [
      "<div style=\"font-family:Inter,system-ui,sans-serif;background:#0F0723;padding:28px;color:#fff;max-width:520px\">",
      "  <div style=\"font-size:11px;font-weight:800;color:#FFAA00;letter-spacing:3px;text-transform:uppercase;margin-bottom:6px\">Sami Hub · Credit Alert</div>",
      "  <div style=\"font-size:18px;font-weight:900;margin-bottom:16px\">Credit balance is low</div>",
      "  <div style=\"background:rgba(255,170,0,0.08);border:1px solid rgba(255,170,0,0.3);border-radius:12px;padding:16px;margin-bottom:16px\">",
      "    <div style=\"font-size:28px;font-weight:900\">" + month.total.toLocaleString("en-ZA") + " <span style=\"font-size:13px;color:#8B7FA3;font-weight:600\">of " + PLAN.creditsLimit.toLocaleString("en-ZA") + " (" + pct + "%)</span></div>",
      "    <div style=\"font-size:11px;color:#c9c1d5;margin-top:6px\">Alert threshold: " + PLAN.alertAt.toLocaleString("en-ZA") + " credits · resets on the " + PLAN.resetDay + "th</div>",
      "  </div>",
      "  <div style=\"font-size:13px;line-height:1.6;color:#c9c1d5;margin-bottom:14px\">",
      "    Markifact MCP calls have crossed the " + PLAN.alertAt.toLocaleString("en-ZA") + " credit alert this billing period. Top up extra credits before the plan hits the ceiling so Sami keeps working through month-end campaign builds.",
      "  </div>",
      "  <div style=\"font-size:10px;font-weight:800;color:#8B7FA3;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px\">Consumption this month by team member</div>",
      "  <table style=\"width:100%;border-collapse:collapse;background:rgba(0,0,0,0.25);border-radius:8px;overflow:hidden;font-size:12px;margin-bottom:16px\">",
      byUserRows || "<tr><td style=\"padding:8px 12px;color:#8B7FA3\">No per-user data recorded yet.</td></tr>",
      "  </table>",
      "  <div style=\"font-size:11px;color:#8B7FA3\">Top up at https://markifact.com/billing · this alert fires once per calendar month.</div>",
      "</div>"
    ].join("");

    await transporter.sendMail({
      from: "GAS Marketing Automation <" + gmailUser + ">",
      to: ALERT_TO,
      subject: "Sami Hub credit alert: " + month.total.toLocaleString("en-ZA") + " of " + PLAN.creditsLimit.toLocaleString("en-ZA") + " credits used",
      html: html
    });

    // Set the dedupe flag with a 40-day TTL so a new month always
    // starts a fresh alert window (calendar month + a few days grace
    // for Markifact's 25th-of-month reset cadence).
    await redisCmd(["SET", flagKey, String(Date.now()), "EX", String(40 * 24 * 3600)]);

    res.status(200).json({ status: "sent", used: month.total, threshold: PLAN.alertAt, month: yyyymm, to: ALERT_TO });
  } catch (err) {
    console.error("[sami-usage-alert] handler error", err);
    res.status(500).json({ error: "Alert check failed", detail: String(err && err.message || err) });
  }
}
