import React, { useState, useEffect, useRef } from "react";

// Internal GAS Campaign Load + Live Health command centre (roadmap #2).
// Team-only view (rendered behind !isClient in App.jsx; the API is
// independently admin-gated). Reads /api/command-centre: live delivery
// + pacing + "what needs a human now", grouped by client.

export default function CommandCentre(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, SH = props.SH;
  var apiBase = props.apiBase, session = props.session;
  var dateFrom = props.dateFrom || "", dateTo = props.dateTo || "";

  var st = useState({ loading: true, error: "", data: null }), s = st[0], setS = st[1];
  // Filter mode: "all" shows every in-flight campaign for situational
  // load/delivery awareness; "attention" collapses to only the rows
  // that have one or more alerts, so end-of-day triage is fast. Default
  // "all" because the page header is "live load, delivery, pacing AND
  // what needs a human now" — both modes are first-class.
  var fm0 = useState("all"), filterMode = fm0[0], setFilterMode = fm0[1];

  // Generation counter + abort controller + alive flag. The user can
  // navigate away from the Command Centre tab while a fetch is still
  // in flight (cold loads of this endpoint can run 20-40s while it
  // pulls Meta+TikTok+Google upstream). Without these guards two things
  // bomb the next visit: (1) the orphaned fetch's setS fires on a fresh
  // mount and overwrites its state, (2) a slow retry can outlive the
  // new mount's faster fetch and stamp a stale error over good data.
  // The generation counter ignores any response whose request was
  // started in an earlier mount or earlier load() call. The abort
  // controller actually cancels the in-flight request when the
  // component unmounts or load() runs again, freeing the socket so the
  // browser doesn't queue behind it on the next visit.
  var genRef = useRef(0);
  var abortRef = useRef(null);
  var aliveRef = useRef(true);
  var retryTimerRef = useRef(null);

  var safeSet = function(myGen, next) {
    if (!aliveRef.current) return;
    if (myGen !== genRef.current) return;
    setS(next);
  };

  // One-shot fetch. Tolerates a non-JSON body (Vercel function timeout
  // returns an HTML 504, which r.json() throws on) and reports the real
  // status code instead of silently falling to "Network error".
  var fetchOnce = function(signal) {
    var qs = (dateFrom && dateTo) ? ("?from=" + encodeURIComponent(dateFrom) + "&to=" + encodeURIComponent(dateTo)) : "";
    return fetch(apiBase + "/api/command-centre" + qs, {
      headers: { "x-session-token": session || "" },
      signal: signal
    }).then(function(r) {
      return r.text().then(function(t) {
        var d = null;
        try { d = t ? JSON.parse(t) : null; } catch (_) { d = null; }
        return { ok: r.ok, status: r.status, d: d, body: t };
      });
    });
  };

  var load = function() {
    // Bump the generation; any pending response from an earlier load()
    // will be discarded by safeSet because its myGen no longer matches.
    var myGen = ++genRef.current;
    // Cancel any in-flight request from a previous load() so the socket
    // is released immediately and the browser doesn't keep dragging a
    // dead 30s connection through the next visit.
    if (abortRef.current) { try { abortRef.current.abort(); } catch (_) {} }
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    abortRef.current = ctl;
    var signal = ctl ? ctl.signal : undefined;

    safeSet(myGen, { loading: true, error: "", data: null });

    var isAbort = function(err) {
      return err && (err.name === "AbortError" || /aborted|abort/i.test(String(err.message || "")));
    };

    fetchOnce(signal)
      .then(function(x) {
        // Success on first try.
        if (x.ok && x.d && x.d.ok) { safeSet(myGen, { loading: false, error: "", data: x.d }); return; }
        // Treat 5xx / parse failures as transient and retry once. Cold
        // upstream pulls (Meta+TikTok+Google) sometimes need a second
        // pass after a function timeout to land on a warm cache.
        var transient = !x.ok && (x.status === 504 || x.status === 502 || x.status === 503 || x.status === 0 || !x.d);
        if (!transient) {
          var em = (x.d && x.d.error) || ("Failed (HTTP " + x.status + ")");
          safeSet(myGen, { loading: false, error: em, data: null });
          return;
        }
        // Brief pause so the upstream cache has a chance to warm. Skip
        // the retry if this load was superseded while we were waiting.
        retryTimerRef.current = setTimeout(function() {
          if (myGen !== genRef.current) return;
          fetchOnce(signal)
            .then(function(y) {
              if (y.ok && y.d && y.d.ok) { safeSet(myGen, { loading: false, error: "", data: y.d }); return; }
              var em2 = (y.d && y.d.error)
                || (y.status === 504 ? "Upstream timed out (the cold platform pull took longer than 60s). Retry in a moment." : ("Failed (HTTP " + y.status + ")"));
              safeSet(myGen, { loading: false, error: em2, data: null });
            })
            .catch(function(err) {
              if (isAbort(err)) return; // user navigated away mid-retry
              safeSet(myGen, { loading: false, error: "Network error: " + String((err && err.message) || err), data: null });
            });
        }, 1500);
      })
      .catch(function(err) {
        if (isAbort(err)) return; // user navigated away mid-load
        safeSet(myGen, { loading: false, error: "Network error: " + String((err && err.message) || err), data: null });
      });
  };

  // Re-pull when the dashboard period changes so the command centre
  // always matches the dates the operator has selected. Cleanup aborts
  // any in-flight fetch / pending retry on unmount so a fast tab-switch
  // never leaves a half-finished load to clobber the next visit.
  useEffect(function() {
    aliveRef.current = true;
    load();
    return function() {
      aliveRef.current = false;
      if (abortRef.current) { try { abortRef.current.abort(); } catch (_) {} }
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    };
  }, [session, dateFrom, dateTo]);

  var sevColor = function(sev) {
    return sev === "high" ? (P.critical || "#ef4444")
      : sev === "medium" ? (P.warning || "#fbbf24")
      : (P.label || "#9ca3af");
  };
  // Dependency-free severity glyph (white, drawn inside a coloured
  // circle). triangle = high, exclamation = medium, info = low.
  var sevIcon = function(sev, size) {
    var s = size || 18;
    var p = sev === "high"
      ? <path d="M12 3 L22 20 H2 Z M12 10 V14 M12 17 h.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      : sev === "medium"
      ? <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16h.01"/></g>
      : <g stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></g>;
    return <svg width={s} height={s} viewBox="0 0 24 24">{p}</svg>;
  };
  var platShort = function(p) {
    p = String(p || "").toLowerCase();
    return p.indexOf("facebook") >= 0 ? "FB" : p.indexOf("instagram") >= 0 ? "IG"
      : p.indexOf("tiktok") >= 0 ? "TT" : p.indexOf("google") >= 0 ? "GA"
      : p.indexOf("youtube") >= 0 ? "YT" : (String(p).slice(0, 2).toUpperCase() || "AD");
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
      // No pacing bar when budget is set at ad-set level or not exposed
      // at campaign level: the verbose explanatory copy added noise on
      // every ABO row without helping the operator decide anything. The
      // tile's spend / today / alerts already carry the actionable info.
      // p.note kept available for future use; rendered only when set.
      if (p && p.note) {
        return <span style={{ fontSize: 10, color: P.caption, fontFamily: fm, lineHeight: 1.5 }}>{p.note}</span>;
      }
      return null;
    }
    return bar(p.actualToDate, p.expectedToDate, p.ratioPct, p.state, R(p.actualToDate) + " / ~" + R(p.expectedToDate) + " " + (p.budgetMode === "lifetime" ? "(lifetime)" : "(daily)"));
  };

  return <div>
    <SH icon={Ic.radar ? Ic.radar(P.solar, 20) : Ic.flag(P.solar, 20)} title="Command Centre"
      sub="Internal. Live load, delivery, pacing and what needs a human now, month to date" accent={P.solar} />

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 18px", gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 11, color: P.label, fontFamily: fm }}>
        {s.data ? ("Period " + s.data.period.from + " to " + s.data.period.to + " · generated " + new Date(s.data.generatedAt).toLocaleString()) : ""}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* All / Needs attention toggle so the operator can collapse
            healthy rows when triaging. Healthy = zero alerts. */}
        <div style={{ display: "inline-flex", border: "1px solid " + P.rule, borderRadius: 8, overflow: "hidden" }}>
          {[["all","All"], ["attention","Needs attention"]].map(function(opt) {
            var on = filterMode === opt[0];
            return <button key={opt[0]} onClick={function(){ setFilterMode(opt[0]); }}
              style={{ background: on ? P.solar + "22" : "transparent", border: "none", padding: "7px 12px", color: on ? P.solar : P.label, fontSize: 10, fontWeight: 800, fontFamily: fm, cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}>
              {opt[1]}
            </button>;
          })}
        </div>
        <button onClick={load} disabled={s.loading} style={{ background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "7px 14px", color: s.loading ? P.dim : P.solar, fontSize: 11, fontWeight: 800, fontFamily: fm, cursor: s.loading ? "wait" : "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}>{s.loading ? "Loading…" : "Refresh"}</button>
      </div>
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

      {(function() {
        // Single row renderer reused by both the live section (top) and
        // the paused section (bottom). dimmed=true mutes the row a bit
        // so the paused section reads as reference rather than action.
        var renderCampaignRow = function(c, dimmed) {
          var hasAlert = c.alerts.length > 0;
          var amUrl = c.adsManagerUrl || "";
          var gradA = (P.cyan || "#22D3EE"), gradB = (P.ember || "#F96203");
          var thumb = <a href={amUrl || undefined} target={amUrl ? "_blank" : undefined} rel="noopener noreferrer"
              title={amUrl ? "Open this campaign in Ads Manager" : "Ads Manager link unavailable"}
              style={{ flexShrink: 0, width: 88, height: 88, borderRadius: 12, overflow: "hidden", display: "block", border: "1px solid " + P.rule, background: "#0c0716", position: "relative", cursor: amUrl ? "pointer" : "default", textDecoration: "none", opacity: dimmed ? 0.75 : 1 }}>
            {c.thumbnail
              ? <img src={c.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>
              : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg," + gradA + "22," + gradB + "15)", color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: fm, letterSpacing: 1 }}>{platShort(c.platform)}</div>}
            {amUrl && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 7.5, fontWeight: 800, fontFamily: fm, letterSpacing: 0.5, textAlign: "center", padding: "3px 0", textTransform: "uppercase" }}>Ads Manager ↗</span>}
          </a>;
          return <Glass key={c.campaignId} accent={hasAlert ? sevColor(c.alerts[0].severity) : (dimmed ? P.rule : P.rule)} st={{ padding: 16, marginBottom: 10, opacity: dimmed ? 0.82 : 1 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
              {thumb}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                  {statusChip(c)}
                  <span style={{ fontSize: 9, color: P.label, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase" }}>{c.platform}</span>
                  {/* Per-row 'Healthy · no alerts' chip removed: the
                      section header already says SCALE READY / WATCH
                      LIST / etc., so the chip duplicated the signal. */}
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
            {!dimmed && <div style={{ marginTop: 12, maxWidth: c.pacing && c.pacing.mode === "adset" ? 520 : 360 }}>{pacingBar(c.pacing)}</div>}
            {hasAlert && <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              {c.alerts.map(function(a, i) {
                var col = sevColor(a.severity);
                return <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: col + "18", border: "1px solid " + col + "55", borderLeft: "5px solid " + col, borderRadius: 12 }}>
                  <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: "50%", background: col, display: "flex", alignItems: "center", justifyContent: "center" }}>{sevIcon(a.severity, 20)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: col, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>{a.severity} · needs attention</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: P.txt, fontFamily: ff, lineHeight: 1.55 }}>{a.message}</div>
                  </div>
                  {amUrl && <a href={amUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, background: col + "22", border: "1px solid " + col + "66", borderRadius: 8, padding: "9px 14px", color: col, fontSize: 11, fontWeight: 800, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap" }}>Fix in Ads Manager ↗</a>}
                </div>;
              })}
            </div>}
          </Glass>;
        };

        // Classify each campaign into a priority bucket so the media
        // operator sees what to handle first, what to watch, what to
        // scale, what's healthy, and what's not in delivery. Order is
        // by urgency (ATTENTION first, PAUSED last).
        //   attention -> any HIGH severity alert
        //   watch     -> any MEDIUM severity alert (no high)
        //   paused    -> c.live === false (and no urgent alert)
        //   scale     -> no medium/high alerts, performing strongly
        //   healthy   -> no medium/high alerts, steady but not scale
        // Low-severity alerts (pacing_ahead) don't trigger WATCH —
        // they're informational and may actually push a row into SCALE.
        var hasSev = function(c, sev) {
          return c.alerts && c.alerts.some(function(a) { return a.severity === sev; });
        };
        var isScaleCandidate = function(c) {
          var d = c.delivery || {};
          var freqLimit = /tiktok/i.test(String(c.platform || "")) ? 6 : 3;
          var paceOK = !c.pacing || c.pacing.state === "on_track" || c.pacing.state === "ahead" || c.pacing.state === "na" || c.pacing.state === "unknown";
          return (d.result > 0) && (d.ctr >= 1.5) && (d.frequency < freqLimit) && paceOK;
        };
        var classify = function(c) {
          if (hasSev(c, "high")) return "attention";
          if (hasSev(c, "medium")) return "watch";
          if (!c.live) return "paused";
          if (isScaleCandidate(c)) return "scale";
          return "healthy";
        };
        var passFilter = function(c) {
          return filterMode === "attention" ? (c.alerts && c.alerts.length > 0) : true;
        };

        // Sort each bucket by spend so the most material rows surface
        // first within the bucket. Each entry keeps its client label.
        var byBucket = { attention: [], watch: [], scale: [], healthy: [], paused: [] };
        s.data.clients.forEach(function(grp) {
          grp.campaigns.forEach(function(c) {
            if (!passFilter(c)) return;
            var b = classify(c);
            byBucket[b].push({ client: grp.client, c: c });
          });
        });
        Object.keys(byBucket).forEach(function(k) {
          byBucket[k].sort(function(a, b) { return (b.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
        });

        // Section definitions render in priority order. Each section
        // is suppressed when its bucket is empty so the page only
        // shows what's relevant. Colors mirror the alert severity
        // palette so the visual hierarchy reinforces the priority.
        var sectionDefs = [
          {
            key: "attention",
            label: "Needs immediate attention",
            sub: "High-severity alerts. Open Ads Manager and fix today.",
            color: P.critical || "#ef4444",
            dimmed: false
          },
          {
            key: "watch",
            label: "Watch list",
            sub: "Medium-severity flags. Review and decide before they escalate.",
            color: P.warning || "#fbbf24",
            dimmed: false
          },
          {
            key: "scale",
            label: "Scale ready",
            sub: "Strong CTR, healthy frequency, results coming through. Candidates for more budget.",
            color: P.mint || "#34D399",
            dimmed: false
          },
          // Healthy bucket dropped intentionally: live + no alerts + not
          // scale-grade campaigns simply don't render in any section.
          // classify() still returns "healthy" for them, but nothing
          // consumes that bucket so they stay off the page. Removed
          // because it cluttered the view without showing anything the
          // operator could act on.
          {
            key: "paused",
            label: "Paused or ended this period",
            sub: "Not in delivery. For reference only.",
            color: P.label || "#9ca3af",
            dimmed: true
          }
        ];

        var anyVisible = sectionDefs.some(function(d) { return byBucket[d.key].length > 0; });
        if (!anyVisible) {
          if (filterMode === "attention") {
            return <Glass st={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: P.mint, fontFamily: ff, fontWeight: 700 }}>Nothing needs attention right now.</div>
              <div style={{ fontSize: 11, color: P.caption, fontFamily: fm, marginTop: 6 }}>Every in-flight campaign is healthy in this window. Switch to All to see the live load.</div>
            </Glass>;
          }
          return null;
        }

        return <React.Fragment>
          {/* Compact per-client overview chip strip so the operator can
              still see per-client roll-ups now that the main layout is
              priority-bucket based rather than per-client grouped. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
            {s.data.clients.map(function(grp) {
              var col = grp.rollup.alerts > 0 ? (P.critical || "#ef4444") : P.mint;
              return <div key={grp.client} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderLeft: "3px solid " + col, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: fm }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: P.txt }}>{grp.client}</span>
                <span style={{ fontSize: 9, color: P.label, letterSpacing: 1 }}>{grp.rollup.live} live · {R(grp.rollup.spendPeriod)}</span>
                {grp.rollup.alerts > 0 && <span style={{ fontSize: 9, fontWeight: 900, color: col, letterSpacing: 1 }}>{grp.rollup.alerts} ALERTS</span>}
              </div>;
            })}
          </div>

          {sectionDefs.map(function(def) {
            var rows = byBucket[def.key];
            if (rows.length === 0) return null;
            return <div key={def.key} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 8, borderBottom: (def.dimmed ? "1px dashed " : "1px solid ") + def.color + (def.dimmed ? "55" : "55") }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ background: def.color + "22", border: "1px solid " + def.color + "66", color: def.color, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, padding: "4px 10px", borderRadius: 5, textTransform: "uppercase" }}>{def.label} · {rows.length}</span>
                  <span style={{ fontSize: 11, color: P.label, fontFamily: fm, fontStyle: "italic" }}>{def.sub}</span>
                </div>
              </div>
              {rows.map(function(r) {
                return <div key={r.c.campaignId} style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, color: P.caption, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, marginLeft: 4 }}>{r.client}</div>
                  {renderCampaignRow(r.c, def.dimmed)}
                </div>;
              })}
            </div>;
          })}
        </React.Fragment>;
      })()}

      <div style={{ fontSize: 9.5, color: P.caption, fontFamily: fm, fontStyle: "italic", marginTop: 8, lineHeight: 1.6 }}>
        Internal operations view, scoped to your selected dates. The headline metric and cost match the campaign's own KPI (leads, page likes on Facebook, profile visits on Instagram, follows on TikTok, app store clicks, traffic clicks, or impressions for awareness). Pacing covers daily and lifetime budgets over days elapsed in the window; ABO budgets resolve at ad-set level via Graph. Not shown to clients.
      </div>
    </div>}
  </div>;
}
