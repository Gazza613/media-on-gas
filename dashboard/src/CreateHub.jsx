// Create hub: one PIN-gated section, three modes.
//
//   Sami Hub - the rebuilt Markifact-style unified read+write chat
//              (CreateChatTab). Behind a per-user opt-in feature flag
//              stored in localStorage as 'gas_sami_hub_enabled'.
//              Phase 1 of the Sami Hub rebuild (project_sami_hub_rebuild).
//   Loader   - the legacy 7-step Meta campaign wizard (CreateTab). Still
//              the default while Sami Hub matures. Kept as 'Classic'.
//   Media AI - the natural-language performance chat (NlpTab). Read-only
//              analytics. Merges into Sami Hub once Phase 1 lands stable.
//
// All modes stay mounted and are shown/hidden with display, so switching
// never loses a half-built campaign or a chat thread. They share the same
// PIN token (sessionStorage gas_create_token), one unlock covers all.

import { useState, useEffect } from "react";
import CreateTab from "./CreateTab.jsx";
import CreateChatTab from "./CreateChatTab.jsx";
import NlpTab from "./NlpTab.jsx";
import BriefBar from "./BriefBar.jsx";

var SAMI_FLAG_KEY = "gas_sami_hub_enabled";

function readSamiFlag() {
  try { return localStorage.getItem(SAMI_FLAG_KEY) === "1"; }
  catch (_) { return false; }
}
function writeSamiFlag(on) {
  try {
    if (on) localStorage.setItem(SAMI_FLAG_KEY, "1");
    else localStorage.removeItem(SAMI_FLAG_KEY);
  } catch (_) { /* non-fatal */ }
}

export default function CreateHub(props) {
  var P = props.P, fm = props.fm;
  // Sami-hub opt-in. When on, that mode is the default and appears in the
  // mode selector. When off, the tab shows only Loader + Media AI as
  // before, so users who haven't opted in see the exact same UX.
  var fs = useState(readSamiFlag()), samiEnabled = fs[0], setSamiEnabled = fs[1];
  var ms = useState(readSamiFlag() ? "sami" : "loader"), mode = ms[0], setMode = ms[1];
  // Bumped when Quick Brief writes a fresh draft, remounting the wizard so
  // it re-reads sessionStorage and shows every step pre-filled.
  var ks = useState(0), wizKey = ks[0], setWizKey = ks[1];
  // Unlocked mirrors CreateTab's PIN-gate state via its onAuthChange
  // callback. BriefBar is hidden until unlocked.
  var us = useState(false), unlocked = us[0], setUnlocked = us[1];

  // Keep the flag reactive across tabs / windows in the same browser
  // profile so toggling in Settings updates this hub immediately.
  useEffect(function () {
    var onStorage = function (e) {
      if (e.key === SAMI_FLAG_KEY) {
        var on = e.newValue === "1";
        setSamiEnabled(on);
        if (on && mode !== "sami") setMode("sami");
        if (!on && mode === "sami") setMode("loader");
      }
    };
    window.addEventListener("storage", onStorage);
    return function () { window.removeEventListener("storage", onStorage); };
  }, [mode]);

  function ModeButton(id, label, sublabel) {
    var active = mode === id;
    return <button key={id} onClick={function () { setMode(id); }} title={sublabel || ""}
      style={{
        background: active ? "linear-gradient(135deg,#FF3D00,#FF6B00)" : "transparent",
        border: active ? "1px solid transparent" : "1px solid " + P.rule,
        borderRadius: 10, padding: "9px 20px",
        color: active ? "#fff" : P.sub,
        fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase",
        cursor: active ? "default" : "pointer",
        transition: "color 0.2s ease"
      }}>
      {label}
    </button>;
  }

  return <div>
    <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 26, flexWrap: "wrap" }}>
      {samiEnabled && ModeButton("sami", "Sami Hub", "Unified chat: plan, brief and build live campaigns with per-action approvals.")}
      {ModeButton("loader", samiEnabled ? "Classic Loader" : "Campaign Loader", "The legacy 7-step Meta campaign wizard.")}
      {ModeButton("ai", "Media AI", "Read-only analytics chat.")}
      {/* Discreet toggle to flip the Sami-hub feature flag on/off per user.
          Users who haven't seen the new hub yet still see 'Enable Sami Hub'.
          Once enabled, the mode picker adds the Sami tab and defaults to it
          on next visit. Off keeps the exact prior UX. */}
      <button onClick={function () {
        var next = !samiEnabled;
        writeSamiFlag(next);
        setSamiEnabled(next);
        setMode(next ? "sami" : "loader");
      }} title={samiEnabled ? "Turn off the new Sami Hub for your account. Reverts to the classic wizard." : "Try the new Sami Hub. Opt-in per user; the classic wizard stays available."}
        style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 10, padding: "9px 14px", color: P.dim || P.sub, fontSize: 10, fontWeight: 700, fontFamily: fm, letterSpacing: 1.5, cursor: "pointer", textTransform: "uppercase" }}>
        {samiEnabled ? "Disable Sami" : "Try Sami Hub"}
      </button>
    </div>

    {/* Sami Hub — mounted only when opted in, so it doesn't spin up
        connectors + sami-hub endpoints on browsers that haven't asked. */}
    {samiEnabled && <div style={{ display: mode === "sami" ? "block" : "none" }}>
      <CreateChatTab {...props} />
    </div>}

    <div style={{ display: mode === "loader" ? "block" : "none" }}>
      {unlocked && <BriefBar apiBase={props.apiBase} P={P} ff={props.ff} fm={fm}
        onApplied={function () { setWizKey(wizKey + 1); }} />}
      <CreateTab key={wizKey} {...props} onAuthChange={setUnlocked} />
    </div>
    <div style={{ display: mode === "ai" ? "block" : "none" }}>
      <NlpTab {...props} />
    </div>
  </div>;
}
