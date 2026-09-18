// Sami Hub — the rebuilt Create tab (Phase 1). Full white-label
// Markifact-style layout: left rail with live connector status,
// main chat pane, per-operation Approve/Reject cards rendered
// inline in Sami's messages, PIN-gate reuse from the wizard so a
// prior unlock in this session carries straight over.
//
// Phase 1 covers: chat + connectors sidebar + approval cards +
// feature-flag entry from CreateHub. Phases 2-5 (Redis-persisted
// threads, recent conversations sidebar, assets pipeline, skills
// memory, wizard retirement) land as follow-up branches.
//
// See project_sami_hub_rebuild memory for the full plan.

import { useState, useEffect, useRef } from "react";

var TOKEN_KEY = "gas_create_token";
var TOKEN_EXP_KEY = "gas_create_token_exp";
// Per-user thread namespacing. The PIN JWT is team-shared so it can't tell
// Gary from Sam. We persist the current user's identity in localStorage on
// first visit (via NamePicker below) and pass it as ?user=<slug> to every
// /api/nlp/sami-threads call. Allowlist mirrors nudge-cron NUDGE_RECIPIENTS.
var USER_KEY = "gas_sami_user";
var TEAM_USERS = [
  { slug: "gary", name: "Gary Berman" },
  { slug: "sam", name: "Sam" },
  { slug: "busi", name: "Busi Mntungwa" },
  { slug: "claire", name: "Claire Chrystal" },
  { slug: "donovan", name: "Donovan" }
];

function readUser() {
  try { var v = localStorage.getItem(USER_KEY); return v && TEAM_USERS.some(function (u) { return u.slug === v; }) ? v : ""; }
  catch (_) { return ""; }
}
function writeUser(slug) {
  try { localStorage.setItem(USER_KEY, slug); } catch (_) { /* non-fatal */ }
}

// Thread id generator: sortable + short + collision-safe enough for a
// per-user pool capped at 50. Timestamp base36 + 8 chars of random.
function newThreadId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Human-friendly relative timestamp for the Recent Conversations sidebar.
function fmtWhen(ms) {
  if (!ms) return "";
  var d = Date.now() - ms;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  if (d < 7 * 86400000) return Math.floor(d / 86400000) + "d ago";
  var dt = new Date(ms);
  return dt.toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
}

var STARTERS = [
  "New campaign for Chilla, R10k lifetime, B2B lead gen on Meta.",
  "What did we spend on MTN MoMo last week vs the week before?",
  "Pause every Learnalot ad set that spent more than R300 in the last 7 days at above R25 per lead.",
  "List every ad account and page I have access to right now."
];

var LOADERS = [
  "Working through it, no shortcuts",
  "Sami is thinking, which is billable",
  "Cross-referencing the accounts",
  "Pulling live numbers, no vibes",
  "Building the plan"
];

function readStoredToken() {
  try {
    var t = sessionStorage.getItem(TOKEN_KEY);
    var exp = parseInt(sessionStorage.getItem(TOKEN_EXP_KEY) || "0", 10);
    if (t && exp && Math.floor(Date.now() / 1000) < exp - 30) return { token: t, exp: exp };
  } catch (_) { /* sessionStorage unavailable */ }
  return null;
}
function storeToken(t, ttlSec) {
  var exp = Math.floor(Date.now() / 1000) + (ttlSec || 7200);
  try {
    sessionStorage.setItem(TOKEN_KEY, t);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(exp));
  } catch (_) { /* non-fatal */ }
  return exp;
}
function clearToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
  } catch (_) { /* non-fatal */ }
}

// ---- PIN gate ------------------------------------------------------------

