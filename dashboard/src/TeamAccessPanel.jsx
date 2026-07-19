// TeamAccessPanel — self-contained team-access surface for Studio /
// any other GAS build.
//
// Ported from Media on GAS. Renders:
//   - Invite form (name + email → server emails an invitation)
//   - Team roster (name / email / role / status / invited / last login)
//   - Per-row actions: RESET password, REVOKE / RESTORE access
//
// Talks to these endpoints on `apiBase` (all copy verbatim from Media,
// see the copy-list in the README below):
//   GET  /api/users                       list team
//   POST /api/users        {action, email}   revoke / restore
//   POST /api/invite       {name, email}     send invite email
//   POST /api/admin-reset  {email}           mint + email a 1h reset link
//
// Auth: every request forwards `session` as the `x-session-token`
// header. The endpoints require the session to belong to a
// superadmin — same gate Media uses.
//
// Usage:
//   import TeamAccessPanel from "./TeamAccessPanel.jsx";
//   <TeamAccessPanel
//     apiBase="https://studio.gasmarketing.co.za"   // your API host
//     session={sessionToken}                        // superadmin session token
//     isSuperadmin={true}                           // gate; hides panel if false
//     palette={/* optional: override brand colors */}
//   />
//
// The palette + font tokens default to the GAS brand. Pass a
// `palette` prop with any of the keys below to re-skin without
// editing this file.

import { useState, useEffect } from "react";

var DEFAULT_PALETTE = {
  ember: "#F96203",
  cyan: "#0891B2",
  mint: "#34D399",
  critical: "#ef4444",
  warning: "#fbbf24",
  solar: "#FFAA00",
  txt: "#FFFBF8",
  label: "rgba(255,251,248,0.7)",
  caption: "rgba(255,251,248,0.58)",
  rule: "rgba(168,85,247,0.12)",
  glass: "rgba(30,18,50,0.65)"
};
var DEFAULT_FM = '"Manrope","Inter",system-ui,sans-serif';

