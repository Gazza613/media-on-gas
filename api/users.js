import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { listUsers, setUserActive, isSuperadminEmail, normalizeEmail, getUser } from "./_users.js";

// Superadmin-only. GET -> list all users. POST -> revoke/restore an account.

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 30, maxPerHour: 300 })) return;

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

    res.status(400).json({ error: "Unknown action" });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
