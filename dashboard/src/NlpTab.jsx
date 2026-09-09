// GAS Media AI tab. Replaces the Create wizard with a natural-language
// dashboard: the team types a plain-English request and the agent pulls
// live media data through /api/nlp/agent (which fronts the data engine
// server-side, fully white-labelled, nothing vendor-branded ever reaches
// the browser).
//
// Reuses the SAME PIN gate + token storage keys as the old Create tab so
// existing CREATE_TAB_PIN_HASH / CREATE_TAB_JWT_SECRET keep working and a
// prior unlock in this session carries straight over.
//
// The old wizard stays in the repo at ./CreateTab.jsx, a one-line swap in
// App.jsx brings it back.

import { useState, useEffect, useRef } from "react";

var TOKEN_KEY = "gas_create_token";
var TOKEN_EXP_KEY = "gas_create_token_exp";

var STARTERS = [
  "What did we spend on Meta this month, per account?",
  "Which campaigns look like they need attention right now?",
  "Give me last week vs the week before, top level.",
  "List the ad accounts you have access to."
];

var LOADERS = [
  "Interrogating the data engine, it knows it did something",
  "Counting rands and impressions, in that order",
  "Pulling live numbers, no vibes, only data",
  "Cross-examining the campaigns, they lawyered up",
  "Sami is thinking, which is billable"
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

function PinGate(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, apiBase = props.apiBase;
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

  return <div style={{ display: "flex", justifyContent: "center", padding: "40px 20px" }}>
    <div style={{ maxWidth: 440, width: "100%", background: P.glass, border: "1px solid " + P.rule, borderRadius: 18, padding: "34px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {Ic.bolt(P.ember, 18)}
        <span style={{ fontSize: 11, fontWeight: 800, color: P.ember, letterSpacing: 3, fontFamily: fm, textTransform: "uppercase" }}>GAS Media AI</span>
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, color: P.txt, fontFamily: ff, marginBottom: 6 }}>Restricted area</div>
      <div style={{ fontSize: 12, color: P.label || P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 22 }}>
        The Media AI answers plain-English questions from live campaign data. Access requires a PIN.
      </div>
      <form onSubmit={submit}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={function (e) { setPin(e.target.value); }}
          placeholder="Enter PIN"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 10, padding: "12px 16px", color: P.txt, fontSize: 16, fontFamily: fm, letterSpacing: 6, outline: "none", marginBottom: 14, textAlign: "center" }}
        />
        {err && <div style={{ fontSize: 11, color: P.critical || "#ef4444", fontFamily: fm, marginBottom: 12 }}>{err}</div>}
        <button type="submit" disabled={loading} style={{ width: "100%", background: loading ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 10, padding: "12px 0", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: fm, letterSpacing: 2, cursor: loading ? "default" : "pointer" }}>
          {loading ? "Checking..." : "Unlock"}
        </button>
      </form>
    </div>
  </div>;
}

