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

        // Sort each bucket by spend so the most material rows surface
        // first within the bucket. Each entry keeps its client label.
        var byBucket = { attention: [], watch: [], scale: [], healthy: [], paused: [], ended: [] };
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

      {/* ============================================================
          HEAD DATA ANALYST RECOMMENDATION
          Senior-analyst memo at the bottom of the Command Centre.
          Computed live from every in-flight campaign across all
          clients in the selected window, so the GAS team gets one
          data-driven restructure brief covering the whole book.
          ============================================================ */}
      {(function() {
        var fR = function(n) { return "R" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 }); };
        var fmtPct = function(n) { return (parseFloat(n) || 0).toFixed(2) + "%"; };

        // Flatten every in-flight campaign across clients. The Command
        // Centre /api/command-centre endpoint already filters out
        // dormant campaigns, so this list is the "live book".
        var allCamps = [];
        s.data.clients.forEach(function(grp) {
          grp.campaigns.forEach(function(c) { allCamps.push({ client: grp.client, c: c }); });
        });
        if (allCamps.length === 0) return null;

        var totalSpend = allCamps.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
        var totalImps = allCamps.reduce(function(a, x) { return a + (x.c.delivery.impressions || 0); }, 0);
        var totalClicks = allCamps.reduce(function(a, x) { return a + (x.c.delivery.clicks || 0); }, 0);
        var blCtr = totalImps > 0 ? (totalClicks / totalImps * 100) : 0;
        var blCpc = totalClicks > 0 ? (totalSpend / totalClicks) : 0;

        // Group by platform + objective for structure + mix findings.
        var byPlat = {}, byObj = {}, byClient = {};
        allCamps.forEach(function(x) {
          var c = x.c;
          var p = c.platform || "Unknown", o = String(c.objective || "unknown").toLowerCase();
          if (!byPlat[p]) byPlat[p] = { n: 0, spend: 0 };
          byPlat[p].n++; byPlat[p].spend += (c.delivery.spendPeriod || 0);
          if (!byObj[o]) byObj[o] = { n: 0, spend: 0 };
          byObj[o].n++; byObj[o].spend += (c.delivery.spendPeriod || 0);
          if (!byClient[x.client]) byClient[x.client] = { n: 0, spend: 0 };
          byClient[x.client].n++; byClient[x.client].spend += (c.delivery.spendPeriod || 0);
        });
        var platforms = Object.keys(byPlat);
        var objectives = Object.keys(byObj);
        var clients = Object.keys(byClient);

        // Top spender, top performer, spend leakers (sub-0.80% CTR
        // with meaningful budget), fatigued (Meta freq>3, TikTok freq>6),
        // scale-ready (the SCALE bucket criteria).
        var sortedSpend = allCamps.slice().sort(function(a, b) { return (b.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
        var top3 = sortedSpend.slice(0, 3);
        var top3Spend = top3.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
        var top3Pct = totalSpend > 0 ? (top3Spend / totalSpend * 100) : 0;

        var realCtr = allCamps.filter(function(x) { return (x.c.delivery.impressions || 0) >= 5000; });
        var topPerf = realCtr.slice().sort(function(a, b) { return (b.c.delivery.ctr || 0) - (a.c.delivery.ctr || 0); })[0] || null;
        var topPerfCtr = topPerf ? (topPerf.c.delivery.ctr || 0) : 0;

        var spendLeakers = allCamps.filter(function(x) {
          var c = x.c;
          return (c.delivery.spendPeriod || 0) >= 5000 && (c.delivery.impressions || 0) >= 10000 && (c.delivery.ctr || 0) < 0.8;
        });
        var leakSpend = spendLeakers.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);

        var fatigued = allCamps.filter(function(x) {
          var c = x.c;
          var freq = c.delivery.frequency || 0;
          var p = String(c.platform || "").toLowerCase();
          var limit = p.indexOf("tiktok") >= 0 ? 6 : 3;
          return freq >= limit && (c.delivery.spendPeriod || 0) >= 2000;
        });

        var formatSet = {};
        (adsList || []).forEach(function(a) { if (a && a.format) formatSet[String(a.format).toUpperCase()] = true; });
        var formatCount = Object.keys(formatSet).length;

        var scaleReady = allCamps.filter(function(x) {
          var c = x.c;
          var ctr = c.delivery.ctr || 0, freq = c.delivery.frequency || 0;
          var p = String(c.platform || "").toLowerCase();
          var limit = p.indexOf("tiktok") >= 0 ? 6 : 3;
          var paceOK = !c.pacing || c.pacing.state === "on_track" || c.pacing.state === "ahead" || c.pacing.state === "na";
          return ctr >= 1.5 && freq < limit && (c.delivery.spendPeriod || 0) >= 2000 && paceOK;
        });
        var scaleSpend = scaleReady.reduce(function(a, x) { return a + (x.c.delivery.spendPeriod || 0); }, 0);
        var scalePct = totalSpend > 0 ? (scaleSpend / totalSpend * 100) : 0;

        var topPlatSpend = Math.max.apply(null, Object.keys(byPlat).map(function(k) { return byPlat[k].spend; }));
        var topPlatPct = totalSpend > 0 ? (topPlatSpend / totalSpend * 100) : 0;
        var dominantPlat = Object.keys(byPlat).reduce(function(a, b) { return byPlat[a].spend > byPlat[b].spend ? a : b; }, Object.keys(byPlat)[0] || "");

        var hasAwareness = !!byObj.awareness;
        var hasConsideration = !!(byObj.followers || byObj.landingpage || byObj.traffic);
        var hasConversion = !!(byObj.leads || byObj.appinstall || byObj.sales);
        var funnelTiers = (hasAwareness ? 1 : 0) + (hasConsideration ? 1 : 0) + (hasConversion ? 1 : 0);

        // Helper: turn a list of {client, c} entries into an array of
        // {thumbnail, label} the renderer can show as a small preview
        // strip. Entries with no thumbnail are still included so the
        // count matches but render as a labelled placeholder.
        var toThumbItems = function(entries) {
          return entries.map(function(x) {
            return { thumbnail: x.c.thumbnail || "", label: x.c.campaignName + " · " + x.client, platform: x.c.platform || "" };
          });
        };

        // Synthesise findings, each gated on a real threshold so the
        // memo only mentions what actually exists in the data. Each
        // finding may carry a `thumbs` array of campaigns to preview.
        var findings = [];
        if (top3Pct >= 70 && allCamps.length >= 5) {
          findings.push({ title: "Spend is concentrated in 3 campaigns", detail: "The top 3 campaigns hold " + top3Pct.toFixed(2) + "% of total live spend across the portfolio. If any one of those decays (creative fatigue, audience saturation, auction shifts), ~" + Math.round(top3Pct / 3) + "% of the budget moves with it. World-class accounts ladder spend across a 5-7 campaign portfolio with planned succession.", thumbs: toThumbItems(top3) });
        }
        if (topPerf && topPerfCtr >= blCtr * 1.6 && realCtr.length >= 3) {
          var multiple = blCtr > 0 ? (topPerfCtr / blCtr) : 0;
          findings.push({ title: "The best campaign is " + multiple.toFixed(1) + "x the blended CTR", detail: "‘" + topPerf.c.campaignName + "’ at " + topPerf.client + " runs at " + fmtPct(topPerfCtr) + " CTR while the blended book sits at " + fmtPct(blCtr) + ". The creative + audience pairing in that one campaign is the formula. Most of the upside on this book is replicating that structure across the rest of the portfolio, not spending more on the average.", thumbs: toThumbItems([topPerf]) });
        }
        if (spendLeakers.length > 0 && leakSpend >= 10000) {
          var leakClientCounts = {};
          spendLeakers.forEach(function(x) { leakClientCounts[x.client] = (leakClientCounts[x.client] || 0) + 1; });
          var leakClientList = Object.keys(leakClientCounts).map(function(k) { return k + " (" + leakClientCounts[k] + ")"; }).join(", ");
          findings.push({ title: fR(leakSpend) + " is flowing through " + spendLeakers.length + " underperforming campaign" + (spendLeakers.length === 1 ? "" : "s"), detail: "Across " + leakClientList + ", these campaigns spent meaningful budget at sub-0.80% CTR. That's money the algorithm is taking but not converting into useful traffic. Pausing and rerouting is the single fastest efficiency lift available.", thumbs: toThumbItems(spendLeakers.slice(0, 6)), totalThumbs: spendLeakers.length });
        }
        if (fatigued.length > 0) {
          findings.push({ title: fatigued.length + " campaign" + (fatigued.length === 1 ? " is" : "s are") + " past their fatigue ceiling", detail: "Frequency above 3x on Meta (6x on TikTok) erodes CTR by 15-25% within days. Creative rotation, not budget rotation, is the lever here.", thumbs: toThumbItems(fatigued.slice(0, 6)), totalThumbs: fatigued.length });
        }
        if (formatCount > 0 && formatCount < 3 && (adsList || []).length >= 10) {
          findings.push({ title: "Creative formats are concentrated, only " + formatCount + " in rotation", detail: "Best-in-class accounts ship across 3+ formats (static, carousel, short-form video, UGC) so the algorithm can pick winners by placement. Limited formats cap the ceiling regardless of how much budget is added." });
        }
        if (topPlatPct >= 85 && platforms.length >= 2) {
          findings.push({ title: topPlatPct.toFixed(2) + "% of spend lives on " + dominantPlat, detail: "That level of single-platform concentration ties book-wide performance to one algorithm's mood. The accounts that compound performance year-on-year run a deliberate 60/30/10 mix so they always have a B and C option warming when the A option tightens." });
        }
        if (funnelTiers < 2 && allCamps.length >= 3) {
          findings.push({ title: "The funnel is single-tier", detail: "There's " + (hasAwareness ? "awareness only" : hasConversion ? "conversion only" : "no funnel structure") + ". The 10x accounts run three connected layers: cold prospecting → engaged consideration → high-intent conversion, with audience hand-offs between them. Single-tier setups force one creative to do the whole funnel's job." });
        }
        if (scalePct > 0 && scalePct < 30 && scaleReady.length > 0) {
          findings.push({ title: "Only " + scalePct.toFixed(2) + "% of spend is on scale-ready creative", detail: scaleReady.length + " campaign" + (scaleReady.length === 1 ? "" : "s") + " cleared the scale bar (CTR ≥ 1.5%, frequency healthy, results coming through) but they're holding a minority of the budget. The fastest path to a 5x outcome is moving the dollars to where the algorithm has already proven it can convert.", thumbs: toThumbItems(scaleReady.slice(0, 6)), totalThumbs: scaleReady.length });
        }

        // 5X play items now carry optional thumbs so the analyst memo
        // shows the actual creatives the recommendation refers to. The
        // GAS analyst can see at a glance which ad they're being asked
        // to pause / clone / refresh without going hunting.
        var fivex = [];
        if (spendLeakers.length > 0 && scaleReady.length > 0) {
          fivex.push({ text: "Pause the " + spendLeakers.length + " underperformer" + (spendLeakers.length === 1 ? "" : "s") + " carrying " + fR(leakSpend) + ". Reroute that budget to the " + scaleReady.length + " scale-ready campaign" + (scaleReady.length === 1 ? "" : "s") + ", historic CTR delta says this alone should lift blended efficiency by 30-50% inside 14 days.", thumbs: toThumbItems(spendLeakers.slice(0, 4).concat(scaleReady.slice(0, 4))), totalThumbs: spendLeakers.length + scaleReady.length });
        }
        if (topPerf) {
          fivex.push({ text: "Clone ‘" + topPerf.c.campaignName + "’ (" + topPerf.client + ") as the template for every same-objective campaign on the book. Same creative format, same hook structure, same audience width. Most of the lift on this book is structural replication, not new creative ideation.", thumbs: toThumbItems([topPerf]) });
        }
        if (fatigued.length > 0) {
          fivex.push({ text: "Ship 3-5 new creative variants on the fatigued ad sets this week. Even minor swaps (hook, colour, CTA) reset the frequency curve and extend productive lifespan 30-40 days.", thumbs: toThumbItems(fatigued.slice(0, 4)), totalThumbs: fatigued.length });
        }
        if (formatCount < 3) {
          fivex.push({ text: "Add the missing formats to the rotation. If the book is heavy on static, ship a 9:16 video variant. If video-heavy, add a carousel test. Format diversity unlocks 20-30% more efficient inventory." });
        }
        if (fivex.length === 0) {
          fivex.push({ text: "Structure is solid. Focus the week on incremental tests (one new audience layer, one new creative format) and let the algorithm compound the gains." });
        }

        var tenx = [];
        tenx.push("Restructure every client into a 3-tier funnel: cold prospecting (broad + interest, 60% of budget), warm consideration (engaged + lookalikes, 30%), high-intent conversion (retargeting + custom audiences, 10%). Hand audiences forward between tiers via Custom Audiences so each layer feeds the next.");
        tenx.push("Consolidate to " + Math.max(3, Math.min(7, Math.round(allCamps.length * 0.6 / Math.max(1, clients.length)))) + " CBO campaigns per client per objective on Meta. Ad-set fragmentation is the single biggest tax on the algorithm. Fewer, bigger campaigns let Meta's learning phase complete and CPMs compress 15-25%.");
        tenx.push("Adopt a 90-day creative cadence across the agency. 3-5 fresh creative variants in market every fortnight per client, with the previous fortnight's winners scaled and losers cut. Top-1% accounts ship 12+ creatives per quarter per platform.");
        if (platforms.length < 3) {
          tenx.push("Add the third platform across the book. Whatever's missing (TikTok if Meta-heavy, Meta if TikTok-heavy, Google Search if neither) closes the audience leakage. The lift comes from incremental reach, not stealing share from the existing platforms.");
        }
        tenx.push("Build first-party data as the agency moat. Pixel + Conversions API + offline conversion uploads turn this dashboard from a reporting layer into an attribution engine. Once GAS can see real CAC by campaign by audience by client, the budget decisions become arithmetic, not opinion.");

        // Small reusable thumbnail strip: shows up to `max` square
        // previews and a +N counter when the underlying list is longer.
        // Items with no thumbnail render a platform-glyph placeholder so
        // the strip's length always matches the count.
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
              return <div key={i} title={it.label} style={{ width: 54, height: 54, borderRadius: 8, overflow: "hidden", border: "1px solid " + P.rule, background: "#0c0716", position: "relative", flexShrink: 0 }}>
                {it.thumbnail
                  ? <img src={it.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={function(e){ e.target.style.display = "none"; }}/>
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg," + (P.cyan || "#22D3EE") + "22," + (P.ember || "#F96203") + "15)", color: "#fff", fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 0.5 }}>{glyph(it.platform)}</div>}
              </div>;
            })}
            {rest > 0 && <div style={{ width: 54, height: 54, borderRadius: 8, border: "1px dashed " + P.rule, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: P.label, fontFamily: fm, flexShrink: 0 }}>+{rest}</div>}
          </div>;
        };

        return <div style={{ marginTop: 28, padding: "32px 34px", borderRadius: 18, background: "linear-gradient(135deg,#0a0418 0%,#100624 50%,#1a0a30 100%)", border: "1px solid " + (P.ember || "#F96203") + "35", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, background: "radial-gradient(circle," + (P.ember || "#F96203") + "15 0%,transparent 70%)", pointerEvents: "none" }}></div>
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: "linear-gradient(135deg," + (P.ember || "#F96203") + "40," + (P.blaze || "#FF3D00") + "40)", border: "1px solid " + (P.ember || "#F96203") + "66", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{Ic.crown ? Ic.crown(P.ember || "#F96203", 28) : null}</div>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900, color: P.ember || "#F96203", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.1 }}>Head Data Analyst</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: ff, marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>Growth Plan</div>
              </div>
            </div>
            <div style={{ fontSize: 10, color: P.caption, fontFamily: fm, fontStyle: "italic", marginBottom: 20, letterSpacing: 1 }}>Top 1% global benchmark · Computed live across {clients.length} client{clients.length === 1 ? "" : "s"} · {allCamps.length} in-flight campaign{allCamps.length === 1 ? "" : "s"} · {dateFrom} to {dateTo}</div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 22 }}>
              {[
                ["CLIENTS", clients.length, P.cyan],
                ["CAMPAIGNS", allCamps.length, P.orchid],
                ["PLATFORMS", platforms.length, P.solar],
                ["BLENDED CTR", fmtPct(blCtr), P.mint],
                ["BLENDED CPC", fR(blCpc), P.blaze]
              ].map(function(x, i) { return <div key={i} style={{ padding: "12px 14px", background: "rgba(0,0,0,0.4)", border: "1px solid " + P.rule, borderRadius: 10, textAlign: "center" }}>
                <div style={{ fontSize: 9, color: P.label, fontFamily: fm, letterSpacing: 1.5, marginBottom: 5 }}>{x[0]}</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: x[2], fontFamily: fm }}>{x[1]}</div>
              </div>; })}
            </div>

            {findings.length > 0 && <div style={{ marginBottom: 24 }}>
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

            {findings.length === 0 && <div style={{ marginBottom: 24, padding: "14px 16px", background: P.mint + "12", border: "1px solid " + P.mint + "40", borderLeft: "3px solid " + P.mint, borderRadius: "0 10px 10px 0" }}>
              <div style={{ fontSize: 12, color: P.mint, fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, marginBottom: 4, textTransform: "uppercase" }}>Structure is solid</div>
              <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.6 }}>No major structural issues detected in the selected window. Focus on incremental optimisations and the 10x plays below.</div>
            </div>}

            <div style={{ marginBottom: 22, padding: "20px 22px", background: "linear-gradient(135deg," + P.mint + "15," + P.mint + "06)", border: "1px solid " + P.mint + "40", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ background: P.mint, color: "#062014", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>5X PLAY</span>
                <span style={{ fontSize: 12, color: P.mint, fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>This week · move the budget to where it works</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {fivex.map(function(p, i) { return <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", background: "rgba(0,0,0,0.25)", border: "1px solid " + P.mint + "22", borderRadius: 10 }}>
                  <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: P.mint + "22", border: "1px solid " + P.mint + "55", color: P.mint, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, fontFamily: fm }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.7 }}>{p.text || p}</div>
                    {p.thumbs && thumbStrip(p.thumbs, p.totalThumbs)}
                  </div>
                </div>; })}
              </div>
            </div>

            <div style={{ padding: "18px 20px", background: "linear-gradient(135deg," + (P.ember || "#F96203") + "15," + (P.blaze || "#FF3D00") + "08)", border: "1px solid " + (P.ember || "#F96203") + "40", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ background: "linear-gradient(135deg," + (P.ember || "#F96203") + "," + (P.blaze || "#FF3D00") + ")", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>10X PLAY</span>
                <span style={{ fontSize: 12, color: P.ember || "#F96203", fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>The structural rebuild · 60-90 days</span>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 22px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85 }}>
                {tenx.map(function(p, i) { return <li key={i} style={{ marginBottom: 6 }}>{p}</li>; })}
              </ul>
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px dashed " + P.rule, fontSize: 10, color: P.caption, fontFamily: fm, fontStyle: "italic", lineHeight: 1.6 }}>
              This recommendation refreshes every time the Command Centre reloads or the date range changes. It mirrors how a top-1% buy-side analyst would read this whole book of business, focused on structural levers, not tactical knobs. The 5x play targets visible efficiency gains inside 14 days; the 10x play is the 60-90 day restructure that compounds over the year.
            </div>
          </div>
        </div>;
      })()}
    </div>}
  </div>;
}
