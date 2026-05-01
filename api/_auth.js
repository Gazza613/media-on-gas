import { verifyToken } from "./_jwt.js";
import { logUsageEvent } from "./_audit.js";
import { getSessionByToken, deleteSession, getUser } from "./_users.js";

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

// Returns true/false. Attaches `req.authPrincipal` with role + allowlist info
// for endpoints that want to apply client-scoped filtering.
//
// Now async because session-token validation hits Redis. Every callsite
// uses `await checkAuth(req, res)`. Three auth options checked in order:
//   1. x-session-token header (browser sessions, preferred — also accepts
//      ?st= query param so <img> previews and sendBeacon calls that can't
//      attach headers still authenticate without leaking the master api key)
//   2. x-api-key header / ?api_key= query (server-to-server only; cron,
//      reconcile->ads, email-share->summary, chat->context. The browser
//      bundle no longer ships this key.)
//   3. Bearer JWT (signed share URLs for read-only client access)
export async function checkAuth(req, res) {
  setCorsHeaders(req, res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return false;
  }

  // Option 1: Browser session token. Validates against the Redis-backed
  // session store, checks TTL, and re-checks user.active so a revoked
  // user is locked out the moment they next hit any endpoint.
  var sessionToken = req.headers["x-session-token"] || req.query.st || "";
  if (sessionToken) {
    try {
      var s = await getSessionByToken(sessionToken);
      if (s) {
        if (s.expires && s.expires < Date.now()) {
          await deleteSession(sessionToken);
        } else {
          var user = await getUser(s.email);
          if (user && user.active !== false) {
            req.authPrincipal = {
              role: s.role || "admin",
              email: s.email,
              name: s.name || ""
            };
            return true;
          }
          // Revoked since session began — kill the session.
          await deleteSession(sessionToken);
        }
      }
    } catch (_) { /* fall through to other auth options */ }
  }

  // Option 2: Admin API key. After the bundle removal this is server-to-
  // server only (env var). Browser requests no longer ship this key.
  var key = req.headers["x-api-key"] || req.query.api_key || "";
  var expected = process.env.DASHBOARD_API_KEY || "";
  if (key && expected && timingSafeEqual(key, expected)) {
    req.authPrincipal = { role: "admin" };
    return true;
  }

  // Option 3: client Bearer token (for shareable URLs)
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

// Internal-staff gate. "admin" is a regular GAS team member, "superadmin"
// is gary@gasmarketing.co.za. Both have full access to admin endpoints
// (audit log, usage stats, ground truth audit, email share, etc.).
// "client" is a read-only share-link viewer; they're rejected.
// Endpoints that need superadmin-only privileges (e.g. revoke other
// admins) check isSuperadminEmail(principal.email) on top of this.
export function isAdminOrSuperadmin(principal) {
  if (!principal) return false;
  return principal.role === "admin" || principal.role === "superadmin";
}

// Strip the `pages` array on /api/campaigns to only those pages whose
// name plausibly belongs to one of the allowed campaigns. Without this,
// a client share-link viewer received the full FB / IG owned-page list
// across every brand on the platform, which leaked all-clients fan
// counts via the response payload (the dashboard only DISPLAYED matched
// pages, but DevTools made the rest readable).
//
// Empty allowlist (misconfigured token) returns []. Otherwise keeps any
// page whose name shares a 4+ char alphanumeric run with any allowed
// campaign name. Loose intentionally: missing a real match would break
// the Community tab for a legit client; the cost of an extra page row
// is just the page's followers_count, not anything PII-grade.
export function filterPagesForPrincipal(pages, principal) {
  if (!principal || principal.role !== "client") return pages || [];
  var p = pages || [];
  if (p.length === 0) return p;
  var names = principal.allowedCampaignNames || [];
  if (names.length === 0) return [];
  var normalize = function(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " "); };
  var significant = function(s) {
    return normalize(s).split(/\s+/).filter(function(w) {
      // Same stop list as the frontend's autoMatchPage so server-side
      // filtering doesn't accidentally diverge from what the UI matches.
      return w.length >= 4 && [
        "campaign", "facebook", "instagram", "tiktok", "paid", "social",
        "funnel", "cycle", "leads", "lead", "follower", "like", "appinstall",
        "traffic", "cold", "warm", "display", "search", "promotion", "promo",
        "april", "may", "june", "july", "august", "september", "october",
        "november", "december", "january", "february", "march", "2024", "2025", "2026"
      ].indexOf(w) < 0;
    });
  };
  var allowedTokens = {};
  names.forEach(function(n) {
    significant(n).forEach(function(w) { allowedTokens[w] = true; });
  });
  if (Object.keys(allowedTokens).length === 0) return [];
  return p.filter(function(pg) {
    var pgTokens = significant(pg.name);
    for (var i = 0; i < pgTokens.length; i++) {
      if (allowedTokens[pgTokens[i]]) return true;
    }
    return false;
  });
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
