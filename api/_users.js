// Team-user model backed by Upstash Redis. Stores hashed passwords only,
// never plaintext. bcryptjs (pure JS) to keep Vercel cold starts fast.
//
// Redis keys:
//   user:<email>       -> { email, name, role, passwordHash, active, createdAt,
//                           activatedAt, lastLogin }
//   invite:<token>     -> { email, name, invitedBy, createdAt, expiresAt, role }
//
// role:
//   superadmin  Gary. Can invite, revoke, view other users. Cannot be revoked.
//   admin       Team member with full dashboard access.
//   revoked     Flipped by superadmin, denies session validation.

import bcrypt from "bcryptjs";
import crypto from "crypto";

var SUPERADMIN_EMAIL = "gary@gasmarketing.co.za";

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisCmd(args) {
  var creds = getCreds();
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
    console.error("Users redis error", err);
    return null;
  }
}

export function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export function isSuperadminEmail(e) {
  return normalizeEmail(e) === SUPERADMIN_EMAIL;
}

export async function getUser(email) {
  var key = "user:" + normalizeEmail(email);
  var r = await redisCmd(["GET", key]);
  if (!r || !r.result) return null;
  try {
    return JSON.parse(r.result);
  } catch (_) { return null; }
}

export async function saveUser(user) {
  if (!user || !user.email) return false;
  user.email = normalizeEmail(user.email);
  var key = "user:" + user.email;
  var payload = JSON.stringify(user);
  await redisCmd(["SET", key, payload]);
  // Also add to the set of all user emails for listing.
  await redisCmd(["SADD", "users:all", user.email]);
  return true;
}

export async function listUsers() {
  var r = await redisCmd(["SMEMBERS", "users:all"]);
  if (!r || !Array.isArray(r.result)) return [];
  var emails = r.result;
  if (emails.length === 0) return [];
  var out = [];
  for (var i = 0; i < emails.length; i++) {
    var u = await getUser(emails[i]);
    if (u) {
      // Never expose the password hash or the sami-pin hash.
      out.push({
        email: u.email,
        name: u.name || "",
        role: u.role || "admin",
        active: u.active !== false,
        status: u.passwordHash ? (u.active !== false ? "active" : "revoked") : "pending_invite",
        createdAt: u.createdAt || null,
        activatedAt: u.activatedAt || null,
        lastLogin: u.lastLogin || null,
        invitedBy: u.invitedBy || null,
        samiAccess: samiAccessAllowed(u),
        samiPinSet: !!u.samiPinHash,
        samiSlug: u.samiSlug || null,
        samiLastUnlock: u.samiLastUnlock || null,
        samiUnlockCount: u.samiUnlockCount || 0
      });
    }
  }
  // Sort: superadmin first, then active, then revoked, then pending.
  var order = { superadmin: 0, admin: 1, revoked: 2 };
  out.sort(function(a, b) {
    if (a.role === "superadmin" && b.role !== "superadmin") return -1;
    if (b.role === "superadmin" && a.role !== "superadmin") return 1;
    return (a.name || a.email).localeCompare(b.name || b.email);
  });
  return out;
}

export async function setUserActive(email, active) {
  var u = await getUser(email);
  if (!u) return { ok: false, reason: "not-found" };
  if (isSuperadminEmail(u.email)) return { ok: false, reason: "cannot-revoke-superadmin" };
  u.active = !!active;
  u.revokedAt = !active ? new Date().toISOString() : null;
  await saveUser(u);
  return { ok: true };
}

// ─── Sami Hub per-user access + PIN ────────────────────────────────
// Two orthogonal fields on the user record:
//   samiAccess    boolean toggle the superadmin flips on the members
//                 page. Off by default, so onboarding a member does
//                 NOT grant Sami access unless the admin explicitly
//                 enables it.
//   samiPinHash   bcrypt hash of the member's own 4-digit PIN. Set
//                 by the member themselves on first Sami visit (via
//                 /api/sami-pin op=set). Admin cannot see it, but can
//                 clear it via op=reset which forces a fresh setup.
//   samiSlug      short kebab identifier used as the Redis-storage
//                 namespace for the member's Sami threads / memory
//                 audit trail / usage counters. Derived from the
//                 email local-part on first enable, so back-compat
//                 with the existing sami:threads:<slug> keys holds
//                 for the original team (gary / sam / busi / claire /
//                 donovan) without any migration.

function slugifyEmail(email) {
  var local = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  return local.slice(0, 60) || "user";
}

async function ensureSamiSlug(u) {
  if (u.samiSlug) return u.samiSlug;
  var base = slugifyEmail(u.email);
  var slug = base;
  var i = 2;
  // Guard against slug collision when two members share the same email
  // local-part on different domains (e.g. sam@a and sam@b).
  while (true) {
    var r = await redisCmd(["GET", "user:samiSlug:" + slug]);
    var claim = r && r.result;
    if (!claim || claim === u.email) break;
    slug = base + "-" + i;
    i++;
    if (i > 20) { slug = base + "-" + crypto.randomBytes(2).toString("hex"); break; }
  }
  await redisCmd(["SET", "user:samiSlug:" + slug, u.email]);
  return slug;
}

// Superadmin bypass: gary always has samiAccess implicitly so he can
// migrate the rest of the team without locking himself out.
export function samiAccessAllowed(u) {
  if (!u) return false;
  if (isSuperadminEmail(u.email)) return true;
  return !!u.samiAccess;
}

