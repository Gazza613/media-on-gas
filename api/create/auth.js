// PIN entry → short-lived JWT for the Create tab.
// Server hashes the submitted PIN and timing-safe-compares to CREATE_TAB_PIN_HASH.
// Rate limited tighter than read endpoints because this is the gate.

import { rateLimit } from "../_rateLimit.js";
import { setCreateCors, verifyPin, issueCreateToken, normaliseUser, ALLOWED_USERS, CREATE_TOKEN_TTL_SECONDS } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCreateCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 }))) return;

  if (!process.env.CREATE_TAB_PIN_HASH || !process.env.CREATE_TAB_JWT_SECRET) {
    res.status(503).json({ error: "Create tab not configured. Set CREATE_TAB_PIN_HASH and CREATE_TAB_JWT_SECRET." });
    return;
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  var pin = (body && body.pin) ? String(body.pin) : "";
  if (!pin) { res.status(400).json({ error: "Missing pin" }); return; }

  // Audit fix #4: user (team member picking their identity) is required
  // and validated against the allowlist. The token is signed against
  // this identity so downstream endpoints (threads, memory audit-trail,
  // credit attribution) cannot be spoofed via body.user.
  var user = normaliseUser(body && body.user);
  if (!user) {
    res.status(400).json({ error: "Pick your team-member identity. user must be one of: " + ALLOWED_USERS.join(", ") });
    return;
  }

  if (!verifyPin(pin)) {
    // Constant-ish delay smooths timing across the boundary regardless of
    // where the rejection actually fell (env missing vs hash mismatch).
    await new Promise(function(r){ setTimeout(r, 250); });
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  var token = issueCreateToken(user);
  res.status(200).json({ token: token, user: user, expiresIn: CREATE_TOKEN_TTL_SECONDS });
}
