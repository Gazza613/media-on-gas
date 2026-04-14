import { validateSession } from "./auth.js";

var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  var mismatch = 0;
  for (var i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function setCorsHeaders(req, res) {
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

export function checkAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return false;
  }
  // Accept session token
  var sessionToken = req.headers["x-session-token"] || "";
  if (sessionToken && validateSession(sessionToken)) {
    return true;
  }
  // Fall back to API key
  var key = req.headers["x-api-key"] || req.query.api_key || "";
  var expected = process.env.DASHBOARD_API_KEY || "";
  if (key && expected && timingSafeEqual(key, expected)) {
    return true;
  }
  res.status(401).json({ error: "Unauthorized" });
  return false;
}
