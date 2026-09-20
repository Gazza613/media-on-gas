// Sami Hub per-user PIN management.
//
// Companion to /api/create/auth. Members set / rotate their own 4-digit
// Sami PIN via op=set (requires the main dashboard session, so we know
// who is setting it, and requires samiAccess to be true, so a
// non-authorised member cannot even reserve a PIN).
//
// The superadmin can force-clear another member's PIN via op=reset,
// after which that member is prompted to set a fresh one on next
// Sami visit. The admin never sees the plaintext PIN.

import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import {
  getUser, normalizeEmail, isSuperadminEmail,
  hashPassword, setSamiPinHash, clearSamiPin, samiAccessAllowed
} from "./_users.js";

function isValidPin(raw) {
  return typeof raw === "string" && /^\d{4}$/.test(raw);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 40 }))) return;

  var sessionToken = req.headers["x-session-token"] || "";
  var session = await getSession(sessionToken);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }

  var body = req.body || {};
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  var op = String(body.op || "").toLowerCase();

  try {
    // Member sets or rotates their own PIN. Server verifies the session
    // proves this is the same person the PIN is being set for.
    if (op === "set") {
      var pin = body.pin ? String(body.pin) : "";
      if (!isValidPin(pin)) {
        res.status(400).json({ error: "PIN must be exactly 4 digits." });
        return;
      }
      var me = await getUser(session.email);
      if (!me) { res.status(404).json({ error: "Account not found." }); return; }
      if (!samiAccessAllowed(me)) {
        res.status(403).json({ error: "Sami Hub access has not been enabled for your account. Ask an admin to enable it." });
        return;
      }
      var hash = await hashPassword(pin);
      var r = await setSamiPinHash(me.email, hash);
      if (!r.ok) { res.status(400).json({ error: r.reason || "failed" }); return; }
      res.status(200).json({ ok: true });
      return;
    }

    // Admin clears another member's PIN. That member is then prompted
    // to set a fresh one on next Sami visit.
    if (op === "reset") {
      if (!isSuperadminEmail(session.email)) {
        res.status(403).json({ error: "Superadmin only." });
        return;
      }
      var targetEmail = normalizeEmail(body.email);
      if (!targetEmail) { res.status(400).json({ error: "email required" }); return; }
      if (isSuperadminEmail(targetEmail)) {
        res.status(400).json({ error: "Superadmin PIN can only be reset by the superadmin themselves via op=set." });
        return;
      }
      var r2 = await clearSamiPin(targetEmail);
      if (!r2.ok) { res.status(400).json({ error: r2.reason || "failed" }); return; }
      res.status(200).json({ ok: true, samiPinSet: false });
      return;
    }

    res.status(400).json({ error: "Unknown op. Use set | reset." });
  } catch (err) {
    console.error("[sami-pin] handler error", err);
    res.status(500).json({ error: "Sami PIN operation failed." });
  }
}
