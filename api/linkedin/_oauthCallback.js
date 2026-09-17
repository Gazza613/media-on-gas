// Shared OAuth 2.0 authorization-code exchange used by both callback
// endpoints (oauth-callback-ads.js and oauth-callback-organic.js). LinkedIn
// forces separate apps per product, but the code exchange itself is
// identical — only the client_id/client_secret and expected redirect_uri
// differ per app.
//
// Flow:
//   1. Admin (Gary) visits this endpoint from a browser after clicking a
//      LinkedIn authorize URL built with our client_id and redirect_uri.
//   2. LinkedIn calls this URL back with ?code=<one-shot-code>.
//   3. We POST code + credentials to LinkedIn's token endpoint.
//   4. LinkedIn returns access_token + refresh_token.
//   5. We display the refresh_token (once, on-screen) so Gary can paste
//      it into Vercel env vars (LINKEDIN_ADS_REFRESH_TOKEN or
//      LINKEDIN_ORG_REFRESH_TOKEN). The refresh token then survives
//      access-token rotation for ~365 days and _auth.js handles the
//      short-lived access-token refresh cycle automatically.
//
// Auth: gated on checkAuth so only signed-in Superadmins can run this.
// The refresh token is a high-value secret; a public callback would
// leak it to anyone with the LinkedIn authorize URL.

import { checkAuth, isAdminOrSuperadmin } from "../_auth.js";

var LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

function envMissingHtml(prefix) {
  return "<h2>LinkedIn OAuth setup incomplete</h2>" +
    "<p>Vercel env vars <code>" + prefix + "CLIENT_ID</code> and " +
    "<code>" + prefix + "CLIENT_SECRET</code> must be set before this callback can run. " +
    "Add them in Vercel &rarr; Project &rarr; Settings &rarr; Environment Variables, redeploy, then retry.</p>";
}

function authorizeUrl(clientId, redirectUri, scope) {
  var qs = new URLSearchParams();
  qs.set("response_type", "code");
  qs.set("client_id", clientId);
  qs.set("redirect_uri", redirectUri);
  qs.set("scope", scope);
  // A random state param would be ideal but this endpoint is single-user
  // and behind checkAuth, so state-CSRF risk is already mitigated.
  qs.set("state", Math.random().toString(36).slice(2, 10));
  return "https://www.linkedin.com/oauth/v2/authorization?" + qs.toString();
}

