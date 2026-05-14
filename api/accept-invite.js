import { rateLimit } from "./_rateLimit.js";
import {
  getInvite, consumeInvite, saveUser, hashPassword, getUser, normalizeEmail,
  getResetToken, consumeResetToken
} from "./_users.js";

// Public endpoint serving two flows that share the exact same form (set a
// new password):
//
//   1. Accept-invite, first-time activation. Token comes from a Redis
//      `invite:` key with 7-day TTL. Consuming it creates the user row.
//
//   2. Password reset, token comes from `reset:` key with 1-hour TTL,
//      issued by /api/forgot-password (self-serve) or /api/admin-reset
//      (superadmin-triggered). Consuming it overwrites passwordHash on the
//      existing user row. Role and other fields are preserved.
//
// GET returns the email + name + a `kind` ("invite" or "reset") so the
// frontend can show appropriate copy. POST applies the new password.

var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];
function setCors(req, res) {
  var origin = req.headers.origin || req.headers.Origin || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

// Look up a token in invites first, then resets. Returns
// { kind: "invite"|"reset", record } or null. Both records carry
// `email`, `name` (invites only), and `expiresAt`.
async function resolveToken(token) {
  if (!token) return null;
  var inv = await getInvite(token);
  if (inv) return { kind: "invite", record: inv };
  var rst = await getResetToken(token);
  if (rst) {
    // Reset records don't carry the user's display name (we look it up
    // from the user row so the welcome line matches the existing profile).
    var u = await getUser(rst.email);
    return {
      kind: "reset",
      record: Object.assign({}, rst, { name: (u && u.name) || "" })
    };
  }
  return null;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 }))) return;

  if (req.method === "GET") {
    var token = String(req.query.token || "").trim();
    if (!token) { res.status(400).json({ error: "Missing token" }); return; }
    var resolved = await resolveToken(token);
    if (!resolved) { res.status(404).json({ error: "Token not found or already used" }); return; }
    var rec = resolved.record;
    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      var msg = resolved.kind === "reset"
        ? "This reset link has expired. Request a new one from the Forgot password? link."
        : "This invite has expired. Ask Gary to send a new one.";
      res.status(410).json({ error: msg });
      return;
    }
    res.status(200).json({
      kind: resolved.kind,
      email: rec.email,
      name: rec.name || "",
      invitedBy: rec.invitedBy || rec.requestedBy || null
    });
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  var body = req.body || {};
  var token = String(body.token || "").trim();
  var password = String(body.password || "");
  if (!token) { res.status(400).json({ error: "Missing token" }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

  var resolved = await resolveToken(token);
  if (!resolved) { res.status(404).json({ error: "Token not found or already used" }); return; }
  var rec = resolved.record;
  if (new Date(rec.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: "Token expired" }); return;
  }

  var emailNorm = normalizeEmail(rec.email);
  var existing = await getUser(emailNorm) || {};
  // Reset path requires an existing user row. Belt-and-braces; the token
  // shouldn't have been minted otherwise, but check anyway.
  if (resolved.kind === "reset" && !existing.passwordHash) {
    res.status(409).json({ error: "Account not active. Use the original invite link instead." });
    return;
  }
  // Don't let a reset token reactivate a revoked account silently.
  if (resolved.kind === "reset" && existing.active === false) {
    res.status(409).json({
      error: "This account is revoked. Ask Gary to restore access before resetting the password."
    });
    return;
  }

  var hash = await hashPassword(password);
  var now = new Date().toISOString();
  var user = {
    email: emailNorm,
    name: existing.name || rec.name || "",
    role: existing.role === "superadmin" ? "superadmin" : (existing.role || rec.role || "admin"),
    passwordHash: hash,
    active: existing.active !== false,
    createdAt: existing.createdAt || now,
    activatedAt: existing.activatedAt || now,
    invitedBy: existing.invitedBy || rec.invitedBy || null,
    passwordChangedAt: now
  };
  await saveUser(user);

  if (resolved.kind === "invite") {
    await consumeInvite(token);
  } else {
    await consumeResetToken(token);
  }
  res.status(200).json({
    ok: true,
    email: user.email,
    name: user.name,
    kind: resolved.kind
  });
}
