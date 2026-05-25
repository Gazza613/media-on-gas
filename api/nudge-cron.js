import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { readEmailLog } from "./_audit.js";
import { registeredDomain, clientIdentity, displayNameFromIdentity, isFreeMailDomain, canonicalClientSlug } from "./_clientIdentity.js";
import { listUsers, normalizeEmail, isSuperadminEmail } from "./_users.js";
import { getSession } from "./auth.js";
import { timingSafeStrEqual } from "./_createAuth.js";

// Daily cron: finds every client whose last report was sent more than 7
// days ago and emails the GAS leadership team a nudge. The body still
// calls out the responsible account manager (the authenticated sender of
// the last report for that client) so accountability is visible, but
// every named leadership address is addressed primary so SLA enforcement
// is a team-wide concern, not a single-person problem.
//
// Trigger: Vercel cron hits GET /api/nudge-cron with Authorization:
// Bearer <CRON_SECRET>. An admin can also call it manually from a browser
// with a logged-in admin session, the response shows what would or did fire.

var SUPERADMIN_EMAIL = "gary@gasmarketing.co.za";
var TEAM_DOMAIN = "gasmarketing.co.za";
var SLA_DAYS = 7;
var BUFFER_HOURS = 2; // hit right after SLA, not in the middle of day 7
var ORIGIN = "https://media-on-gas.vercel.app";

// Fixed leadership distribution. Every overdue-client nudge ships to this
// list as TO recipients so all five leaders see every SLA breach. The list
// is filtered through isTeamEmail() before send (defense-in-depth) so any
// future config typo cannot leak a nudge to a client domain.
var NUDGE_RECIPIENTS = [
  "gary@gasmarketing.co.za",
  "sam@gasmarketing.co.za",
  "busi@gasmarketing.co.za",
  "claire@gasmarketing.co.za",
  "donovan@gasmarketing.co.za"
];

// Hard rule: nudges are internal-only. A nudge MUST NEVER reach a client
// address, no matter what the audit log says about who sent the last
// report. Every send site runs the address through this filter.
function isTeamEmail(addr) {
  var e = String(addr || "").toLowerCase().trim();
  var at = e.lastIndexOf("@");
  if (at < 0) return false;
  return e.slice(at + 1) === TEAM_DOMAIN;
}
function filterTeamOnly(list) {
  return (list || []).filter(isTeamEmail);
}

function isActiveStatus(s) {
  s = String(s || "").toLowerCase();
  return s === "active" || s === "enable" || s === "enabled";
}

function parseCampaignEndMs(raw) {
  var s = String(raw || "").trim();
  if (!s) return 0;
  // Bare YYYY-MM-DD should mean "through end of that day" in UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return Date.parse(s + "T23:59:59.999Z") || 0;
  }
  return Date.parse(s) || 0;
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function ymdUtc(ms) {
  var d = new Date(ms);
  return d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate());
}
function ymdSast(ms) {
  // SAST is UTC+2, no DST.
  return ymdUtc(ms + 2 * 60 * 60 * 1000);
}
function addDaysYmd(isoDay, days) {
  var t = Date.parse(String(isoDay || "") + "T00:00:00.000Z");
  if (!isFinite(t)) return "";
  return ymdUtc(t + (days || 0) * 24 * 60 * 60 * 1000);
}

var PLATFORM_SUFFIX = /\s+(Meta|Google|TikTok|Facebook|Instagram|Ads|FB|IG)$/i;
var POS_TAG = /(^|[^A-Za-z])POS([^A-Za-z]|$)/i;
var GAS_PREFIX_CLIENT = /(?:^|\|\s*)GAS\s*\|\s*([^|]+?)\s*\|/i;