// Exposed so oauth-callback-ads.js / oauth-callback-organic.js can call it
// with their own prefix + scope + redirect. Renders HTML directly so the
// admin gets a browser-friendly page instead of raw JSON.
export async function handleOAuthCallback(req, res, config) {
  if (!(await checkAuth(req, res))) return;
  if (!isAdminOrSuperadmin(req.authPrincipal)) {
    res.status(403).send("<h2>Forbidden</h2><p>Only Superadmins can complete LinkedIn OAuth.</p>");
    return;
  }

  var prefix = config.appKey === "organic" ? "LINKEDIN_ORG_" : "LINKEDIN_ADS_";
  var clientId = process.env[prefix + "CLIENT_ID"] || "";
  var clientSecret = process.env[prefix + "CLIENT_SECRET"] || "";
  if (!clientId || !clientSecret) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(503).send(envMissingHtml(prefix));
    return;
  }

  var code = String((req.query && req.query.code) || "");
  // Step 1: no code -> render an authorize-link page so the admin can
  // kick off the OAuth flow in one click.
  if (!code) {
    var link = authorizeUrl(clientId, config.redirectUri, config.scope);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(
      "<!doctype html><html><head><title>LinkedIn OAuth (" + config.appKey + ")</title>" +
      "<style>body{font-family:system-ui,sans-serif;padding:40px;background:#0a0418;color:#fff;line-height:1.6}" +
      "a.btn{display:inline-block;background:#0A66C2;color:#fff;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:700;margin-top:16px}" +
      "code{background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px}</style></head>" +
      "<body><h1>LinkedIn OAuth — " + config.appKey.toUpperCase() + " app</h1>" +
      "<p>Click below to authorize the <strong>" + config.appKey + "</strong> LinkedIn Developer App " +
      "against the MoMo from MTN ZA identity. LinkedIn will redirect back here with a one-shot code, " +
      "which this endpoint exchanges for a refresh token you paste into Vercel as " +
      "<code>" + prefix + "REFRESH_TOKEN</code>.</p>" +
      "<p>Requested scopes: <code>" + config.scope + "</code></p>" +
      "<a class='btn' href='" + link + "'>Authorize " + config.appKey + " app</a>" +
      "</body></html>"
    );
    return;
  }

  // Step 2: LinkedIn redirected back with a code. Exchange it.
  var form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("redirect_uri", config.redirectUri);

  try {
    var resp = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    var text = await resp.text();
    if (!resp.ok) {
      console.error("[linkedin/oauth-callback] token exchange failed", config.appKey, resp.status, text.slice(0, 300));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(502).send(
        "<h2>Token exchange failed</h2>" +
        "<p>LinkedIn returned status " + resp.status + ". Full response for debugging:</p>" +
        "<pre style='background:#111;color:#fff;padding:12px;border-radius:6px;overflow:auto'>" +
        String(text).replace(/</g, "&lt;").slice(0, 2000) + "</pre>"
      );
      return;
    }
    var data;
    try { data = JSON.parse(text); } catch (_) { data = {}; }
    var refreshToken = data.refresh_token || "";
    var accessToken = data.access_token || "";
    var refreshExp = data.refresh_token_expires_in || 0;
    if (!refreshToken) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(502).send(
        "<h2>No refresh_token returned</h2>" +
        "<p>LinkedIn did not return a refresh_token. This usually means the OAuth app is not enabled " +
        "for the <code>refresh_token</code> grant type. Contact LinkedIn Developer Support.</p>" +
        "<pre style='background:#111;color:#fff;padding:12px;border-radius:6px;overflow:auto'>" +
        String(text).slice(0, 800) + "</pre>"
      );
      return;
    }
    // Success — display refresh token ONCE for copy-paste to Vercel.
    var envName = prefix + "REFRESH_TOKEN";
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(
      "<!doctype html><html><head><title>Refresh token minted</title>" +
      "<style>body{font-family:system-ui,sans-serif;padding:40px;background:#0a0418;color:#fff;line-height:1.6;max-width:820px}" +
      "code{background:rgba(255,255,255,0.08);padding:2px 6px;border-radius:4px}" +
      "pre{background:#111;color:#7dd3fc;padding:14px 16px;border-radius:8px;word-break:break-all;white-space:pre-wrap}" +
      ".ok{color:#34D399;font-weight:800}</style></head><body>" +
      "<h1 class='ok'>Refresh token minted for " + config.appKey + " app</h1>" +
      "<p>Copy the token below and add it to Vercel as <code>" + envName + "</code>. " +
      "Refresh tokens live approximately <strong>" + Math.floor((refreshExp || 60 * 24 * 3600 * 6) / 86400) + " days</strong> " +
      "before you must re-run this flow.</p>" +
      "<h3>" + envName + "</h3><pre>" + refreshToken + "</pre>" +
      "<h3>Access token (transient, no need to save)</h3><pre>" + accessToken.slice(0, 60) + "...</pre>" +
      "<p><strong>After adding the env var:</strong> redeploy the Vercel project so the LinkedIn endpoints pick up the new value. " +
      "The <code>/api/linkedin/paid</code> or <code>/api/linkedin/organic</code> endpoint will then work.</p>" +
      "<p>This page will not show the token again on refresh — copy it now.</p>" +
      "</body></html>"
    );
  } catch (err) {
    console.error("[linkedin/oauth-callback] exception", config.appKey, err);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(500).send("<h2>Callback failed</h2><p>" + String(err.message || err) + "</p>");
  }
}
