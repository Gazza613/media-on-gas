// Quick Brief bar. Sits above the campaign wizard in the Create hub.
// The team types the campaign in plain English, Sami parses it into the
// wizard's own draft format, and the wizard below remounts with every
// step pre-filled. The team then confirms account and page, drops the
// designer's files into the Step 4 dropzone, and reviews. Typing drops
// to one paragraph.
//
// Draft handoff uses the wizard's existing sessionStorage draft key, and
// the wizard's defensive mergeDraft() fills any structure this partial
// draft omits, so nothing here can blank the wizard.

import { useState } from "react";

var TOKEN_KEY = "gas_create_token";
var DRAFT_KEY = "gas_create_draft_v2";

function getToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ""; } catch (_) { return ""; }
}

// Mirrors the wizard's emptyCreative() so the first creative card arrives
// with link, CTA and the lead copy variant already applied.
function seededCreative(defaults, adVariants) {
  return {
    kind: "image",
    imageHash: null, videoId: null,
    headline: (adVariants && adVariants.headlines && adVariants.headlines[0]) || "",
    primaryText: (adVariants && adVariants.primaryTexts && adVariants.primaryTexts[0]) || "",
    description: "",
    linkUrl: (defaults && defaults.linkUrl) || "",
    callToAction: (defaults && defaults.callToAction) || "LEARN_MORE",
    filename: null, previewDataUrl: null,
    concept: "", version: "V01"
  };
}

export default function BriefBar(props) {
  var apiBase = props.apiBase, P = props.P, ff = props.ff, fm = props.fm;
  var onApplied = props.onApplied;

  var os = useState(false), open = os[0], setOpen = os[1];
  var bs = useState(""), brief = bs[0], setBrief = bs[1];
  var ws = useState(false), busy = ws[0], setBusy = ws[1];
  var es = useState(""), err = es[0], setErr = es[1];
  var ds = useState(null), done = ds[0], setDone = ds[1]; // { notes: [] }

  var run = function () {
    var token = getToken();
    if (!token) { setErr("Unlock with the PIN below first, then come back to the brief."); return; }
    var text = brief.trim();
    if (text.length < 10) { setErr("Give Sami a sentence or two, client, goal, budget, dates, audience."); return; }
    setBusy(true); setErr(""); setDone(null);

    // Account list first so the parser can match the client to an
    // allowlisted account. A failure here is non-fatal, parsing still
    // works, the team just picks the account manually on Step 1.
    fetch(apiBase + "/api/create/accounts", { headers: { "Authorization": "Bearer " + token } })
      .then(function (r) { return r.ok ? r.json() : { accounts: [] }; })
      .catch(function () { return { accounts: [] }; })
      .then(function (acc) {
        var accounts = ((acc && acc.accounts) || []).map(function (a) {
          return { id: a.accountId || a.id || a.account_id || "", name: a.name || "" };
        }).filter(function (a) { return a.id && a.name; });

        return fetch(apiBase + "/api/create/brief-parse", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
          body: JSON.stringify({ brief: text, accounts: accounts })
        });
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .then(function (x) {
        setBusy(false);
        if (x.status === 401) { setErr("Session expired. Unlock with the PIN below, then run the brief again."); return; }
        if (!x.ok || !x.data || !x.data.draft) {
          setErr((x.data && x.data.error) || "Brief parsing hit a problem. Try again.");
          return;
        }
        var d = x.data.draft;
        var partial = {
          accountId: d.accountId || "",
          accountName: d.accountName || "",
          objective: d.objective,
          specialAdCategories: d.specialAdCategories || [],
          clientCode: d.clientCode || "",
          variant: d.variant || "A",
          audience: d.audience || {},
          funding: d.funding, budgetMode: "daily",
          dailyBudgetRand: d.dailyBudgetRand,
          startDate: d.startDate, endDate: d.endDate,
          creativeMode: "single",
          creatives: [seededCreative(d.creativeDefaults, d.adVariants)],
          adVariants: d.adVariants
        };
        try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(partial)); }
        catch (_) { setErr("Could not hand the draft to the wizard (storage blocked). Fill it manually."); return; }
        setDone({ notes: x.data.notes || [] });
        setBrief("");
        if (onApplied) onApplied();
      })
      .catch(function () { setBusy(false); setErr("Network error. Try again."); });
  };

  return <div style={{ maxWidth: 980, margin: "0 auto 22px" }}>
    <div style={{ background: "rgba(30,18,50,0.65)", border: "1px solid rgba(249,98,3,0.28)", borderRadius: 16, overflow: "hidden" }}>
      <button onClick={function () { setOpen(!open); }}
        style={{ width: "100%", background: "transparent", border: "none", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "linear-gradient(135deg,#FF3D00,#FF6B00)" }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: P.txt, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase" }}>Quick Brief</span>
          <span style={{ fontSize: 11, color: P.sub, fontFamily: ff }}>type the campaign, Sami fills every step</span>
        </span>
        <span style={{ fontSize: 11, color: P.ember, fontFamily: fm, letterSpacing: 1 }}>{open ? "CLOSE" : "OPEN"}</span>
      </button>

      {open && <div style={{ padding: "0 20px 18px" }}>
        <textarea
          value={brief}
          onChange={function (e) { setBrief(e.target.value); }}
          rows={3}
          placeholder={"Example: Leads campaign for Boston City Campus, R400 a day, Gauteng, 18 to 30, student intake angle, landing page boston.co.za/apply, start Monday for two weeks."}
          style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "rgba(40,25,60,0.5)", border: "1px solid " + P.rule, borderRadius: 12, padding: "12px 14px", color: P.txt, fontSize: 13, fontFamily: ff, lineHeight: 1.6, outline: "none", marginBottom: 12 }}
        />
        {err && <div style={{ marginBottom: 10, fontSize: 11, color: P.critical, fontFamily: fm }}>{err}</div>}
        {done && <div style={{ marginBottom: 12, padding: "11px 14px", background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: P.mint, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: done.notes.length ? 8 : 0 }}>
            Draft applied to the wizard below
          </div>
          {done.notes.map(function (n, i) {
            return <div key={i} style={{ fontSize: 11.5, color: P.label, fontFamily: ff, lineHeight: 1.7 }}>• {n}</div>;
          })}
        </div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, color: P.dim, fontFamily: fm, letterSpacing: 0.5 }}>
            Sami pre-fills, your team still confirms account and page, drops the images, and reviews before launch.
          </span>
          <button onClick={run} disabled={busy}
            style={{ background: busy ? P.dim : "linear-gradient(135deg,#FF3D00,#FF6B00)", border: "none", borderRadius: 10, padding: "10px 20px", color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 2, cursor: busy ? "default" : "pointer", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {busy ? "Building..." : "Build from brief"}
          </button>
        </div>
      </div>}
    </div>
  </div>;
}
