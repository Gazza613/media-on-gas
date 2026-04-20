import { rateLimit } from "./_rateLimit.js";
import { logUsageEvent } from "./_audit.js";

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

var sessions = {};

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

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

export function getSessionRole(token) {
  if (!token || !sessions[token]) return null;
  if (sessions[token].expires < Date.now()) { delete sessions[token]; return null; }
  return sessions[token].role;
}

export default async function handler(req, res) {
  setAuthCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (!rateLimit(req, res, { maxPerMin: 10, maxPerHour: 60 })) return;

  if (req.method === "GET") {
    var token = req.headers["x-session-token"] || "";
    if (validateSession(token)) {
      res.status(200).json({ valid: true, role: getSessionRole(token) });
    } else {
      res.status(401).json({ valid: false });
    }
    return;
  }

  if (req.method === "POST") {
    var body = req.body || {};
    var password = body.password || "";
    var dashPass = process.env.DASHBOARD_PASSWORD || "";
    var clientPass = process.env.DASHBOARD_CLIENT_PASSWORD || "";
    var role = null;

    if (dashPass && timingSafeEqual(password, dashPass)) {
      role = "admin";
    } else if (clientPass && timingSafeEqual(password, clientPass)) {
      role = "client";
    }

    if (!role) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    cleanExpired();
    var newToken = generateToken();
    var expires = Date.now() + 24 * 60 * 60 * 1000;
    sessions[newToken] = { role: role, expires: expires };
    // Dedup-per-hour usage event so we can see which day the team is
    // active. Actor is just the role string since we do not have per-user
    // identity yet, once multi-user lands, swap actor to the email.
    logUsageEvent(role === "admin" ? "admin_login" : "client_pw_login", role).catch(function() {});
    res.status(200).json({ token: newToken, role: role, expires: expires });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