export default function TeamAccessPanel(props) {
  var P = Object.assign({}, DEFAULT_PALETTE, props.palette || {});
  var fm = props.fontFamily || DEFAULT_FM;
  var apiBase = props.apiBase || "";
  var session = props.session || "";

  var teamUsers = useState([]);
  var teamLoading = useState(false);
  var teamErr = useState("");
  var teamBusy = useState(false);
  var inviteName = useState("");
  var inviteEmail = useState("");
  var inviteNote = useState("");

  var loadTeam = function() {
    teamLoading[1](true); teamErr[1]("");
    fetch(apiBase + "/api/users", { headers: { "x-session-token": session } })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        teamLoading[1](false);
        if (Array.isArray(d.users)) teamUsers[1](d.users);
        else teamErr[1](d.error || "Could not load users");
      })
      .catch(function() { teamLoading[1](false); teamErr[1]("Connection error"); });
  };

  var sendInvite = function() {
    if (teamBusy[0]) return;
    teamBusy[1](true); inviteNote[1](""); teamErr[1]("");
    fetch(apiBase + "/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-token": session },
      body: JSON.stringify({ name: inviteName[0].trim(), email: inviteEmail[0].trim().toLowerCase() })
    })
      .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
      .then(function(r) {
        teamBusy[1](false);
        if (r.status === 200) {
          inviteNote[1]("Invitation emailed to " + r.data.email);
          inviteName[1](""); inviteEmail[1](""); loadTeam();
        } else {
          teamErr[1](r.data.error || "Could not send invite");
        }
      })
      .catch(function() { teamBusy[1](false); teamErr[1]("Connection error"); });
  };

  var toggleUser = function(email, currentlyActive) {
    if (!window.confirm((currentlyActive ? "Revoke access for " : "Restore access for ") + email + "?")) return;
    fetch(apiBase + "/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-token": session },
      body: JSON.stringify({ action: currentlyActive ? "revoke" : "restore", email: email })
    })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d.ok) loadTeam(); else teamErr[1](d.error || "Action failed"); })
      .catch(function() { teamErr[1]("Connection error"); });
  };

  // Admin-triggered password reset. Mints a 1h reset token + emails
  // the target user. Also returns the resetUrl so the admin can copy
  // it into Slack as a fallback for inboxes that delay or filter.
  var adminResetUser = function(email) {
    if (!window.confirm("Send a password reset link to " + email + "?\n\nA one-time reset link will be emailed to them and shown to you so you can also share it via Slack.")) return;
    inviteNote[1](""); teamErr[1]("");
    fetch(apiBase + "/api/admin-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-session-token": session },
      body: JSON.stringify({ email: email })
    })
      .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
      .then(function(r) {
        if (r.status === 200 && r.data && r.data.ok) {
          var msg = "Reset link sent to " + r.data.email + (r.data.emailSent ? " (emailed)" : " (email failed; copy the link below).") + "\nLink: " + r.data.resetUrl;
          inviteNote[1](msg);
          try { if (navigator && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.data.resetUrl); } catch (_) {}
          loadTeam();
        } else {
          teamErr[1]((r.data && r.data.error) || "Reset failed");
        }
      })
      .catch(function() { teamErr[1]("Connection error"); });
  };

  useEffect(function() { if (props.isSuperadmin) loadTeam(); }, [props.isSuperadmin]);

  if (!props.isSuperadmin) return null;

  var users = teamUsers[0] || [];
  var fmtDate = function(iso) {
    if (!iso) return "-";
    try { return new Date(iso).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" }); }
    catch (_) { return iso; }
  };
  var statusPill = function(u) {
    if (u.role === "superadmin") return { label: "SUPER ADMIN", color: P.ember };
    if (u.status === "pending_invite") return { label: "PENDING INVITE", color: P.warning };
    if (u.status === "revoked" || u.active === false) return { label: "REVOKED", color: P.critical };
    return { label: "ACTIVE", color: P.mint };
  };
  var hdr = { padding: "10px", textAlign: "left", fontSize: 9, fontWeight: 800, color: P.ember, letterSpacing: 2, textTransform: "uppercase", borderBottom: "1px solid " + P.rule, background: "rgba(249,98,3,0.12)" };
  var cell = { padding: "10px", color: P.txt, fontSize: 12, fontFamily: fm, borderBottom: "1px solid " + P.rule + "30" };
  var gEmber = "linear-gradient(135deg,#FF3D00 0%,#FF6B00 45%,#F96203 100%)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, overflow: "auto" }}>
      <div style={{ fontSize: 11, color: P.label, fontFamily: fm, lineHeight: 1.5 }}>
        Invite team members by email, revoke access when someone leaves. Invited users set their own password via the emailed link.
      </div>

      <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 900, color: P.ember, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Invite a Team Member</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 10, alignItems: "stretch" }}>
          <input name="invite-name" autoComplete="name" value={inviteName[0]} onChange={function(e) { inviteName[1](e.target.value); }} placeholder="Full name" style={{ background: P.glass, border: "1px solid " + P.rule, borderRadius: 8, padding: "10px 12px", color: P.txt, fontSize: 12, fontFamily: fm, outline: "none" }} />
          <input name="invite-email" autoComplete="email" value={inviteEmail[0]} onChange={function(e) { inviteEmail[1](e.target.value); }} placeholder="work@domain.com" type="email" style={{ background: P.glass, border: "1px solid " + P.rule, borderRadius: 8, padding: "10px 12px", color: P.txt, fontSize: 12, fontFamily: fm, outline: "none" }} />
          <button onClick={sendInvite} disabled={teamBusy[0] || !inviteName[0].trim() || !inviteEmail[0].trim()} style={{ background: (teamBusy[0] || !inviteName[0].trim() || !inviteEmail[0].trim()) ? "#555" : gEmber, border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, cursor: teamBusy[0] ? "wait" : "pointer", letterSpacing: 1.5, whiteSpace: "nowrap" }}>{teamBusy[0] ? "SENDING..." : "SEND INVITE"}</button>
        </div>
        {inviteNote[0] && <div style={{ marginTop: 10, fontSize: 11, color: P.mint, fontFamily: fm, whiteSpace: "pre-wrap" }}>{inviteNote[0]}</div>}
        {teamErr[0] && <div style={{ marginTop: 10, fontSize: 11, color: P.critical, fontFamily: fm }}>{teamErr[0]}</div>}
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: P.cyan, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase" }}>Team Members</span>
          <span style={{ fontSize: 11, color: P.label, fontFamily: fm }}>{users.length + " user" + (users.length === 1 ? "" : "s")}</span>
          <button onClick={loadTeam} disabled={teamLoading[0]} style={{ marginLeft: "auto", background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "6px 12px", color: P.label, fontSize: 10, fontWeight: 800, fontFamily: fm, cursor: teamLoading[0] ? "wait" : "pointer", letterSpacing: 1.5 }}>{teamLoading[0] ? "LOADING" : "REFRESH"}</button>
        </div>
        <div style={{ border: "1px solid " + P.rule, borderRadius: 10, background: "rgba(0,0,0,0.3)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: fm }}>
            <thead><tr><th style={hdr}>Name</th><th style={hdr}>Email</th><th style={hdr}>Role</th><th style={hdr}>Status</th><th style={hdr}>Invited</th><th style={hdr}>Last Login</th><th style={Object.assign({}, hdr, { textAlign: "right" })}>Action</th></tr></thead>
            <tbody>
              {users.length === 0 && !teamLoading[0]
                ? <tr><td colSpan={7} style={{ padding: 20, color: P.caption, textAlign: "center", fontSize: 11, fontFamily: fm, fontStyle: "italic" }}>No team members yet. Invite someone above.</td></tr>
                : users.map(function(u) {
                    var s = statusPill(u);
                    var canToggle = u.role !== "superadmin";
                    return (
                      <tr key={u.email}>
                        <td style={Object.assign({}, cell, { fontWeight: 700 })}>{u.name || "-"}</td>
                        <td style={Object.assign({}, cell, { color: P.label })}>{u.email}</td>
                        <td style={cell}>{u.role === "superadmin" ? "Super Admin" : "Team Member"}</td>
                        <td style={cell}><span style={{ background: s.color + "20", color: s.color, border: "1px solid " + s.color + "50", padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</span></td>
                        <td style={Object.assign({}, cell, { color: P.label })}>{fmtDate(u.createdAt)}</td>
                        <td style={Object.assign({}, cell, { color: P.label })}>{fmtDate(u.lastLogin)}</td>
                        <td style={Object.assign({}, cell, { textAlign: "right" })}>
                          <div style={{ display: "inline-flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                            {u.role !== "superadmin" && u.active && u.status === "active" && (
                              <button onClick={function() { adminResetUser(u.email); }} title="Send a password reset link" style={{ background: "transparent", border: "1px solid " + P.solar + "60", borderRadius: 6, padding: "4px 10px", color: P.solar, fontSize: 10, fontWeight: 800, fontFamily: fm, cursor: "pointer", letterSpacing: 1 }}>RESET</button>
                            )}
                            {canToggle
                              ? <button onClick={function() { toggleUser(u.email, u.active); }} style={{ background: u.active ? "transparent" : P.mint + "15", border: "1px solid " + (u.active ? P.critical + "60" : P.mint + "60"), borderRadius: 6, padding: "4px 12px", color: u.active ? P.critical : P.mint, fontSize: 10, fontWeight: 800, fontFamily: fm, cursor: "pointer", letterSpacing: 1 }}>{u.active ? "REVOKE" : "RESTORE"}</button>
                              : <span style={{ color: P.caption, fontSize: 10 }}>-</span>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11, color: P.label, fontFamily: fm, marginTop: 10, lineHeight: 1.6 }}>Revoking access invalidates the user's next login request.</div>
      </div>
    </div>
  );
}