function PinGate(props) {
  var P = props.P, ff = props.ff, fm = props.fm, apiBase = props.apiBase;
  var ps = useState(""), pin = ps[0], setPin = ps[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var ls = useState(false), loading = ls[0], setLoading = ls[1];

  var submit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;
    if (!pin) { setErr("Enter your PIN."); return; }
    setLoading(true); setErr("");
    fetch(apiBase + "/api/create/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin })
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (x) {
        if (!x.ok || !x.data || !x.data.token) {
          setErr((x.data && x.data.error) || "Invalid PIN.");
          setLoading(false); return;
        }
        setLoading(false);
        props.onAuthed(x.data.token, x.data.expiresIn);
      })
      .catch(function () { setErr("Network error. Try again."); setLoading(false); });
  };

  return <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
    <div style={{ maxWidth: 440, width: "100%", background: P.glass, border: "1px solid " + P.rule, borderRadius: 18, padding: "34px 32px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: P.ember, letterSpacing: 3, fontFamily: fm, textTransform: "uppercase", marginBottom: 8 }}>Sami · Campaign Hub</div>
      <div style={{ fontSize: 18, fontWeight: 900, color: P.txt, fontFamily: ff, marginBottom: 6 }}>Enter your PIN</div>
      <div style={{ fontSize: 12, color: P.label || P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 22 }}>
        Sami builds campaigns and makes real changes to live ad accounts. Every write is paused on creation and requires you to approve it. PIN gate keeps everyone but the team out.
      </div>
      <form onSubmit={submit}>
        <input type="password" inputMode="numeric" autoComplete="one-time-code" value={pin}
          onChange={function (e) { setPin(e.target.value); }} placeholder="Enter PIN"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 10, padding: "12px 16px", color: P.txt, fontSize: 16, fontFamily: fm, letterSpacing: 6, outline: "none", marginBottom: 14, textAlign: "center" }} />
        {err && <div style={{ fontSize: 11, color: P.critical || "#ef4444", fontFamily: fm, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", background: loading ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 10, padding: "12px 0", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: fm, letterSpacing: 2, cursor: loading ? "default" : "pointer" }}>
          {loading ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  </div>;
}

// ---- Name picker ---------------------------------------------------------
// One-time modal on first Sami Hub visit. Threads namespace by user so
// each AM sees only their own Recent Conversations. Team-only allowlist.

function NamePicker(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  return <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
    <div style={{ maxWidth: 480, width: "100%", background: P.glass, border: "1px solid " + P.rule, borderRadius: 18, padding: "30px 32px" }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: P.ember, letterSpacing: 3, fontFamily: fm, textTransform: "uppercase", marginBottom: 8 }}>Sami · Who's chatting?</div>
      <div style={{ fontSize: 13, color: P.label || P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 22 }}>
        Pick your name so Sami saves your conversations to your own Recent list. This stays in your browser and you can change it later from the sidebar.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {TEAM_USERS.map(function (u) {
          return <button key={u.slug} onClick={function () { props.onPick(u.slug); }}
            style={{ background: "rgba(249,98,3,0.06)", border: "1px solid rgba(249,98,3,0.28)", borderRadius: 12, padding: "14px 16px", color: P.txt, fontSize: 13, fontWeight: 700, fontFamily: ff, cursor: "pointer", textAlign: "left" }}>
            {u.name}
            <div style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm, marginTop: 3, letterSpacing: 1 }}>@{u.slug}</div>
          </button>;
        })}
      </div>
    </div>
  </div>;
}

// ---- Approval card --------------------------------------------------------
//
// Sami emits <APPROVAL_CARD>{...}</APPROVAL_CARD> blocks in her replies
// whenever a live write is proposed. The server parses them out and hands
// us structured records via response.cards. We render each as an
// interactive Approve/Reject card. Clicking sends 'APPROVED: <id>' or
// 'REJECTED: <id>' back to Sami as a user message so she executes (or
// asks how to adjust).

function ApprovalCard(props) {
  var card = props.card, P = props.P, ff = props.ff, fm = props.fm;
  var status = props.status || "pending"; // pending | approved | rejected
  var color = status === "approved" ? (P.mint || "#34D399")
    : status === "rejected" ? (P.critical || "#ef4444")
    : (P.solar || "#FFAA00");
  var kindColor = card.platform === "meta" ? "#4599FF"
    : card.platform === "tiktok" ? "#00F2EA"
    : card.platform === "google" ? "#34A853"
    : card.platform === "linkedin" ? "#0A66C2"
    : (P.solar || "#FFAA00");

  return <div style={{
    marginTop: 10, marginBottom: 4,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid " + color + "55",
    borderLeft: "4px solid " + color,
    borderRadius: 12, padding: "14px 16px",
    opacity: status === "rejected" ? 0.6 : 1
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 9, fontWeight: 900, color: kindColor, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", background: kindColor + "18", border: "1px solid " + kindColor + "44", borderRadius: 6, padding: "3px 8px" }}>
        {(card.platform || "action").toUpperCase()} · {(card.kind || "change").toUpperCase()}
      </span>
      <span style={{ fontSize: 9, fontWeight: 800, color: color, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginLeft: "auto" }}>
        {status === "approved" ? "✓ Approved" : status === "rejected" ? "✗ Rejected" : "Awaiting approval"}
      </span>
    </div>
    <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: ff, marginBottom: 6, lineHeight: 1.45 }}>{card.title || "Proposed change"}</div>
    {card.description && <div style={{ fontSize: 12, color: P.label || "#c9c1d5", fontFamily: ff, lineHeight: 1.6, marginBottom: 10, whiteSpace: "pre-wrap" }}>{card.description}</div>}
    {card.details && typeof card.details === "object" && Object.keys(card.details).length > 0 && <div style={{ marginBottom: 12, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 8, fontSize: 11, fontFamily: fm, color: P.txt, lineHeight: 1.7 }}>
      {Object.keys(card.details).map(function (k) {
        var v = card.details[k];
        var vs = (v && typeof v === "object") ? JSON.stringify(v) : String(v);
        return <div key={k} style={{ display: "flex", gap: 12 }}>
          <span style={{ color: P.caption || "#8B7FA3", minWidth: 120, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</span>
          <span style={{ flex: 1, wordBreak: "break-word" }}>{vs}</span>
        </div>;
      })}
    </div>}
    {status === "pending" && <div style={{ display: "flex", gap: 10 }}>
      <button onClick={function () { props.onApprove(card); }}
        style={{ background: "linear-gradient(135deg,#059669,#34D399)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        ✓ Approve
      </button>
      <button onClick={function () { props.onReject(card); }}
        style={{ background: "transparent", border: "1px solid " + (P.critical || "#ef4444") + "80", borderRadius: 8, padding: "9px 18px", color: P.critical || "#ef4444", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        ✗ Reject
      </button>
    </div>}
  </div>;
}

// ---- Connectors sidebar ---------------------------------------------------

function ConnectorsRail(props) {
  var P = props.P, ff = props.ff, fm = props.fm, apiBase = props.apiBase, token = props.token;
  var cs = useState({ loading: true, connectors: [], reason: null }), state = cs[0], setState = cs[1];

  useEffect(function () {
    if (!token) return;
    fetch(apiBase + "/api/nlp/connectors", { headers: { "Authorization": "Bearer " + token } })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (x) {
        setState({
          loading: false,
          connectors: (x.data && x.data.connectors) || [],
          reason: (x.data && x.data.reason) || null
        });
      })
      .catch(function () { setState({ loading: false, connectors: [], reason: "network_error" }); });
  }, [token, apiBase]);

  var itemStyle = { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, marginBottom: 4 };

  return <div style={{ padding: "16px 14px", height: "100%", overflowY: "auto" }}>
    <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10, opacity: 0.75 }}>Connectors</div>
    {state.loading && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 10px" }}>Checking...</div>}
    {!state.loading && state.connectors.length === 0 && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 10px", lineHeight: 1.55 }}>
      No connectors detected yet. {state.reason === "credentials_pending" ? "Data engine credentials not set." : "Try again shortly."}
    </div>}
    {!state.loading && state.connectors.map(function (c, i) {
      var dot = c.status === "connected" ? (P.mint || "#34D399") : (P.solar || "#FFAA00");
      return <div key={c.key || i} style={itemStyle}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flex: "0 0 auto", boxShadow: "0 0 8px " + dot + "80" }} />
        <span style={{ fontSize: 12, color: P.txt, fontFamily: ff, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.accountLabel ? (c.name + " · " + c.accountLabel) : c.name}>
          {c.name}
        </span>
      </div>;
    })}
  </div>;
}

// ---- Recent Conversations sidebar ---------------------------------------
// Renders the user's Redis-persisted thread list. Each row is
// click-to-load; hover reveals rename + delete buttons. Highlights the
// currently-active thread so the AM always knows which conversation
// they're in.

function RecentSidebar(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var threads = Array.isArray(props.threads) ? props.threads : [];
  var currentId = props.currentThreadId;
  var onOpen = props.onOpen, onDelete = props.onDelete, onRename = props.onRename;
  var hs = useState(null), hoverId = hs[0], setHoverId = hs[1];

  var handleRename = function (t) {
    var next = prompt("Rename this conversation:", t.title || "");
    if (next && next.trim() && next.trim() !== t.title) onRename(t.id, next.trim());
  };
  var handleDelete = function (t) {
    if (window.confirm("Delete '" + (t.title || "this conversation") + "'? This can't be undone.")) onDelete(t.id);
  };

  return <div style={{ padding: "6px 10px 12px" }}>
    <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, opacity: 0.75, padding: "0 4px" }}>Recent</div>
    {threads.length === 0 && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 6px", lineHeight: 1.55 }}>Conversations you have with Sami will appear here.</div>}
    {threads.map(function (t) {
      var active = t.id === currentId;
      var hovering = t.id === hoverId;
      return <div key={t.id} onMouseEnter={function () { setHoverId(t.id); }} onMouseLeave={function () { setHoverId(null); }}
        style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 8px", borderRadius: 8, marginBottom: 3,
          background: active ? "rgba(249,98,3,0.14)" : (hovering ? "rgba(255,255,255,0.03)" : "transparent"),
          border: active ? "1px solid rgba(249,98,3,0.35)" : "1px solid transparent",
          cursor: "pointer", transition: "background 0.15s ease"
        }}>
        <div onClick={function () { onOpen(t.id); }} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: active ? P.ember : P.txt, fontFamily: ff, fontWeight: active ? 800 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || "Untitled"}</div>
          <div style={{ fontSize: 9.5, color: P.caption || "#8B7FA3", fontFamily: fm, marginTop: 1 }}>
            {fmtWhen(t.updatedAt)} · {t.msgCount || 0} msg
          </div>
        </div>
        {hovering && <div style={{ display: "flex", gap: 2, flex: "0 0 auto" }}>
          <button onClick={function (e) { e.stopPropagation(); handleRename(t); }} title="Rename"
            style={{ background: "transparent", border: "1px solid " + (P.rule || "rgba(255,255,255,0.1)"), borderRadius: 5, padding: "3px 6px", color: P.sub, fontSize: 11, cursor: "pointer" }}>✎</button>
          <button onClick={function (e) { e.stopPropagation(); handleDelete(t); }} title="Delete"
            style={{ background: "transparent", border: "1px solid " + (P.rule || "rgba(255,255,255,0.1)"), borderRadius: 5, padding: "3px 6px", color: P.critical || "#ef4444", fontSize: 11, cursor: "pointer" }}>✕</button>
        </div>}
      </div>;
    })}
  </div>;
}

