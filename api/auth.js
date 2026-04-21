import { rateLimit } from "./_rateLimit.js";
import { logUsageEvent } from "./_audit.js";
import { getUser, verifyPassword, recordLogin, ensureSuperadminBootstrap, normalizeEmail, isSuperadminEmail } from "./_users.js";

var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];

function setAuthCors(req, res) {
  var origin = req.headers.origin || req.headers.Origin || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-session-token");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

// In-memory session store. Warm instances only, users re-login after a
// cold start. Sessions carry the authenticated user's email + role so
// downstream endpoints can gate on identity without a Redis round-trip.
var sessions = {};

function generateToken() {
  var chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  var token = "";
  for (var i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function cleanExpired() {
  var now = Date.now();
  Object.keys(sessions).forEach(function(t) {
    if (sessions[t].expires < now) delete sessions[t];
  });
}

export function validateSession(token) {
  if (!token) return false;
  cleanExpired();
  return !!sessions[token];
}

export function getSession(token) {
  if (!token || !sessions[token]) return null;
  if (sessions[token].expires < Date.now()) { delete sessions[token]; return null; }
  return sessions[token];
}

export function getSessionRole(token) {
  var s = getSession(token);
  return s ? s.role : null;
}

export default async function handler(req, res) {
  setAuthCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;

  // Make sure Gary's superadmin row is provisioned. No-op after the first
  // successful bootstrap.
  try { await ensureSuperadminBootstrap(); } catch (_) {}

  if (req.method === "GET") {
    var token = req.headers["x-session-token"] || "";
    var s = getSession(token);
    if (!s) { res.status(401).json({ valid: false }); return; }
    // Re-check that the user hasn't been revoked since their session began.
    var user = await getUser(s.email);
    if (!user || user.active === false) {
      delete sessions[token];
      res.status(401).json({ valid: false, reason: "revoked" });
      return;
    }
    res.status(200).json({ valid: true, role: s.role, email: s.email, name: user.name || "" });
    return;
  }

  if (req.method === "POST") {
    var body = req.body || {};
    var email = normalizeEmail(body.email);
    var password = String(body.password || "");

    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    var user = await getUser(email);
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }
    if (user.active === false) {
      res.status(403).json({ error: "This account has been revoked. Contact " + "gary@gasmarketing.co.za" + " if this is unexpected." });
      return;
    }

    var ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    cleanExpired();
    var newToken = generateToken();
    var expires = Date.now() + 24 * 60 * 60 * 1000;
    sessions[newToken] = {
      email: user.email,
      name: user.name || "",
      role: user.role || "admin",
      expires: expires
    };

    // Fire-and-await, log once per hour per email (dedup inside audit).
    try {
      await logUsageEvent("admin_login", user.email, { role: user.role, name: user.name || "" });
      await recordLogin(user.email);
    } catch (_) {}

    res.status(200).json({
      token: newToken,
      role: user.role,
      email: user.email,
      name: user.name || "",
      expires: expires,
      isSuperadmin: isSuperadminEmail(user.email)
    });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
