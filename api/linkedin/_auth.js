// Shared LinkedIn OAuth 2.0 helper. Two apps live behind this module:
//
//   ADS      -> Advertising API access, id/secret/refresh under
//               LINKEDIN_ADS_* env vars, used by paid.js.
//   ORGANIC  -> Community Management API access, id/secret/refresh
//               under LINKEDIN_ORG_* env vars, used by organic.js.
//
// LinkedIn forces the two products onto separate developer apps for
// legal/security reasons ("This API product requires that it be the
// only product on the application"), so paid + organic each have
// their own client_id/client_secret/refresh_token triple.
//
// Access tokens carry a 60-day TTL. We cache them in the same
// Upstash-Redis store the rest of the repo already uses (via raw
// fetch, matching api/custom-outcomes.js line ~42), keyed per app,
// with a 1-hour safety margin against the reported expires_in.
// A refresh call auto-fires when the cache is empty or on any 401
// from LinkedIn (see fetchLinkedIn below).
//
// Every export here is server-side only. Client Secret and refresh
// token never leave the function.

var LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
var LINKEDIN_API_BASE = "https://api.linkedin.com";
var CACHE_MARGIN_SECONDS = 3600; // renew 1 hour before real expiry

// ---- Redis (same shape as custom-outcomes.js) -----------------------------

function getRedisCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/+$/, ""), token: token };
}

async function redisCmd(args) {
  var creds = getRedisCreds();
  if (!creds) return null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args)
    });
    if (!r.ok) return null;
    return r.json();
  } catch (err) {
    console.error("[linkedin/_auth] redis error", err);
    return null;
  }
}

// ---- Env-var resolution ---------------------------------------------------

// appKey is either "ads" or "organic". Returns the triple or null when
// something's missing so callers can 503 with a clear message.
export function getAppCreds(appKey) {
  var prefix = appKey === "organic" ? "LINKEDIN_ORG_" : "LINKEDIN_ADS_";
  var clientId = process.env[prefix + "CLIENT_ID"] || "";
  var clientSecret = process.env[prefix + "CLIENT_SECRET"] || "";
  var refreshToken = process.env[prefix + "REFRESH_TOKEN"] || "";
  if (!clientId || !clientSecret || !refreshToken) return null;
  return { appKey: appKey, clientId: clientId, clientSecret: clientSecret, refreshToken: refreshToken };
}

// The two shared IDs are the same for both apps (MTN MoMo's ad account
// and MTN MoMo's Company Page — one client, two dev apps). Return null
// on missing so the endpoint layer decides how to fail.
export function getAdAccountId() {
  return process.env.LINKEDIN_AD_ACCOUNT_ID || "";
}

export function getOrgUrn() {
  var raw = process.env.LINKEDIN_ORG_URN || "";
  if (!raw) return "";
  // Accept either "urn:li:organization:102944402" or bare "102944402"
  return /^urn:li:organization:/i.test(raw) ? raw : "urn:li:organization:" + raw;
}

// ---- Access token cache ---------------------------------------------------

function cacheKey(appKey) { return "linkedin:token:" + appKey; }

async function readCachedToken(appKey) {
  var r = await redisCmd(["GET", cacheKey(appKey)]);
  if (!r || !r.result) return null;
  try {
    var parsed = JSON.parse(r.result);
    if (!parsed || !parsed.accessToken || !parsed.expiresAt) return null;
    // Renew CACHE_MARGIN_SECONDS ahead of real expiry so a request landing
    // near the boundary never uses a token that dies mid-flight.
    if (parsed.expiresAt - Date.now() < CACHE_MARGIN_SECONDS * 1000) return null;
    return parsed;
  } catch (_) { return null; }
}

async function writeCachedToken(appKey, accessToken, expiresInSeconds) {
  var expiresAt = Date.now() + (expiresInSeconds || 60 * 24 * 3600) * 1000;
  var body = JSON.stringify({ accessToken: accessToken, expiresAt: expiresAt });
  // TTL matches LinkedIn's reported expiry so Redis auto-evicts if we lose
  // sync with reality (e.g. a refresh-token rotation elsewhere).
  var ttl = Math.max(60, (expiresInSeconds || 60 * 24 * 3600) - CACHE_MARGIN_SECONDS);
  await redisCmd(["SET", cacheKey(appKey), body, "EX", String(ttl)]);
}

// ---- Refresh-token exchange ----------------------------------------------

async function refreshAccessToken(creds) {
  var form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", creds.refreshToken);
  form.set("client_id", creds.clientId);
  form.set("client_secret", creds.clientSecret);
  var resp = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  });
  var text = await resp.text();
  if (!resp.ok) {
    console.error("[linkedin/_auth] refresh failed", creds.appKey, resp.status, text.slice(0, 300));
    throw new Error("linkedin_refresh_failed:" + resp.status);
  }
  var data;
  try { data = JSON.parse(text); } catch (_) { throw new Error("linkedin_refresh_bad_json"); }
  if (!data.access_token) throw new Error("linkedin_refresh_no_token");
  await writeCachedToken(creds.appKey, data.access_token, data.expires_in);
  return data.access_token;
}

// Public: get a working access token for the given app. Reads cache first,
// refreshes on miss. Throws when creds are missing so the caller returns
// a clean 503 with the specific env var name.
export async function getAccessToken(appKey) {
  var creds = getAppCreds(appKey);
  if (!creds) {
    var prefix = appKey === "organic" ? "LINKEDIN_ORG_" : "LINKEDIN_ADS_";
    throw new Error("linkedin_env_missing:" + prefix + "CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN");
  }
  var cached = await readCachedToken(appKey);
  if (cached) return cached.accessToken;
  return await refreshAccessToken(creds);
}

// ---- Authed GET wrapper ---------------------------------------------------

// LinkedIn wants version + protocol headers on every /rest/* call. Two
// products, same headers. On a 401 we refresh once and retry — LinkedIn's
// access tokens sometimes get revoked mid-window even when our cache says
// they're valid.
export async function fetchLinkedIn(appKey, path, opts) {
  opts = opts || {};
  var attempt = async function (token) {
    var headers = Object.assign({
      "Authorization": "Bearer " + token,
      "LinkedIn-Version": opts.version || "202506",
      "X-Restli-Protocol-Version": "2.0.0",
      "Accept": "application/json"
    }, opts.headers || {});
    var url = /^https?:\/\//i.test(path) ? path : LINKEDIN_API_BASE + path;
    return await fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body || undefined
    });
  };
  var token = await getAccessToken(appKey);
  var resp = await attempt(token);
  if (resp.status === 401) {
    // Force a fresh token by clearing cache, then retry once.
    await redisCmd(["DEL", cacheKey(appKey)]);
    token = await getAccessToken(appKey);
    resp = await attempt(token);
  }
  return resp;
}

// Convenience wrapper for endpoints that just want parsed JSON + a status
// hint. Never throws on non-200; caller decides how to handle.
export async function fetchLinkedInJson(appKey, path, opts) {
  var resp = await fetchLinkedIn(appKey, path, opts);
  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: resp.status, ok: resp.ok, data: data, rawText: text };
}