function routedClientLabel(accountName, campaignName) {
  var raw = String(accountName || "").trim();
  var clean = raw.replace(PLATFORM_SUFFIX, "").replace(PLATFORM_SUFFIX, "").trim();
  var base = clean || raw || "";
  var nm = String(campaignName || "");
  var m = nm.match(GAS_PREFIX_CLIENT);
  if (m && m[1]) {
    var routed = String(m[1] || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/\s+/g, " ").trim();
    if (!routed) return base;
    if (POS_TAG.test(nm) && !POS_TAG.test(routed)) return routed + " POS";
    return routed;
  }
  if (POS_TAG.test(nm) && !POS_TAG.test(base)) return base + " POS";
  return base;
}

function campaignClientSlug(row) {
  var label = routedClientLabel(row && row.accountName, row && row.campaignName);
  return canonicalClientSlug(label);
}

function deriveCampaignLifecycle(campaignRows) {
  var now = Date.now();
  var bySlug = {};
  (campaignRows || []).forEach(function(c) {
    var slug = campaignClientSlug(c);
    if (!slug) return;
    if (!bySlug[slug]) {
      bySlug[slug] = {
        slug: slug,
        liveCount: 0,
        latestEndedMs: 0
      };
    }
    var rec = bySlug[slug];
    var endMs = parseCampaignEndMs(c && c.endDate);
    var active = isActiveStatus(c && c.status);
    var ended = !!(endMs && endMs < now);
    var live = active && !ended;
    if (live) rec.liveCount += 1;
    if (ended && endMs > rec.latestEndedMs) rec.latestEndedMs = endMs;
  });
  Object.keys(bySlug).forEach(function(slug) {
    var rec = bySlug[slug];
    rec.hasLive = rec.liveCount > 0;
    rec.latestEndedYmd = rec.latestEndedMs ? ymdSast(rec.latestEndedMs) : "";
    rec.finalReminderYmd = rec.latestEndedYmd ? addDaysYmd(rec.latestEndedYmd, 1) : "";
  });
  return { bySlug: bySlug, checkedAt: new Date().toISOString() };
}

