// Phase 2 of the Sami Hub rebuild: per-user chat-thread persistence in
// Redis. The Create tab's PIN JWT is team-shared (one PIN unlocks for
// every team member) so it can't distinguish who is chatting. To
// namespace threads per person we require an ?user=<slug> query param
// on every call, validated against an allowlist of the GAS team's
// personal emails' local-parts (gary/sam/busi/claire/donovan). Not a
// security boundary — the whole team shares the PIN and is trusted —
// but it keeps each AM's thread list clean and prevents accidental
// cross-user overwrites.
//
// Storage schema (Upstash REST, same store custom-outcomes uses):
//
//   sami:threads:<user>              JSON array of thread metadata:
//                                    [{id, title, updatedAt, msgCount}, ...]
//                                    sorted newest-first, capped at MAX_THREADS_PER_USER
//
//   sami:thread:<user>:<threadId>    JSON of the full message history:
//                                    { id, title, createdAt, updatedAt,
//                                      messages: [{role, content, cards?, live?}, ...] }
//
// Endpoints (all POST to keep bodies simple):
//   op=list                          Returns [threadMeta, ...] for the user
//   op=get     + threadId            Returns the full thread with messages
//   op=save    + threadId + payload  Upserts thread (messages + title)
//   op=rename  + threadId + title    Updates title only
//   op=delete  + threadId            Deletes thread + removes from index
//
// Auth: reuses checkCreateAuth (PIN JWT). No new env vars.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

var MAX_THREADS_PER_USER = 50;
var MAX_MESSAGES_PER_THREAD = 200;
var MAX_TITLE_LEN = 120;
var MAX_MESSAGE_CHARS = 12000;

function cleanStr(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

function normThreadId(raw) {
  var s = String(raw || "").trim();
  // Only accept the ids we generate on the frontend — ULID-ish 20-32
  // char alphanumeric-and-dash. Prevents key injection into Redis.
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(s)) return "";
  return s;
}

// Audit fix #7: sanitise a per-card status map before persisting. Card
// ids follow the same allowlisted-slug shape Sami emits, and status
// must be one of the enum values the frontend actually renders.
// Everything else is silently dropped (never trust the client blob).
function sanitiseStatusMap(raw, allowed) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  var out = {};
  var keys = Object.keys(raw).slice(0, 200);
  keys.forEach(function (k) {
    if (typeof k !== "string" || k.length === 0 || k.length > 120) return;
    if (!/^[a-zA-Z0-9_-]+$/.test(k)) return;
    var v = String(raw[k] == null ? "" : raw[k]);
    if (allowed.indexOf(v) < 0) return;
    out[k] = v;
  });
  return out;
}

// Auto-title from first user message: first ~60 chars, break on sentence
// end or newline where possible. Kept simple; users can rename.
function autoTitle(messages) {
  var first = (messages || []).find(function (m) { return m && m.role === "user" && m.content; });
  if (!first) return "Untitled";
  var raw = String(first.content).trim();
  raw = raw.replace(/[\r\n]+/g, " ");
  if (raw.length <= 60) return raw || "Untitled";
  var cut = raw.slice(0, 60);
  var lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 30) cut = cut.slice(0, lastSpace);
  return cut + "…";
}

// ---- Redis helpers (same shape as custom-outcomes.js) --------------------

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
    console.error("[sami-threads] redis error", err);
    return null;
  }
}

// Audit fix #7b: the threads index is now a Redis hash (one field per
// thread meta) so two concurrent saves can never clobber each other.
// Previous shape was a single JSON blob at sami:threads:<user> which
// suffered the GET-mutate-SET race the audit flagged. Full-thread
// records live at their own per-key sami:thread:<user>:<threadId>
// already, no race there.
var LEGACY_INDEX_PREFIX = "sami:threads:";
function indexKey(user) { return "sami:threads:hash:" + user; }
function threadKey(user, threadId) { return "sami:thread:" + user + ":" + threadId; }

