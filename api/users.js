import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { listUsers, setUserActive, isSuperadminEmail, normalizeEmail, getUser, setSamiAccess, clearSamiPin, samiAccessAllowed } from "./_users.js";
import { sendSamiAccessGrantedEmail, sendSamiPinResetEmail } from "./_samiInvite.js";

// Superadmin-only. GET -> list all users. POST -> revoke/restore an account.

export default async function handler(req, res) {
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 }))) return;

  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isSuperadminEmail(session.email)) { res.status(403).json({ error: "Superadmin only" }); return; }

  if (req.method === "GET") {
    var users = await listUsers();
    res.status(200).json({ users: users });
    return;
  }

  if (req.method === "POST") {
    var body = req.body || {};
    var action = String(body.action || "");
    var email = normalizeEmail(body.email);
    if (!email) { res.status(400).json({ error: "email required" }); return; }
    if (isSuperadminEmail(email)) { res.status(400).json({ error: "Superadmin cannot be modified" }); return; }

    if (action === "revoke" || action === "restore") {
      var r = await setUserActive(email, action === "restore");
      if (!r.ok) { res.status(400).json({ error: r.reason || "failed" }); return; }
      var updated = await getUser(email);
      res.status(200).json({ ok: true, user: updated ? { email: updated.email, active: updated.active, status: updated.passwordHash ? (updated.active ? "active" : "revoked") : "pending_invite" } : null });
      return;
    }

    // Sami Hub per-user access controls. Superadmin only.
    if (action === "sami-enable" || action === "sami-disable") {
      // Read the current state first so we only email on the ON transition
      // (avoid spamming a member every time an admin toggles them off and on).
      var priorTarget = await getUser(email);
      var wasEnabled = priorTarget ? samiAccessAllowed(priorTarget) : false;
      var r2 = await setSamiAccess(email, action === "sami-enable");
      if (!r2.ok) { res.status(400).json({ error: r2.reason || "failed" }); return; }
      var emailed = false;
      var emailReason = "";
      if (action === "sami-enable" && !wasEnabled) {
        try {
          var target = priorTarget || await getUser(email);
          var invitedByName = (session && (session.name || session.email)) || "Your admin";
          var mailR = await sendSamiAccessGrantedEmail(target || { email: email }, invitedByName);
          emailed = !!(mailR && mailR.sent);
          emailReason = mailR && mailR.reason ? mailR.reason : "";
        } catch (e) { console.error("[users] sami-enable email failed", e); emailReason = String(e && e.message || e); }
      }
      res.status(200).json({ ok: true, samiAccess: action === "sami-enable", samiSlug: r2.samiSlug || null, emailed: emailed, emailReason: emailReason });
      return;
    }

    if (action === "sami-reset-pin") {
      var priorReset = await getUser(email);
      var r3 = await clearSamiPin(email);
      if (!r3.ok) { res.status(400).json({ error: r3.reason || "failed" }); return; }
      var emailedR = false;
      var emailedRReason = "";
      try {
        var resetByName = (session && (session.name || session.email)) || "An admin";
        var rMail = await sendSamiPinResetEmail(priorReset || { email: email }, resetByName);
        emailedR = !!(rMail && rMail.sent);
        emailedRReason = rMail && rMail.reason ? rMail.reason : "";
      } catch (e) { console.error("[users] sami-reset-pin email failed", e); emailedRReason = String(e && e.message || e); }
      res.status(200).json({ ok: true, samiPinSet: false, emailed: emailedR, emailReason: emailedRReason });
      return;
    }

    res.status(400).json({ error: "Unknown action" });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
