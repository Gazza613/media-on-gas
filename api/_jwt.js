// Minimal HMAC-SHA256 signed token helper for client share URLs.
// Self-contained, uses Node's built-in crypto so no external dependency.
// Tokens are stateless: payload is signed, and verification relies only on
// DASHBOARD_JWT_SECRET matching what was used at issue-time.

import crypto from "crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function getSecret() {
  var s = process.env.DASHBOARD_JWT_SECRET;
  if (!s) throw new Error("DASHBOARD_JWT_SECRET env var not set");
  return s;
}

export function issueToken(payload, expiresInSeconds) {
  var now = Math.floor(Date.now() / 1000);
  var body = Object.assign({}, payload, {
    iat: now,
    exp: now + (expiresInSeconds || 30 * 24 * 60 * 60)
  });
  var header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  var bodyEncoded = b64url(JSON.stringify(body));
  var unsigned = header + "." + bodyEncoded;
  var sig = crypto.createHmac("sha256", getSecret()).update(unsigned).digest();
  return unsigned + "." + b64url(sig);
}

export function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  var parts = token.split(".");
  if (parts.length !== 3) return null;
  var unsigned = parts[0] + "." + parts[1];
  var expectedSig = crypto.createHmac("sha256", getSecret()).update(unsigned).digest();
  var providedSig = b64urlDecode(parts[2]);
  if (expectedSig.length !== providedSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;
  try {
    var payload = JSON.parse(b64urlDecode(parts[1]).toString("utf-8"));
    if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) return null;
    return payload;
  } catch (_) { return null; }
}
