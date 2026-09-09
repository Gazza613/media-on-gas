// Create hub: one PIN-gated section, two modes.
//
//   Loader   - the full 7-step Meta campaign wizard (CreateTab, unchanged).
//   Media AI - the natural-language performance chat (NlpTab).
//
// Both modes stay mounted and are shown/hidden with display, so switching
// never loses a half-built campaign or a chat thread. They share the same
// PIN token (sessionStorage gas_create_token), one unlock covers both.

import { useState } from "react";
import CreateTab from "./CreateTab.jsx";
import NlpTab from "./NlpTab.jsx";
import BriefBar from "./BriefBar.jsx";

export default function CreateHub(props) {
  var P = props.P, fm = props.fm;
  var ms = useState("loader"), mode = ms[0], setMode = ms[1];
  // Bumped when Quick Brief writes a fresh draft, remounting the wizard so
  // it re-reads sessionStorage and shows every step pre-filled.
  var ks = useState(0), wizKey = ks[0], setWizKey = ks[1];
  // Unlocked mirrors CreateTab's PIN-gate state via its onAuthChange
  // callback. BriefBar is hidden until unlocked so the operator can't
  // type into it before authenticating (which would fail with "Unlock
  // with the PIN below first" because BriefBar's fetch needs the token
  // that PIN unlock puts into sessionStorage).
  var us = useState(false), unlocked = us[0], setUnlocked = us[1];

  function ModeButton(id, label) {
    var active = mode === id;
    return <button key={id} onClick={function () { setMode(id); }}
      style={{
        background: active ? "linear-gradient(135deg,#FF3D00,#FF6B00)" : "transparent",
        border: active ? "1px solid transparent" : "1px solid " + P.rule,
        borderRadius: 10,
        padding: "9px 20px",
        color: active ? "#fff" : P.sub,
        fontSize: 11,
        fontWeight: 800,
        fontFamily: fm,
        letterSpacing: 2,
        textTransform: "uppercase",
        cursor: active ? "default" : "pointer",
        transition: "color 0.2s ease"
      }}>
      {label}
    </button>;
  }

  return <div>
    <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 26 }}>
      {ModeButton("loader", "Campaign Loader")}
      {ModeButton("ai", "Media AI")}
    </div>
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