async function fetchCampaignRowsForLifecycle(apiKey, origin) {
  if (!apiKey) return [];
  var todaySastMs = Date.now() + 2 * 60 * 60 * 1000;
  var from = ymdUtc(todaySastMs - 120 * 24 * 60 * 60 * 1000);
  var to = ymdUtc(todaySastMs);
  var u = String(origin || ORIGIN) + "/api/campaigns?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to);
  var r = await fetch(u, { headers: { "x-api-key": apiKey } });
  if (!r.ok) throw new Error("campaign lifecycle fetch failed " + r.status);
  var j = await r.json();
  return (j && j.campaigns) || [];
}

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}
async function redisCmd(args) {
  var creds = getCreds();
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

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function buildNudgeHtml(opts) {
  var clientName = escapeHtml(opts.clientName);
  var lastSentDisplay = opts.lastSentDisplay;
  var daysOverdue = opts.daysOverdue;
  var dashboardUrl = opts.dashboardUrl;
  var logoUrl = opts.origin + "/GAS_LOGO_EMBLEM_GAS_Primary_Gradient.png";
  var reminderType = opts.reminderType || "sla_overdue";
  var campaignEndedDisplay = escapeHtml(opts.campaignEndedDisplay || "");
  // Nudge body intentionally does not name the internal GAS sender,
  // matching is on the client recipient domain (so the same client is
  // tracked across any AM change) and the body addresses the team
  // collectively rather than calling out a single person.
  var headline = clientName + ' has not had their report in ' + daysOverdue + ' days.';
  var sentByLine = 'The last report for <strong style="color:#F96203;">' + clientName + '</strong> was sent on <strong style="color:#F96203;">' + lastSentDisplay + '</strong>. That is now <strong style="color:#F96203;">' + daysOverdue + ' days ago</strong>, past the line.';
  var actionLine = 'Please pull the latest and send when you have a couple of minutes. Two minutes to pull, two minutes to send.';
  if (reminderType === "final_cycle") {
    headline = clientName + ' campaign ended and final cycle report is due.';
    sentByLine = 'The latest campaign for <strong style="color:#F96203;">' + clientName + '</strong> ended on <strong style="color:#F96203;">' + campaignEndedDisplay + '</strong>. Please send the final cycle report today.';
    actionLine = 'This is the post-campaign close-out reminder. Once sent, regular SLA nudges stay off until a new campaign goes live.';
  }

  // Preheader text — what shows in the inbox preview line alongside the
  // subject. Hidden visually but read by Gmail / iOS Mail / Outlook.
  var preheader = clientName + " is due a report, here is a gentle reminder.";
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Gentle reminder, ${clientName} is due a report</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch><o:AllowPNG/></o:OfficeDocumentSettings></xml>
<style>table,td,div,p,a{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif!important;}</style>
<![endif]-->
<style>
  /* Resets — keep clients from inheriting host page styles */
  body, table, td, p, a, div { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  a { text-decoration: none; }
  /* Mobile responsiveness, applied by every client that respects <style>
     (Apple Mail, iOS Mail, Gmail iOS/Android, Outlook iOS, web Gmail in
     some viewports). Outlook desktop ignores media queries but its
     fixed-width body is fine on desktop anyway. */
  @media only screen and (max-width: 600px) {
    .container { width: 100% !important; max-width: 100% !important; border-radius: 14px !important; }
    .pad-x { padding-left: 22px !important; padding-right: 22px !important; }
    .pad-top { padding-top: 28px !important; }
    .pad-bottom { padding-bottom: 22px !important; }
    .headline { font-size: 22px !important; line-height: 1.3 !important; }
    .body-text { font-size: 14px !important; line-height: 1.7 !important; }
    .small-text { font-size: 13px !important; }
    .eyebrow { letter-spacing: 2px !important; }
    .brand-mark { font-size: 22px !important; letter-spacing: 3px !important; }
    .logo-top { width: 72px !important; height: 72px !important; }
    .footer-row { display: block !important; width: 100% !important; padding: 0 !important; text-align: center !important; }
    .footer-row-img { padding: 0 0 12px 0 !important; width: 100% !important; }
    .footer-row img { margin: 0 auto !important; }
    .cta-btn { display: block !important; padding: 13px 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#070E16;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<!-- Preheader: hidden inbox-preview text -->
<div style="display:none;font-size:1px;color:#070E16;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070E16;">
  <tr><td align="center" style="padding:32px 12px;">
    <!--[if mso]>
    <table role="presentation" align="center" width="620" cellpadding="0" cellspacing="0" border="0"><tr><td>
    <![endif]-->
    <table role="presentation" class="container" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:#0F1820;background-image:linear-gradient(170deg,#0F1820 0%,#13202C 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">
      <tr><td class="pad-x pad-top" style="padding:40px 40px 28px;text-align:center;">
        <div style="text-align:center;margin-bottom:18px;">
          <img src="${logoUrl}" alt="GAS Marketing" width="84" height="84" border="0" class="logo-top" style="width:84px;height:84px;display:inline-block;border-radius:50%;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;box-shadow:0 0 24px rgba(249,98,3,0.45),0 0 50px rgba(255,61,0,0.28);"/>
        </div>
        <div class="eyebrow" style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>
        <div class="brand-mark" style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">
          <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
        </div>
        <div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">A gentle nudge, not a telling off</div>
      </td></tr>

      <tr><td class="pad-x" style="padding:0 40px;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);line-height:1px;font-size:1px;">&nbsp;</div>
      </td></tr>

      <tr><td class="pad-x" style="padding:36px 40px 12px;">
        <div class="eyebrow" style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Reporting check</div>
        <div class="headline" style="font-size:26px;font-weight:900;color:#FFFBF8;line-height:1.25;margin-bottom:14px;">${headline}</div>
        <div class="body-text" style="font-size:15px;color:#FFFBF8;line-height:1.7;">Hi team,</div>
        <div class="body-text" style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          Our client-facing SLA is one report every 7 days. ${sentByLine}
        </div>
        <div class="body-text" style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          ${actionLine}
        </div>
      </td></tr>

      <tr><td class="pad-x" style="padding:24px 40px 8px;" align="center">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${dashboardUrl}" style="height:40px;v-text-anchor:middle;width:180px;" arcsize="28%" stroke="f" fillcolor="#FF5A1F">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">OPEN DASHBOARD</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${dashboardUrl}" class="cta-btn" style="background-color:#FF5A1F;background-image:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:10px;color:#ffffff;display:inline-block;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:2px;padding:11px 28px;text-decoration:none;text-transform:uppercase;mso-hide:all;">Open Dashboard</a>
        <!--<![endif]-->
      </td></tr>

      <tr><td class="pad-x" style="padding:28px 40px 4px;">
        <div class="small-text" style="font-size:13px;color:#FFFBF8;font-weight:800;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:1px;text-transform:uppercase;">SAMI</div>
        <div style="font-size:11px;color:#F96203;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">AI EXPERT AGENT</div>
        <div style="font-size:10px;color:#8B7FA3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">GAS MEDIA DEPARTMENT</div>
      </td></tr>

      <tr><td class="pad-x" style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);line-height:1px;font-size:1px;">&nbsp;</div>
      </td></tr>

      <tr><td class="pad-x pad-bottom" style="padding:20px 40px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td class="footer-row footer-row-img" valign="middle" style="width:56px;padding-right:14px;">
              <img src="${logoUrl}" alt="GAS Marketing" width="48" height="48" border="0" style="width:48px;height:48px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>
            </td>
            <td class="footer-row" valign="middle">
              <div style="font-size:12px;color:#FFFBF8;font-weight:800;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
              </div>
              <div style="font-size:11px;color:#8B7FA3;margin-top:6px;">
                <a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
    <!--[if mso]>
    </td></tr></table>
    <![endif]-->
  </td></tr>
</table>
</body>
</html>`;
}

// A send whose ENTIRE to: list is internal team members is a test/internal
// round-trip, not a real client delivery. Excluded from the SLA watch.
// CC'ing yourself on a real send is fine, only the to: list is checked.
function isInternalTestSend(entry, teamEmailSet) {
  var to = Array.isArray(entry.to) ? entry.to : [];
  if (to.length === 0) return true; // nobody was really emailed
  for (var i = 0; i < to.length; i++) {
    if (!teamEmailSet[normalizeEmail(to[i])]) return false;
  }
  return true;
}

// Normalise a slug the same way clientIdentity() does so that
// "mtn-momo", "MTN MOMO", "MTN MOMO APRIL 2026", "Willowbrook Cycle2"
// all collapse to one canonical client. Delegates to the shared
// canonicalClientSlug so every SLA path agrees.
function normalizeSlug(s) {
  return canonicalClientSlug(s);
}

// Groups audit entries by client identity, returns the last-send record
// per client plus derived fields. Skips internal test sends so the SLA
// watcher only reasons over real client-facing emails.
//
// After the initial identity-based grouping, a second pass merges
// identities that share the same normalised clientSlug. This handles the
// common case where the same real-world client is contacted via different
// email addresses across sends (e.g. a contact person changes, or the
// recipient switches from a freemail address to a corporate one). Without
// the merge the old identity stays overdue forever even though a report
// was just sent to the same client under a new identity.
function groupByClient(entries, teamEmailSet) {
  var byIdentity = {};
  entries.forEach(function(e) {
    if (isInternalTestSend(e, teamEmailSet)) return;
    // Identity is stored on each entry now (added in email-share.js). Fall
    // back to deriving on the fly for historical rows that predate the
    // field being captured.
    var primary = Array.isArray(e.to) && e.to.length > 0 ? e.to[0] : "";
    var identity = e.clientIdentity || clientIdentity(primary, e.clientSlug) || "";
    if (!identity) return;
    var ts = Date.parse(e.sentAt || "");
    if (!ts) return;
    var cur = byIdentity[identity];
    if (!cur || ts > cur.lastSentTs) {
      byIdentity[identity] = {
        identity: identity,
        lastSentTs: ts,
        lastSentIso: e.sentAt,
        lastSlug: e.clientSlug || "",
        lastSenderEmail: e.senderEmail || "",
        lastSenderName: e.senderName || "",
        lastPrimaryRecipient: primary,
        lastRecipients: e.to || [],
        lastDomain: registeredDomain(primary)
      };
    }
  });

  // Second pass: merge identities that share the same normalised slug.
  // When two identities map to the same slug, keep only the one with the
  // most recent send. This prevents stale identities from generating
  // spurious nudges when a client's contact email changes.
  var bySlug = {};
  Object.keys(byIdentity).forEach(function(id) {
    var rec = byIdentity[id];
    var ns = normalizeSlug(rec.lastSlug);
    if (!ns) return; // no slug, keep identity-based grouping as-is
    var prev = bySlug[ns];
    if (!prev || rec.lastSentTs > prev.lastSentTs) {
      bySlug[ns] = rec;
    }
  });
  // Remove identities that were superseded by a newer send under the same slug.
  Object.keys(byIdentity).forEach(function(id) {
    var rec = byIdentity[id];
    var ns = normalizeSlug(rec.lastSlug);
    if (!ns) return;
    if (bySlug[ns] && bySlug[ns] !== rec) {
      delete byIdentity[id];
    }
  });

  return byIdentity;
}

export default async function handler(req, res) {
  var cronSecret = process.env.CRON_SECRET || "";
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  // Constant-time compare so the cron secret cannot be glimpsed via
  // response-time differences. timingSafeStrEqual returns false for any
  // length mismatch without leaking that info.
  var isCron = !!(cronSecret && timingSafeStrEqual(authHeader, "Bearer " + cronSecret));
  var isManual = false;

  if (!isCron) {
    if (!(await rateLimit(req, res, { maxPerMin: 6, maxPerHour: 30 }))) return;
    // Two manual-trigger paths:
    //
    //   1. x-api-key matching DASHBOARD_API_KEY, for any dashboard page that
    //      already passes the static API key (legacy admin tools).
    //   2. x-session-token from a logged-in SUPERADMIN, used by the
    //      Settings -> Reconcile pane "Reset SLA Baseline" button so the
    //      static API key never has to ship in the frontend bundle.
    //
    // Either path is sufficient. Both rate-limit identically.
    var apiKey = req.headers["x-api-key"] || req.query.api_key || "";
    var expectedKey = process.env.DASHBOARD_API_KEY || "";
    var keyOk = apiKey && expectedKey && timingSafeStrEqual(String(apiKey), expectedKey);
    var sessionOk = false;
    if (!keyOk) {
      var sessionToken = req.headers["x-session-token"] || "";
      if (sessionToken) {
        try {
          var sess = await getSession(sessionToken);
          if (sess && isSuperadminEmail(sess.email)) sessionOk = true;
        } catch (_) {}
      }
    }
    if (!keyOk && !sessionOk) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    isManual = true;
  }

  var dryRun = req.query.dryRun === "1" || req.query.dry === "1";
  // verbose=1 returns every tracked client (not just overdue), with
  // last-sent + days-since + isOverdue + whether the baseline was
  // applied. Lets the dashboard SLA panel show 'why isn't X being
  // nudged?' without guessing.
  var verbose = req.query.verbose === "1";

  // baselineOnly=1: lightweight read of the current baseline. Used
  // by the dashboard SLA panel to filter the Reports Sent table to
  // entries after the last Apply Reset so the team doesn't have to
  // scroll past pre-reset history.
  if (req.query.baselineOnly === "1") {
    var btsOnly = 0;
    try {
      var bResOnly = await redisCmd(["GET", "nudge:baseline"]);
      if (bResOnly && bResOnly.result) btsOnly = Date.parse(bResOnly.result) || 0;
    } catch (_) {}
    res.status(200).json({
      ok: true,
      baseline: btsOnly ? new Date(btsOnly).toISOString() : null,
      slaDays: SLA_DAYS,
      bufferHours: BUFFER_HOURS
    });
    return;
  }

  // ?reset=1[&baseline=YYYY-MM-DD], set a baseline date in Redis. All
  // clients are treated as if they last sent on this date, so the SLA
  // counter restarts from there. The first nudges will fire SLA_DAYS +
  // BUFFER_HOURS after the baseline. With no &baseline= the reset uses
  // "now" (the original behaviour). With &baseline=2026-05-01 the
  // baseline is anchored at midnight UTC of that date so historic gaps
  // before the chosen day stop generating nudges.
  var BASELINE_KEY = "nudge:baseline";
  if (req.query.reset === "1") {
    var baselineIso;
    var explicit = String(req.query.baseline || "").trim();
    if (explicit) {
      // Accept YYYY-MM-DD or any ISO 8601 string. Anchor bare dates at
      // 00:00 UTC so the SLA window is unambiguous regardless of the
      // server's local timezone.
      if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) {
        baselineIso = explicit + "T00:00:00.000Z";
      } else {
        var parsed = Date.parse(explicit);
        if (!isFinite(parsed)) {
          res.status(400).json({ error: "baseline must be YYYY-MM-DD or ISO 8601, got: " + explicit });
          return;
        }
        baselineIso = new Date(parsed).toISOString();
      }
    } else {
      baselineIso = new Date().toISOString();
    }
    await redisCmd(["SET", BASELINE_KEY, baselineIso]);
    var anchorMs = Date.parse(baselineIso);
    var msPerDay = 24 * 60 * 60 * 1000;
    var firstNudgeMs = anchorMs + SLA_DAYS * msPerDay + BUFFER_HOURS * 60 * 60 * 1000;
    res.status(200).json({
      ok: true,
      action: "reset",
      baseline: baselineIso,
      nextNudgeAfter: new Date(firstNudgeMs).toISOString(),
      explanation: explicit
        ? "Clients with last-send before " + baselineIso + " will be treated as if they sent on that date. First nudge possible from " + new Date(firstNudgeMs).toISOString() + "."
        : SLA_DAYS + " days + " + BUFFER_HOURS + "h from now"
    });
    return;
  }

  // Read baseline (if set). Clients whose last send is before the baseline
  // are treated as if they sent on the baseline date, giving them a fresh
  // SLA window. Once the baseline itself is older than SLA_DAYS the effect
  // expires naturally.
  var baselineTs = 0;
  try {
    var bRes = await redisCmd(["GET", BASELINE_KEY]);
    if (bRes && bRes.result) baselineTs = Date.parse(bRes.result) || 0;
  } catch (_) {}

  // Pull a reasonably deep window of audit entries so a client that last
  // reported 29 days ago still registers.
  var entries = [];
  try { entries = await readEmailLog(1000); } catch (_) { entries = []; }

  // Team email set, used to filter out internal test sends (emails sent
  // only to team members, e.g. when an AM tests the share email to
  // themselves). Always include the superadmin even if not listed.
  var teamEmailSet = {};
  teamEmailSet[SUPERADMIN_EMAIL] = true;
  try {
    var users = await listUsers();
    users.forEach(function(u) { if (u && u.email) teamEmailSet[normalizeEmail(u.email)] = true; });
  } catch (_) {}

  var byClient = groupByClient(entries, teamEmailSet);
  var identities = Object.keys(byClient);
  var now = Date.now();
  var slaMs = SLA_DAYS * 24 * 60 * 60 * 1000 + BUFFER_HOURS * 60 * 60 * 1000;
  var todaySast = ymdSast(now);

  // Apply baseline: if a client's last send is before the baseline,
  // bump their effective last-sent timestamp to the baseline date.
  if (baselineTs > 0) {
    identities.forEach(function(id) {
      var c = byClient[id];
      if (c.lastSentTs < baselineTs) c.lastSentTs = baselineTs;
    });
  }

  // Snapshot every tracked client BEFORE the overdue filter so the
  // verbose diagnostic can report 'on track' clients with their
  // exact days-since. Captures whether the baseline was applied so
  // the team can see when a client's counter was bumped forward.
  var trackedSnapshot = identities.map(function(id) {
    var c = byClient[id];
    var origMs = c.lastSentTs; // already potentially baseline-bumped at this point
    return {
      identity: c.identity,
      clientName: displayNameFromIdentity(c.identity, c.lastSlug),
      lastSlug: c.lastSlug || "",
      lastSenderEmail: c.lastSenderEmail || "",
      lastSentIso: c.lastSentIso,
      effectiveLastSentIso: new Date(origMs).toISOString(),
      baselineApplied: !!(baselineTs > 0 && Date.parse(c.lastSentIso) < baselineTs),
      daysSince: Math.floor((now - origMs) / (24 * 60 * 60 * 1000)),
      isOverdue: (now - origMs) > slaMs
    };
  }).sort(function(a, b) { return b.daysSince - a.daysSince; });

  var overdue = identities.map(function(id) { return byClient[id]; })
    .filter(function(c) { return (now - c.lastSentTs) > slaMs; });

  // Campaign lifecycle gate:
  //   1) Live campaigns use normal SLA nudges.
  //   2) Ended campaigns get ONE final-cycle reminder the next SAST day.
  //   3) After that day, suppress reminders until a new live campaign exists.
  var lifecycle = null;
  var lifecycleError = "";
  try {
    var dashKey = process.env.DASHBOARD_API_KEY || "";
    if (dashKey) {
      var campaignRows = await fetchCampaignRowsForLifecycle(dashKey, ORIGIN);
      lifecycle = deriveCampaignLifecycle(campaignRows);
    }
  } catch (err) {
    lifecycleError = String(err && err.message || err || "");
    console.error("Nudge lifecycle fetch failed", lifecycleError);
  }

  var queueByIdentity = {};
  overdue.forEach(function(c) {
    queueByIdentity[c.identity] = { client: c, reminderType: "sla_overdue", campaignEndedYmd: "" };
  });

  var suppressedEndedCount = 0;
  var finalCycleCount = 0;
  if (lifecycle && lifecycle.bySlug) {
    identities.forEach(function(id) {
      var c = byClient[id];
      var slug = normalizeSlug(c.lastSlug || "") || canonicalClientSlug(displayNameFromIdentity(c.identity, c.lastSlug));
      if (!slug) return;
      var state = lifecycle.bySlug[slug];
      if (!state) return;
      if (state.hasLive) return;

      // No live campaign for this client right now.
      if (state.finalReminderYmd && state.finalReminderYmd === todaySast) {
        queueByIdentity[id] = {
          client: c,
          reminderType: "final_cycle",
          campaignEndedYmd: state.latestEndedYmd || ""
        };
        finalCycleCount += 1;
        return;
      }

      // Past the one-day final reminder window, suppress any SLA nudges.
      if (queueByIdentity[id]) {
        delete queueByIdentity[id];
        suppressedEndedCount += 1;
      }
    });
  }

  var reminderQueue = Object.keys(queueByIdentity).map(function(id) { return queueByIdentity[id]; });

  var results = [];
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  var canSend = !!(gmailUser && gmailPass);
  var transporter = canSend ? nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  }) : null;

  var todayKey = new Date().toISOString().slice(0, 10);

  // Leadership distribution list, filtered through the team-domain
  // allowlist as defense-in-depth. Same list used for every overdue
  // client this run, the loop builds the recipient list once.
  var leadershipList = filterTeamOnly(NUDGE_RECIPIENTS);
  if (leadershipList.length === 0) leadershipList = [SUPERADMIN_EMAIL];

  for (var i = 0; i < reminderQueue.length; i++) {
    var q = reminderQueue[i];
    var c = q.client;
    var reminderType = q.reminderType || "sla_overdue";
    // Resolve the responsible account manager from the recorded last
    // sender. Only used for body accountability text, not routing, every
    // nudge goes to the full leadership list regardless.
    var rawAm = c.lastSenderEmail || "";
    var amEmail = isTeamEmail(rawAm) ? rawAm.toLowerCase() : "";
    var daysOverdue = Math.floor((now - c.lastSentTs) / (24 * 60 * 60 * 1000));
    var clientName = displayNameFromIdentity(c.identity, c.lastSlug);
    var lastSentDisplay = new Date(c.lastSentTs).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
    var campaignEndedDisplay = q.campaignEndedYmd ? new Date(q.campaignEndedYmd + "T00:00:00.000Z").toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }) : "";

    // Dedup:
    //   - SLA nudges: once per day/client.
    //   - Final-cycle reminder: once per ended-cycle/client.
    var dedupKey = reminderType === "final_cycle"
      ? ("nudge:final:" + c.identity + ":" + (q.campaignEndedYmd || "unknown"))
      : ("nudge:sent:" + c.identity + ":" + todayKey);
    var dedupTtlSeconds = reminderType === "final_cycle" ? (120 * 24 * 60 * 60) : 172800;
    if (!dryRun && canSend) {
      var seen = await redisCmd(["SET", dedupKey, "1", "EX", String(dedupTtlSeconds), "NX"]);
      if (!seen || seen.result !== "OK") {
        results.push({ identity: c.identity, clientName: clientName, reminderType: reminderType, status: reminderType === "final_cycle" ? "final_already_sent" : "already_nudged_today" });
        continue;
      }
    }

    var html = buildNudgeHtml({
      clientName: clientName,
      lastSentDisplay: lastSentDisplay,
      daysOverdue: daysOverdue,
      dashboardUrl: ORIGIN,
      origin: ORIGIN,
      reminderType: reminderType,
      campaignEndedDisplay: campaignEndedDisplay
    });
    var text = reminderType === "final_cycle"
      ? (clientName + " campaign ended on " + campaignEndedDisplay + ". Final cycle report is due now.\n\n" +
        "Open the dashboard and send: " + ORIGIN + "\n\n" +
        "GAS Marketing Automation")
      : (clientName + " has not had a report in " + daysOverdue + " days.\n\n" +
        "Last sent on " + lastSentDisplay + ".\n\n" +
        "Open the dashboard and send: " + ORIGIN + "\n\n" +
        "GAS Marketing Automation");

    if (dryRun || !canSend) {
      results.push({
        identity: c.identity, clientName: clientName, am: amEmail,
        lastSent: c.lastSentIso, daysOverdue: daysOverdue,
        reminderType: reminderType,
        campaignEndedOn: q.campaignEndedYmd || "",
        wouldNotify: { to: leadershipList },
        lastSenderRaw: c.lastSenderEmail || "",
        senderWasInternal: isTeamEmail(c.lastSenderEmail),
        status: dryRun ? "dry_run" : "mailer_not_configured"
      });
      continue;
    }

    try {
      await transporter.sendMail({
        from: "GAS Marketing Automation <" + gmailUser + ">",
        to: leadershipList.join(", "),
        subject: reminderType === "final_cycle"
          ? (clientName + " final cycle report due (campaign ended " + campaignEndedDisplay + ")")
          : (clientName + " is " + daysOverdue + " days overdue for a report"),
        text: text,
        html: html
      });
      results.push({ identity: c.identity, clientName: clientName, to: leadershipList, daysOverdue: daysOverdue, reminderType: reminderType, campaignEndedOn: q.campaignEndedYmd || "", status: "sent" });
    } catch (err) {
      console.error("Nudge send failed", c.identity, err);
      results.push({ identity: c.identity, clientName: clientName, to: leadershipList, reminderType: reminderType, status: "error: " + String(err && err.message || err) });
    }
  }

  var payload = {
    ok: true,
    mode: isCron ? "cron" : "manual",
    dryRun: dryRun,
    slaDays: SLA_DAYS,
    bufferHours: BUFFER_HOURS,
    baseline: baselineTs ? new Date(baselineTs).toISOString() : null,
    clientsTracked: identities.length,
    overdueCount: overdue.length,
    reminderCount: reminderQueue.length,
    finalCycleCount: finalCycleCount,
    suppressedEndedCount: suppressedEndedCount,
    lifecycleLoaded: !!lifecycle,
    lifecycleError: lifecycleError || null,
    nudges: results,
    checkedAt: new Date().toISOString()
  };
  if (verbose) payload.tracked = trackedSnapshot;
  res.status(200).json(payload);
}
