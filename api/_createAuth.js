// PIN-gate auth for the Create tab. Lives separately from _auth.js because:
//   - It uses its own JWT secret (CREATE_TAB_JWT_SECRET) so a leaked dashboard
//     session token can't authorise campaign creation.
//   - Tokens are short-lived (15 min) and stateless.
//   - Allowlist of ad accounts is read-validated server-side on every request,
//     not just trusted from the client wizard.

import crypto from "crypto";

export var MAX_DAILY_BUDGET_CENTS = 500000;       // R5,000 hard ceiling. Code change + PR to raise.
export var CREATE_TOKEN_TTL_SECONDS = 15 * 60;
export var META_API_VERSION = "v25.0";

export var ALLOWED_OBJECTIVES = {
  OUTCOME_TRAFFIC: { optimization_goal: "LINK_CLICKS",        billing_event: "IMPRESSIONS" },
  OUTCOME_ENGAGEMENT: { optimization_goal: "POST_ENGAGEMENT", billing_event: "IMPRESSIONS" },
  OUTCOME_LEADS: { optimization_goal: "LEAD_GENERATION",      billing_event: "IMPRESSIONS" },
  OUTCOME_AWARENESS: { optimization_goal: "REACH",            billing_event: "IMPRESSIONS" },
  OUTCOME_SALES: { optimization_goal: "OFFSITE_CONVERSIONS",  billing_event: "IMPRESSIONS" },
  OUTCOME_APP_PROMOTION: { optimization_goal: "APP_INSTALLS", billing_event: "IMPRESSIONS" }
};

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}
function getJwtSecret() {
  var s = process.env.CREATE_TAB_JWT_SECRET;
  if (!s) throw new Error("CREATE_TAB_JWT_SECRET env var not set");
  return s;
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

export function timingSafeStrEqual(a, b) {
  var aBuf = Buffer.from(String(a || ""), "utf8");
  var bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyPin(pin) {
  var expected = process.env.CREATE_TAB_PIN_HASH || "";
  if (!expected) return false;
  return timingSafeStrEqual(sha256Hex(pin), expected.toLowerCase());
}

export function issueCreateToken() {
  var now = Math.floor(Date.now() / 1000);
  var body = { scope: "create", iat: now, exp: now + CREATE_TOKEN_TTL_SECONDS };
  var header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  var bodyEncoded = b64url(JSON.stringify(body));
  var unsigned = header + "." + bodyEncoded;
  var sig = crypto.createHmac("sha256", getJwtSecret()).update(unsigned).digest();
  return unsigned + "." + b64url(sig);
}

export function verifyCreateToken(token) {
  if (!token || typeof token !== "string") return null;
  var parts = token.split(".");
  if (parts.length !== 3) return null;
  var unsigned = parts[0] + "." + parts[1];
  var expected = crypto.createHmac("sha256", getJwtSecret()).update(unsigned).digest();
  var provided = b64urlDecode(parts[2]);
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;
  try {
    var payload = JSON.parse(b64urlDecode(parts[1]).toString("utf-8"));
    if (payload.scope !== "create") return null;
    if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch (_) { return null; }
}

// Gate every Create endpoint. Returns true if authed, false if it sent 401.
// CORS is mirrored from _auth.js so the wizard works locally and on the
// production hostnames. The Authorization header carries the create-tab JWT.
var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];

export function setCreateCors(req, res) {
  var origin = req.headers.origin || req.headers.Origin || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

export function checkCreateAuth(req, res) {
  setCreateCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return false; }
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var bearer = "";
  if (authHeader.indexOf("Bearer ") === 0) bearer = authHeader.substring(7);
  if (!bearer) { res.status(401).json({ error: "Missing Authorization bearer token" }); return false; }
  var payload = verifyCreateToken(bearer);
  if (!payload) { res.status(401).json({ error: "Invalid or expired create-tab token" }); return false; }
  return true;
}

// Comma-separated env var → trimmed array of `act_…` ids. Empty → empty.
// We keep it strict: malformed entries are dropped silently rather than
// halting the endpoint, since one bad entry should not block the whole tab.
export function getAllowedAccounts() {
  var raw = process.env.CREATE_TAB_ALLOWED_ACCOUNTS || "";
  return raw.split(",").map(function(s){return String(s||"").trim();}).filter(function(s){
    return s.length > 0 && s.indexOf("act_") === 0;
  });
}

export function isAccountAllowed(accountId) {
  if (!accountId) return false;
  var id = String(accountId).trim();
  if (id.indexOf("act_") !== 0) id = "act_" + id;
  return getAllowedAccounts().indexOf(id) >= 0;
}
