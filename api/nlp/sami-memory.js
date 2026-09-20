// Phase 4 of the Sami Hub rebuild: per-client Memory.
//
// A memory entry is a short structured note Sami references
// automatically when the team asks her to work on that client, e.g.
//   MTN MoMo:
//     - "Standard budget: R10K/month starting the 1st"
//     - "Always tag campaigns with the MTN-MoMo_ prefix"
//     - "WhatsApp number: +27 76 993 2598"
//   Chilla:
//     - "B2B hospitality focus; never blend consumer messaging"
//     - "Never launch From-The-Amazon in acquisition"
// Team-shared per client — every AM sees the same memory when they
// mention MTN MoMo in a Sami session. Editable via the sidebar
// modal OR by asking Sami directly ("Remember that Chilla always
// uses WhatsApp 076..."), in which case Sami emits a SAVE_MEMORY
// block the frontend applies (planned; this endpoint accepts the
// same shape either way).
//
// Storage:
//   sami:memory:__index                       JSON [{slug, name, updatedAt, noteCount}]
//   sami:memory:<slug>                        JSON {slug, name, notes: [{id,label,value,updatedBy,updatedAt}]}
//
// Endpoints (all POST):
//   op=list                                 Returns index of clients with memory
//   op=get     + clientSlug                 Returns full memory for one client
//   op=save    + clientSlug + name + notes  Upserts memory for a client
//   op=upsertNote + clientSlug + note       Add/update a single note within a client
//   op=deleteNote + clientSlug + noteId     Remove one note from a client
//   op=delete  + clientSlug                 Wipe a client's memory entirely

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

var MAX_CLIENTS = 100;
var MAX_NOTES_PER_CLIENT = 40;
var MAX_LABEL_LEN = 80;
var MAX_VALUE_LEN = 800;
var MAX_NAME_LEN = 100;

function cleanStr(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}
function normSlug(raw) {
  var s = String(raw || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
  return s.slice(0, 60);
}
function normNoteId(raw) {
  var s = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9\-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 60);
}
function makeNoteId(label) {
  var base = normNoteId(label) || "note";
  return base + "-" + Math.random().toString(36).slice(2, 6);
}

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
    console.error("[sami-memory] redis error", err);
    return null;
  }
}
var INDEX_KEY = "sami:memory:__index";
function clientKey(slug) { return "sami:memory:" + slug; }

async function readIndex() {
  var r = await redisCmd(["GET", INDEX_KEY]);
  if (!r || !r.result) return [];
  try { var parsed = JSON.parse(r.result); return Array.isArray(parsed) ? parsed : []; }
  catch (_) { return []; }
}
async function writeIndex(arr) {
  await redisCmd(["SET", INDEX_KEY, JSON.stringify((Array.isArray(arr) ? arr : []).slice(0, MAX_CLIENTS))]);
}
async function readClient(slug) {
  var r = await redisCmd(["GET", clientKey(slug)]);
  if (!r || !r.result) return null;
  try { return JSON.parse(r.result); }
  catch (_) { return null; }
}
async function writeClient(record) {
  record.notes = (Array.isArray(record.notes) ? record.notes : []).slice(0, MAX_NOTES_PER_CLIENT);
  await redisCmd(["SET", clientKey(record.slug), JSON.stringify(record)]);
}
async function bumpIndex(slug, name, noteCount) {
  var idx = await readIndex();
  var without = idx.filter(function (r) { return r.slug !== slug; });
  var meta = { slug: slug, name: name, updatedAt: Date.now(), noteCount: noteCount };
  without.unshift(meta);
  await writeIndex(without);
  return without;
}

