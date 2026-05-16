// One-time helper: mint a GA4 (Google Analytics Data API) refresh token.
//
// Why this exists: the OAuth Playground UI is fiddly. This does the same
// thing from the terminal. It uses the Playground's redirect URI purely
// as a "show me the code" landing page, Google redirects the browser
// there with ?code=... in the address bar, you copy that code back here,
// and this script exchanges it for a refresh token. No localhost, no
// port forwarding, works fine across the laptop-browser / Codespace
// split.
//
// PREREQUISITE (one Console step, unavoidable for a Web client):
//   The OAuth client must have this EXACT Authorized redirect URI:
//     https://developers.google.com/oauthplayground
//   (Google Cloud Console -> APIs & Services -> Credentials -> your
//    OAuth client -> Authorized redirect URIs -> + ADD URI -> Save)
//   And the "Google Analytics Data API" must be Enabled in that project.
//
// Run:   node tools/ga4-token.mjs
// Then follow the printed instructions.

import readline from "node:readline";

var REDIRECT = "https://developers.google.com/oauthplayground";
var SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

function ask(question) {
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(function (resolve) {
    rl.question(question, function (answer) { rl.close(); resolve(String(answer || "").trim()); });
  });
}

// Accepts either the bare code, a "code=..." fragment, or the whole
// redirected URL pasted in. Returns the decoded authorization code.
function extractCode(raw) {
  var s = String(raw || "").trim();
  if (!s) return "";
  if (s.indexOf("code=") >= 0) {
    var m = s.match(/[?&]code=([^&\s]+)/) || s.match(/code=([^&\s]+)/);
    if (m) s = m[1];
  }
  try { s = decodeURIComponent(s); } catch (_) {}
  return s;
}

async function main() {
  console.log("\n=== GA4 refresh-token helper ===\n");

  var clientId = process.env.GA4_OAUTH_CLIENT_ID || await ask("Paste the OAuth CLIENT ID: ");
  if (!clientId) { console.error("No client ID. Aborting."); process.exit(1); }
  var clientSecret = process.env.GA4_OAUTH_CLIENT_SECRET || await ask("Paste the OAuth CLIENT SECRET: ");
  if (!clientSecret) { console.error("No client secret. Aborting."); process.exit(1); }

  var authUrl = "https://accounts.google.com/o/oauth2/v2/auth" +
    "?client_id=" + encodeURIComponent(clientId) +
    "&redirect_uri=" + encodeURIComponent(REDIRECT) +
    "&response_type=code" +
    "&scope=" + encodeURIComponent(SCOPE) +
    "&access_type=offline" +
    "&prompt=consent";

  console.log("\n--------------------------------------------------------");
  console.log("STEP 1. Open this URL in your browser (sign in as");
  console.log("        gary@gasmarketing.co.za and click Allow):\n");
  console.log(authUrl);
  console.log("\nIf you see 'Google hasn't verified this app', click");
  console.log("Advanced -> Go to ... (unsafe). It's your own app, safe.");
  console.log("--------------------------------------------------------\n");
  console.log("STEP 2. After you click Allow, the browser lands on the");
  console.log("        OAuth Playground page. Look at the BROWSER ADDRESS");
  console.log("        BAR, it will contain ...?code=4%2F0A...&scope=...");
  console.log("        Copy that whole address bar value (or just the");
  console.log("        code part) and paste it below.\n");

  var raw = await ask("Paste the code (or the full redirected URL): ");
  var code = extractCode(raw);
  if (!code) { console.error("No code found in what you pasted. Aborting."); process.exit(1); }

  console.log("\nExchanging code for tokens...\n");
  var body = new URLSearchParams({
    code: code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT,
    grant_type: "authorization_code"
  });
  var r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  var d = await r.json();

  if (!r.ok || d.error) {
    console.error("Token exchange FAILED:");
    console.error(JSON.stringify(d, null, 2));
    console.error("\nCommon causes:");
    console.error("  - redirect URI not added to the client (add");
    console.error("    https://developers.google.com/oauthplayground, save, wait 1 min)");
    console.error("  - code already used (each code works once, re-run and");
    console.error("    get a fresh one)");
    console.error("  - code was truncated when copied");
    process.exit(1);
  }

  if (!d.refresh_token) {
    console.error("Got an access token but NO refresh token.");
    console.error("Re-run the script, the auth URL already forces");
    console.error("prompt=consent so a refresh token should be issued,");
    console.error("make sure you used a FRESH code and the SAME account.");
    process.exit(1);
  }

  console.log("=========================================================");
  console.log("SUCCESS. Set these three in Vercel (Production):\n");
  console.log("GA4_OAUTH_CLIENT_ID     = " + clientId);
  console.log("GA4_OAUTH_CLIENT_SECRET = " + clientSecret);
  console.log("GA4_REFRESH_TOKEN       = " + d.refresh_token);
  console.log("=========================================================");
  console.log("\nThen tell the assistant 'done' and it will build the");
  console.log("GA4 endpoint + Ecommerce tab.\n");
}

main().catch(function (e) {
  console.error("Unexpected error:", e && e.message || e);
  process.exit(1);
});
