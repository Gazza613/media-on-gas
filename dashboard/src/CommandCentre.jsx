import React, { useState, useEffect } from "react";

// Internal GAS Campaign Load + Live Health command centre (roadmap #2).
// Team-only view (rendered behind !isClient in App.jsx; the API is
// independently admin-gated). Reads /api/command-centre: live delivery
// + pacing + "what needs a human now", grouped by client.

export default function CommandCentre(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, SH = props.SH;
  var apiBase = props.apiBase, session = props.session;
  var dateFrom = props.dateFrom || "", dateTo = props.dateTo || "";

  var st = useState({ loading: true, error: "", data: null }), s = st[0], setS = st[1];

  var load = function() {
    setS({ loading: true, error: "", data: null });
    var qs = (dateFrom && dateTo) ? ("?from=" + encodeURIComponent(dateFrom) + "&to=" + encodeURIComponent(dateTo)) : "";
    fetch(apiBase + "/api/command-centre" + qs, { headers: { "x-session-token": session || "" } })
      .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, status: r.status, d: d }; }); })
      .then(function(x) {
        if (!x.ok || !x.d || !x.d.ok) { setS({ loading: false, error: (x.d && x.d.error) || ("Failed (" + x.status + ")"), data: null }); return; }
        setS({ loading: false, error: "", data: x.d });
      })
      .catch(function() { setS({ loading: false, error: "Network error", data: null }); });
  };
  // Re-pull when the dashboard period changes so the command centre
  // always matches the dates the operator has selected.
  useEffect(load, [session, dateFrom, dateTo]);

  var sevColor = function(sev) {
    return sev === "high" ? (P.critical || "#ef4444")
      : sev === "medium" ? (P.warning || "#fbbf24")
      : (P.label || "#9ca3af");
  };
  var R = function(n) { return "R" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); };
  var N = function(n) { return Number(n || 0).toLocaleString(); };

  var card = function(label, value, accent, sub) {
    return <Glass accent={accent} hv={true} st={{ padding: 16, textAlign: "center", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", fontFamily: fm, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: accent, fontFamily: fm }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: P.caption, fontFamily: fm, marginTop: 4 }}>{sub}</div>}
    </Glass>;
  };

  var statusChip = function(c) {
    var color = c.live ? P.mint : c.ended ? (P.label || "#9ca3af") : P.solar;
    var txt = c.live ? "LIVE" : c.ended ? "ENDED" : String(c.status || "OFF").toUpperCase();
    return <span style={{ background: color + "22", border: "1px solid " + color + "55", color: color, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1, padding: "3px 8px", borderRadius: 5, textTransform: "uppercase" }}>{txt}</span>;
  };

  var stateCol = function(stt) { return stt === "behind" ? (P.warning || "#fbbf24") : stt === "ahead" ? P.solar : stt === "pending" ? (P.label || "#9ca3af") : P.mint; };
  var bar = function(actual, expected, ratioPct, stt, leftLabel) {
    var col = stateCol(stt);
    var pct = ratioPct == null ? 0 : Math.max(0, Math.min(160, ratioPct));
    return <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: P.label, fontFamily: fm, marginBottom: 3 }}>
        <span>{leftLabel}</span>
        <span style={{ color: col, fontWeight: 800 }}>{ratioPct == null ? "-" : ratioPct.toFixed(2) + "%"} {String(stt).replace("_", " ")}</span>
      </div>
      <div style={{ height: 7, background: P.rule + "55", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: (pct / 1.6) + "%", height: "100%", background: col, borderRadius: 4 }} />
      </div>
    </div>;
  };
  var pacingBar = function(p) {
    // Per-ad-set (ABO) breakdown.
    if (p && p.mode === "adset" && p.adsets && p.adsets.length) {
      return <div>
        {bar(p.actualToDate, p.expectedToDate, p.ratioPct, p.state, R(p.actualToDate) + " / ~" + R(p.expectedToDate) + " · " + p.adsets.length + " ad set" + (p.adsets.length === 1 ? "" : "s") + " (ABO)")}
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 5 }}>
          {p.adsets.map(function(a, i) {
            return <div key={i} style={{ paddingLeft: 10, borderLeft: "2px solid " + stateCol(a.state) + "55" }}>
              <div style={{ fontSize: 9, color: P.caption, fontFamily: fm, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name} · {a.budgetLabel} · {a.window}</div>
              {bar(a.actualToDate, a.expectedToDate, a.ratioPct, a.state, R(a.actualToDate) + " / ~" + R(a.expectedToDate))}
            </div>;
          })}
        </div>
      </div>;
    }
    if (!p || p.state === "na" || p.ratioPct == null) {
      return <span style={{ fontSize: 10, color: P.caption, fontFamily: fm, lineHeight: 1.5 }}>{(p && p.note) || "Budget pacing not available at campaign level."}</span>;
    }
    return bar(p.actualToDate, p.expectedToDate, p.ratioPct, p.state, R(p.actualToDate) + " / ~" + R(p.expectedToDate) + " " + (p.budgetMode === "lifetime" ? "(lifetime)" : "(daily)"));
  };

  return <div>
    <SH icon={Ic.radar ? Ic.radar(P.solar, 20) : Ic.flag(P.solar, 20)} title="Command Centre"
      sub="Internal. Live load, delivery, pacing and what needs a human now, month to date" accent={P.solar} />

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 18px" }}>
      <div style={{ fontSize: 11, color: P.label, fontFamily: fm }}>
        {s.data ? ("Period " + s.data.period.from + " to " + s.data.period.to + " · generated " + new Date(s.data.generatedAt).toLocaleString()) : ""}
      </div>
      <button onClick={load} disabled={s.loading} style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "7px 14px", color: s.loading ? P.dim : P.solar, fontSize: 11, fontWeight: 800, fontFamily: fm, cursor: s.loading ? "wait" : "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}>{s.loading ? "Loading…" : "Refresh"}</button>
    </div>

    {s.loading && <Glass st={{ padding: 28, textAlign: "center" }}><div style={{ fontSize: 13, color: P.label, fontFamily: fm }}>Reading live delivery across all clients…</div></Glass>}
    {s.error && <Glass accent={P.critical || "#ef4444"} st={{ padding: 20 }}><div style={{ fontSize: 13, color: P.critical || "#ef4444", fontFamily: fm }}>{s.error}</div></Glass>}

    {s.data && <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        {card("CAMPAIGNS", N(s.data.summary.campaigns), P.cyan, "in flight this month")}
        {card("LIVE NOW", N(s.data.summary.live), P.mint)}
        {card("NEEDS ATTENTION", N(s.data.summary.needsAttention), s.data.summary.needsAttention > 0 ? (P.critical || "#ef4444") : P.mint, N(s.data.summary.alerts) + " alerts")}
        {card("SPEND TODAY", R(s.data.summary.spendToday), P.solar)}
        {card("SPEND MTD", R(s.data.summary.spendPeriod), P.ember)}
      </div>

      {s.data.clients.length === 0 && <Glass st={{ padding: 24, textAlign: "center" }}><div style={{ fontSize: 13, color: P.caption, fontFamily: ff }}>Nothing in flight this month.</div></Glass>}

      {s.data.clients.map(function(grp) {
        return <div key={grp.client} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid " + P.rule }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: P.txt, fontFamily: fm, letterSpacing: 1 }}>{grp.client}</div>
            <div style={{ fontSize: 11, color: P.label, fontFamily: fm }}>
              {grp.rollup.live} live · {R(grp.rollup.spendPeriod)} period · {R(grp.rollup.spendToday)} today · {N(grp.rollup.results)} results
              {grp.rollup.alerts > 0 && <span style={{ color: P.critical || "#ef4444", fontWeight: 800 }}> · {grp.rollup.alerts} alerts</span>}
            </div>
          </div>

          {grp.campaigns.map(function(c) {
            var hasAlert = c.alerts.length > 0;
            return <Glass key={c.campaignId} accent={hasAlert ? sevColor(c.alerts[0].severity) : P.rule} st={{ padding: 16, marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    {statusChip(c)}
                    <span style={{ fontSize: 9, color: P.label, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase" }}>{c.platform}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: fm, wordBreak: "break-word", lineHeight: 1.4 }}>{c.campaignName}</div>
                  <div style={{ fontSize: 9.5, color: P.caption, fontFamily: fm, marginTop: 2 }}>{c.objective}{c.endDate ? " · ends " + c.endDate : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontFamily: fm }}>
                  {[["SPEND", R(c.delivery.spendPeriod)], ["TODAY", R(c.delivery.spendToday)], ["IMPR", N(c.delivery.impressions)], ["CLICKS", N(c.delivery.clicks)], ["CTR", c.delivery.ctr.toFixed(2) + "%"], ["CPM", R(c.delivery.cpm)], [(c.delivery.resultLabel || "RESULTS").toUpperCase(), N(c.delivery.result)], [c.delivery.costLabel || "CPR", c.delivery.result > 0 ? R(c.delivery.costPer) : "-"], ["FREQ", c.delivery.frequency.toFixed(2)]].map(function(m, i) {
                    return <div key={i} style={{ textAlign: "right", minWidth: 52 }}>
                      <div style={{ fontSize: 8, color: P.label, letterSpacing: 1, marginBottom: 2 }}>{m[0]}</div>
                      <div style={{ fontSize: 12, fontWeight: 800, color: P.txt }}>{m[1]}</div>
                    </div>;
                  })}
                </div>
              </div>
              <div style={{ marginTop: 12, maxWidth: c.pacing && c.pacing.mode === "adset" ? 520 : 360 }}>{pacingBar(c.pacing)}</div>
              {hasAlert && <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {c.alerts.map(function(a, i) {
                  var col = sevColor(a.severity);
                  return <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", background: col + "12", border: "1px solid " + col + "33", borderRadius: 8 }}>
                    <span style={{ background: col, color: "#0b0716", fontSize: 8, fontWeight: 900, fontFamily: fm, letterSpacing: 1, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", flexShrink: 0, marginTop: 1 }}>{a.severity}</span>
                    <span style={{ fontSize: 11.5, color: P.txt, fontFamily: ff, lineHeight: 1.5 }}>{a.message}</span>
                  </div>;
                })}
              </div>}
            </Glass>;
          })}
        </div>;
      })}

      <div style={{ fontSize: 9.5, color: P.caption, fontFamily: fm, fontStyle: "italic", marginTop: 8, lineHeight: 1.6 }}>
        Internal operations view, scoped to your selected dates. The headline metric and cost are the campaign's own objective (installs / leads / followers / clicks / impressions). Pacing covers daily and lifetime budgets over days elapsed in the window; ABO budgets set at ad-set level are noted rather than guessed. Not shown to clients.
      </div>
    </div>}
  </div>;
}