// Lazy migration: if the hash is empty but the legacy single-blob key
// exists, seed the hash from it and delete the legacy key. Safe to
// call from every read — the branch only fires once per user then the
// hash keeps satisfying subsequent reads.
async function migrateLegacyIndex(user) {
  var legacy = await redisCmd(["GET", LEGACY_INDEX_PREFIX + user]);
  if (!legacy || !legacy.result) return [];
  var parsed;
  try { parsed = JSON.parse(legacy.result); } catch (_) { parsed = null; }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    await redisCmd(["DEL", LEGACY_INDEX_PREFIX + user]);
    return [];
  }
  for (var i = 0; i < parsed.length; i++) {
    var m = parsed[i];
    if (m && m.id) await redisCmd(["HSET", indexKey(user), m.id, JSON.stringify(m)]);
  }
  await redisCmd(["DEL", LEGACY_INDEX_PREFIX + user]);
  return parsed;
}

async function readIndex(user) {
  var r = await redisCmd(["HGETALL", indexKey(user)]);
  var raw = r && Array.isArray(r.result) ? r.result : [];
  if (raw.length === 0) {
    // Nothing in the hash: run the one-time migration from the legacy
    // blob if it exists. Returns the seeded array directly so this call
    // does not need a second HGETALL round trip.
    var migrated = await migrateLegacyIndex(user);
    if (migrated.length === 0) return [];
    migrated.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return migrated.slice(0, MAX_THREADS_PER_USER);
  }
  var out = [];
  for (var j = 0; j < raw.length; j += 2) {
    try {
      var meta = JSON.parse(raw[j + 1]);
      if (meta && meta.id) out.push(meta);
    } catch (_) { /* skip corrupt row */ }
  }
  out.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  return out.slice(0, MAX_THREADS_PER_USER);
}

async function upsertIndexEntry(user, meta) {
  if (!meta || !meta.id) return;
  await redisCmd(["HSET", indexKey(user), meta.id, JSON.stringify(meta)]);
  // Cap enforcement: if the hash grew past the per-user cap, prune the
  // oldest entries. Done after the write so a fresh save is never the
  // one dropped by its own cap-check.
  var sz = await redisCmd(["HLEN", indexKey(user)]);
  var count = sz && sz.result ? parseInt(sz.result, 10) : 0;
  if (count > MAX_THREADS_PER_USER) {
    var current = await readIndex(user);
    var toDrop = current.slice(MAX_THREADS_PER_USER);
    for (var k = 0; k < toDrop.length; k++) {
      await redisCmd(["HDEL", indexKey(user), toDrop[k].id]);
    }
  }
}

async function deleteIndexEntry(user, threadId) {
  await redisCmd(["HDEL", indexKey(user), threadId]);
}

async function readThread(user, threadId) {
  var r = await redisCmd(["GET", threadKey(user, threadId)]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); }
  catch (_) { return null; }
}

async function writeThread(user, thread) {
  await redisCmd(["SET", threadKey(user, thread.id), JSON.stringify(thread)]);
}

async function deleteThreadKey(user, threadId) {
  await redisCmd(["DEL", threadKey(user, threadId)]);
}

// ---- Handler -------------------------------------------------------------

