// PIN entry → short-lived JWT for the Create tab.
//
// Now per-member (not shared): the caller must present a valid main
// dashboard session PLUS a 4-digit PIN that matches the hash stored
// on their own user record. The token is signed against their samiSlug
// so every downstream Sami surface (threads, memory audit-trail,
// credit attribution, MCP-tool nonce authorisation) already knows who
// is driving.
//
// Response codes:
//   401 no-session         Dashboard session missing / expired
//   403 no-access          Admin has not enabled Sami for this member
//   409 no-pin             Member has never set their Sami PIN — send
//                          them to POST /api/sami-pin op=set
//   401 wrong-pin          Wrong 4-digit PIN
//   200 { token, user, expiresIn }

import { rateLimit } from "../_rateLimit.js";
import { setCreateCors, issueCreateToken, CREATE_TOKEN_TTL_SECONDS } from "../_createAuth.js";
import { getSession } from "../auth.js";
import { getUser, verifyPassword, samiAccessAllowed, recordSamiUnlock } from "../_users.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  setCreateCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 }))) return;

  if (!process.env.CREATE_TAB_JWT_SECRET) {
    res.status(503).json({ error: "Create tab not configured. Set CREATE_TAB_JWT_SECRET." });
    return;
  }

  var sessionToken = req.headers["x-session-token"] || "";
  var session = await getSession(sessionToken);
  if (!session) {
    res.status(401).json({ error: "Sign in to the dashboard first, then enter your Sami PIN.", code: "no-session" });
    return;
  }

  var body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  body = body || {};
  var op = String(body.op || "verify").toLowerCase();

  // Preflight status probe. PinGate on the frontend calls this on
  // mount so it can land on the correct screen (no-access / set-pin /
  // ready-to-verify) without asking the user to type a PIN first.
  // Never returns anything sensitive; just the gate state.
  if (op === "status") {
    var pre = await getUser(session.email);
    if (!pre) { res.status(401).json({ code: "no-account" }); return; }
    if (!samiAccessAllowed(pre)) { res.status(200).json({ code: "no-access", name: pre.name || null }); return; }
    if (!pre.samiPinHash) { res.status(200).json({ code: "no-pin", name: pre.name || null }); return; }
    res.status(200).json({ code: "ready", name: pre.name || null });
    return;
  }

  var pin = body.pin ? String(body.pin) : "";
  if (!pin) { res.status(400).json({ error: "Missing PIN.", code: "missing-pin" }); return; }

  var me = await getUser(session.email);
  if (!me) {
    res.status(401).json({ error: "Account not found.", code: "no-account" });
    return;
  }
  if (!samiAccessAllowed(me)) {
    res.status(403).json({ error: "Sami Hub access has not been enabled for your account. Ask an admin to enable it.", code: "no-access" });
    return;
  }
  if (!me.samiPinHash) {
    res.status(409).json({ error: "Set your Sami PIN first.", code: "no-pin" });
    return;
  }

  var okPin = await verifyPassword(pin, me.samiPinHash);
  if (!okPin) {
    // Constant-ish delay smooths timing across the boundary.
    await new Promise(function(r){ setTimeout(r, 250); });
    res.status(401).json({ error: "Invalid PIN.", code: "wrong-pin" });
    return;
  }

  var slug = me.samiSlug || "";
  if (!slug) {
    // Belt and braces: samiAccess is on, PIN is set, but no slug was
    // seeded. Shouldn't happen because setSamiAccess seeds it, but
    // handle it by falling back to the email local-part.
    slug = String(session.email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60) || "user";
  }

  await recordSamiUnlock(me.email);
  var token = issueCreateToken(slug);
  res.status(200).json({ token: token, user: slug, name: me.name || slug, expiresIn: CREATE_TOKEN_TTL_SECONDS });
}
