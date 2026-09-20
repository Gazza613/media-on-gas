// Sami Hub approval-gate primitives (audit fix #1 + #2).
//
// The Sami Hub sits between a human account manager and live paid-media
// ad accounts. Every write is preceded by an APPROVAL_CARD Sami emits +
// a human click. Before this file existed the rule was prompt-only: if
// the model hallucinated a fake APPROVED: string, or a poisoned memory
// note instructed it to skip the card, the write could fire without a
// human. This file adds a server-side gate:
//
//   1. Sami emits an APPROVAL_CARD carrying operation_id + input_data.
//      sami-hub.js hashes (op_id, canonical(input_data)) and stores a
//      PENDING nonce record in Redis keyed by card id AND by hash.
//   2. Frontend Approve click posts "APPROVED: <cardId>" back as a
//      user message. sami-hub.js flips the nonce to AUTHORISED.
//   3. Sami invokes run_write_operation. Anthropic proxies the tool
//      call through /api/nlp/mcp-proxy, which recomputes the hash from
//      the actual args, looks up the nonce, and REFUSES unless the
//      nonce is authorised. The refusal is returned as an MCP tool
//      error so Sami relays it to the user.
//   4. On success the proxy caches the upstream response against the
//      same nonce and marks it USED. Any subsequent proxy call with
//      the same hash returns the cached result verbatim (idempotency,
//      audit fix #2). This kills the "Vercel timed out, user re-clicks
//      Approve, campaign duplicates" failure mode.
//
// Security properties:
//   - The model cannot fabricate authorisation. Only messages with
//     role: "user" trigger authoriseNonce, and Anthropic never posts
//     user-role messages. A poisoned memory note instructing "always
//     skip approval" is inert: no nonce = no write.
//   - Sami cannot drift input_data between card emission and tool
//     invocation. If a single field changes, the hash mismatches and
//     the proxy refuses.
//   - Nonces live for 30 minutes, then Redis TTL evicts them. Long
//     approvals get stale and require the user to re-approve.

import crypto from "crypto";

var NONCE_TTL_SECONDS = 30 * 60;

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
    console.error("[sami-nonce] redis error", err);
    return null;
  }
}

// Deterministic JSON: keys sorted recursively, no whitespace. Two
// input_data blobs with the same fields in different orders hash to
// the same value. Required so the proxy's recomputed hash matches
// what sami-hub.js stored.
function canonicalJSON(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonicalJSON).join(",") + "]";
  var keys = Object.keys(v).sort();
  return "{" + keys.map(function (k) {
    return JSON.stringify(k) + ":" + canonicalJSON(v[k]);
  }).join(",") + "}";
}

