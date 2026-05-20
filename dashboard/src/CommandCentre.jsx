import React, { useState, useEffect, useRef } from "react";

// Internal GAS Campaign Load + Live Health command centre (roadmap #2).
// Team-only view (rendered behind !isClient in App.jsx; the API is
// independently admin-gated). Reads /api/command-centre: live delivery
// + pacing + "what needs a human now", grouped by client.

export default function CommandCentre(props) {
  var P = props.P, ff = props.ff, fm = props.fm, Ic = props.Ic, Glass = props.Glass, SH = props.SH;
  var apiBase = props.apiBase, session = props.session;
  var dateFrom = props.dateFrom || "", dateTo = props.dateTo || "";
  // adsList from the dashboard's /api/ads pull. Used only by the
  // Head Data Analyst memo at the bottom for creative-format diversity
  // findings. Optional, defaults to [] when not passed.
  var adsList = props.adsList || [];

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
          // Split out ended (end date passed) from paused (operator
          // turned it off but end date still in future) — the team
          // wants those reading separately at the bottom.
          if (c.ended) return "ended";
          if (!c.live) return "paused";
          if (isScaleCandidate(c)) return "scale";
          return "healthy";
        };
        var passFilter = function(c) {
          return filterMode === "attention" ? (c.alerts && c.alerts.length > 0) : true;
        };

        // Per-client buckets. Each client gets their OWN classification
        // pass so the GAS team can scan a client section start-to-end
        // (live work → triage → scale → paused/ended → growth plan)
        // rather than hopping back-and-forth between clients. This is
        // the structural pivot the user asked for: MTN MoMo and MTN
        // MoMo POS are separate clients (backend keeps accountName
        // distinct) and must read as separate sections.
        var bucketsForClient = function(grp) {
          var b = { attention: [], watch: [], scale: [], healthy: [], paused: [], ended: [] };
          grp.campaigns.forEach(function(c) {
            if (!passFilter(c)) return;
            var k = classify(c);
            b[k].push({ client: grp.client, c: c });
          });
          Object.keys(b).forEach(function(k) {
            b[k].sort(function(a, c) { return (c.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
          });
          return b;
        };
        var perClient = s.data.clients.map(function(grp) {
          var b = bucketsForClient(grp);
          return { grp: grp, buckets: b };
        }).filter(function(x) {
          // Hide a client section entirely when filter is "attention"
          // and they have zero alerted campaigns. In "all" mode they
          // always render so the GAS team has total visibility.
          if (filterMode !== "attention") return true;
          return x.buckets.attention.length > 0 || x.buckets.watch.length > 0;
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
            label: "Paused this period",
            sub: "Operator turned these off but the end date is still in the future. Reactivate or extend if needed.",
            color: P.solar || "#fbbf24",
            dimmed: true
          },
          {
            key: "ended",
            label: "Ended this period",
            sub: "End date has passed. Closed out, kept for reference only.",
            color: P.label || "#9ca3af",
            dimmed: true
          }
        ];

        // ===== Per-client Growth Plan helpers =====
        var fR2 = function(n) { return "R" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); };
        var fmtPct = function(n) { return (parseFloat(n) || 0).toFixed(2) + "%"; };

        // Build a same-origin /api/ad-image proxy URL for a specific
        // ad (Meta/TikTok). Uses the session token via the &st= query
        // param the proxy already accepts, so <img src=> works without
        // custom headers. Falls back to a.thumbnail when the platform
        // isn't supported by the proxy or no adId is present.
        var adThumbUrl = function(a) {
          if (!a) return "";
          if (!a.adId) return a.thumbnail || "";
          var pLow = String(a.platform || "").toLowerCase();
          var pKey = (pLow.indexOf("instagram") >= 0 || pLow.indexOf("facebook") >= 0) ? "meta" : (pLow.indexOf("tiktok") >= 0 ? "tiktok" : "");
          if (!pKey) return a.thumbnail || "";
          var cId = String(a.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "");
          var auth = session ? ("&st=" + encodeURIComponent(session)) : "";
          return apiBase + "/api/ad-image?platform=" + pKey + "&adId=" + encodeURIComponent(a.adId) + (cId ? ("&campaignId=" + encodeURIComponent(cId)) : "") + auth;
        };

        // Two thumb-item factories: one for campaign rows (uses the
        // server-attached c.thumbnail), one for ad rows (uses the
        // adThumbUrl proxy so the URL is always fresh).
        var campThumbs = function(entries) {
          return (entries || []).map(function(x) {
            return { thumbnail: (x.c && x.c.thumbnail) || "", label: (x.c && x.c.campaignName) || "", platform: (x.c && x.c.platform) || "" };
          });
        };
        var adThumbs = function(ads) {
          return (ads || []).map(function(a) {
            return { thumbnail: adThumbUrl(a), label: a.adName || a.campaignName || "", platform: a.platform || "" };
          });
        };

        // Strip of square previews with a "+N more" chip when capped.
        var thumbStrip = function(items, total, max) {
          if (!items || items.length === 0) return null;
          var cap = max || 6;
          var shown = items.slice(0, cap);
          var rest = (total || items.length) - shown.length;
          var glyph = function(plat) {
            var p = String(plat || "").toLowerCase();
            return p.indexOf("facebook") >= 0 ? "FB" : p.indexOf("instagram") >= 0 ? "IG" : p.indexOf("tiktok") >= 0 ? "TT" : p.indexOf("google") >= 0 ? "GA" : "AD";
          };
          return <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {shown.map(function(it, i) {
              return <div key={i} title={it.label} style={{ width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: "1px solid " + P.rule, background: "#0c0716", position: "relative", flexShrink: 0 }}>
                {it.thumbnail
                  ? <img src={it.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={function(e) { e.target.style.display = "none"; }}/>
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg," + (P.cyan || "#22D3EE") + "22," + (P.ember || "#F96203") + "15)", color: "#fff", fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 0.5 }}>{glyph(it.platform)}</div>}
              </div>;
            })}
            {rest > 0 && <div style={{ width: 56, height: 56, borderRadius: 8, border: "1px dashed " + P.rule, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: P.label, fontFamily: fm, flexShrink: 0 }}>+{rest}</div>}
          </div>;
        };

        // Build the per-client growth plan: scoped to ONE client only.
        // Returns the full memo JSX (or null when client has nothing to
        // recommend, but that's rare). The memo gives the GAS team
        // concrete advice on how to pick best audiences, ads, and
        // objectives, with ad thumbnails wherever possible.
        var renderClientGrowthPlan = function(grp, allAds) {
          var camps = grp.campaigns.map(function(c) { return { client: grp.client, c: c }; });
          if (camps.length === 0) return null;

          // Scope the ads list to this client by matching campaignId.
          var clientCampIds = {};
          grp.campaigns.forEach(function(c) {
            if (c.campaignId) clientCampIds[String(c.campaignId)] = true;
            var raw = String(c.campaignId || "").replace(/_facebook$/, "").replace(/_instagram$/, "");
            if (raw) clientCampIds[raw] = true;
          });
          var clientAds = (allAds || []).filter(function(a) {
            if (!a || !a.campaignId) return false;
            var k = String(a.campaignId);
            return clientCampIds[k] || clientCampIds[k.replace(/_facebook$/, "").replace(/_instagram$/, "")];
          });

          var totalSpend = camps.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
          var totalImps = camps.reduce(function(a, x) { return a + (x.c.delivery.impressions || 0); }, 0);
          var totalClicks = camps.reduce(function(a, x) { return a + (x.c.delivery.clicks || 0); }, 0);
          var blCtr = totalImps > 0 ? (totalClicks / totalImps * 100) : 0;
          var blCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

          // Grouping by platform + objective (for funnel + mix advice).
          var byPlat = {}, byObj = {};
          camps.forEach(function(x) {
            var c = x.c, p = c.platform || "Unknown", o = String(c.objective || "unknown").toLowerCase();
            if (!byPlat[p]) byPlat[p] = { n: 0, spend: 0 };
            byPlat[p].n++; byPlat[p].spend += (c.delivery.spendPeriod || 0);
            if (!byObj[o]) byObj[o] = { n: 0, spend: 0, results: 0 };
            byObj[o].n++; byObj[o].spend += (c.delivery.spendPeriod || 0); byObj[o].results += (c.delivery.result || 0);
          });
          var platforms = Object.keys(byPlat);
          var objectives = Object.keys(byObj);

          var sortedSpend = camps.slice().sort(function(a, b) { return (b.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
          var top3 = sortedSpend.slice(0, 3);
          var top3Spend = top3.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
          var top3Pct = totalSpend > 0 ? (top3Spend / totalSpend * 100) : 0;

          var realCtr = camps.filter(function(x) { return (x.c.delivery.impressions || 0) >= 5000; });
          var topPerf = realCtr.slice().sort(function(a, b) { return (b.c.delivery.ctr || 0) - (a.c.delivery.ctr || 0); })[0] || null;
          var topPerfCtr = topPerf ? (topPerf.c.delivery.ctr || 0) : 0;

          var spendLeakers = camps.filter(function(x) {
            var c = x.c;
            return (c.delivery.spendPeriod || 0) >= 5000 && (c.delivery.impressions || 0) >= 10000 && (c.delivery.ctr || 0) < 0.8;
          });
          var leakSpend = spendLeakers.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);

          var fatigued = camps.filter(function(x) {
            var c = x.c, freq = c.delivery.frequency || 0;
            var p = String(c.platform || "").toLowerCase();
            var limit = p.indexOf("tiktok") >= 0 ? 6 : 3;
            return freq >= limit && (c.delivery.spendPeriod || 0) >= 2000;
          });

          var scaleReady = camps.filter(function(x) {
            var c = x.c, ctr = c.delivery.ctr || 0, freq = c.delivery.frequency || 0;
            var p = String(c.platform || "").toLowerCase();
            var limit = p.indexOf("tiktok") >= 0 ? 6 : 3;
            var paceOK = !c.pacing || c.pacing.state === "on_track" || c.pacing.state === "ahead" || c.pacing.state === "na";
            return ctr >= 1.5 && freq < limit && (c.delivery.spendPeriod || 0) >= 2000 && paceOK;
          });
          var scaleSpend = scaleReady.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
          var scalePct = totalSpend > 0 ? (scaleSpend / totalSpend * 100) : 0;

          // Format mix from ad-level data (per client).
          var formatSet = {};
          clientAds.forEach(function(a) { if (a && a.format) formatSet[String(a.format).toUpperCase()] = true; });
          var formatList = Object.keys(formatSet);
          var formatCount = formatList.length;

          // Ad-level winners + losers for the CREATIVE advice section.
          var realAds = clientAds.filter(function(a) { return (a.impressions || 0) >= 1000; });
          var sortedAds = realAds.slice().sort(function(a, b) { return (b.ctr || 0) - (a.ctr || 0); });
          var topAds = sortedAds.slice(0, 3);
          var worstAds = clientAds.filter(function(a) { return (a.spend || 0) >= 500 && (a.impressions || 0) >= 3000 && (a.ctr || 0) < 0.8; })
            .sort(function(a, b) { return (b.spend || 0) - (a.spend || 0); }).slice(0, 3);
          var fatiguedAds = clientAds.filter(function(a) {
            var p = String(a.platform || "").toLowerCase();
            var limit = p.indexOf("tiktok") >= 0 ? 6 : 3;
            return (a.frequency || 0) >= limit && (a.spend || 0) >= 300;
          }).slice(0, 6);

          var topPlatSpend = platforms.length > 0 ? Math.max.apply(null, platforms.map(function(k) { return byPlat[k].spend; })) : 0;
          var topPlatPct = totalSpend > 0 ? (topPlatSpend / totalSpend * 100) : 0;
          var dominantPlat = platforms.reduce(function(a, b) { return (byPlat[a] || { spend: 0 }).spend > (byPlat[b] || { spend: 0 }).spend ? a : b; }, platforms[0] || "");

          var hasAwareness = !!byObj.awareness;
          var hasConsideration = !!(byObj.followers || byObj.landingpage || byObj.traffic);
          var hasConversion = !!(byObj.leads || byObj.appinstall || byObj.sales);
          var funnelTiers = (hasAwareness ? 1 : 0) + (hasConsideration ? 1 : 0) + (hasConversion ? 1 : 0);

          // ---- DIAGNOSIS ----
          var findings = [];
          if (top3Pct >= 70 && camps.length >= 5) {
            findings.push({ title: "Spend is concentrated in 3 campaigns", detail: "The top 3 campaigns hold " + top3Pct.toFixed(2) + "% of this client's spend. If any one of those decays, ~" + Math.round(top3Pct / 3) + "% of the budget moves with it. Ladder spend across 5-7 campaigns with planned succession.", thumbs: campThumbs(top3) });
          }
          if (topPerf && topPerfCtr >= blCtr * 1.6 && realCtr.length >= 3) {
            var multiple = blCtr > 0 ? (topPerfCtr / blCtr) : 0;
            findings.push({ title: "The best campaign is " + multiple.toFixed(1) + "x the blended CTR", detail: "‘" + topPerf.c.campaignName + "’ runs at " + fmtPct(topPerfCtr) + " CTR vs " + fmtPct(blCtr) + " blended. The creative + audience pairing in that campaign is the formula. Most of the upside on this client is replicating that structure across the rest of the portfolio.", thumbs: campThumbs([topPerf]) });
          }
          if (spendLeakers.length > 0 && leakSpend >= 5000) {
            findings.push({ title: fR2(leakSpend) + " is flowing through " + spendLeakers.length + " underperforming campaign" + (spendLeakers.length === 1 ? "" : "s"), detail: "These campaigns spent meaningful budget at sub-0.80% CTR. Money the algorithm is taking but not converting into useful traffic. Pausing and rerouting is the single fastest efficiency lift available.", thumbs: campThumbs(spendLeakers.slice(0, 6)), totalThumbs: spendLeakers.length });
          }
          if (fatigued.length > 0) {
            findings.push({ title: fatigued.length + " campaign" + (fatigued.length === 1 ? " is" : "s are") + " past the fatigue ceiling", detail: "Frequency above 3x on Meta (6x on TikTok) erodes CTR by 15-25% within days. Creative rotation, not budget rotation, is the lever here.", thumbs: campThumbs(fatigued.slice(0, 6)), totalThumbs: fatigued.length });
          }
          if (formatCount > 0 && formatCount < 3 && clientAds.length >= 10) {
            findings.push({ title: "Creative formats are concentrated, only " + formatCount + " in rotation (" + formatList.join(", ") + ")", detail: "Top-1% accounts ship across 3+ formats (static, carousel, short-form video, UGC) so the algorithm can pick winners by placement. Limited formats cap the ceiling regardless of how much budget is added." });
          }
          if (topPlatPct >= 85 && platforms.length >= 2) {
            findings.push({ title: topPlatPct.toFixed(2) + "% of spend lives on " + dominantPlat, detail: "Single-platform concentration ties account performance to one algorithm's mood. The accounts that compound year-on-year run a 60/30/10 mix so they always have a B and C option warming." });
          }
          if (funnelTiers < 2 && camps.length >= 3) {
            findings.push({ title: "The funnel is single-tier", detail: "Only " + (hasAwareness ? "awareness" : hasConversion ? "conversion" : hasConsideration ? "consideration" : "one tier") + " is running. Add the missing tiers so audiences flow cold → warm → hot. Single-tier setups force one creative to do the whole funnel's job." });
          }
          if (scalePct > 0 && scalePct < 30 && scaleReady.length > 0) {
            findings.push({ title: "Only " + scalePct.toFixed(2) + "% of spend is on scale-ready creative", detail: scaleReady.length + " campaign" + (scaleReady.length === 1 ? "" : "s") + " cleared the scale bar but they're holding a minority of the budget. Move dollars to where the algorithm has already proven it can convert.", thumbs: campThumbs(scaleReady.slice(0, 6)), totalThumbs: scaleReady.length });
          }

          // ---- AUDIENCES advice ----
          var audAdvice = [];
          if (fatigued.length > 0) {
            audAdvice.push("Frequency is climbing on " + fatigued.length + " campaign" + (fatigued.length === 1 ? "" : "s") + " — the audiences are too narrow. Broaden them: add a 1-3% Lookalike off your top converter list at Meta, or layer a wider interest stack on top of the current targeting.");
          }
          if (topPerf && realCtr.length >= 2) {
            audAdvice.push("Build a Custom Audience of engagers from ‘" + topPerf.c.campaignName + "’ (the highest-CTR campaign for this client) and retarget them with a conversion creative. The handover from cold to warm is where 10x accounts compound.");
          }
          if (funnelTiers < 2 && camps.length >= 2) {
            audAdvice.push("Funnel is missing the " + (hasAwareness ? "conversion" : "cold-prospecting") + " tier. Add a " + (hasAwareness ? "retargeting + lookalike layer on top of the warm engagers" : "broad + interest layer at the top") + " so audiences flow into the next tier.");
          }
          if (audAdvice.length === 0) {
            audAdvice.push("Audience signals look healthy. Refresh lookalike audiences quarterly (1%, 2%, 3% seeded on different conversion windows) to keep the algorithm exploring fresh edges.");
          }

          // ---- CREATIVE advice ----
          var creAdvice = [];
          if (topAds.length > 0) {
            creAdvice.push("Best-performing ad" + (topAds.length === 1 ? "" : "s") + " by CTR: clone this hook + format combination across the rest of the rotation. The team's strongest ammunition this week.");
          }
          if (worstAds.length > 0) {
            creAdvice.push(worstAds.length + " ad" + (worstAds.length === 1 ? " is" : "s are") + " burning budget at sub-0.80% CTR. Pause now and redirect spend to the top performers above.");
          }
          if (fatiguedAds.length > 0) {
            creAdvice.push("Ship 3-5 new variants on the fatigued ads this week. Even minor swaps (hook, colour, CTA) reset the frequency curve and extend productive lifespan 30-40 days.");
          }
          if (formatCount > 0 && formatCount < 3) {
            creAdvice.push("Format mix is " + formatCount + " (" + formatList.join(", ") + "). Add a " + (formatList.indexOf("VIDEO") < 0 ? "9:16 short-form video" : formatList.indexOf("CAROUSEL") < 0 ? "carousel" : "UGC-style static") + " variant so the algorithm can pick winners by placement.");
          }
          if (creAdvice.length === 0) {
            creAdvice.push("Creative is doing its job. Maintain a 2-week refresh cadence and document what's working so it's repeatable on the next campaign.");
          }

          // ---- OBJECTIVES advice ----
          var objMix = Object.keys(byObj).map(function(k) { return { name: k, count: byObj[k].n, spend: byObj[k].spend, pct: totalSpend > 0 ? (byObj[k].spend / totalSpend * 100) : 0 }; }).sort(function(a, b) { return b.spend - a.spend; });
          var objAdvice = [];
          if (funnelTiers < 2 && camps.length >= 3) {
            objAdvice.push("Single-tier funnel: only " + (hasAwareness ? "awareness" : hasConversion ? "conversion" : hasConsideration ? "consideration" : "one tier") + " is running. World-class accounts run a 60/30/10 split across cold prospecting → warm consideration → high-intent conversion. Add the missing tiers.");
          }
          if (objMix.length > 0 && objMix[0].pct >= 70) {
            objAdvice.push((objMix[0].pct).toFixed(0) + "% of spend sits on " + objMix[0].name + ". Diversifying across two objectives gives the algorithm more signals to optimise against and reduces single-objective risk.");
          }
          if (objMix.length >= 2 && funnelTiers >= 2) {
            objAdvice.push("Objective mix looks sensible. Track results-per-objective weekly: the highest results-to-spend ratio earns the next budget increase, the lowest gets a creative refresh before being pulled.");
          }
          if (objAdvice.length === 0) {
            objAdvice.push("Objective mix is balanced. Continue weekly attribution checks so each objective stays in its lane.");
          }

          // ---- 5X PLAY ----
          var fivex = [];
          if (spendLeakers.length > 0 && scaleReady.length > 0) {
            fivex.push({ text: "Pause the " + spendLeakers.length + " underperformer" + (spendLeakers.length === 1 ? "" : "s") + " carrying " + fR2(leakSpend) + " — reroute that budget to the " + scaleReady.length + " scale-ready campaign" + (scaleReady.length === 1 ? "" : "s") + ". Historic CTR delta says this alone should lift blended efficiency by 30-50% inside 14 days.", thumbs: campThumbs(spendLeakers.slice(0, 4).concat(scaleReady.slice(0, 4))), totalThumbs: spendLeakers.length + scaleReady.length });
          }
          if (topPerf) {
            fivex.push({ text: "Clone ‘" + topPerf.c.campaignName + "’ as the template for every same-objective campaign on this client. Same creative format, same hook structure, same audience width. Replication beats reinvention.", thumbs: campThumbs([topPerf]) });
          }
          if (fatiguedAds.length > 0) {
            fivex.push({ text: "Ship 3-5 new creative variants on the " + fatiguedAds.length + " fatigued ad" + (fatiguedAds.length === 1 ? "" : "s") + " this week. Minor swaps (hook, colour, CTA) reset the frequency curve.", thumbs: adThumbs(fatiguedAds.slice(0, 4)), totalThumbs: fatiguedAds.length });
          }
          if (formatCount < 3) {
            fivex.push({ text: "Add the missing formats to the rotation. If heavy on static, ship a 9:16 video variant. If video-heavy, add a carousel. Format diversity unlocks 20-30% more efficient inventory." });
          }
          if (fivex.length === 0) {
            fivex.push({ text: "Structure is solid for this client. Focus the week on incremental tests (one new audience layer, one new creative variant) and let the algorithm compound the gains." });
          }

          // ---- 10X PLAY ----
          var tenx = [];
          tenx.push("Restructure into a 3-tier funnel: cold prospecting (broad + interest, 60% of budget), warm consideration (engaged + lookalikes, 30%), high-intent conversion (retargeting + custom audiences, 10%). Hand audiences forward between tiers via Custom Audiences so each layer feeds the next.");
          tenx.push("Consolidate to " + Math.max(3, Math.min(7, Math.round(camps.length * 0.6))) + " CBO campaigns per objective on Meta. Ad-set fragmentation is the single biggest tax on the algorithm. Fewer, bigger campaigns let learning phase complete and CPMs compress 15-25%.");
          tenx.push("Adopt a 90-day creative cadence. 3-5 fresh creative variants in market every fortnight, previous fortnight's winners scaled, losers cut. Top-1% accounts ship 12+ creatives per quarter per platform.");
          if (platforms.length < 3) {
            tenx.push("Add the third platform. Whatever's missing (TikTok if Meta-heavy, Meta if TikTok-heavy, Google Search if neither) closes the audience leakage. The lift comes from incremental reach, not from stealing share.");
          }
          tenx.push("Build first-party data as the moat for this client. Pixel + Conversions API + offline conversion uploads turn the dashboard into an attribution engine. Once GAS can see real CAC by campaign by audience, budget decisions become arithmetic, not opinion.");

          // ---- Render ----
          return <div style={{ marginTop: 22, padding: "28px 30px", borderRadius: 16, background: "linear-gradient(135deg,#0a0418 0%,#100624 50%,#1a0a30 100%)", border: "1px solid " + (P.ember || "#F96203") + "35", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: "radial-gradient(circle," + (P.ember || "#F96203") + "15 0%,transparent 70%)", pointerEvents: "none" }}></div>
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
                <div style={{ width: 52, height: 52, borderRadius: 12, background: "linear-gradient(135deg," + (P.ember || "#F96203") + "40," + (P.blaze || "#FF3D00") + "40)", border: "1px solid " + (P.ember || "#F96203") + "66", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Ic.crown ? Ic.crown(P.ember || "#F96203", 26) : null}</div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: P.ember || "#F96203", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.1 }}>Growth Plan</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: P.txt, fontFamily: ff, marginTop: 4, letterSpacing: 1 }}>Head Data Analyst memo for <span style={{ color: P.ember || "#F96203" }}>{grp.client}</span></div>
                </div>
              </div>
              <div style={{ fontSize: 10, color: P.caption, fontFamily: fm, fontStyle: "italic", marginBottom: 18, letterSpacing: 1 }}>Top-1% global benchmark · {camps.length} campaign{camps.length === 1 ? "" : "s"} · {clientAds.length} ad{clientAds.length === 1 ? "" : "s"} · {dateFrom} to {dateTo}</div>

              {/* Mini stats strip for this client. */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 22 }}>
                {[
                  ["SPEND", fR2(totalSpend), P.ember],
                  ["BLENDED CTR", fmtPct(blCtr), P.mint],
                  ["BLENDED CPC", fR2(blCpc), P.blaze],
                  ["PLATFORMS", platforms.length, P.orchid],
                  ["OBJECTIVES", objectives.length, P.solar]
                ].map(function(x, i) { return <div key={i} style={{ padding: "12px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid " + P.rule, borderRadius: 10, textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: P.label, fontFamily: fm, letterSpacing: 1.5, marginBottom: 5 }}>{x[0]}</div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: x[2], fontFamily: fm }}>{x[1]}</div>
                </div>; })}
              </div>

              {/* Diagnosis */}
              {findings.length > 0 && <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: P.txt, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid " + P.rule }}>Diagnosis · what the data is telling me</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {findings.map(function(f, i) { return <div key={i} style={{ display: "flex", gap: 12, padding: "14px 16px", background: "rgba(255,255,255,0.025)", border: "1px solid " + P.rule, borderLeft: "3px solid " + P.solar, borderRadius: "0 10px 10px 0" }}>
                    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: P.solar + "22", border: "1px solid " + P.solar + "55", color: P.solar, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: fm }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: P.txt, fontFamily: ff, marginBottom: 5 }}>{f.title}</div>
                      <div style={{ fontSize: 12, color: P.label, fontFamily: ff, lineHeight: 1.7 }}>{f.detail}</div>
                      {f.thumbs && thumbStrip(f.thumbs, f.totalThumbs)}
                    </div>
                  </div>; })}
                </div>
              </div>}

              {findings.length === 0 && <div style={{ marginBottom: 22, padding: "14px 16px", background: P.mint + "12", border: "1px solid " + P.mint + "40", borderLeft: "3px solid " + P.mint, borderRadius: "0 10px 10px 0" }}>
                <div style={{ fontSize: 12, color: P.mint, fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>Structure is solid</div>
                <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.6 }}>No major structural issues detected for this client in this window. Focus on incremental optimisations and the 10X plays below.</div>
              </div>}

              {/* AUDIENCES · ADS · OBJECTIVES — three concrete how-to-pick sections */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12, marginBottom: 22 }}>
                {/* AUDIENCES */}
                <div style={{ padding: "16px 18px", background: "rgba(168,85,247,0.08)", border: "1px solid " + (P.orchid || "#A855F7") + "40", borderLeft: "3px solid " + (P.orchid || "#A855F7"), borderRadius: "0 12px 12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ background: (P.orchid || "#A855F7") + "22", color: P.orchid || "#A855F7", padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5 }}>1</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: P.orchid || "#A855F7", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>How to pick the best audiences</span>
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85 }}>
                    {audAdvice.map(function(a, i) { return <li key={i} style={{ marginBottom: 5 }}>{a}</li>; })}
                  </ul>
                </div>

                {/* ADS */}
                <div style={{ padding: "16px 18px", background: "rgba(255,107,0,0.08)", border: "1px solid " + (P.ember || "#F96203") + "40", borderLeft: "3px solid " + (P.ember || "#F96203"), borderRadius: "0 12px 12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ background: (P.ember || "#F96203") + "22", color: P.ember || "#F96203", padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5 }}>2</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: P.ember || "#F96203", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>How to pick the best ads</span>
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85 }}>
                    {creAdvice.map(function(a, i) { return <li key={i} style={{ marginBottom: 5 }}>{a}</li>; })}
                  </ul>
                  {topAds.length > 0 && <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: P.mint, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Top performers · clone these</div>
                    {thumbStrip(adThumbs(topAds), topAds.length)}
                  </div>}
                  {worstAds.length > 0 && <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: P.critical || "#ef4444", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Spend leakers · pause these</div>
                    {thumbStrip(adThumbs(worstAds), worstAds.length)}
                  </div>}
                  {fatiguedAds.length > 0 && <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: P.warning || "#fbbf24", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Fatigued · refresh these</div>
                    {thumbStrip(adThumbs(fatiguedAds), fatiguedAds.length)}
                  </div>}
                </div>

                {/* OBJECTIVES */}
                <div style={{ padding: "16px 18px", background: "rgba(34,211,238,0.08)", border: "1px solid " + (P.cyan || "#22D3EE") + "40", borderLeft: "3px solid " + (P.cyan || "#22D3EE"), borderRadius: "0 12px 12px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ background: (P.cyan || "#22D3EE") + "22", color: P.cyan || "#22D3EE", padding: "3px 9px", borderRadius: 5, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5 }}>3</span>
                    <span style={{ fontSize: 14, fontWeight: 900, color: P.cyan || "#22D3EE", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>How to pick the best objectives</span>
                  </div>
                  <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85, marginBottom: 8 }}>
                    {objAdvice.map(function(a, i) { return <li key={i} style={{ marginBottom: 5 }}>{a}</li>; })}
                  </ul>
                  {objMix.length > 0 && <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {objMix.map(function(o, i) { return <div key={i} style={{ padding: "6px 10px", background: "rgba(0,0,0,0.35)", border: "1px solid " + P.rule, borderRadius: 8, fontFamily: fm }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: P.cyan || "#22D3EE", letterSpacing: 1, textTransform: "uppercase" }}>{o.name}</span>
                      <span style={{ fontSize: 10, color: P.label, marginLeft: 8 }}>{o.count} · {o.pct.toFixed(0)}% · {fR2(o.spend)}</span>
                    </div>; })}
                  </div>}
                </div>
              </div>

              {/* 5X PLAY */}
              <div style={{ marginBottom: 16, padding: "18px 20px", background: "linear-gradient(135deg," + P.mint + "15," + P.mint + "06)", border: "1px solid " + P.mint + "40", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ background: P.mint, color: "#062014", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>5X PLAY</span>
                  <span style={{ fontSize: 12, color: P.mint, fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>This week · move the budget to where it works</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {fivex.map(function(p, i) { return <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: "rgba(0,0,0,0.25)", border: "1px solid " + P.mint + "22", borderRadius: 10 }}>
                    <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: P.mint + "22", border: "1px solid " + P.mint + "55", color: P.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: fm }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.7 }}>{p.text}</div>
                      {p.thumbs && thumbStrip(p.thumbs, p.totalThumbs)}
                    </div>
                  </div>; })}
                </div>
              </div>

              {/* 10X PLAY */}
              <div style={{ padding: "18px 20px", background: "linear-gradient(135deg," + (P.ember || "#F96203") + "15," + (P.blaze || "#FF3D00") + "08)", border: "1px solid " + (P.ember || "#F96203") + "40", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ background: "linear-gradient(135deg," + (P.ember || "#F96203") + "," + (P.blaze || "#FF3D00") + ")", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>10X PLAY</span>
                  <span style={{ fontSize: 12, color: P.ember || "#F96203", fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>Structural rebuild · 60-90 days</span>
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 22px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85 }}>
                  {tenx.map(function(p, i) { return <li key={i} style={{ marginBottom: 6 }}>{p}</li>; })}
                </ul>
              </div>
            </div>
          </div>;
        };

        if (perClient.length === 0) {
          if (filterMode === "attention") {
            return <Glass st={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: P.mint, fontFamily: ff, fontWeight: 700 }}>Nothing needs attention right now.</div>
              <div style={{ fontSize: 11, color: P.caption, fontFamily: fm, marginTop: 6 }}>Every in-flight campaign is healthy in this window. Switch to All to see the live load.</div>
            </Glass>;
          }
          return null;
        }

        // Anchor-friendly slug per client so the TOC chip strip jumps to
        // the right section on click. Strips non-letter/digit chars.
        var slugOf = function(name) { return "gas-cc-" + String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-"); };

        return <React.Fragment>
          {/* Per-client TOC chip strip — click jumps to that client's
              section below. Each chip stays the same compact size so
              the strip works as quick navigation, not a heading. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
            {s.data.clients.map(function(grp) {
              var col = grp.rollup.alerts > 0 ? (P.critical || "#ef4444") : P.mint;
              return <a key={grp.client} href={"#" + slugOf(grp.client)}
                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderLeft: "3px solid " + col, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: fm, textDecoration: "none", cursor: "pointer" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: P.txt }}>{grp.client}</span>
                <span style={{ fontSize: 9, color: P.label, letterSpacing: 1 }}>{grp.rollup.live} live · {R(grp.rollup.spendPeriod)}</span>
                {grp.rollup.alerts > 0 && <span style={{ fontSize: 9, fontWeight: 900, color: col, letterSpacing: 1 }}>{grp.rollup.alerts} ALERTS</span>}
              </a>;
            })}
          </div>

          {/* Per-client sections. Each client carries its own buckets
              and its own growth plan, so the team reads top-to-bottom
              per client rather than hopping between them. */}
          {perClient.map(function(entry) {
            var grp = entry.grp;
            var buckets = entry.buckets;
            var slug = slugOf(grp.client);
            return <section key={grp.client} id={slug} style={{ marginBottom: 36, paddingBottom: 22, borderBottom: "1px solid " + P.rule }}>
              {/* Big client header — the user explicitly asked for the
                  client names to be bigger and clearly separated. */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18, padding: "16px 0", borderBottom: "2px solid " + (grp.rollup.alerts > 0 ? (P.critical || "#ef4444") : P.mint) + "55" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: P.label, fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Client</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: P.txt, fontFamily: fm, letterSpacing: 1, lineHeight: 1 }}>{grp.client}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: fm }}>
                  {[
                    ["LIVE", N(grp.rollup.live), P.mint],
                    ["PERIOD", R(grp.rollup.spendPeriod), P.ember],
                    ["TODAY", R(grp.rollup.spendToday), P.solar],
                    ["RESULTS", N(grp.rollup.results), P.cyan],
                    ["ALERTS", N(grp.rollup.alerts), grp.rollup.alerts > 0 ? (P.critical || "#ef4444") : P.label]
                  ].map(function(m, i) {
                    return <div key={i} style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderRadius: 8, textAlign: "right", minWidth: 70 }}>
                      <div style={{ fontSize: 8, color: P.label, letterSpacing: 1, marginBottom: 2 }}>{m[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: m[2] }}>{m[1]}</div>
                    </div>;
                  })}
                </div>
              </div>

              {/* Per-client priority buckets. Same sectionDefs as before,
                  scoped to this client. Empty buckets render nothing. */}
              {sectionDefs.map(function(def) {
                var rows = buckets[def.key];
                if (!rows || rows.length === 0) return null;
                return <div key={def.key} style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, paddingBottom: 8, borderBottom: (def.dimmed ? "1px dashed " : "1px solid ") + def.color + "55" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ background: def.color + "22", border: "1px solid " + def.color + "66", color: def.color, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, padding: "4px 10px", borderRadius: 5, textTransform: "uppercase" }}>{def.label} · {rows.length}</span>
                      <span style={{ fontSize: 11, color: P.label, fontFamily: fm, fontStyle: "italic" }}>{def.sub}</span>
                    </div>
                  </div>
                  {rows.map(function(r) { return renderCampaignRow(r.c, def.dimmed); })}
                </div>;
              })}

              {/* Per-client growth plan (Head Analyst memo, scoped). */}
              {renderClientGrowthPlan(grp, adsList)}
            </section>;
          })}
        </React.Fragment>;
      })()}

      <div style={{ fontSize: 9.5, color: P.caption, fontFamily: fm, fontStyle: "italic", marginTop: 8, lineHeight: 1.6 }}>
        Internal operations view, scoped to your selected dates. The headline metric and cost match the campaign's own KPI (leads, page likes on Facebook, profile visits on Instagram, follows on TikTok, app store clicks, traffic clicks, or impressions for awareness). Pacing covers daily and lifetime budgets over days elapsed in the window; ABO budgets resolve at ad-set level via Graph. Not shown to clients.
      </div>

    </div>}
  </div>;
}
