// Studio-on-GAS → Media-on-GAS single-sign-on handoff.
//
// Studio mints a short-lived JWT (5 min TTL) signed with the shared
// STUDIO_MEDIA_HANDOFF_SECRET env var and redirects the user to:
//   https://media.gasmarketing.co.za/enter?st=<jwt>
//
// The Media frontend's App boot picks up ?st=, POSTs to this endpoint,
// swaps the Studio JWT for a normal Media session token, drops the
// query param and lands the user on the dashboard.
//
// Token shape (Studio must issue):
//   {
//     iss: "studio",                     // required, exactly this string
//     aud: "media",                      // required, exactly this string
//     email: "user@company.co.za",       // required, must exist in Media's users table (or be allowlisted below)
//     name: "First Last",                // optional
//     role: "admin" | "superadmin" | "client",  // optional, defaults to "admin"
//     iat: <unix seconds>,
//     exp: <unix seconds>                // required, MUST be ≤ 5 min from iat
//   }
//
// Signing: HS256 with the shared secret. Same wire format as our own
// _jwt.js so we can reuse the verify helper verbatim.
//
// Sketch of the Studio side (their code):
//   import crypto from "crypto";
//   function mintMediaHandoffToken(user) {
//     var now = Math.floor(Date.now() / 1000);
//     var body = { iss: "studio", aud: "media",
//                  email: user.email, name: user.name, role: user.role,
//                  iat: now, exp: now + 300 };
//     var b64 = (x) => Buffer.from(x).toString("base64")
//                       .replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
//     var h = b64(JSON.stringify({ alg:"HS256", typ:"JWT" }));
//     var p = b64(JSON.stringify(body));
//     var sig = crypto.createHmac("sha256", process.env.STUDIO_MEDIA_HANDOFF_SECRET)
//                     .update(h+"."+p).digest();
//     return h+"."+p+"."+b64(sig);
//   }
//   // Then redirect:
//   res.redirect(302, "https://media.gasmarketing.co.za/enter?st=" + mintMediaHandoffToken(user));

import crypto from "crypto";
import { rateLimit } from "./_rateLimit.js";
import { getUser, saveSession, generateToken } from "./_users.js";
import { logUsageEvent } from "./_audit.js";

var ALLOWED_ORIGINS = [
  "https://media-on-gas.vercel.app",
  "https://media.gasmarketing.co.za",
  "http://media.gasmarketing.co.za",
  "http://localhost:5173",
  "http://localhost:3000"
];

function setCors(req, res) {
  var origin = req.headers.origin || req.headers.Origin || "";
  if (ALLOWED_ORIGINS.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
}

function b64urlDecode(str) {
  str = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

// Verifies a Studio-issued JWT using the shared HS256 secret. Returns
// the payload on success, null on any failure (bad shape, bad sig,
// wrong iss/aud, expired). Constant-time signature compare.
function verifyStudioToken(token) {
  var secret = process.env.STUDIO_MEDIA_HANDOFF_SECRET;
  if (!secret) return { error: "handoff_disabled" };
  if (!token || typeof token !== "string") return { error: "no_token" };
  var parts = token.split(".");
  if (parts.length !== 3) return { error: "malformed" };
  var unsigned = parts[0] + "." + parts[1];
  var expectedSig = crypto.createHmac("sha256", secret).update(unsigned).digest();
  var providedSig;
  try { providedSig = b64urlDecode(parts[2]); } catch (_) { return { error: "malformed_sig" }; }
  if (expectedSig.length !== providedSig.length) return { error: "bad_sig" };
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return { error: "bad_sig" };
  var payload;
  try { payload = JSON.parse(b64urlDecode(parts[1]).toString("utf-8")); }
  catch (_) { return { error: "malformed_body" }; }
  if (payload.iss !== "studio") return { error: "bad_iss" };
  if (payload.aud !== "media") return { error: "bad_aud" };
  var now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= now) return { error: "expired" };
  // Hard cap: never trust a Studio token that claims to live longer
  // than 15 minutes. Even if their code issued a 24h token by mistake,
  // we won't accept it.
  if (payload.iat && payload.exp - payload.iat > 900) return { error: "ttl_too_long" };
  if (!payload.email || typeof payload.email !== "string") return { error: "no_email" };
  return { payload: payload };
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }
  // Tight rate limit: this endpoint should fire ONCE per handoff link
  // click. A hot loop hitting it is either brute-forcing signatures or
  // a bug on the Studio side.
  if (!(await rateLimit(req, res, { maxPerMin: 20, maxPerHour: 120 }))) return;

  var body = req.body || {};
  var token = String(body.token || "").trim();
  var verdict = verifyStudioToken(token);
  if (verdict.error) {
    console.warn("[studio-handoff] token rejected", { reason: verdict.error });
    res.status(401).json({ error: "Invalid or expired handoff token" });
    return;
  }
  var payload = verdict.payload;
  var email = String(payload.email || "").toLowerCase().trim();

  // Media user must already exist (invite + password flow). We don't
  // auto-provision — the team lead adds team members via the Users
  // admin, and Studio issues handoff tokens only for known emails.
  // Keeps Media's role model and allowlists intact.
  var user = await getUser(email);
  if (!user || user.active === false) {
    console.warn("[studio-handoff] unknown or revoked user", { email: email });
    res.status(403).json({ error: "This email is not provisioned on Media on GAS. Ask an admin to invite it first." });
    return;
  }

  // Create a standard 24-hour Media session, identical to the one
  // /api/auth issues on a normal email+password login.
  var mediaToken = generateToken();
  var expires = Date.now() + 24 * 60 * 60 * 1000;
  await saveSession(mediaToken, {
    email: user.email,
    name: user.name || payload.name || "",
    role: user.role || "admin",
    expires: expires
  });

  try { await logUsageEvent("studio_handoff_login", user.email, { role: user.role, name: user.name || "" }); } catch (_) {}

  res.status(200).json({
    token: mediaToken,
    role: user.role,
    email: user.email,
    name: user.name || "",
    expires: expires
  });
}
