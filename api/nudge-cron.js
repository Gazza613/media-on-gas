import nodemailer from "nodemailer";
import { rateLimit } from "./_rateLimit.js";
import { readEmailLog } from "./_audit.js";
import { registeredDomain, clientIdentity, displayNameFromIdentity, isFreeMailDomain } from "./_clientIdentity.js";
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
  // Nudge body intentionally does not name the internal GAS sender,
  // matching is on the client recipient domain (so the same client is
  // tracked across any AM change) and the body addresses the team
  // collectively rather than calling out a single person.
  var sentByLine = 'The last report for <strong style="color:#F96203;">' + clientName + '</strong> was sent on <strong style="color:#F96203;">' + lastSentDisplay + '</strong>. That is now <strong style="color:#F96203;">' + daysOverdue + ' days ago</strong>, past the line.';
  var actionLine = 'Please pull the latest and send when you have a couple of minutes. Two minutes to pull, two minutes to send.';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gentle reminder, ${clientName} is due a report</title></head>
<body style="margin:0;padding:0;background:#070E16;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#070E16;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background:linear-gradient(170deg,#0F1820 0%,#13202C 100%);border-radius:20px;overflow:hidden;border:1px solid rgba(168,85,247,0.18);">
      <tr><td style="padding:40px 40px 28px;text-align:center;">
        <div style="font-size:11px;color:#F96203;letter-spacing:6px;font-weight:800;margin-bottom:6px;text-transform:uppercase;">GAS Marketing Automation</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:4px;color:#FFFBF8;margin-bottom:0;">
          <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
        </div>
        <div style="font-size:10px;color:#8B7FA3;letter-spacing:3px;margin-top:6px;text-transform:uppercase;font-weight:600;">A gentle nudge, not a telling off</div>
      </td></tr>

      <tr><td style="padding:0 40px;">
        <div style="height:1px;background:linear-gradient(90deg,transparent,#F96203,transparent);"></div>
      </td></tr>

      <tr><td style="padding:36px 40px 12px;">
        <div style="font-size:11px;color:#8B7FA3;letter-spacing:3px;font-weight:700;text-transform:uppercase;margin-bottom:10px;">Reporting SLA check</div>
        <div style="font-size:26px;font-weight:900;color:#FFFBF8;line-height:1.25;margin-bottom:14px;">${clientName} has not had their report in ${daysOverdue} days.</div>
        <div style="font-size:15px;color:#FFFBF8;line-height:1.7;">Hi team,</div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          Our client-facing SLA is one report every 7 days. ${sentByLine}
        </div>
        <div style="font-size:14px;color:rgba(255,251,248,0.82);line-height:1.75;margin-top:14px;">
          ${actionLine}
        </div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;" align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:linear-gradient(135deg,#FF3D00,#FF6B00);border-radius:12px;">
            <a href="${dashboardUrl}" style="display:inline-block;padding:16px 42px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:3px;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Open Dashboard</a>
          </td></tr>
        </table>
        <div style="margin-top:14px;font-size:10px;color:#8B7FA3;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Pull the latest, click Share, pick ${clientName}, send</div>
      </td></tr>

      <tr><td style="padding:28px 40px 4px;">
        <div style="font-size:13px;color:#FFFBF8;font-weight:800;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;letter-spacing:1px;">Sami</div>
        <div style="font-size:11px;color:#F96203;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;">AI Expert Agent</div>
        <div style="font-size:10px;color:#8B7FA3;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;margin-top:2px;letter-spacing:1px;">GAS Media Department</div>
      </td></tr>

      <tr><td style="padding:28px 40px 8px;">
        <div style="height:1px;background:rgba(168,85,247,0.16);"></div>
      </td></tr>

      <tr><td style="padding:20px 40px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td valign="middle" style="width:56px;padding-right:14px;">
              <img src="${logoUrl}" alt="GAS Marketing" width="48" height="48" border="0" style="width:48px;height:48px;border-radius:50%;display:block;border:none;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;"/>
            </td>
            <td valign="middle">
              <div style="font-size:12px;color:#FFFBF8;font-weight:800;letter-spacing:3px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                <span>MEDIA </span><span style="color:#F96203;">ON </span><span style="color:#FF3D00;">GAS</span>
              </div>
              <div style="font-size:10px;color:#8B7FA3;letter-spacing:2px;margin-top:3px;text-transform:uppercase;font-weight:600;">Automated SLA watcher</div>
              <div style="font-size:11px;color:#8B7FA3;margin-top:6px;">
                <a href="mailto:grow@gasmarketing.co.za" style="color:#8B7FA3;text-decoration:none;">grow@gasmarketing.co.za</a>
              </div>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
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
// "mtn-momo", "MTN MOMO", "mtn momo" all collapse to "mtnmomo".
function normalizeSlug(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
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
    var keyOk = apiKey && expectedKey && apiKey === expectedKey;
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

  // Apply baseline: if a client's last send is before the baseline,
  // bump their effective last-sent timestamp to the baseline date.
  if (baselineTs > 0) {
    identities.forEach(function(id) {
      var c = byClient[id];
      if (c.lastSentTs < baselineTs) c.lastSentTs = baselineTs;
    });
  }

  var overdue = identities.map(function(id) { return byClient[id]; })
    .filter(function(c) { return (now - c.lastSentTs) > slaMs; });

  var results = [];
  var gmailUser = process.env.GMAIL_USER;
  var gmailPass = process.env.GMAIL_APP_PASSWORD;
  var canSend = !!(gmailUser && gmailPass);
  var transporter = canSend ? nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: gmailUser, pass: gmailPass }
  }) : null;

  var origin = "https://media-on-gas.vercel.app";
  var todayKey = new Date().toISOString().slice(0, 10);

  // Leadership distribution list, filtered through the team-domain
  // allowlist as defense-in-depth. Same list used for every overdue
  // client this run, the loop builds the recipient list once.
  var leadershipList = filterTeamOnly(NUDGE_RECIPIENTS);
  if (leadershipList.length === 0) leadershipList = [SUPERADMIN_EMAIL];

  for (var i = 0; i < overdue.length; i++) {
    var c = overdue[i];
    // Resolve the responsible account manager from the recorded last
    // sender. Only used for body accountability text, not routing, every
    // nudge goes to the full leadership list regardless.
    var rawAm = c.lastSenderEmail || "";
    var amEmail = isTeamEmail(rawAm) ? rawAm.toLowerCase() : "";
    var daysOverdue = Math.floor((now - c.lastSentTs) / (24 * 60 * 60 * 1000));
    var clientName = displayNameFromIdentity(c.identity, c.lastSlug);
    var lastSentDisplay = new Date(c.lastSentTs).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });

    // Dedup: only nudge once per calendar day per client, so a long-
    // overdue client doesn't get a daily blast if the cron re-fires.
    var dedupKey = "nudge:sent:" + c.identity + ":" + todayKey;
    if (!dryRun && canSend) {
      var seen = await redisCmd(["SET", dedupKey, "1", "EX", "172800", "NX"]);
      if (!seen || seen.result !== "OK") {
        results.push({ identity: c.identity, clientName: clientName, status: "already_nudged_today" });
        continue;
      }
    }

    var html = buildNudgeHtml({
      clientName: clientName,
      lastSentDisplay: lastSentDisplay,
      daysOverdue: daysOverdue,
      dashboardUrl: origin,
      origin: origin
    });
    var text = clientName + " has not had a report in " + daysOverdue + " days.\n\n" +
      "Last sent on " + lastSentDisplay + ".\n\n" +
      "Open the dashboard and send: " + origin + "\n\n" +
      "GAS Marketing Automation";

    if (dryRun || !canSend) {
      results.push({
        identity: c.identity, clientName: clientName, am: amEmail,
        lastSent: c.lastSentIso, daysOverdue: daysOverdue,
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
        subject: clientName + " is " + daysOverdue + " days overdue for a report",
        text: text,
        html: html
      });
      results.push({ identity: c.identity, clientName: clientName, to: leadershipList, daysOverdue: daysOverdue, status: "sent" });
    } catch (err) {
      console.error("Nudge send failed", c.identity, err);
      results.push({ identity: c.identity, clientName: clientName, to: leadershipList, status: "error: " + String(err && err.message || err) });
    }
  }

  res.status(200).json({
    ok: true,
    mode: isCron ? "cron" : "manual",
    dryRun: dryRun,
    slaDays: SLA_DAYS,
    baseline: baselineTs ? new Date(baselineTs).toISOString() : null,
    clientsTracked: identities.length,
    overdueCount: overdue.length,
    nudges: results,
    checkedAt: new Date().toISOString()
  });
}
