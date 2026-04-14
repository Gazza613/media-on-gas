import { setCorsHeaders } from "./_auth.js";
import { rateLimit } from "./_rateLimit.js";

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
  setCorsHeaders(req, res);
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
    res.status(200).json({ token: newToken, role: role, expires: expires });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