export default function NlpTab(props) {
  var apiBase = props.apiBase, P = props.P, ff = props.ff, fm = props.fm;
  var Ic = props.Ic, Glass = props.Glass, SH = props.SH, gEmber = props.gEmber;

  var stored = readStoredToken();
  var ts = useState(stored ? stored.token : null), token = ts[0], setToken = ts[1];
  var ms = useState([]), messages = ms[0], setMessages = ms[1];
  var is = useState(""), input = is[0], setInput = is[1];
  var bs = useState(false), busy = bs[0], setBusy = bs[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var qs = useState(0), quipIdx = qs[0], setQuipIdx = qs[1];
  var scrollRef = useRef(null);
  var inputRef = useRef(null);

  // Rotate the loading quip while a request is in flight.
  useEffect(function () {
    if (!busy) return;
    var id = setInterval(function () {
      setQuipIdx(function (i) { return (i + 1) % LOADERS.length; });
    }, 2600);
    return function () { clearInterval(id); };
  }, [busy]);

  // Keep the newest message in view.
  useEffect(function () {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  var send = function (text) {
    var content = String(text == null ? input : text).trim();
    if (!content || busy || !token) return;
    setErr("");
    var next = messages.concat([{ role: "user", content: content }]);
    setMessages(next);
    setInput("");
    setBusy(true);

    fetch(apiBase + "/api/nlp/agent", {
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
          setErr("Your session expired. Enter the PIN again, your conversation is kept.");
          return;
        }
        if (!x.ok || !x.data || !x.data.reply) {
          setErr((x.data && x.data.error) || "The Media AI hit a problem. Try again.");
          return;
        }
        setMessages(function (cur) {
          return cur.concat([{ role: "assistant", content: x.data.reply, live: Array.isArray(x.data.actions) && x.data.actions.length > 0 }]);
        });
      })
      .catch(function () {
        setBusy(false);
        setErr("Network error. Check your connection and try again.");
      });
  };

  var onKeyDown = function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  if (!token) {
    return <PinGate P={P} ff={ff} fm={fm} Ic={Ic} apiBase={apiBase}
      onAuthed={function (t, ttlSec) { storeToken(t, ttlSec); setToken(t); }} />;
  }

  var empty = messages.length === 0;

  return <div style={{ maxWidth: 860, margin: "0 auto" }}>
    <SH accent={P.ember} icon={Ic.bolt(P.ember, 20)} title="GAS Media AI"
      sub="ASK ANYTHING, LIVE CAMPAIGN DATA ANSWERS" />

    <Glass st={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 520 }}>
      {/* Conversation area */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "26px 26px 10px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "58vh" }}>
        {empty && <div style={{ padding: "30px 6px 10px" }}>
          <div style={{ fontSize: 14, color: P.txt, fontFamily: ff, fontWeight: 700, marginBottom: 6 }}>
            Ask in plain English. Sami pulls the live numbers.
          </div>
          <div style={{ fontSize: 12, color: P.sub, fontFamily: ff, lineHeight: 1.7, marginBottom: 20 }}>
            Spend, results, account lists, comparisons across dates, whatever you would normally dig out of a platform, ask for it here instead.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {STARTERS.map(function (s, i) {
              return <button key={i} onClick={function () { send(s); }}
                style={{ background: "rgba(249,98,3,0.08)", border: "1px solid rgba(249,98,3,0.25)", borderRadius: 12, padding: "10px 14px", color: P.txt, fontSize: 12, fontFamily: ff, cursor: "pointer", textAlign: "left", lineHeight: 1.5 }}>
                {s}
              </button>;
            })}
          </div>
        </div>}

        {messages.map(function (m, i) {
          if (m.role === "user") {
            return <div key={i} style={{ alignSelf: "flex-end", maxWidth: "82%", background: "rgba(249,98,3,0.13)", border: "1px solid rgba(249,98,3,0.3)", borderRadius: "14px 14px 4px 14px", padding: "11px 15px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>;
          }
          return <div key={i} style={{ alignSelf: "flex-start", maxWidth: "88%" }}>
            <div style={{ background: "rgba(30,18,50,0.85)", border: "1px solid " + P.rule, borderRadius: "14px 14px 14px 4px", padding: "13px 16px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
            {m.live && <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 9, fontWeight: 700, color: P.mint, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: P.mint }} />
              Live data
            </div>}
          </div>;
        })}

        {busy && <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 12, padding: "6px 2px" }}>
          <div style={{ width: 18, height: 18, border: "2px solid " + P.rule, borderTopColor: P.ember, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 11, color: P.sub, fontFamily: fm, letterSpacing: 0.5 }}>{LOADERS[quipIdx]}</span>
          <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
        </div>}
      </div>

      {err && <div style={{ margin: "0 26px 10px", padding: "9px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, fontSize: 11, color: P.critical, fontFamily: fm }}>{err}</div>}

      {/* Composer */}
      <div style={{ borderTop: "1px solid " + P.rule, padding: "16px 20px", display: "flex", gap: 12, alignItems: "flex-end" }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={function (e) { setInput(e.target.value); }}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask about spend, results, accounts, comparisons..."
          style={{ flex: 1, resize: "none", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 12, padding: "11px 14px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.55, outline: "none" }}
        />
        <button onClick={function () { send(); }} disabled={busy || !input.trim()}
          style={{ background: (busy || !input.trim()) ? P.dim : (gEmber || "linear-gradient(135deg,#FF3D00,#FF6B00)"), border: "none", borderRadius: 12, padding: "12px 22px", color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: fm, letterSpacing: 1.5, cursor: (busy || !input.trim()) ? "default" : "pointer", textTransform: "uppercase" }}>
          Ask
        </button>
      </div>
    </Glass>

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
      <span style={{ fontSize: 10, color: P.dim, fontFamily: fm, letterSpacing: 1 }}>
        Answers come from live platform data via the GAS engine.
      </span>
      {messages.length > 0 && <button onClick={function () { setMessages([]); setErr(""); }}
        style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "6px 12px", color: P.sub, fontSize: 10, fontWeight: 700, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        New chat
      </button>}
    </div>
  </div>;
}