export async function setSamiAccess(email, allowed) {
  var u = await getUser(email);
  if (!u) return { ok: false, reason: "not-found" };
  u.samiAccess = !!allowed;
  u.samiAccessUpdatedAt = new Date().toISOString();
  if (allowed && !u.samiSlug) {
    u.samiSlug = await ensureSamiSlug(u);
  }
  await saveUser(u);
  return { ok: true, samiSlug: u.samiSlug || null };
}

export async function setSamiPinHash(email, hash) {
  var u = await getUser(email);
  if (!u) return { ok: false, reason: "not-found" };
  if (!samiAccessAllowed(u)) return { ok: false, reason: "no-access" };
  if (!u.samiSlug) u.samiSlug = await ensureSamiSlug(u);
  u.samiPinHash = hash;
  u.samiPinSetAt = new Date().toISOString();
  await saveUser(u);
  return { ok: true, samiSlug: u.samiSlug };
}

export async function clearSamiPin(email) {
  var u = await getUser(email);
  if (!u) return { ok: false, reason: "not-found" };
  u.samiPinHash = null;
  u.samiPinSetAt = null;
  u.samiPinResetAt = new Date().toISOString();
  await saveUser(u);
  return { ok: true };
}

export async function recordSamiUnlock(email) {
  var u = await getUser(email);
  if (!u) return false;
  u.samiLastUnlock = new Date().toISOString();
  u.samiUnlockCount = (parseInt(u.samiUnlockCount || 0, 10) || 0) + 1;
  await saveUser(u);
  return true;
}

export async function recordLogin(email) {
  var u = await getUser(email);
  if (!u) return false;
  u.lastLogin = new Date().toISOString();
  await saveUser(u);
  return true;
}

export async function hashPassword(plain) {
  return bcrypt.hash(String(plain || ""), 10);
}

export async function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try { return await bcrypt.compare(String(plain), String(hash)); }
  catch (_) { return false; }
}

// Invite tokens
export function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

// ─── Sessions in Redis ──────────────────────────────────────────────
// Vercel serverless functions are independent Lambdas so an in-memory
// session map in one file is invisible to another. Redis-backed sessions
// let /api/invite / /api/users read sessions created by /api/auth.
var SESSION_TTL_SEC = 24 * 60 * 60;

export async function saveSession(token, data) {
  if (!token) return false;
  await redisCmd(["SET", "session:" + token, JSON.stringify(data), "EX", String(SESSION_TTL_SEC)]);
  return true;
}

export async function getSessionByToken(token) {
  if (!token) return null;
  var r = await redisCmd(["GET", "session:" + token]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); } catch (_) { return null; }
}

export async function deleteSession(token) {
  if (!token) return;
  await redisCmd(["DEL", "session:" + token]);
}

export async function createInvite(email, name, invitedBy) {
  var token = generateToken();
  var record = {
    token: token,
    email: normalizeEmail(email),
    name: name || "",
    invitedBy: normalizeEmail(invitedBy),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    role: "admin"
  };
  await redisCmd(["SET", "invite:" + token, JSON.stringify(record), "EX", String(7 * 24 * 60 * 60)]);
  return record;
}

export async function getInvite(token) {
  if (!token) return null;
  var r = await redisCmd(["GET", "invite:" + token]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); } catch (_) { return null; }
}

export async function consumeInvite(token) {
  await redisCmd(["DEL", "invite:" + token]);
}

// ─── Password reset tokens ─────────────────────────────────────────
// Separate keyspace from invites so an invite token can never be used to
// reset an existing account's password (and vice versa). Reset tokens have
// a tighter 1-hour TTL since the only proof of identity is email control,
// and the token is always one-time-use.
//
// Redis: reset:<token> → { token, email, requestedBy, kind, createdAt, expiresAt }
//   requestedBy = "self"   (came from /api/forgot-password)
//   requestedBy = <email>  (came from /api/admin-reset, superadmin's email)
export var RESET_TTL_SEC = 60 * 60; // 1 hour

export async function createResetToken(email, requestedBy) {
  var token = generateToken();
  var record = {
    token: token,
    email: normalizeEmail(email),
    requestedBy: requestedBy === "self" ? "self" : normalizeEmail(requestedBy || "self"),
    kind: "reset",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + RESET_TTL_SEC * 1000).toISOString()
  };
  await redisCmd(["SET", "reset:" + token, JSON.stringify(record), "EX", String(RESET_TTL_SEC)]);
  return record;
}

export async function getResetToken(token) {
  if (!token) return null;
  var r = await redisCmd(["GET", "reset:" + token]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); } catch (_) { return null; }
}

export async function consumeResetToken(token) {
  await redisCmd(["DEL", "reset:" + token]);
}

// Bootstrap: ensure Gary's superadmin row exists. On first run, seed from
// DASHBOARD_PASSWORD env var so he can log in immediately. Afterwards Gary
// can rotate the password via the standard accept-invite flow on himself
// (or a future "change password" UI).
export async function ensureSuperadminBootstrap() {
  var existing = await getUser(SUPERADMIN_EMAIL);
  if (existing) return existing;
  var envPass = process.env.DASHBOARD_PASSWORD || "";
  if (!envPass) return null;
  var hash = await hashPassword(envPass);
  var user = {
    email: SUPERADMIN_EMAIL,
    name: "Gary Berman",
    role: "superadmin",
    passwordHash: hash,
    active: true,
    createdAt: new Date().toISOString(),
    activatedAt: new Date().toISOString(),
    bootstrapped: true
  };
  await saveUser(user);
  return user;
}