export default async function handler(req, res) {
  // Audit fix #4: user identity comes from the signed JWT (auth.user),
  // NOT from body.user. Any body.user field is silently ignored — the
  // frontend used to pass it and old clients might still, but Sam can
  // no longer read Gary's threads by lying about the slug.
  var auth = checkCreateAuth(req, res);
  if (!auth) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 60, maxPerHour: 600 }))) return;

  if (!getRedisCreds()) {
    res.status(503).json({ error: "Sami Hub storage not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing)." });
    return;
  }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};

  var user = auth.user;

  var op = String(body.op || "").toLowerCase();

  try {
    if (op === "list") {
      var idx = await readIndex(user);
      res.status(200).json({ threads: idx });
      return;
    }

    if (op === "get") {
      var gid = normThreadId(body.threadId);
      if (!gid) { res.status(400).json({ error: "Invalid threadId." }); return; }
      var t = await readThread(user, gid);
      if (!t) { res.status(404).json({ error: "Thread not found." }); return; }
      res.status(200).json({ thread: t });
      return;
    }

    if (op === "save") {
      var sid = normThreadId(body.threadId);
      if (!sid) { res.status(400).json({ error: "Invalid threadId." }); return; }
      var messagesIn = Array.isArray(body.messages) ? body.messages : null;
      if (!messagesIn) { res.status(400).json({ error: "Missing messages array." }); return; }

      // Sanitise messages: role + content are mandatory; every card
      // array + optional flags pass through so a reloaded thread
      // renders every interactive block Sami originally emitted
      // (previously only `cards` + `live` survived — plans, briefs,
      // pairCards, memories, actions, unverifiedNumbers all vanished
      // on reload, killing the Approve-plan button / brief form /
      // pairing UI mid-build).
      var messages = messagesIn.slice(-MAX_MESSAGES_PER_THREAD).map(function (m) {
        var role = (m && m.role === "user") ? "user" : "assistant";
        var content = cleanStr(m && m.content, MAX_MESSAGE_CHARS);
        var out = { role: role, content: content };
        if (m && Array.isArray(m.cards) && m.cards.length > 0) out.cards = m.cards;
        if (m && Array.isArray(m.plans) && m.plans.length > 0) out.plans = m.plans;
        if (m && Array.isArray(m.briefs) && m.briefs.length > 0) out.briefs = m.briefs;
        if (m && Array.isArray(m.pairCards) && m.pairCards.length > 0) out.pairCards = m.pairCards;
        if (m && Array.isArray(m.memories) && m.memories.length > 0) out.memories = m.memories;
        if (m && Array.isArray(m.results) && m.results.length > 0) out.results = m.results;
        if (m && Array.isArray(m.actions) && m.actions.length > 0) out.actions = m.actions;
        if (m && m.live) out.live = true;
        if (m && m.unverifiedNumbers) out.unverifiedNumbers = true;
        return out;
      }).filter(function (m) { return m.content; });

      // Audit fix #7 + #6: persist per-card approval / pair-confirm /
      // plan-approval / brief-submit status so a reloaded thread
      // doesn't render historic cards as pending (which would let a
      // click re-fire the write, defeating the idempotency + nonce
      // guards).
      var cardStatus = sanitiseStatusMap(body.cardStatus, ["approved", "rejected", "pending"]);
      var pairStatus = sanitiseStatusMap(body.pairStatus, ["confirmed", "rejected", "pending"]);
      var planStatus = sanitiseStatusMap(body.planStatus, ["approved", "rejected", "pending"]);
      var briefStatus = sanitiseStatusMap(body.briefStatus, ["submitted", "pending"]);

      var now = Date.now();
      var existing = await readThread(user, sid);
      var thread = {
        id: sid,
        title: cleanStr(body.title, MAX_TITLE_LEN) || (existing && existing.title) || autoTitle(messages),
        createdAt: (existing && existing.createdAt) || now,
        updatedAt: now,
        messages: messages,
        cardStatus: cardStatus,
        pairStatus: pairStatus,
        planStatus: planStatus,
        briefStatus: briefStatus
      };
      await writeThread(user, thread);

      // Upsert the hash entry then re-read the sorted, capped index.
      // Concurrent-save-safe: writing one hash field cannot clobber
      // another team member's thread meta.
      var meta = { id: sid, title: thread.title, updatedAt: now, msgCount: messages.length };
      await upsertIndexEntry(user, meta);
      var fresh = await readIndex(user);

      res.status(200).json({ thread: thread, threads: fresh });
      return;
    }

    if (op === "rename") {
      var rid = normThreadId(body.threadId);
      if (!rid) { res.status(400).json({ error: "Invalid threadId." }); return; }
      var newTitle = cleanStr(body.title, MAX_TITLE_LEN);
      if (!newTitle) { res.status(400).json({ error: "New title cannot be empty." }); return; }
      var t2 = await readThread(user, rid);
      if (!t2) { res.status(404).json({ error: "Thread not found." }); return; }
      t2.title = newTitle;
      t2.updatedAt = Date.now();
      await writeThread(user, t2);
      // Reflect the rename in the hash entry.
      await upsertIndexEntry(user, { id: rid, title: newTitle, updatedAt: t2.updatedAt, msgCount: Array.isArray(t2.messages) ? t2.messages.length : 0 });
      var updated = await readIndex(user);
      res.status(200).json({ threads: updated });
      return;
    }

    if (op === "delete") {
      var did = normThreadId(body.threadId);
      if (!did) { res.status(400).json({ error: "Invalid threadId." }); return; }
      await deleteThreadKey(user, did);
      await deleteIndexEntry(user, did);
      var pruned = await readIndex(user);
      res.status(200).json({ threads: pruned });
      return;
    }

    res.status(400).json({ error: "Unknown op. Use list | get | save | rename | delete." });
  } catch (err) {
    console.error("[sami-threads] handler error", err);
    res.status(500).json({ error: "Storage operation failed." });
  }
}
