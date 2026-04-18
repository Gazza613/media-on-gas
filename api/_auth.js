import { verifyToken } from "./_jwt.js";

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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, x-session-token, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

// Returns true/false for back-compat. Attaches `req.authPrincipal` with role + allowlist info
// for endpoints that want to apply client-scoped filtering.
export function checkAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return false;
  }

  // Option 1: admin API key
  var key = req.headers["x-api-key"] || req.query.api_key || "";
  var expected = process.env.DASHBOARD_API_KEY || "";
  if (key && expected && timingSafeEqual(key, expected)) {
    req.authPrincipal = { role: "admin" };
    return true;
  }

  // Option 2: client Bearer token (for shareable URLs)
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  var bearer = "";
  if (authHeader.indexOf("Bearer ") === 0) bearer = authHeader.substring(7);
  else if (req.query.token) bearer = req.query.token;
  if (bearer) {
    try {
      var payload = verifyToken(bearer);
      if (payload && payload.sub) {
        req.authPrincipal = {
          role: "client",
          clientSlug: payload.sub,
          allowedCampaignIds: payload.camps || [],
          allowedCampaignNames: payload.names || [],
          allowedFrom: payload.from || null,
          allowedTo: payload.to || null
        };
        return true;
      }
    } catch (_) {}
  }

  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// Helper for data endpoints: given a campaign id/name and the current principal,
// decide if the caller is allowed to see it. Admins see everything.
export function isCampaignAllowed(principal, campaignId, campaignName) {
  if (!principal || principal.role === "admin") return true;
  if (principal.role !== "client") return false;
  var ids = principal.allowedCampaignIds || [];
  var names = principal.allowedCampaignNames || [];
  if (ids.length === 0 && names.length === 0) return false;
  var idStr = String(campaignId || "");
  if (ids.indexOf(idStr) >= 0) return true;
  if (idStr && ids.some(function(a) { return String(a) === idStr || idStr.indexOf(String(a)) === 0; })) return true;
  if (campaignName && names.indexOf(campaignName) >= 0) return true;
  return false;
}