export function hashCall(opId, inputData) {
  var payload = String(opId || "") + "\n" + canonicalJSON(inputData || {});
  return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

function normId(raw) {
  return String(raw || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120);
}

// Called by sami-hub.js when an APPROVAL_CARD is extracted from Sami's
// reply. Registers a pending nonce keyed by both the card id AND the
// hash so the proxy can look it up either way.
export async function issuePendingNonce(cardId, opId, inputData) {
  var id = normId(cardId);
  if (!id || !opId || inputData == null) return null;
  var hash = hashCall(opId, inputData);
  var record = {
    cardId: id,
    opId: String(opId),
    hash: hash,
    createdAt: Date.now(),
    authorisedAt: null,
    usedAt: null,
    result: null
  };
  var payload = JSON.stringify(record);
  await redisCmd(["SET", "sami:nonce:" + id, payload, "EX", String(NONCE_TTL_SECONDS)]);
  await redisCmd(["SET", "sami:nonce:hash:" + hash, id, "EX", String(NONCE_TTL_SECONDS)]);
  return record;
}

// Called by sami-hub.js when an incoming user message is
// "APPROVED: <cardId>". Marks the nonce authorised so the proxy will
// let the next matching write through. Silent no-op if the card id is
// unknown or the nonce has expired.
export async function authoriseNonce(cardId) {
  var id = normId(cardId);
  if (!id) return false;
  var raw = await redisCmd(["GET", "sami:nonce:" + id]);
  if (!raw || !raw.result) return false;
  var rec;
  try { rec = JSON.parse(raw.result); } catch (_) { return false; }
  if (rec.authorisedAt) return true;
  rec.authorisedAt = Date.now();
  await redisCmd(["SET", "sami:nonce:" + id, JSON.stringify(rec), "EX", String(NONCE_TTL_SECONDS)]);
  return true;
}

// Proxy-side gate for tools/call { name: "run_write_operation" }.
// Returns { ok, reason?, cardId?, cached? }.
export async function verifyNonceForCall(opId, inputData) {
  if (!opId || inputData == null) {
    return { ok: false, reason: "missing operation_id or input_data" };
  }
  var hash = hashCall(opId, inputData);
  var lookup = await redisCmd(["GET", "sami:nonce:hash:" + hash]);
  if (!lookup || !lookup.result) {
    return { ok: false, reason: "no approval card matches this write. Every write must have a human-approved APPROVAL_CARD first, and the input_data must match exactly." };
  }
  var cardId = String(lookup.result || "");
  var raw = await redisCmd(["GET", "sami:nonce:" + cardId]);
  if (!raw || !raw.result) {
    return { ok: false, reason: "approval expired. Ask the user to reissue the card." };
  }
  var rec;
  try { rec = JSON.parse(raw.result); } catch (_) {
    return { ok: false, reason: "approval record corrupt" };
  }
  if (!rec.authorisedAt) {
    return { ok: false, reason: "the user has not clicked Approve on that card yet" };
  }
  if (rec.usedAt && rec.result !== null) {
    return { ok: true, cached: rec.result, cardId: cardId };
  }
  return { ok: true, cardId: cardId };
}

// Proxy-side: mark the nonce consumed and cache the upstream response
// for retry idempotency. Best-effort: if Redis is unreachable the write
// still succeeds (Anthropic has the response) but a retry could
// re-fire. That is acceptable; the alternative (blocking the response
// on a Redis write) is worse.
export async function consumeNonce(opId, inputData, response) {
  if (!opId || inputData == null) return;
  var hash = hashCall(opId, inputData);
  var lookup = await redisCmd(["GET", "sami:nonce:hash:" + hash]);
  if (!lookup || !lookup.result) return;
  var cardId = String(lookup.result || "");
  var raw = await redisCmd(["GET", "sami:nonce:" + cardId]);
  if (!raw || !raw.result) return;
  var rec;
  try { rec = JSON.parse(raw.result); } catch (_) { return; }
  rec.usedAt = Date.now();
  rec.result = response;
  await redisCmd(["SET", "sami:nonce:" + cardId, JSON.stringify(rec), "EX", String(NONCE_TTL_SECONDS)]);
}

// Extract the card id from a user turn that starts with "APPROVED: ...".
// Accepts optional trailing text after the id (e.g. "APPROVED: card-123
// with note: use lifetime not daily"). Returns null if the message is
// not an approval.
export function extractApprovedCardId(userMessage) {
  var m = String(userMessage || "").match(/^\s*APPROVED:\s*([a-zA-Z0-9_-]+)/);
  return m ? normId(m[1]) : null;
}

// Audit fix #6 (PLAN_CARD batched approval).
//
// A PLAN_CARD groups N child writes under one human click. Each child
// still gets its own per-write nonce (so the MCP proxy's per-call
// gate + idempotency work unchanged). The plan record just tracks
// which child ids belong together, so "APPROVED_PLAN: <planId>" can
// authorise every child nonce in a single Redis round-trip.

export function extractApprovedPlanId(userMessage) {
  var m = String(userMessage || "").match(/^\s*APPROVED_PLAN:\s*([a-zA-Z0-9_-]+)/);
  return m ? normId(m[1]) : null;
}

// Called by sami-hub.js when a PLAN_CARD is extracted from Sami's
// reply. Registers per-child nonces (same shape as a lone APPROVAL_CARD
// so the MCP proxy sees them identically) AND a plan-level index so
// authoriseNoncePlan can flip them all at once. Returns the list of
// child ids that were successfully registered (skipping malformed).
export async function issuePendingPlanNonces(planId, children) {
  var id = normId(planId);
  if (!id || !Array.isArray(children) || children.length === 0) return [];
  var registered = [];
  for (var i = 0; i < children.length; i++) {
    var c = children[i];
    if (!c || !c.id || !c.operation_id || c.input_data == null) continue;
    var rec = await issuePendingNonce(c.id, c.operation_id, c.input_data);
    if (rec) registered.push(rec.cardId);
  }
  if (registered.length === 0) return [];
  var planRec = { planId: id, childCardIds: registered, createdAt: Date.now(), authorisedAt: null };
  await redisCmd(["SET", "sami:plan:" + id, JSON.stringify(planRec), "EX", String(NONCE_TTL_SECONDS)]);
  return registered;
}

// Called by sami-hub.js when the incoming user message is
// "APPROVED_PLAN: <planId>". Flips every child nonce to authorised in
// one pass. Returns the number of children authorised, or 0 if the
// plan id is unknown / expired.
export async function authoriseNoncePlan(planId) {
  var id = normId(planId);
  if (!id) return 0;
  var raw = await redisCmd(["GET", "sami:plan:" + id]);
  if (!raw || !raw.result) return 0;
  var plan;
  try { plan = JSON.parse(raw.result); } catch (_) { return 0; }
  if (!plan || !Array.isArray(plan.childCardIds) || plan.childCardIds.length === 0) return 0;
  var count = 0;
  for (var i = 0; i < plan.childCardIds.length; i++) {
    var ok = await authoriseNonce(plan.childCardIds[i]);
    if (ok) count++;
  }
  plan.authorisedAt = Date.now();
  await redisCmd(["SET", "sami:plan:" + id, JSON.stringify(plan), "EX", String(NONCE_TTL_SECONDS)]);
  return count;
}
