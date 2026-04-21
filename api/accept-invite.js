import { rateLimit } from "./_rateLimit.js";
import { getInvite, consumeInvite, saveUser, hashPassword, getUser, normalizeEmail } from "./_users.js";

// Public endpoint: called from /signup?token=... when the invitee submits
// their chosen password. GET returns the invited email + name so the page
// can render a welcoming form. POST accepts the password, creates (or
// updates) the user, consumes the invite, returns a session token by
// asking the user to log in afterwards.

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

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;

  if (req.method === "GET") {
    var token = String(req.query.token || "").trim();
    if (!token) { res.status(400).json({ error: "Missing invite token" }); return; }
    var invite = await getInvite(token);
    if (!invite) { res.status(404).json({ error: "Invite not found or already used" }); return; }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      res.status(410).json({ error: "This invite has expired. Ask Gary to send a new one." });
      return;
    }
    res.status(200).json({ email: invite.email, name: invite.name, invitedBy: invite.invitedBy });
    return;
  }

  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }

  var body = req.body || {};
  var token = String(body.token || "").trim();
  var password = String(body.password || "");
  if (!token) { res.status(400).json({ error: "Missing invite token" }); return; }
  if (password.length < 8) { res.status(400).json({ error: "Password must be at least 8 characters" }); return; }

  var invite = await getInvite(token);
  if (!invite) { res.status(404).json({ error: "Invite not found or already used" }); return; }
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    res.status(410).json({ error: "Invite expired" }); return;
  }

  var emailNorm = normalizeEmail(invite.email);
  var existing = await getUser(emailNorm) || {};
  var hash = await hashPassword(password);
  var now = new Date().toISOString();
  var user = {
    email: emailNorm,
    name: invite.name || existing.name || "",
    role: existing.role === "superadmin" ? "superadmin" : (invite.role || "admin"),
    passwordHash: hash,
    active: true,
    createdAt: existing.createdAt || now,
    activatedAt: now,
    invitedBy: invite.invitedBy || existing.invitedBy || null
  };
  await saveUser(user);
  await consumeInvite(token);
  res.status(200).json({ ok: true, email: user.email, name: user.name });
}