export default async function handler(req, res) {
  // Audit fix #4: audit-trail user (updatedBy on notes) comes from the
  // signed JWT, not body.user. Prevents a team member from attributing
  // a memory change to someone else.
  var auth = checkCreateAuth(req, res);
  if (!auth) return;
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 40, maxPerHour: 300 }))) return;

  if (!getRedisCreds()) {
    res.status(503).json({ error: "Sami Hub storage not configured (KV_REST_API_URL / KV_REST_API_TOKEN missing)." });
    return;
  }

  var body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  body = body || {};
  var op = String(body.op || "").toLowerCase();
  var user = auth.user;

  try {
    if (op === "list") {
      var idx = await readIndex();
      res.status(200).json({ clients: idx });
      return;
    }

    if (op === "get") {
      var slug = normSlug(body.clientSlug);
      if (!slug) { res.status(400).json({ error: "clientSlug required." }); return; }
      var rec = await readClient(slug);
      res.status(200).json({ client: rec || { slug: slug, name: cleanStr(body.clientName, MAX_NAME_LEN) || slug, notes: [] } });
      return;
    }

    if (op === "save") {
      var sSlug = normSlug(body.clientSlug);
      if (!sSlug) { res.status(400).json({ error: "clientSlug required." }); return; }
      var sName = cleanStr(body.clientName, MAX_NAME_LEN) || sSlug;
      var notesIn = Array.isArray(body.notes) ? body.notes : [];
      var notes = notesIn.slice(0, MAX_NOTES_PER_CLIENT).map(function (n) {
        var label = cleanStr(n && n.label, MAX_LABEL_LEN);
        var value = cleanStr(n && n.value, MAX_VALUE_LEN);
        if (!label || !value) return null;
        return {
          id: normNoteId(n.id) || makeNoteId(label),
          label: label, value: value,
          updatedBy: user, updatedAt: Date.now()
        };
      }).filter(Boolean);
      var record = { slug: sSlug, name: sName, notes: notes };
      await writeClient(record);
      var newIdx = await bumpIndex(sSlug, sName, notes.length);
      res.status(200).json({ client: record, clients: newIdx });
      return;
    }

    if (op === "upsertnote") {
      var uSlug = normSlug(body.clientSlug);
      if (!uSlug) { res.status(400).json({ error: "clientSlug required." }); return; }
      var uName = cleanStr(body.clientName, MAX_NAME_LEN) || uSlug;
      var noteIn = body.note || {};
      var uLabel = cleanStr(noteIn.label, MAX_LABEL_LEN);
      var uValue = cleanStr(noteIn.value, MAX_VALUE_LEN);
      if (!uLabel || !uValue) { res.status(400).json({ error: "note.label and note.value required." }); return; }
      var uId = normNoteId(noteIn.id) || makeNoteId(uLabel);
      var current = (await readClient(uSlug)) || { slug: uSlug, name: uName, notes: [] };
      var kept = (current.notes || []).filter(function (n) { return n.id !== uId; });
      kept.unshift({ id: uId, label: uLabel, value: uValue, updatedBy: user, updatedAt: Date.now() });
      current.notes = kept;
      current.name = uName;
      await writeClient(current);
      var uIdx = await bumpIndex(uSlug, uName, current.notes.length);
      res.status(200).json({ client: current, clients: uIdx });
      return;
    }

    if (op === "deletenote") {
      var dSlug = normSlug(body.clientSlug);
      var dNote = normNoteId(body.noteId);
      if (!dSlug || !dNote) { res.status(400).json({ error: "clientSlug and noteId required." }); return; }
      var dCurrent = await readClient(dSlug);
      if (!dCurrent) { res.status(404).json({ error: "Client memory not found." }); return; }
      dCurrent.notes = (dCurrent.notes || []).filter(function (n) { return n.id !== dNote; });
      await writeClient(dCurrent);
      var dIdx = await bumpIndex(dSlug, dCurrent.name, dCurrent.notes.length);
      res.status(200).json({ client: dCurrent, clients: dIdx });
      return;
    }

    if (op === "delete") {
      var wSlug = normSlug(body.clientSlug);
      if (!wSlug) { res.status(400).json({ error: "clientSlug required." }); return; }
      await redisCmd(["DEL", clientKey(wSlug)]);
      var wIdx = (await readIndex()).filter(function (r) { return r.slug !== wSlug; });
      await writeIndex(wIdx);
      res.status(200).json({ clients: wIdx });
      return;
    }

    res.status(400).json({ error: "Unknown op. Use list | get | save | upsertNote | deleteNote | delete." });
  } catch (err) {
    console.error("[sami-memory] handler error", err);
    res.status(500).json({ error: "Memory operation failed." });
  }
}
