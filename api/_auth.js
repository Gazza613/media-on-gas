import { verifyToken } from "./_jwt.js";
import { logUsageEvent } from "./_audit.js";

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
//
// NOTE: still synchronous. Usage-event writes are handled by the async
// checkAuthAsync below, callers that want reliable tracking should use
// that variant. checkAuth stays available so untouched endpoints behave
// exactly as before.
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
        // Kick off a usage ping (deduped per slug per hour). In Vercel
        // serverless fire-and-forget can be cancelled when the response
        // sends, but the hourly dedup means most invocations short-circuit
        // on the SETNX quickly. For the first view of the hour the risk
        // of loss remains, /api/usage also fires server-side tracking via
        // a separate direct call when the client dashboard mounts.
        logUsageEvent("client_view", payload.sub, { via: "share_link" }).catch(function() {});
        return true;
      }
    } catch (_) {}
  }

  res.status(401).json({ error: "Unauthorized" });
  return false;
}

// Helper for data endpoints: given a campaign id/name and the current principal,
// decide if the caller is allowed to see it. Admins see everything.
// Strict matching only, no prefix bypass. Accepts raw and _facebook/_instagram
// suffixed variants explicitly so tokens issued against dashboard IDs still match.
export function isCampaignAllowed(principal, campaignId, campaignName) {
  if (!principal || principal.role === "admin") return true;
  if (principal.role !== "client") return false;
  var ids = (principal.allowedCampaignIds || []).map(String);
  var names = principal.allowedCampaignNames || [];
  if (ids.length === 0 && names.length === 0) return false;
  var idStr = String(campaignId || "");
  var idStrStripped = idStr.replace(/_(facebook|instagram)$/, "");
  var allowed = {};
  ids.forEach(function(a) {
    allowed[a] = true;
    allowed[a.replace(/_(facebook|instagram)$/, "")] = true;
  });
  if (allowed[idStr] || allowed[idStrStripped]) return true;
  if (campaignName && names.indexOf(campaignName) >= 0) return true;
  return false;
}