// ---- Main hub -------------------------------------------------------------

export default function CreateChatTab(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, apiBase = props.apiBase || "";
  var stored = readStoredToken();
  var ts = useState(stored ? stored.token : null), token = ts[0], setToken = ts[1];
  // User identity (per-user thread namespacing). Empty → NamePicker gate.
  var us = useState(readUser()), user = us[0], setUser = us[1];

  // Chat state
  var ms = useState([]), messages = ms[0], setMessages = ms[1];
  // Approval-card statuses keyed by card id: 'pending' | 'approved' | 'rejected'
  var cts = useState({}), cardStatus = cts[0], setCardStatus = cts[1];
  var is = useState(""), input = is[0], setInput = is[1];
  var bs = useState(false), busy = bs[0], setBusy = bs[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var qs = useState(0), quipIdx = qs[0], setQuipIdx = qs[1];
  var scrollRef = useRef(null);
  var inputRef = useRef(null);

  // Persistence state (Phase 2)
  var tids = useState(""), threadId = tids[0], setThreadId = tids[1]; // Current thread being edited
  var trs = useState([]), threads = trs[0], setThreads = trs[1];       // Sidebar list

  useEffect(function () {
    if (!busy) return;
    var id = setInterval(function () { setQuipIdx(function (i) { return (i + 1) % LOADERS.length; }); }, 2600);
    return function () { clearInterval(id); };
  }, [busy]);

  useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // ---- Thread persistence (Phase 2) --------------------------------------
  // Fetch the user's thread list on mount + whenever user changes. Kept
  // simple: one POST { op: "list" } and set state.
  var fetchThreads = function () {
    if (!token || !user) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "list", user: user })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.threads)) setThreads(d.threads); })
      .catch(function () { /* non-fatal, sidebar just stays empty */ });
  };
  useEffect(function () { fetchThreads(); }, [token, user]);

  // Save the current thread (upsert). Called after Sami's reply lands.
  var saveThread = function (id, msgs) {
    if (!token || !user || !id || !msgs || msgs.length === 0) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "save", user: user, threadId: id, messages: msgs })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.threads)) setThreads(d.threads); })
      .catch(function () { /* non-fatal — session continues, next save retries */ });
  };

  // Load a saved thread by id — replaces the current chat state.
  var openThread = function (id) {
    if (!token || !user || !id) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "get", user: user, threadId: id })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.thread) return;
        setMessages(Array.isArray(d.thread.messages) ? d.thread.messages : []);
        setThreadId(d.thread.id);
        setCardStatus({}); // Reset approval states; historic cards read as pending unless we tracked them.
        setErr("");
      })
      .catch(function () { setErr("Could not load that conversation."); });
  };

  var renameThread = function (id, title) {
    if (!token || !user || !id) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "rename", user: user, threadId: id, title: title })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.threads)) setThreads(d.threads); });
  };

  var deleteThread = function (id) {
    if (!token || !user || !id) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "delete", user: user, threadId: id })
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Array.isArray(d.threads)) setThreads(d.threads);
        // If the user deleted the thread they were sitting in, clear the pane
        if (id === threadId) { setMessages([]); setCardStatus({}); setThreadId(""); setInput(""); setErr(""); }
      });
  };

  // Send a user message + fetch Sami's reply. Handles both a plain text
  // send (from the composer or a starter) and an approval-response send
  // (from clicking Approve/Reject on a card). Auto-generates a threadId
  // on the first send of a fresh session, and persists the thread after
  // each Sami reply so Recent Conversations stays up to date.
  var send = function (text) {
    var content = String(text == null ? input : text).trim();
    if (!content || busy || !token) return;
    setErr("");
    // Auto-generate a threadId on the first message of a fresh session so
    // it can persist immediately without waiting for a Save button.
    var activeThreadId = threadId || newThreadId();
    if (!threadId) setThreadId(activeThreadId);
    var next = messages.concat([{ role: "user", content: content }]);
    setMessages(next);
    if (text == null) setInput("");
    setBusy(true);

    fetch(apiBase + "/api/nlp/sami-hub", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({
        messages: next.map(function (m) { return { role: m.role, content: m.content }; })
      })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
      .then(function (x) {
        setBusy(false);
        if (x.status === 401) {
          clearToken(); setToken(null);
          setErr("Your session expired. Enter the PIN again, the conversation is kept.");
          return;
        }
        if (!x.ok || !x.data) {
          setErr((x.data && x.data.error) || "Sami hit a problem answering. Try again.");
          return;
        }
        var samiTurn = {
          role: "assistant",
          content: x.data.reply || "",
          cards: Array.isArray(x.data.cards) ? x.data.cards : [],
          live: Array.isArray(x.data.actions) && x.data.actions.length > 0
        };
        var withReply = next.concat([samiTurn]);
        setMessages(withReply);
        // Seed each new card to pending status.
        if (samiTurn.cards.length > 0) {
          setCardStatus(function (cur) {
            var nextStatuses = Object.assign({}, cur);
            samiTurn.cards.forEach(function (c) { if (!nextStatuses[c.id]) nextStatuses[c.id] = "pending"; });
            return nextStatuses;
          });
        }
        // Persist the thread after Sami's reply so the sidebar updates
        // and a page refresh / cross-device resume finds this conversation.
        saveThread(activeThreadId, withReply);
      })
      .catch(function () { setBusy(false); setErr("Network error. Check your connection and try again."); });
  };

  var handleApprove = function (card) {
    if (busy) return;
    setCardStatus(function (cur) { var n = Object.assign({}, cur); n[card.id] = "approved"; return n; });
    send("APPROVED: " + card.id);
  };
  var handleReject = function (card) {
    if (busy) return;
    setCardStatus(function (cur) { var n = Object.assign({}, cur); n[card.id] = "rejected"; return n; });
    send("REJECTED: " + card.id);
  };

  var onKeyDown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // New task clears everything AND generates a fresh threadId so the next
  // send starts a new persisted thread instead of overwriting the last.
  var newTask = function () {
    setMessages([]); setCardStatus({}); setErr(""); setInput("");
    setThreadId(""); // Empty forces send() to mint a new id on next message
  };

  if (!token) {
    return <PinGate P={P} ff={ff} fm={fm} apiBase={apiBase}
      onAuthed={function (t, ttlSec) { storeToken(t, ttlSec); setToken(t); }} />;
  }
  // Second gate: pick your team-member identity so Sami threads namespace
  // per user. Shows once, persisted in localStorage.
  if (!user) {
    return <NamePicker P={P} ff={ff} fm={fm}
      onPick={function (slug) { writeUser(slug); setUser(slug); }} />;
  }

  var empty = messages.length === 0;

  return <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 0, minHeight: "78vh", background: P.glass, border: "1px solid " + P.rule, borderRadius: 18, overflow: "hidden" }}>
    {/* Left rail — connectors + New task */}
    <aside style={{ borderRight: "1px solid " + P.rule, background: "rgba(0,0,0,0.20)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "18px 14px 12px", borderBottom: "1px solid " + P.rule }}>
        <button onClick={newTask} style={{ width: "100%", background: "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 10, padding: "10px 14px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> New task
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <ConnectorsRail P={P} ff={ff} fm={fm} apiBase={apiBase} token={token} />
        {/* Phase 2 addition: Recent Conversations. User-scoped, click any
            row to load its full history back into the main chat. */}
        <div style={{ marginTop: 4, borderTop: "1px solid " + P.rule, paddingTop: 8 }}>
          <RecentSidebar P={P} ff={ff} fm={fm}
            threads={threads} currentThreadId={threadId}
            onOpen={openThread} onDelete={deleteThread} onRename={renameThread} />
        </div>
      </div>
      <div style={{ padding: "10px 14px", borderTop: "1px solid " + P.rule, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.35 }}>
          <span style={{ fontSize: 10, color: P.txt, fontFamily: fm, fontWeight: 700 }}>{(TEAM_USERS.find(function (u) { return u.slug === user; }) || {}).name || user}</span>
          <span style={{ fontSize: 8, color: P.caption || "#8B7FA3", fontFamily: fm, letterSpacing: 1, textTransform: "uppercase" }}>@{user}</span>
        </div>
        <button onClick={function () { writeUser(""); setUser(""); }} title="Switch to a different team member"
          style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 6, padding: "4px 8px", color: P.dim || P.sub, fontSize: 9, fontWeight: 700, fontFamily: fm, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" }}>
          Switch
        </button>
      </div>
    </aside>

    {/* Main pane — chat */}
    <section style={{ display: "flex", flexDirection: "column", height: "78vh" }}>
      <header style={{ padding: "14px 22px", borderBottom: "1px solid " + P.rule, display: "flex", alignItems: "center", gap: 10 }}>
        {Ic && Ic.bolt ? Ic.bolt(P.ember, 18) : null}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: P.txt, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase" }}>Sami · Campaign Hub</div>
          <div style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm, letterSpacing: 0.5 }}>Plan, brief and build live campaigns. Every write is paused and awaits your approval.</div>
        </div>
      </header>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "22px 26px 12px", display: "flex", flexDirection: "column", gap: 14 }}>
        {empty && <div style={{ padding: "12px 4px 4px" }}>
          <div style={{ fontSize: 14, color: P.txt, fontFamily: ff, fontWeight: 700, marginBottom: 6 }}>What are we building?</div>
          <div style={{ fontSize: 12, color: P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 18 }}>Tell Sami the client, objective, budget and dates in one message. She will ask for anything else she needs.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STARTERS.map(function (s, i) {
              return <button key={i} onClick={function () { send(s); }}
                style={{ background: "rgba(249,98,3,0.06)", border: "1px solid rgba(249,98,3,0.20)", borderRadius: 10, padding: "10px 14px", color: P.txt, fontSize: 12, fontFamily: ff, cursor: "pointer", textAlign: "left", lineHeight: 1.55 }}>
                {s}
              </button>;
            })}
          </div>
        </div>}

        {messages.map(function (m, i) {
          if (m.role === "user") {
            var isAppr = /^APPROVED: /.test(m.content);
            var isRej = /^REJECTED: /.test(m.content);
            return <div key={i} style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
              <div style={{
                background: isAppr ? "rgba(52,211,153,0.13)" : isRej ? "rgba(239,68,68,0.13)" : "rgba(249,98,3,0.13)",
                border: "1px solid " + (isAppr ? "rgba(52,211,153,0.35)" : isRej ? "rgba(239,68,68,0.35)" : "rgba(249,98,3,0.3)"),
                borderRadius: "14px 14px 4px 14px", padding: "10px 14px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.6, whiteSpace: "pre-wrap"
              }}>{m.content}</div>
            </div>;
          }
          return <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%", width: "88%" }}>
            {m.content && <div style={{ background: "rgba(30,18,50,0.85)", border: "1px solid " + P.rule, borderRadius: "14px 14px 14px 4px", padding: "13px 16px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.content}</div>}
            {Array.isArray(m.cards) && m.cards.map(function (c) {
              return <ApprovalCard key={c.id} card={c} P={P} ff={ff} fm={fm}
                status={cardStatus[c.id] || "pending"}
                onApprove={handleApprove} onReject={handleReject} />;
            })}
            {m.live && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 9, fontWeight: 700, color: P.mint || "#34D399", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.mint || "#34D399" }} />
              Live engine
            </div>}
          </div>;
        })}

        {busy && <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12, padding: "6px 2px" }}>
          <div style={{ width: 16, height: 16, border: "2px solid " + P.rule, borderTopColor: P.ember, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 11, color: P.sub, fontFamily: fm, letterSpacing: 0.5 }}>{LOADERS[quipIdx]}</span>
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </div>}
      </div>

      {err && <div style={{ margin: "0 22px 10px", padding: "9px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, fontSize: 11, color: P.critical || "#ef4444", fontFamily: fm }}>{err}</div>}

      <div style={{ borderTop: "1px solid " + P.rule, padding: "14px 22px", display: "flex", gap: 12, alignItems: "flex-end" }}>
        <textarea ref={inputRef} value={input}
          onChange={function (e) { setInput(e.target.value); }} onKeyDown={onKeyDown} rows={2}
          placeholder="Ask Sami anything. Describe the campaign to build, or hit New task to reset."
          style={{ flex: 1, resize: "none", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 12, padding: "11px 14px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.55, outline: "none" }} />
        <button onClick={function () { send(); }} disabled={busy || !input.trim()}
          style={{ background: (busy || !input.trim()) ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 12, padding: "12px 20px", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: (busy || !input.trim()) ? "default" : "pointer", textTransform: "uppercase" }}>
          Send
        </button>
      </div>
    </section>
  </div>;
}
