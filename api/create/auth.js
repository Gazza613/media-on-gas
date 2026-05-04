// PIN entry → short-lived JWT for the Create tab.
// Server hashes the submitted PIN and timing-safe-compares to CREATE_TAB_PIN_HASH.
// Rate limited tighter than read endpoints because this is the gate.

import { rateLimit } from "../_rateLimit.js";
import { setCreateCors, verifyPin, issueCreateToken, CREATE_TOKEN_TTL_SECONDS } from "../_createAuth.js";

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

  if (!verifyPin(pin)) {
    // Constant-ish delay smooths timing across the boundary regardless of
    // where the rejection actually fell (env missing vs hash mismatch).
    await new Promise(function(r){ setTimeout(r, 250); });
    res.status(401).json({ error: "Invalid PIN" });
    return;
  }

  var token = issueCreateToken();
  res.status(200).json({ token: token, expiresIn: CREATE_TOKEN_TTL_SECONDS });
}
