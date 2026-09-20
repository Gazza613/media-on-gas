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

var GUIDED_SKILL_ID = "guided-campaign-build";

// Fallback prompt used when the skills list has not finished loading
// yet. Sami's system prompt + the seeded skill carry the full checklist;
// this short trigger message asks her to run it.
var GUIDED_FALLBACK_PROMPT = "Run the GAS Guided Campaign Build. Walk me through every material campaign question one at a time, then emit a single PLAN_CARD covering every write to launch.";

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
  // Audit fix #4: user identity is included in the PIN request so the
  // token is signed against a specific team member. Parent guarantees a
  // valid user is set before rendering PinGate.
  var user = props.user;
  var ps = useState(""), pin = ps[0], setPin = ps[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var ls = useState(false), loading = ls[0], setLoading = ls[1];

  var submit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    if (loading) return;
    if (!pin) { setErr("Enter your PIN."); return; }
    if (!user) { setErr("Pick your team-member identity first."); return; }
    setLoading(true); setErr("");
    fetch(apiBase + "/api/create/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin, user: user })
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

// ---- Plan card (audit fix #6, batched approval) --------------------------
//
// Sami emits <PLAN_CARD>{...}</PLAN_CARD> when a single brief requires 3+
// related writes (typical: campaign + ad set + N ads for a new launch).
// The AM approves the whole plan once; the GAS engine authorises every
// child write via a single Redis pass. Rejecting halts the entire plan.

function PlanCard(props) {
  var card = props.card, P = props.P, ff = props.ff, fm = props.fm;
  var status = props.status || "pending";
  var color = status === "approved" ? (P.mint || "#34D399")
    : status === "rejected" ? (P.critical || "#ef4444")
    : "#B085FF";
  var writeCount = Array.isArray(card.plan) ? card.plan.length : 0;

  return <div style={{
    marginTop: 10, marginBottom: 4,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid " + color + "55",
    borderLeft: "4px solid " + color,
    borderRadius: 12, padding: "14px 16px",
    opacity: status === "rejected" ? 0.6 : 1
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 9, fontWeight: 900, color: "#B085FF", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", background: "rgba(176,133,255,0.14)", border: "1px solid rgba(176,133,255,0.35)", borderRadius: 6, padding: "3px 8px" }}>
        Plan · {writeCount} write{writeCount === 1 ? "" : "s"}
      </span>
      <span style={{ fontSize: 9, fontWeight: 800, color: color, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginLeft: "auto" }}>
        {status === "approved" ? "✓ Plan approved" : status === "rejected" ? "✗ Plan rejected" : "Awaiting plan approval"}
      </span>
    </div>
    <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: ff, marginBottom: 6, lineHeight: 1.45 }}>{card.title || "Proposed plan"}</div>
    {card.description && <div style={{ fontSize: 12, color: P.label || "#c9c1d5", fontFamily: ff, lineHeight: 1.6, marginBottom: 12, whiteSpace: "pre-wrap" }}>{card.description}</div>}
    {writeCount > 0 && <div style={{ marginBottom: 12, padding: "8px 10px", background: "rgba(0,0,0,0.25)", borderRadius: 8, fontSize: 11, fontFamily: fm, color: P.txt, lineHeight: 1.7, maxHeight: 260, overflowY: "auto" }}>
      {card.plan.map(function (child, i) {
        var kColor = child.platform === "meta" ? "#4599FF"
          : child.platform === "tiktok" ? "#00F2EA"
          : child.platform === "google" ? "#34A853"
          : child.platform === "linkedin" ? "#0A66C2"
          : (P.solar || "#FFAA00");
        return <div key={child.id || i} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0", borderBottom: i < writeCount - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
          <span style={{ color: P.caption || "#8B7FA3", minWidth: 22, textAlign: "right", fontSize: 10 }}>{i + 1}.</span>
          <span style={{ color: kColor, fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", minWidth: 108 }}>{(child.platform || "").toUpperCase()} · {(child.kind || "").toUpperCase()}</span>
          <span style={{ flex: 1, color: P.txt, wordBreak: "break-word" }}>{child.title || child.id}</span>
        </div>;
      })}
    </div>}
    {status === "pending" && <div style={{ display: "flex", gap: 10 }}>
      <button onClick={function () { props.onApprove(card); }}
        style={{ background: "linear-gradient(135deg,#059669,#34D399)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        ✓ Approve all {writeCount} writes
      </button>
      <button onClick={function () { props.onReject(card); }}
        style={{ background: "transparent", border: "1px solid " + (P.critical || "#ef4444") + "80", borderRadius: 8, padding: "9px 18px", color: P.critical || "#ef4444", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        ✗ Reject plan
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

  // CSS-fix 2026-09-19: removed height:100% + overflowY:auto that was
  // filling the entire middle scroll area and pushing the RecentSidebar
  // sibling below the fold. Parent aside handles overflow.
  return <div style={{ padding: "16px 14px 8px" }}>
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

// ---- Skills panel (Phase 4) ---------------------------------------------
// Left-rail section listing reusable prompt patterns fetched from
// /api/nlp/sami-skills. Clicking a skill injects its prompt text into
// the chat composer for Sami to react to. Team-shared — every AM sees
// the same list.

function SkillsPanel(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var skills = Array.isArray(props.skills) ? props.skills : [];
  var onInject = props.onInject, onManage = props.onManage;
  var hs = useState(null), hoverId = hs[0], setHoverId = hs[1];
  return <div style={{ padding: "6px 10px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 6px" }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", opacity: 0.75 }}>Skills</div>
      <button onClick={onManage} title="Add / edit / delete skills"
        style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "2px 7px", color: P.dim || P.sub, fontSize: 9, fontWeight: 800, fontFamily: fm, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" }}>Manage</button>
    </div>
    {skills.length === 0 && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 6px", lineHeight: 1.55 }}>No skills saved yet.</div>}
    {skills.map(function (s) {
      var hovering = hoverId === s.id;
      return <div key={s.id} onClick={function () { onInject(s); }}
        onMouseEnter={function () { setHoverId(s.id); }} onMouseLeave={function () { setHoverId(null); }}
        title={s.description || s.prompt}
        style={{ padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer", background: hovering ? "rgba(255,255,255,0.03)" : "transparent" }}>
        <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</div>
        {s.description && <div style={{ fontSize: 9.5, color: P.caption || "#8B7FA3", fontFamily: fm, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.description}</div>}
      </div>;
    })}
  </div>;
}

// ---- Memory panel (Phase 4) ---------------------------------------------
// Shows a compact list of clients that have saved memory, click one to
// open the manage modal. Memory injection happens server-side; this
// panel is just visibility + editing.

function MemoryPanel(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var clients = Array.isArray(props.clients) ? props.clients : [];
  var onOpen = props.onOpen, onManage = props.onManage;
  return <div style={{ padding: "6px 10px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 6px" }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", opacity: 0.75 }}>Memory</div>
      <button onClick={onManage} title="View or edit per-client memory notes"
        style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "2px 7px", color: P.dim || P.sub, fontSize: 9, fontWeight: 800, fontFamily: fm, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" }}>Manage</button>
    </div>
    {clients.length === 0 && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 6px", lineHeight: 1.55 }}>Ask Sami to "remember that Chilla ..." and it will appear here.</div>}
    {clients.slice(0, 6).map(function (c) {
      return <div key={c.slug} onClick={function () { onOpen(c); }}
        style={{ padding: "6px 8px", borderRadius: 8, marginBottom: 2, cursor: "pointer" }} title={"Open " + c.name + " memory"}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
          <div style={{ fontSize: 9, color: P.caption || "#8B7FA3", fontFamily: fm }}>{c.noteCount || 0}</div>
        </div>
      </div>;
    })}
  </div>;
}

// ---- Scheduled strip (Phase 4) ------------------------------------------
// Small compact list of the next 3 upcoming automated tasks (crons +
// any Redis-tracked extras). Read-only, informational.

function ScheduledStrip(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var items = Array.isArray(props.items) ? props.items : [];
  var fmtWhen = function (iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    var delta = d.getTime() - Date.now();
    if (delta < 3600 * 1000) return Math.max(1, Math.floor(delta / 60000)) + "m";
    if (delta < 86400 * 1000) return Math.floor(delta / 3600000) + "h";
    return Math.floor(delta / 86400000) + "d";
  };
  return <div style={{ padding: "6px 10px 12px" }}>
    <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, opacity: 0.75, padding: "0 4px" }}>Scheduled</div>
    {items.length === 0 && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 6px" }}>No scheduled tasks.</div>}
    {items.slice(0, 5).map(function (t, i) {
      return <div key={i} title={t.description || t.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 6px", borderRadius: 6, marginBottom: 2 }}>
        <div style={{ fontSize: 11, color: P.txt, fontFamily: ff, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.label}</div>
        <div style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm, flex: "0 0 auto", marginLeft: 6 }}>in {fmtWhen(t.nextRunIso)}</div>
      </div>;
    })}
  </div>;
}

// ---- Skills / Memory management modals ----------------------------------

function SkillsModal(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var skills = Array.isArray(props.skills) ? props.skills : [];
  var draft = props.draft || { id: "", label: "", description: "", prompt: "" };
  var setDraft = props.setDraft;
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={props.onClose}>
    <div onClick={function (e) { e.stopPropagation(); }} style={{ maxWidth: 720, width: "100%", maxHeight: "85vh", overflowY: "auto", background: "#0d0520", border: "1px solid " + P.rule, borderRadius: 18, padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: P.ember, letterSpacing: 3, fontFamily: fm, textTransform: "uppercase" }}>Skills library</div>
        <button onClick={props.onClose} style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 6, padding: "4px 10px", color: P.sub, fontSize: 10, fontWeight: 700, fontFamily: fm, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" }}>Close</button>
      </div>
      <div style={{ fontSize: 12, color: P.label || "#c9c1d5", fontFamily: ff, marginBottom: 16, lineHeight: 1.6 }}>Team-shared reusable prompts. Anyone can add, edit, or delete.</div>

      <div style={{ marginBottom: 20, padding: "12px 14px", background: "rgba(249,98,3,0.04)", border: "1px solid rgba(249,98,3,0.22)", borderRadius: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: P.ember, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>{draft.id ? "Edit skill" : "Add new skill"}</div>
        <input value={draft.label || ""} onChange={function (e) { setDraft(Object.assign({}, draft, { label: e.target.value })); }} placeholder="Short label (e.g. 'Draft a B2B lead campaign')"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px 12px", color: P.txt, fontSize: 12, fontFamily: ff, marginBottom: 8, outline: "none" }} />
        <input value={draft.description || ""} onChange={function (e) { setDraft(Object.assign({}, draft, { description: e.target.value })); }} placeholder="One-line description (optional)"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px 12px", color: P.txt, fontSize: 12, fontFamily: ff, marginBottom: 8, outline: "none" }} />
        <textarea value={draft.prompt || ""} onChange={function (e) { setDraft(Object.assign({}, draft, { prompt: e.target.value })); }} rows={5} placeholder="The full prompt Sami sees when the team clicks this skill"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 8, padding: "9px 12px", color: P.txt, fontSize: 12, fontFamily: ff, resize: "vertical", outline: "none", lineHeight: 1.55 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={props.onSave} disabled={!draft.label || !draft.prompt}
            style={{ background: (!draft.label || !draft.prompt) ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: (!draft.label || !draft.prompt) ? "default" : "pointer", textTransform: "uppercase" }}>
            {draft.id ? "Save changes" : "Add skill"}
          </button>
          {draft.id && <button onClick={function () { setDraft({ id: "", label: "", description: "", prompt: "" }); }}
            style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px 14px", color: P.sub, fontSize: 11, fontWeight: 700, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>Cancel</button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {skills.map(function (s) {
          return <div key={s.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid " + P.rule, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: P.txt, fontFamily: ff, marginBottom: 3 }}>{s.label}</div>
                {s.description && <div style={{ fontSize: 11, color: P.label || "#c9c1d5", fontFamily: ff, marginBottom: 6, lineHeight: 1.5 }}>{s.description}</div>}
                <div style={{ fontSize: 10.5, color: P.caption || "#8B7FA3", fontFamily: fm, lineHeight: 1.55, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{s.prompt}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                <button onClick={function () { setDraft({ id: s.id, label: s.label, description: s.description || "", prompt: s.prompt }); }}
                  style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "3px 8px", color: P.sub, fontSize: 10, cursor: "pointer" }}>Edit</button>
                <button onClick={function () { if (window.confirm("Delete '" + s.label + "'?")) props.onDelete(s.id); }}
                  style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "3px 8px", color: P.critical || "#ef4444", fontSize: 10, cursor: "pointer" }}>Delete</button>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

function MemoryModal(props) {
  var P = props.P, ff = props.ff, fm = props.fm;
  var client = props.client;
  if (!client) return null;
  var draft = props.draft || { id: "", label: "", value: "" };
  var setDraft = props.setDraft;
  var notes = Array.isArray(client.notes) ? client.notes : [];
  return <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={props.onClose}>
    <div onClick={function (e) { e.stopPropagation(); }} style={{ maxWidth: 720, width: "100%", maxHeight: "85vh", overflowY: "auto", background: "#0d0520", border: "1px solid " + P.rule, borderRadius: 18, padding: "22px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: P.ember, letterSpacing: 3, fontFamily: fm, textTransform: "uppercase" }}>{client.name} · Memory</div>
          <div style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm, marginTop: 3 }}>@{client.slug} · {notes.length} note{notes.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={props.onClose} style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 6, padding: "4px 10px", color: P.sub, fontSize: 10, fontWeight: 700, fontFamily: fm, letterSpacing: 1, cursor: "pointer", textTransform: "uppercase" }}>Close</button>
      </div>

      <div style={{ marginBottom: 20, padding: "12px 14px", background: "rgba(249,98,3,0.04)", border: "1px solid rgba(249,98,3,0.22)", borderRadius: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: P.ember, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>{draft.id ? "Edit note" : "Add note"}</div>
        <input value={draft.label || ""} onChange={function (e) { setDraft(Object.assign({}, draft, { label: e.target.value })); }} placeholder="Short label (e.g. 'Standard budget', 'WhatsApp destination')"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px 12px", color: P.txt, fontSize: 12, fontFamily: ff, marginBottom: 8, outline: "none" }} />
        <textarea value={draft.value || ""} onChange={function (e) { setDraft(Object.assign({}, draft, { value: e.target.value })); }} rows={3} placeholder="Full note text (Sami sees this verbatim when the client is mentioned)"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 8, padding: "9px 12px", color: P.txt, fontSize: 12, fontFamily: ff, resize: "vertical", outline: "none", lineHeight: 1.55 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={props.onSaveNote} disabled={!draft.label || !draft.value}
            style={{ background: (!draft.label || !draft.value) ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 8, padding: "8px 18px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: (!draft.label || !draft.value) ? "default" : "pointer", textTransform: "uppercase" }}>
            {draft.id ? "Save note" : "Add note"}
          </button>
          {draft.id && <button onClick={function () { setDraft({ id: "", label: "", value: "" }); }}
            style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px 14px", color: P.sub, fontSize: 11, fontWeight: 700, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>Cancel</button>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.map(function (n) {
          return <div key={n.id} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid " + P.rule, borderRadius: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: P.solar || "#FFAA00", fontFamily: fm, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{n.label}</div>
                <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{n.value}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                <button onClick={function () { setDraft({ id: n.id, label: n.label, value: n.value }); }}
                  style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "3px 8px", color: P.sub, fontSize: 10, cursor: "pointer" }}>Edit</button>
                <button onClick={function () { if (window.confirm("Delete '" + n.label + "'?")) props.onDeleteNote(n.id); }}
                  style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 5, padding: "3px 8px", color: P.critical || "#ef4444", fontSize: 10, cursor: "pointer" }}>Delete</button>
              </div>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
}

// ---- Creative pair card (Phase 3) ---------------------------------------
// Rendered when Sami emits a <CREATIVE_PAIR_CARD> block after walking a
// Drive/Dropbox folder. Shows the paired concepts as a grid of 1:1 +
// 9:16 thumbnails, plus small warning strips for square-only and
// vertical-only files. The user clicks Pairs OK to confirm the grouping
// (posts PAIRS_OK: <id> back to Sami) or types free-language corrections
// (e.g. "pair Menu_03_v2 with Menu_03_9x16 instead") to reassign.

function CreativePairCard(props) {
  var card = props.card, P = props.P, ff = props.ff, fm = props.fm;
  var status = props.status || "pending"; // pending | confirmed
  var accent = P.li || "#0A66C2"; // Reuse LinkedIn brand accent for a distinct "assets" look

  var pairs = Array.isArray(card.pairs) ? card.pairs : [];
  var sqOnly = Array.isArray(card.squareOnly) ? card.squareOnly : [];
  var vOnly = Array.isArray(card.verticalOnly) ? card.verticalOnly : [];

  var thumb = function (file, aspect) {
    if (!file) return <div style={{ background: "rgba(255,255,255,0.04)", border: "1px dashed " + P.rule, borderRadius: 6, aspectRatio: aspect === "9x16" ? "9/16" : "1/1", display: "flex", alignItems: "center", justifyContent: "center", color: P.caption || "#8B7FA3", fontSize: 9, fontFamily: fm }}>Missing</div>;
    return <div style={{ background: "#0a1830", border: "1px solid " + accent + "33", borderRadius: 6, overflow: "hidden", aspectRatio: aspect === "9x16" ? "9/16" : "1/1", position: "relative" }}>
      {file.url
        ? <img src={file.url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={function (e) { e.currentTarget.style.display = "none"; }} />
        : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: P.caption || "#8B7FA3", fontSize: 9, fontFamily: fm }}>No preview</div>
      }
      <div style={{ position: "absolute", bottom: 2, left: 2, right: 2, fontSize: 7.5, color: "#fff", fontFamily: fm, fontWeight: 800, letterSpacing: 0.5, textAlign: "center", textShadow: "0 1px 2px rgba(0,0,0,0.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{aspect}</div>
    </div>;
  };

  return <div style={{
    marginTop: 10, marginBottom: 4,
    background: "rgba(255,255,255,0.02)",
    border: "1px solid " + accent + "55",
    borderLeft: "4px solid " + accent,
    borderRadius: 12, padding: "14px 16px"
  }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
      <span style={{ fontSize: 9, fontWeight: 900, color: accent, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", background: accent + "18", border: "1px solid " + accent + "44", borderRadius: 6, padding: "3px 8px" }}>
        CREATIVE · {pairs.length} PAIR{pairs.length === 1 ? "" : "S"}
      </span>
      {card.source && <span style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm }}>{card.source}</span>}
      <span style={{ fontSize: 9, fontWeight: 800, color: status === "confirmed" ? (P.mint || "#34D399") : (P.solar || "#FFAA00"), fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginLeft: "auto" }}>
        {status === "confirmed" ? "✓ Pairs confirmed" : "Confirm pairing"}
      </span>
    </div>
    {card.title && <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: ff, marginBottom: 10, lineHeight: 1.45 }}>{card.title}</div>}

    {pairs.length > 0 && <div style={{ marginBottom: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
        {pairs.map(function (pr, i) {
          return <div key={i} style={{ background: "rgba(0,0,0,0.20)", border: "1px solid " + P.rule, borderRadius: 8, padding: "8px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 0.6fr", gap: 6, marginBottom: 6 }}>
              {thumb(pr.square, "1x1")}
              {thumb(pr.vertical, "9x16")}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: P.txt, fontFamily: fm, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={pr.concept}>{pr.concept || "Unnamed pair"}</div>
          </div>;
        })}
      </div>
    </div>}

    {sqOnly.length > 0 && <div style={{ marginTop: 8, padding: "6px 10px", background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.35)", borderRadius: 6, fontSize: 10.5, color: P.txt, fontFamily: fm, lineHeight: 1.55 }}>
      <strong style={{ color: P.solar || "#FFAA00" }}>{sqOnly.length} square-only</strong> — will run on Feed placements only: {sqOnly.map(function (f) { return f.name; }).slice(0, 5).join(", ")}{sqOnly.length > 5 ? ", …" : ""}
    </div>}
    {vOnly.length > 0 && <div style={{ marginTop: 6, padding: "6px 10px", background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.35)", borderRadius: 6, fontSize: 10.5, color: P.txt, fontFamily: fm, lineHeight: 1.55 }}>
      <strong style={{ color: P.solar || "#FFAA00" }}>{vOnly.length} vertical-only</strong> — will run on Stories / Reels / WhatsApp Status only: {vOnly.map(function (f) { return f.name; }).slice(0, 5).join(", ")}{vOnly.length > 5 ? ", …" : ""}
    </div>}

    {status !== "confirmed" && <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
      <button onClick={function () { props.onConfirm(card); }}
        style={{ background: "linear-gradient(135deg,#0A66C2,#4599FF)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        ✓ Pairs look right, proceed
      </button>
      <span style={{ fontSize: 10, color: P.caption || "#8B7FA3", fontFamily: fm, alignSelf: "center", lineHeight: 1.5 }}>
        or type below to reassign specific pairs (e.g. "swap Menu_03 vertical for the v2 version")
      </span>
    </div>}
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
  var errorText = props.errorText || "";
  var hs = useState(null), hoverId = hs[0], setHoverId = hs[1];

  var handleRename = function (t) {
    var next = prompt("Rename this conversation:", t.title || "");
    if (next && next.trim() && next.trim() !== t.title) onRename(t.id, next.trim());
  };
  var handleDelete = function (t) {
    if (window.confirm("Delete '" + (t.title || "this conversation") + "'? This can't be undone.")) onDelete(t.id);
  };

  return <div style={{ padding: "6px 10px 12px" }}>
    <div style={{ fontSize: 9, fontWeight: 900, color: P.label || "#c9c1d5", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8, opacity: 0.75, padding: "0 4px" }}>Recent · {threads.length}</div>
    {/* Surface any load/save error so the user sees Redis / auth issues
        rather than assuming Sami just didn't save. */}
    {errorText && <div style={{ fontSize: 10, color: P.critical || "#ef4444", fontFamily: fm, padding: "6px 8px", marginBottom: 6, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, lineHeight: 1.45 }}>
      Thread load/save error: {errorText}
    </div>}
    {threads.length === 0 && !errorText && <div style={{ fontSize: 11, color: P.caption || "#8B7FA3", fontFamily: fm, padding: "6px 6px", lineHeight: 1.55 }}>Conversations you have with Sami will appear here.</div>}
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
  // Creative-pair-card statuses keyed by card id: 'pending' | 'confirmed'
  var pcs = useState({}), pairStatus = pcs[0], setPairStatus = pcs[1];
  // Audit fix #6: PLAN_CARD statuses keyed by plan id.
  var pls = useState({}), planStatus = pls[0], setPlanStatus = pls[1];
  var is = useState(""), input = is[0], setInput = is[1];
  var bs = useState(false), busy = bs[0], setBusy = bs[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var qs = useState(0), quipIdx = qs[0], setQuipIdx = qs[1];
  var scrollRef = useRef(null);
  var inputRef = useRef(null);

  // Persistence state (Phase 2)
  var tids = useState(""), threadId = tids[0], setThreadId = tids[1]; // Current thread being edited
  var trs = useState([]), threads = trs[0], setThreads = trs[1];       // Sidebar list
  var thErr = useState(""), threadErr = thErr[0], setThreadErr = thErr[1]; // Load/save error banner

  // Phase 4 state — Skills / Memory / Scheduled
  var sks = useState([]), skills = sks[0], setSkills = sks[1];
  var mcs = useState([]), memoryClients = mcs[0], setMemoryClients = mcs[1];
  var scs = useState([]), scheduled = scs[0], setScheduled = scs[1];
  var smd = useState(false), skillsModalOpen = smd[0], setSkillsModalOpen = smd[1];
  var mmd = useState(null), memoryModalClient = mmd[0], setMemoryModalClient = mmd[1]; // full client record or null
  var sdr = useState({ id: "", label: "", description: "", prompt: "" }), skillDraft = sdr[0], setSkillDraft = sdr[1];
  var ndr = useState({ id: "", label: "", value: "" }), noteDraft = ndr[0], setNoteDraft = ndr[1];

  useEffect(function () {
    if (!busy) return;
    var id = setInterval(function () { setQuipIdx(function (i) { return (i + 1) % LOADERS.length; }); }, 2600);
    return function () { clearInterval(id); };
  }, [busy]);

  useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  // ---- Thread persistence (Phase 2) --------------------------------------
  // Fetch the user's thread list on mount + whenever user changes.
  // Surfaces errors to the sidebar banner AND the browser console so
  // we can trace persistence issues (see project_sami_hub_rebuild note
  // on Redis failure modes).
  var fetchThreads = function () {
    if (!token || !user) return;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "list", user: user })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
      .then(function (x) {
        try { console.log("[sami-threads] list", user, x.status, x.data); } catch (_) {}
        if (!x.ok) {
          setThreadErr(((x.data && x.data.error) || "list failed") + " (status " + x.status + ")");
          return;
        }
        setThreadErr("");
        if (Array.isArray(x.data.threads)) setThreads(x.data.threads);
      })
      .catch(function (e) {
        try { console.error("[sami-threads] list network error", e); } catch (_) {}
        setThreadErr("network error: " + (e && e.message || e));
      });
  };
  useEffect(function () { fetchThreads(); }, [token, user]);

  // Save the current thread (upsert). Called after Sami's reply lands
  // and whenever an approval/rejection changes card state. Errors get
  // logged AND surface in the sidebar banner so a silent Redis failure
  // can't happen invisibly again.
  //
  // Audit fix #7: cardStatus / pairStatus are persisted alongside
  // messages so a page reload restores approved / rejected cards
  // instead of showing them as pending (which would let a re-click
  // fire the write again, defeating the nonce + idempotency guards).
  // The caller may pass explicit override objects when the current
  // state closure is stale (e.g. inside a setState callback).
  var saveThread = function (id, msgs, opts) {
    if (!token || !user || !id || !msgs || msgs.length === 0) return;
    opts = opts || {};
    var csOverride = opts.cardStatus !== undefined ? opts.cardStatus : cardStatus;
    var psOverride = opts.pairStatus !== undefined ? opts.pairStatus : pairStatus;
    var planOverride = opts.planStatus !== undefined ? opts.planStatus : planStatus;
    fetch(apiBase + "/api/nlp/sami-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "save", user: user, threadId: id, messages: msgs, cardStatus: csOverride, pairStatus: psOverride, planStatus: planOverride })
    })
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); })
      .then(function (x) {
        try { console.log("[sami-threads] save", user, id, x.status, "->", (x.data && x.data.threads && x.data.threads.length) || 0, "threads"); } catch (_) {}
        if (!x.ok) {
          setThreadErr(((x.data && x.data.error) || "save failed") + " (status " + x.status + ")");
          return;
        }
        setThreadErr("");
        if (Array.isArray(x.data.threads)) setThreads(x.data.threads);
      })
      .catch(function (e) {
        try { console.error("[sami-threads] save network error", e); } catch (_) {}
        setThreadErr("save network error: " + (e && e.message || e));
      });
  };

  // Load a saved thread by id — replaces the current chat state.
  // Audit fix #7: restore persisted cardStatus / pairStatus so an
  // approved card reads as approved (not pending) after reload.
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
        setCardStatus((d.thread.cardStatus && typeof d.thread.cardStatus === "object") ? d.thread.cardStatus : {});
        setPairStatus((d.thread.pairStatus && typeof d.thread.pairStatus === "object") ? d.thread.pairStatus : {});
        setPlanStatus((d.thread.planStatus && typeof d.thread.planStatus === "object") ? d.thread.planStatus : {});
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

  // ---- Phase 4 fetchers (skills / memory / scheduled) ---
  var fetchSkills = function () {
    if (!token) return;
    fetch(apiBase + "/api/nlp/sami-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "list" })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.skills)) setSkills(d.skills); })
      .catch(function () { /* non-fatal */ });
  };
  var fetchMemoryClients = function () {
    if (!token || !user) return;
    fetch(apiBase + "/api/nlp/sami-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "list", user: user })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.clients)) setMemoryClients(d.clients); })
      .catch(function () { /* non-fatal */ });
  };
  var fetchScheduled = function () {
    if (!token) return;
    fetch(apiBase + "/api/nlp/sami-scheduled", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.scheduled)) setScheduled(d.scheduled); })
      .catch(function () { /* non-fatal */ });
  };
  useEffect(function () { fetchSkills(); fetchMemoryClients(); fetchScheduled(); }, [token, user]);

  var saveSkill = function () {
    if (!token || !skillDraft.label || !skillDraft.prompt) return;
    fetch(apiBase + "/api/nlp/sami-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "save", user: user, skill: skillDraft })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && Array.isArray(d.skills)) setSkills(d.skills);
        setSkillDraft({ id: "", label: "", description: "", prompt: "" });
      });
  };
  var deleteSkill = function (id) {
    if (!token || !id) return;
    fetch(apiBase + "/api/nlp/sami-skills", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "delete", id: id })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && Array.isArray(d.skills)) setSkills(d.skills); });
  };
  var injectSkill = function (skill) {
    if (!skill || !skill.prompt) return;
    setInput(skill.prompt);
    if (inputRef.current) inputRef.current.focus();
  };

  var openMemoryClient = function (meta) {
    if (!token || !meta || !meta.slug) return;
    fetch(apiBase + "/api/nlp/sami-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "get", user: user, clientSlug: meta.slug, clientName: meta.name })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.client) setMemoryModalClient(d.client); });
  };
  var saveNote = function () {
    if (!token || !memoryModalClient || !noteDraft.label || !noteDraft.value) return;
    fetch(apiBase + "/api/nlp/sami-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "upsertNote", user: user, clientSlug: memoryModalClient.slug, clientName: memoryModalClient.name, note: noteDraft })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.client) setMemoryModalClient(d.client);
        if (d && Array.isArray(d.clients)) setMemoryClients(d.clients);
        setNoteDraft({ id: "", label: "", value: "" });
      });
  };
  var deleteNote = function (noteId) {
    if (!token || !memoryModalClient || !noteId) return;
    fetch(apiBase + "/api/nlp/sami-memory", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ op: "deleteNote", user: user, clientSlug: memoryModalClient.slug, noteId: noteId })
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.client) setMemoryModalClient(d.client);
        if (d && Array.isArray(d.clients)) setMemoryClients(d.clients);
      });
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
          plans: Array.isArray(x.data.plans) ? x.data.plans : [],
          pairCards: Array.isArray(x.data.pairCards) ? x.data.pairCards : [],
          memories: Array.isArray(x.data.memories) ? x.data.memories : [],
          actions: Array.isArray(x.data.actions) ? x.data.actions : [],
          live: Array.isArray(x.data.actions) && x.data.actions.length > 0
        };
        // Auto-persist any SAVE_MEMORY blocks Sami emitted (Phase 4).
        // Fire-and-forget: refreshes the memory clients list after each
        // save so the sidebar updates immediately.
        if (samiTurn.memories.length > 0) {
          samiTurn.memories.forEach(function (mem) {
            fetch(apiBase + "/api/nlp/sami-memory", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
              body: JSON.stringify({ op: "upsertNote", user: user, clientSlug: mem.clientSlug, clientName: mem.clientName, note: { label: mem.label, value: mem.value } })
            }).then(function (r) { return r.ok ? r.json() : null; })
              .then(function (d) { if (d && Array.isArray(d.clients)) setMemoryClients(d.clients); });
          });
        }
        var withReply = next.concat([samiTurn]);
        setMessages(withReply);
        // Seed each new approval card to pending status.
        if (samiTurn.cards.length > 0) {
          setCardStatus(function (cur) {
            var nextStatuses = Object.assign({}, cur);
            samiTurn.cards.forEach(function (c) { if (!nextStatuses[c.id]) nextStatuses[c.id] = "pending"; });
            return nextStatuses;
          });
        }
        // Seed each new plan card to pending too (audit fix #6).
        if (samiTurn.plans.length > 0) {
          setPlanStatus(function (cur) {
            var nextStatuses = Object.assign({}, cur);
            samiTurn.plans.forEach(function (p) { if (!nextStatuses[p.id]) nextStatuses[p.id] = "pending"; });
            return nextStatuses;
          });
        }
        // Seed each new pair card to pending too.
        if (samiTurn.pairCards.length > 0) {
          setPairStatus(function (cur) {
            var nextStatuses = Object.assign({}, cur);
            samiTurn.pairCards.forEach(function (c) { if (!nextStatuses[c.id]) nextStatuses[c.id] = "pending"; });
            return nextStatuses;
          });
        }
        // Persist the thread after Sami's reply so the sidebar updates
        // and a page refresh / cross-device resume finds this conversation.
        saveThread(activeThreadId, withReply);
      })
      .catch(function () { setBusy(false); setErr("Network error. Check your connection and try again."); });
  };

  // Audit fix #7: persist card status the instant it changes so a
  // reload or crash between Approve-click and Sami's reply doesn't
  // reset the card to pending. Fire-and-forget save with the new
  // state passed explicitly (setState is async so closure would
  // capture the stale value otherwise).
  var handleApprove = function (card) {
    if (busy) return;
    var next = Object.assign({}, cardStatus, {}); next[card.id] = "approved";
    setCardStatus(next);
    if (activeThreadId) saveThread(activeThreadId, messages, { cardStatus: next });
    send("APPROVED: " + card.id);
  };
  var handleReject = function (card) {
    if (busy) return;
    var next = Object.assign({}, cardStatus, {}); next[card.id] = "rejected";
    setCardStatus(next);
    if (activeThreadId) saveThread(activeThreadId, messages, { cardStatus: next });
    send("REJECTED: " + card.id);
  };
  var handleConfirmPair = function (card) {
    if (busy) return;
    var next = Object.assign({}, pairStatus, {}); next[card.id] = "confirmed";
    setPairStatus(next);
    if (activeThreadId) saveThread(activeThreadId, messages, { pairStatus: next });
    send("PAIRS_OK: " + card.id);
  };

  // Audit fix #6: plan-level approve/reject. Approving flips the plan
  // status AND marks every child card as approved (so the inline child
  // list renders resolved), then sends a single APPROVED_PLAN back to
  // Sami; she executes each child write in order. Rejecting stops the
  // whole plan.
  var handleApprovePlan = function (plan) {
    if (busy) return;
    var nextPlan = Object.assign({}, planStatus, {}); nextPlan[plan.id] = "approved";
    setPlanStatus(nextPlan);
    var nextCard = Object.assign({}, cardStatus, {});
    (plan.plan || []).forEach(function (c) { if (c && c.id) nextCard[c.id] = "approved"; });
    setCardStatus(nextCard);
    if (activeThreadId) saveThread(activeThreadId, messages, { cardStatus: nextCard, planStatus: nextPlan });
    send("APPROVED_PLAN: " + plan.id);
  };
  var handleRejectPlan = function (plan) {
    if (busy) return;
    var nextPlan = Object.assign({}, planStatus, {}); nextPlan[plan.id] = "rejected";
    setPlanStatus(nextPlan);
    if (activeThreadId) saveThread(activeThreadId, messages, { planStatus: nextPlan });
    send("REJECTED_PLAN: " + plan.id);
  };

  var onKeyDown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // New task clears everything AND generates a fresh threadId so the next
  // send starts a new persisted thread instead of overwriting the last.
  var newTask = function () {
    setMessages([]); setCardStatus({}); setPairStatus({}); setPlanStatus({}); setErr(""); setInput("");
    setThreadId(""); // Empty forces send() to mint a new id on next message
  };

  // Guided vs Self mode entry points shown on the empty-state screen.
  // Guided pulls the guided-campaign-build skill prompt (falls back to a
  // short trigger message if skills haven't loaded yet) and sends it,
  // walking the AM through every mandatory question. Self is a no-op
  // that focuses the composer for a freeform brief.
  var startGuided = function () {
    var guided = (skills || []).find(function (s) { return s && s.id === GUIDED_SKILL_ID; });
    var prompt = (guided && guided.prompt) || GUIDED_FALLBACK_PROMPT;
    send(prompt);
  };
  var startSelf = function () {
    try { if (inputRef.current) inputRef.current.focus(); } catch (_) {}
  };

  // Audit fix #4: name-picker runs FIRST because the PIN endpoint now
  // signs the picked user into the JWT (so downstream Sami endpoints can
  // trust auth.user without accepting a spoofable body.user). Order was
  // previously PIN → name; swapping means a first-time visitor picks
  // their name once and the PIN is bound to that identity for the
  // 2-hour session.
  if (!user) {
    return <NamePicker P={P} ff={ff} fm={fm}
      onPick={function (slug) { writeUser(slug); setUser(slug); }} />;
  }
  if (!token) {
    return <PinGate P={P} ff={ff} fm={fm} apiBase={apiBase} user={user}
      onAuthed={function (t, ttlSec) { storeToken(t, ttlSec); setToken(t); }} />;
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
        {/* Phase 2: Recent Conversations */}
        <div style={{ marginTop: 4, borderTop: "1px solid " + P.rule, paddingTop: 8 }}>
          <RecentSidebar P={P} ff={ff} fm={fm}
            threads={threads} currentThreadId={threadId}
            errorText={threadErr}
            onOpen={openThread} onDelete={deleteThread} onRename={renameThread} />
        </div>
        {/* Phase 4: Skills library — team-shared reusable prompts */}
        <div style={{ marginTop: 4, borderTop: "1px solid " + P.rule, paddingTop: 8 }}>
          <SkillsPanel P={P} ff={ff} fm={fm}
            skills={skills}
            onInject={injectSkill}
            onManage={function () { setSkillDraft({ id: "", label: "", description: "", prompt: "" }); setSkillsModalOpen(true); }} />
        </div>
        {/* Phase 4: Memory — per-client notes Sami references automatically */}
        <div style={{ marginTop: 4, borderTop: "1px solid " + P.rule, paddingTop: 8 }}>
          <MemoryPanel P={P} ff={ff} fm={fm}
            clients={memoryClients}
            onOpen={openMemoryClient}
            onManage={function () { setMemoryModalClient({ slug: "", name: "", notes: [] }); }} />
        </div>
        {/* Phase 4: Scheduled — read-only strip of upcoming automated tasks */}
        <div style={{ marginTop: 4, borderTop: "1px solid " + P.rule, paddingTop: 8 }}>
          <ScheduledStrip P={P} ff={ff} fm={fm} items={scheduled} />
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
          <div style={{ fontSize: 12, color: P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 18 }}>Pick Guided Build for a step-by-step brief so nothing gets missed, or Self Build to type your own brief.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
            <button onClick={startGuided}
              style={{ background: "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 12, padding: "18px 18px", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", textAlign: "left" }}>
              Guided Build
              <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.9, letterSpacing: 0.5, textTransform: "none", marginTop: 6, lineHeight: 1.5 }}>
                Sami walks you through every material question, ends in one plan card for a single approval.
              </div>
            </button>
            <button onClick={startSelf}
              style={{ background: "rgba(249,98,3,0.08)", border: "1px solid rgba(249,98,3,0.30)", borderRadius: 12, padding: "18px 18px", color: P.txt, fontSize: 13, fontWeight: 800, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", textAlign: "left" }}>
              Self Build
              <div style={{ fontSize: 10, fontWeight: 600, color: P.sub, letterSpacing: 0.5, textTransform: "none", marginTop: 6, lineHeight: 1.5 }}>
                Type your own brief in one message. Sami asks anything she still needs.
              </div>
            </button>
          </div>
        </div>}

        {messages.map(function (m, i) {
          if (m.role === "user") {
            var isAppr = /^APPROVED: /.test(m.content);
            var isRej = /^REJECTED: /.test(m.content);
            var isPairOk = /^PAIRS_OK: /.test(m.content);
            var isPlanAppr = /^APPROVED_PLAN: /.test(m.content);
            var isPlanRej = /^REJECTED_PLAN: /.test(m.content);
            var bg, bd;
            if (isAppr || isPlanAppr) { bg = "rgba(52,211,153,0.13)"; bd = "rgba(52,211,153,0.35)"; }
            else if (isRej || isPlanRej) { bg = "rgba(239,68,68,0.13)"; bd = "rgba(239,68,68,0.35)"; }
            else if (isPairOk) { bg = "rgba(10,102,194,0.14)"; bd = "rgba(10,102,194,0.4)"; }
            else { bg = "rgba(249,98,3,0.13)"; bd = "rgba(249,98,3,0.3)"; }
            return <div key={i} style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
              <div style={{
                background: bg,
                border: "1px solid " + bd,
                borderRadius: "14px 14px 4px 14px", padding: "10px 14px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.6, whiteSpace: "pre-wrap"
              }}>{m.content}</div>
            </div>;
          }
          return <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%", width: "88%" }}>
            {m.content && <div style={{ background: "rgba(30,18,50,0.85)", border: "1px solid " + P.rule, borderRadius: "14px 14px 14px 4px", padding: "13px 16px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{m.content}</div>}
            {Array.isArray(m.pairCards) && m.pairCards.map(function (c) {
              return <CreativePairCard key={c.id} card={c} P={P} ff={ff} fm={fm}
                status={pairStatus[c.id] || "pending"}
                onConfirm={handleConfirmPair} />;
            })}
            {Array.isArray(m.plans) && m.plans.map(function (c) {
              return <PlanCard key={c.id} card={c} P={P} ff={ff} fm={fm}
                status={planStatus[c.id] || "pending"}
                onApprove={handleApprovePlan} onReject={handleRejectPlan} />;
            })}
            {Array.isArray(m.cards) && m.cards.map(function (c) {
              return <ApprovalCard key={c.id} card={c} P={P} ff={ff} fm={fm}
                status={cardStatus[c.id] || "pending"}
                onApprove={handleApprove} onReject={handleReject} />;
            })}
            {m.live && <div title={Array.isArray(m.actions) && m.actions.length ? ("Engine calls: " + m.actions.join(", ")) : "Live engine activity"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 9, fontWeight: 700, color: P.mint || "#34D399", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", cursor: "help" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.mint || "#34D399" }} />
              Live engine · {(m.actions || []).length} call{(m.actions || []).length === 1 ? "" : "s"}
            </div>}
            {/* When Sami replies to an approval with ZERO tool calls, surface
                a visible warning — this is the exact silent-failure mode where
                Sami acknowledges approval in text but never actually invokes
                the write. Only shown for assistant turns that follow an
                APPROVED/PAIRS_OK user message. */}
            {(!m.live) && i > 0 && (function () {
              var prev = messages[i - 1];
              if (!prev || prev.role !== "user") return null;
              if (!/^(APPROVED|PAIRS_OK): /.test(prev.content || "")) return null;
              return <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 9, fontWeight: 800, color: P.critical || "#ef4444", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 6, padding: "3px 8px" }}
                title="Sami acknowledged the approval in text but did not invoke a write tool. She should have called run_write_operation. Ask her to retry.">
                ⚠ No tool call fired
              </div>;
            })()}
            {/* Prose-card anti-pattern detector: Sami mentioned '✓ Approve'
                or similar as plain text but emitted NO APPROVAL_CARD tag.
                Means she described the write but didn't wrap it in the
                required format, so the user can't actually approve. Shows
                a helpful nudge to ask her to retry in the correct format. */}
            {(function () {
              var hasCards = Array.isArray(m.cards) && m.cards.length > 0;
              var hasPairCards = Array.isArray(m.pairCards) && m.pairCards.length > 0;
              if (hasCards || hasPairCards) return null;
              var text = String(m.content || "");
              var mentionsApprove = /✓\s*Approve|Approve\s*✓|approval|APPROVED:/.test(text) && /(create|paused|budget|ad ?set|campaign|ad$|creative)/i.test(text);
              if (!mentionsApprove) return null;
              return <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(255,170,0,0.08)", border: "1px solid rgba(255,170,0,0.35)", borderRadius: 8, fontSize: 11, color: P.txt, fontFamily: fm, lineHeight: 1.55 }}>
                <strong style={{ color: P.solar || "#FFAA00" }}>No interactive approval card was emitted.</strong> Sami described a proposed change in text but did not wrap it in the required approval format, so there is no button to click. Type <em>"emit that as a proper approval card"</em> or hit Send with an empty message to nudge her to retry.
              </div>;
            })()}
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

    {/* Phase 4 modals (overlay, portal-like — mounted at hub root) */}
    {skillsModalOpen && <SkillsModal P={P} ff={ff} fm={fm}
      skills={skills} draft={skillDraft} setDraft={setSkillDraft}
      onSave={saveSkill} onDelete={deleteSkill}
      onClose={function () { setSkillsModalOpen(false); setSkillDraft({ id: "", label: "", description: "", prompt: "" }); }} />}
    {memoryModalClient && <MemoryModal P={P} ff={ff} fm={fm}
      client={memoryModalClient} draft={noteDraft} setDraft={setNoteDraft}
      onSaveNote={saveNote} onDeleteNote={deleteNote}
      onClose={function () { setMemoryModalClient(null); setNoteDraft({ id: "", label: "", value: "" }); }} />}
  </div>;
}
