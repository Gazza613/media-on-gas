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

  // Platform filter: "" (or "all") shows every platform section; any
  // other value isolates that one platform (Facebook, Instagram,
  // TikTok, Google). The page is structured per-platform now rather
  // than per-client because the team works in platform-specific
  // sprints (someone owns Facebook for the morning, someone else
  // owns TikTok), and switching mental models between clients was
  // the navigation friction the team reported.
  var pf0 = useState(""), platformFilter = pf0[0], setPlatformFilter = pf0[1];

  // Best-practices playbook fetched from /api/best-practices (which
  // reads the Redis copy refreshed monthly by the cron, falling back
  // to a bundled JSON file if Redis is empty). Loaded once on mount,
  // doesn't change with the date picker. Null while loading; falsy
  // values trigger the in-component hardcoded fallback per section.
  var bp0 = useState(null), bp = bp0[0], setBp = bp0[1];
  useEffect(function() {
    if (!session) return;
    fetch(apiBase + "/api/best-practices", { headers: { "x-session-token": session } })
      .then(function(r) { return r.json(); })
      .then(function(d) { if (d && (d.meta || d.tiktok || d.google)) setBp(d); })
      .catch(function() { /* silent — the memo has hardcoded fallback */ });
  }, [session, apiBase]);

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
  var fetchOnce = function(signal, opts) {
    var parts = [];
    if (dateFrom && dateTo) {
      parts.push("from=" + encodeURIComponent(dateFrom));
      parts.push("to=" + encodeURIComponent(dateTo));
    }
    // fresh=1 bypasses the server response cache. The Refresh button
    // sets this so an operator who needs the latest numbers can force
    // a recompute. Background reloads (date change, mount) use the
    // cache to stay snappy.
    if (opts && opts.fresh) parts.push("fresh=1");
    var qs = parts.length ? ("?" + parts.join("&")) : "";
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

  var load = function(opts) {
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

    fetchOnce(signal, opts)
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
        // The retry never passes fresh=1 — we WANT it to hit the cache
        // the first attempt warmed.
        retryTimerRef.current = setTimeout(function() {
          if (myGen !== genRef.current) return;
          fetchOnce(signal)
            .then(function(y) {
              if (y.ok && y.d && y.d.ok) { safeSet(myGen, { loading: false, error: "", data: y.d }); return; }
              var em2 = (y.d && y.d.error)
                || (y.status === 504 ? "Upstream is taking longer than usual (3 minute timeout). Try Refresh again in a moment, the cache should have warmed by then." : ("Failed (HTTP " + y.status + ")"));
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
    <SH icon={Ic.person ? Ic.person(P.solar, 20) : (Ic.radar ? Ic.radar(P.solar, 20) : Ic.flag(P.solar, 20))} title="Optimisation Centre"
      sub="Internal. Live load, delivery, pacing and what needs a human now, month to date." accent={P.solar} />

    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "14px 0 18px", gap: 10, flexWrap: "wrap" }}>
      <div style={{ fontSize: 11, color: P.label, fontFamily: fm }}>
        {s.data ? ("Period " + s.data.period.from + " to " + s.data.period.to + " · generated " + new Date(s.data.generatedAt).toLocaleString()) : ""}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* All / Needs attention toggle so the operator can collapse
            healthy rows when triaging. Each pill carries a live count so
            the click is visibly doing something even when the underlying
            list is mostly identical (e.g. when every client has at least
            one alert, switching modes still shows the same client list,
            and without a count badge the buttons looked inert). */}
        {(function() {
          var totalCount = (s.data && s.data.summary && s.data.summary.campaigns) || 0;
          var attentionCount = (s.data && s.data.summary && s.data.summary.needsAttention) || 0;
          return <div style={{ display: "inline-flex", border: "1px solid " + P.rule, borderRadius: 8, overflow: "hidden" }}>
            {[["all", "All", totalCount], ["attention", "Needs attention", attentionCount]].map(function(opt) {
              var on = filterMode === opt[0];
              var col = opt[0] === "attention" && opt[2] > 0 ? (P.critical || "#ef4444") : P.solar;
              return <button key={opt[0]} onClick={function(){ setFilterMode(opt[0]); }}
                style={{ background: on ? col + "22" : "transparent", border: "none", borderBottom: on ? "2px solid " + col : "2px solid transparent", padding: "7px 14px", color: on ? col : P.label, fontSize: 10, fontWeight: 800, fontFamily: fm, cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 8 }}>
                <span>{opt[1]}</span>
                <span style={{ background: on ? col + "33" : "rgba(255,255,255,0.08)", color: on ? col : P.label, padding: "2px 7px", borderRadius: 10, fontSize: 10, fontWeight: 900 }}>{opt[2]}</span>
              </button>;
            })}
          </div>;
        })()}
        <button onClick={function(){ load({ fresh: true }); }} disabled={s.loading} style={{ background: s.loading ? "rgba(255,255,255,0.05)" : "transparent", border: "1px solid " + (s.loading ? P.solar + "55" : P.rule), borderRadius: 8, padding: "7px 14px", color: s.loading ? P.solar : P.solar, fontSize: 11, fontWeight: 800, fontFamily: fm, cursor: s.loading ? "wait" : "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}>{s.loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </div>

    {s.loading && <Glass st={{ padding: 28, textAlign: "center" }}><div style={{ fontSize: 13, color: P.label, fontFamily: fm }}>Reading live delivery across all clients…</div></Glass>}
    {s.error && <Glass accent={P.critical || "#ef4444"} st={{ padding: 20 }}><div style={{ fontSize: 13, color: P.critical || "#ef4444", fontFamily: fm }}>{s.error}</div></Glass>}

    {s.data && <div>
      {/* Summary tile totals. When a platform filter is active, the
          tiles recalculate to that platform's slice — the operator
          working Facebook for the morning wants Facebook's CAMPAIGNS
          / LIVE / SPEND, not the cross-platform roll-up. Computed
          inline (re-uses canonPlatform logic) so the tiles can sit
          above the IIFE that owns the rest of the page. */}
      {(function() {
        var canonPlatTile = function(p) {
          var s3 = String(p || "").toLowerCase();
          if (s3.indexOf("instagram") >= 0) return "Instagram";
          if (s3.indexOf("facebook") >= 0) return "Facebook";
          if (s3.indexOf("tiktok") >= 0) return "TikTok";
          if (s3.indexOf("google") >= 0 || s3.indexOf("youtube") >= 0) return "Google";
          return "Other";
        };
        var sum = s.data.summary;
        var label = "in flight this month";
        if (platformFilter && platformFilter !== "all") {
          var camps = 0, live = 0, attn = 0, alerts = 0, spendT = 0, spendP = 0;
          s.data.clients.forEach(function(grp) {
            grp.campaigns.forEach(function(c) {
              if (canonPlatTile(c.platform) !== platformFilter) return;
              camps++;
              if (c.live) live++;
              spendT += (c.delivery && c.delivery.spendToday) || 0;
              spendP += (c.delivery && c.delivery.spendPeriod) || 0;
              if (c.alerts && c.alerts.length > 0) {
                attn++;
                alerts += c.alerts.length;
              }
            });
          });
          sum = { campaigns: camps, live: live, needsAttention: attn, alerts: alerts, spendToday: spendT, spendPeriod: spendP };
          label = platformFilter + " · in flight this month";
        }
        return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
          {card("CAMPAIGNS", N(sum.campaigns), P.cyan, label)}
          {card("LIVE NOW", N(sum.live), P.mint)}
          {card("NEEDS ATTENTION", N(sum.needsAttention), sum.needsAttention > 0 ? (P.critical || "#ef4444") : P.mint, N(sum.alerts) + " alerts")}
          {card("SPEND TODAY", R(sum.spendToday), P.solar)}
          {card("SPEND MTD", R(sum.spendPeriod), P.ember)}
        </div>;
      })()}

      {s.data.clients.length === 0 && <Glass st={{ padding: 24, textAlign: "center" }}><div style={{ fontSize: 13, color: P.caption, fontFamily: ff }}>Nothing in flight this month.</div></Glass>}

      {(function() {
        // Single row renderer reused by both the live section (top) and
        // the paused section (bottom). dimmed=true mutes the row a bit
        // so the paused section reads as reference rather than action.
        var renderCampaignRow = function(c, dimmed) {
          var hasAlert = c.alerts.length > 0;
          var amUrl = c.adsManagerUrl || "";
          var gradA = (P.cyan || "#22D3EE"), gradB = (P.ember || "#F96203");
          // Layered thumbnail with platform-glyph fallback. Meta CDN
          // thumbnail URLs are signed + time-limited, so cards that
          // were generated against a fresh cache can fail to load
          // hours later. onError hides the <img>, the glyph div
          // beneath shows through.
          var thumb = <a href={amUrl || undefined} target={amUrl ? "_blank" : undefined} rel="noopener noreferrer"
              title={amUrl ? "Open this campaign in Ads Manager" : "Ads Manager link unavailable"}
              style={{ flexShrink: 0, width: 88, height: 88, borderRadius: 12, overflow: "hidden", display: "block", border: "1px solid " + P.rule, background: "linear-gradient(135deg," + gradA + "22," + gradB + "15)", position: "relative", cursor: amUrl ? "pointer" : "default", textDecoration: "none", opacity: dimmed ? 0.75 : 1 }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: fm, letterSpacing: 1 }}>{platShort(c.platform)}</div>
            {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" decoding="async" onError={function(e) { e.target.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
            {amUrl && <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 7.5, fontWeight: 800, fontFamily: fm, letterSpacing: 0.5, textAlign: "center", padding: "3px 0", textTransform: "uppercase" }}>Ads Manager ↗</span>}
          </a>;
          return <Glass key={c.campaignId} accent={hasAlert && !dimmed ? sevColor(c.alerts[0].severity) : P.rule} st={{ padding: 16, marginBottom: 10, opacity: dimmed ? 0.82 : 1 }}>
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
                {(function() {
                  // Defensive numeric coerce so a stray undefined/null
                  // from the API doesn't crash the whole tab on a
                  // `.toFixed()` call. Was previously trusting
                  // c.delivery.ctr / .frequency to always be present
                  // and numeric, which is the suspected cause of the
                  // 'Command tab crashing' user report.
                  var d = c.delivery || {};
                  var n = function(v) { var x = parseFloat(v); return isFinite(x) ? x : 0; };
                  return [["SPEND", R(n(d.spendPeriod))], ["TODAY", R(n(d.spendToday))], ["IMPR", N(n(d.impressions))], ["CLICKS", N(n(d.clicks))], ["CTR", n(d.ctr).toFixed(2) + "%"], ["CPM", R(n(d.cpm))], [(d.resultLabel || "RESULTS").toUpperCase(), N(n(d.result))], [d.costLabel || "CPR", n(d.result) > 0 ? R(n(d.costPer)) : "-"], ["FREQ", n(d.frequency).toFixed(2)]];
                })().map(function(m, i) {
                  return <div key={i} style={{ textAlign: "right", minWidth: 52 }}>
                    <div style={{ fontSize: 8, color: P.label, letterSpacing: 1, marginBottom: 2 }}>{m[0]}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: P.txt }}>{m[1]}</div>
                  </div>;
                })}
              </div>
            </div>
            {!dimmed && <div style={{ marginTop: 12, maxWidth: c.pacing && c.pacing.mode === "adset" ? 520 : 360 }}>{pacingBar(c.pacing)}</div>}
            {/* Alerts are hidden on dimmed (paused / ended) rows. A
                paused campaign always pacing-behinds itself (the daily
                target keeps ticking while spend froze), so surfacing
                that alert under a PAUSED row was tautological noise
                AND it visually broke the section flow: the next row
                in PAUSED THIS PERIOD would appear below the alert
                block of the previous row, looking unrelated to the
                bucket. High-severity alerts already float to
                ATTENTION via classify(), so a row that lands here
                never has anything urgent to surface. */}
            {hasAlert && !dimmed && <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
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
          // High-severity alerts always float to ATTENTION so a stalled
          // / blown-budget campaign is never hidden in PAUSED.
          if (hasSev(c, "high")) return "attention";
          // Ended / paused outrank medium alerts (pacing_behind on a
          // paused campaign is tautological — it's behind BECAUSE it's
          // paused, so it belongs in PAUSED THIS PERIOD where the
          // operator can decide to reactivate or extend, not in WATCH
          // LIST mixed with live campaigns that need triage).
          if (c.ended) return "ended";
          if (!c.live) return "paused";
          if (hasSev(c, "medium")) return "watch";
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
        // Each tile is now a clickable anchor that opens the full-size
        // CDN URL in a new tab — user explicitly asked for the ability
        // to verify the exact creative referenced by each recommendation.
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
              var canOpen = !!it.thumbnail;
              var tileStyle = { width: 56, height: 56, borderRadius: 8, overflow: "hidden", border: "1px solid " + P.rule, background: "#0c0716", position: "relative", flexShrink: 0, display: "block", cursor: canOpen ? "pointer" : "default" };
              var inner = it.thumbnail
                ? <img src={it.thumbnail} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={function(e) { e.target.style.display = "none"; }}/>
                : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg," + (P.cyan || "#22D3EE") + "22," + (P.ember || "#F96203") + "15)", color: "#fff", fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 0.5 }}>{glyph(it.platform)}</div>;
              if (canOpen) {
                return <a key={i} href={it.thumbnail} target="_blank" rel="noopener noreferrer" title={it.label + " · click to open the full-size creative"} style={tileStyle}>{inner}</a>;
              }
              return <div key={i} title={it.label} style={tileStyle}>{inner}</div>;
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

          // Platform detection used to gate the platform-specific
          // recommendations below. The advice differs significantly
          // between Meta (Advantage+ era, broad targeting won),
          // TikTok (Smart+ + Spark Ads + UGC + trending audio) and
          // Google (PMax + Enhanced Conversions + broad match).
          var hasMeta = !!byPlat.Facebook || !!byPlat.Instagram;
          var hasTikTok = !!byPlat.TikTok;
          var hasGoogle = !!byPlat["Google Ads"] || !!byPlat.Google;

          // Pull a section from the LLM-refreshed playbook (Redis →
          // cron-written) or fall back to the hardcoded array. The
          // monthly cron at /api/cron/refresh-best-practices keeps the
          // platform advice current; this fallback ships the last
          // committed copy if Redis hasn't been written yet (e.g. the
          // cron hasn't fired, or ANTHROPIC_API_KEY isn't configured).
          var fromPlaybook = function(platformKey, section, fallbackArr) {
            var p = bp && bp[platformKey];
            var arr = p && p[section];
            if (Array.isArray(arr) && arr.length) return arr;
            return fallbackArr;
          };

          // ---- AUDIENCES advice (2026 platform-current best practice) ----
          // Platform-specific strings come from the LLM-refreshed
          // playbook (fromPlaybook) so the team always sees this-month
          // best practice without a code change.
          var audAdvice = [];
          if (hasMeta) {
            fromPlaybook("meta", "audiences", [
              "META · The 2026 default is Advantage+ Audience with BROAD targeting (age + country only) — Meta's algorithm now finds converters better than narrow lookalikes do, because iOS14+ + cookie deprecation gutted the signal that narrow targeting used to depend on. Use lookalike/interest as Audience Suggestions only (Meta's term), not as hard segments."
            ]).forEach(function(s) { audAdvice.push(s); });
          }
          if (fatigued.length > 0) {
            audAdvice.push(fatigued.length + " campaign" + (fatigued.length === 1 ? " is" : "s are") + " above the frequency ceiling — audiences are too narrow. On Meta switch to Advantage+ Audience (broad + signals); on TikTok let Smart+ run audience-free; on Google add Customer Match + Optimized Targeting on top of the existing audience.");
          }
          if (hasTikTok) {
            fromPlaybook("tiktok", "audiences", [
              "TIKTOK · Smart+ Campaigns (TikTok's 2026 default) let the algorithm pick audience + creative + placement together — manual targeting loses to Smart+ on 80%+ of accounts in the current auction. If you're still running manual audience, move it to Smart+ and use creator + interest signals as inputs, not constraints."
            ]).forEach(function(s) { audAdvice.push(s); });
          }
          if (hasGoogle) {
            fromPlaybook("google", "audiences", [
              "GOOGLE · Stack Customer Match (uploaded converter emails) + Enhanced Conversions + Optimized Targeting on top of every campaign. Google's ML lost ~40% of cookie signal post-2024; first-party data is what feeds it back the learning it needs to find converters at your CAC target."
            ]).forEach(function(s) { audAdvice.push(s); });
          }
          if (topPerf && realCtr.length >= 2) {
            audAdvice.push("Build a Custom Audience from engagers of ‘" + topPerf.c.campaignName + "’ (the highest-CTR campaign here) and use it as a retargeting seed AND as a 1% Lookalike seed. Engagers from a winning creative are higher-quality than purchasers from a losing one.");
          }
          if (funnelTiers < 2 && camps.length >= 2) {
            audAdvice.push("Funnel is missing the " + (hasAwareness ? "conversion" : "cold-prospecting") + " tier. Add it so audiences hand forward — Meta Advantage+ Shopping for the conversion layer or a Reach campaign with Reels-first creative for the awareness layer.");
          }
          if (audAdvice.length === 0) {
            audAdvice.push("Audience setup is solid. Refresh Customer Match lists monthly with the latest converter cohort, and re-cut Lookalikes off 90-day vs 28-day vs 7-day windows quarterly so the algorithm has multiple seed shapes to explore.");
          }

          // ---- CREATIVE advice (2026 platform-current best practice) ----
          var creAdvice = [];
          if (topAds.length > 0) {
            creAdvice.push("WINNERS · Clone the top-CTR ad" + (topAds.length === 1 ? "" : "s") + " below into 3-5 variants each: same hook, swap colour / CTA / talent / first-frame. Meta and TikTok algorithms reward creative families that share the winning DNA more than they reward one-off masterpieces.");
          }
          if (worstAds.length > 0) {
            creAdvice.push("LEAKERS · Pause the " + worstAds.length + " sub-0.80% CTR ad" + (worstAds.length === 1 ? "" : "s") + " below today. The algorithm is allocating spend based on relative CTR within each ad set — keeping a weak ad in the set actively suppresses the strong ones.");
          }
          if (fatiguedAds.length > 0) {
            creAdvice.push("FATIGUED · Refresh the high-frequency ad" + (fatiguedAds.length === 1 ? "" : "s") + " below this week. The hook is the single biggest lever — change the first 1-3 seconds, keep the rest. Even a colour or face swap resets frequency 30-40 days.");
          }
          if (hasMeta) {
            fromPlaybook("meta", "creative", [
              "META · Reels is now 60%+ of feed impressions — 9:16 vertical video with sound-on storytelling is the win pattern in 2026. Static + carousel still work for catalog + offer ads but cap them at 40% of ad-set creative for prospecting."
            ]).forEach(function(s) { creAdvice.push(s); });
          }
          if (hasTikTok) {
            fromPlaybook("tiktok", "creative", [
              "TIKTOK · Spark Ads using creator content outperform brand-polished by 30-50% on CTR. Brief 3-5 creators monthly on the offer + the trending audio chart (top 100 in TikTok Library). UGC is the cheapest creative production with the highest auction signal."
            ]).forEach(function(s) { creAdvice.push(s); });
          }
          if (hasGoogle) {
            fromPlaybook("google", "creative", [
              "GOOGLE · Performance Max wants 20+ assets per asset group (5+ headlines, 5+ descriptions, 1+ long headline, 5+ images, 1+ logo, 1+ video). Asset gaps tank the ML's exploration budget — fill every slot, including a 9:16 video for YouTube Shorts placements."
            ]).forEach(function(s) { creAdvice.push(s); });
          }
          if (formatCount > 0 && formatCount < 3) {
            creAdvice.push("Only " + formatCount + " creative format" + (formatCount === 1 ? "" : "s") + " in rotation (" + formatList.join(", ") + "). Add a " + (formatList.indexOf("VIDEO") < 0 ? "9:16 short-form vertical video (the highest-yield format in 2026)" : formatList.indexOf("CAROUSEL") < 0 ? "carousel for catalog / multi-message" : "UGC-style raw-feel static") + " variant — format diversity unlocks 20-30% more efficient inventory because the algorithm gets more placements to pick winners from.");
          }
          if (creAdvice.length === 0) {
            creAdvice.push("Creative pipeline is healthy. Hold the 2-week refresh cadence and document the winning hook structures so they can be replicated across future campaigns. The team's competitive advantage is the playbook, not any single ad.");
          }

          // ---- OBJECTIVES advice (2026-current) ----
          var objMix = Object.keys(byObj).map(function(k) { return { name: k, count: byObj[k].n, spend: byObj[k].spend, pct: totalSpend > 0 ? (byObj[k].spend / totalSpend * 100) : 0 }; }).sort(function(a, b) { return b.spend - a.spend; });
          var objAdvice = [];
          if (funnelTiers < 2 && camps.length >= 3) {
            objAdvice.push("Single-tier funnel — only " + (hasAwareness ? "awareness" : hasConversion ? "conversion" : hasConsideration ? "consideration" : "one tier") + " is running. Run a 60/30/10 split across cold prospecting → engaged consideration → high-intent conversion, with Custom Audience hand-offs between tiers so each layer feeds the next.");
          }
          if (objMix.length > 0 && objMix[0].pct >= 70) {
            objAdvice.push((objMix[0].pct).toFixed(0) + "% of spend sits on " + objMix[0].name + ". Diversifying across two objectives gives the algorithm more signal events to optimise against — a single-objective account loses ~15% efficiency vs a two-objective one in head-to-head agency benchmarks.");
          }
          if (hasMeta && !hasConversion) {
            fromPlaybook("meta", "objectives", [
              "META · Add a Sales/Leads objective campaign with Conversions API + Pixel + CAPI Gateway wired. iOS14+ + cookie deprecation reduced Pixel-only attribution by ~50%; CAPI recovers most of that. This is non-negotiable for any account where conversion ROI is the KPI."
            ]).forEach(function(s) { objAdvice.push(s); });
          }
          if (hasGoogle && !hasConversion) {
            fromPlaybook("google", "objectives", [
              "GOOGLE · Add a Performance Max campaign with Enhanced Conversions + offline conversion imports. Google's ML needs to see conversions land — without that signal, broad match + automated bidding can't find your converter pocket."
            ]).forEach(function(s) { objAdvice.push(s); });
          }
          if (objMix.length >= 2 && funnelTiers >= 2 && objAdvice.length === 0) {
            objAdvice.push("Objective mix is sensible. Track results-per-objective weekly: the highest results-to-spend ratio earns the next 15-20% budget increase, the lowest gets a creative refresh before any pause decision.");
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

          // ---- STRUCTURAL PLAY (60-90 day rebuild) ----
          // Renamed from "10X PLAY" — the multiplier framing was a
          // promise the team didn't want to make. Same content, more
          // honest label. Strategic platform-rebuild plays come from
          // the LLM-refreshed playbook (bp.rebuild.{platform}); the
          // universal plays come from bp.rebuild.universal.
          var tenx = [];
          var universalRebuild = fromPlaybook("rebuild", "universal", [
            "Run the 3-tier funnel with audience hand-offs: cold prospecting on Advantage+ Audience / TikTok Smart+ (60% of budget) → warm consideration on Custom Audiences of engagers + 1% Lookalikes (30%) → high-intent conversion via retargeting + Customer Match (10%). Each tier's converters seed the next tier's audience.",
            "90-day creative cadence: 3-5 fresh variants in market every fortnight per client, previous fortnight's winners scaled (15-20% budget bump), losers cut. Top-1% accounts ship 12+ creatives per quarter per platform — creative volume IS the moat once targeting commoditised.",
            "First-party data infrastructure: Pixel + Conversions API + offline conversion uploads + Customer Match feed on a 7-day refresh cadence. Once GAS sees real CAC by campaign by audience by creative, budget decisions become arithmetic, not opinion — and the same data improves every platform's ML signal-recovery."
          ]);
          if (universalRebuild[0]) tenx.push(universalRebuild[0]);
          if (hasMeta) {
            var metaCons = Math.max(2, Math.min(5, Math.round(camps.filter(function(x) { return /facebook|instagram/i.test(x.c.platform || ""); }).length * 0.5)));
            fromPlaybook("rebuild", "meta", [
              "META · Consolidate to " + metaCons + " Advantage+ Shopping/Sales campaigns (one per major product/offer line). The 2026 win pattern is FEWER, BIGGER campaigns running on Advantage+ Audience — Meta's ML needs ~50 conversions per ad-set per week to escape learning phase, and ad-set fragmentation starves it of that signal."
            ]).forEach(function(s) { tenx.push(s); });
          }
          if (hasTikTok) {
            fromPlaybook("rebuild", "tiktok", [
              "TIKTOK · Migrate every campaign to Smart+ (mandatory on most objectives by mid-2026 anyway). Pipeline 3-5 Spark Ads from creator partners per fortnight, each tied to a trending audio. Auction-side: TikTok rewards 'native-feeling' creative — branded polish actively suppresses delivery."
            ]).forEach(function(s) { tenx.push(s); });
          }
          if (hasGoogle) {
            fromPlaybook("rebuild", "google", [
              "GOOGLE · Move conversion campaigns to Performance Max with full asset coverage (5+ headlines, 5+ descriptions, 5+ images, 1+ logo, 1+ video at minimum). Wire Enhanced Conversions + offline conversion imports + Customer Match — those three together restore most of the signal cookie deprecation took, and PMax can't optimize without them."
            ]).forEach(function(s) { tenx.push(s); });
          }
          // Tack on the remaining universal plays after platform plays.
          for (var ui = 1; ui < universalRebuild.length; ui++) tenx.push(universalRebuild[ui]);
          if (platforms.length < 3) {
            tenx.push("Add the third platform. Whatever's missing (TikTok if Meta-heavy, Meta if TikTok-heavy, Google PMax if neither) closes audience-overlap leakage. The lift comes from incremental reach, not from stealing share — most accounts find their lowest-CAC pocket is on the platform they're under-invested on.");
          }

          // ---- INSIDE THE CRYSTAL BALL · ideal setup blueprint ----
          // Directional (no R-amounts), per-platform "what the perfect
          // setup looks like in 2026" blueprint. Renders only for the
          // platforms this client is actually on. Sits visually
          // separate (gold/purple) so it reads as the vision/north
          // star, not another tactical to-do.
          var crystalBall = [];
          if (hasMeta) {
            crystalBall.push({
              platform: "Meta", glyph: "fb",
              headline: "FB + IG as one funnel under Advantage+",
              blueprint: [
                { label: "Campaign count", value: "1-2 Advantage+ Shopping/Sales campaigns per major offer line. Fewer, bigger campaigns let the algorithm escape learning phase." },
                { label: "Ad sets", value: "1-2 per campaign. Avoid ad-set fragmentation — splitting budget across 5+ ad sets starves each one of conversion signal." },
                { label: "Audience", value: "Advantage+ Audience (broad, age + country only). Lookalikes and interests sit as Audience Suggestions, never hard segments." },
                { label: "Creative mix", value: "60% Reels-style 9:16 vertical video · 30% static (catalog/offer) · 10% carousel. Multiple creatives per ad set so Meta can pick winners by placement." },
                { label: "Tracking", value: "Pixel + Conversions API + CAPI Gateway. iOS14+ + cookie deprecation halved Pixel-only attribution — CAPI recovers most of that signal." },
                { label: "Refresh cadence", value: "3-5 fresh variants every fortnight. Winners scale 15-20%, losers cut. Hook is the lever — change the first 1-3 seconds first." }
              ]
            });
          }
          if (hasTikTok) {
            crystalBall.push({
              platform: "TikTok", glyph: "tt",
              headline: "Smart+ on autopilot, creator-led content pipeline",
              blueprint: [
                { label: "Campaign type", value: "Smart+ Campaigns end-to-end. Algorithm picks audience + creative + placement together — out-performs manual on 80%+ of accounts." },
                { label: "Audience", value: "Left blank or with creator/interest signals only. Manual segments constrain Smart+ rather than help it." },
                { label: "Creative mix", value: "70% Spark Ads from creator partners (raw UGC) · 30% brand-made. UGC out-performs polished brand 30-50% on CTR." },
                { label: "Audio", value: "Trending audio on at least 50% of variants. Pull from the Top 100 in TikTok's Creator Marketplace audio library each week." },
                { label: "Hook", value: "First 1-3 seconds is everything. Pattern interrupt + visual hook before brand reveal — branded polish suppresses delivery." },
                { label: "Refresh cadence", value: "14-day creative cycle. 3-5 Spark Ads from creators per fortnight, last fortnight's winners scaled, losers cut." }
              ]
            });
          }
          if (hasGoogle) {
            crystalBall.push({
              platform: "Google", glyph: "ga",
              headline: "Performance Max with full first-party signal",
              blueprint: [
                { label: "Campaign type", value: "Performance Max for conversion; plus 1 brand Search campaign for defence. PMax is the 2026 default for any account with conversion data." },
                { label: "Asset coverage", value: "20+ assets per asset group: 5+ headlines, 5+ descriptions, 1+ long headline, 5+ images, 1+ logo, 1+ video (including a 9:16 for YouTube Shorts)." },
                { label: "Audience signals", value: "Customer Match (uploaded converter emails) + Optimized Targeting stacked on top of every asset group. First-party data is what feeds the ML the signal cookie deprecation took." },
                { label: "Tracking", value: "Enhanced Conversions + offline conversion imports on a 7-day refresh. Without these the ML can't see conversions land and broad match can't find your converter pocket." },
                { label: "Bid strategy", value: "Maximize Conversions while learning; switch to Target CPA once you have 30+ conversions/month at a stable cost." },
                { label: "Asset groups", value: "One asset group per major product/offer. Don't over-fragment — PMax learns better with denser asset groups than thinner ones." }
              ]
            });
          }

          // Universal rules apply regardless of platform mix.
          var crystalUniversal = [
            "Funnel split · 60% cold prospecting / 30% warm consideration / 10% high-intent conversion. Each tier feeds the next via Custom Audience hand-offs.",
            "Creative cadence · 3-5 fresh variants per fortnight per platform. Volume IS the moat once targeting commoditised.",
            "First-party data · Pixel + CAPI + offline imports + Customer Match refreshed weekly. Same data feeds every platform's ML.",
            "Test-kill discipline · Winners scale 15-20% per week; losers paused after 7 days. Decisions become arithmetic, not opinion."
          ];

          // ---- TL;DR · Top 3 Moves This Week ----
          // Headline actions surfaced from the 5X play. Each move now
          // carries action / why / how / impact so a junior account
          // manager can execute the recommendation without needing a
          // glossary — but the language stays accurate so a senior
          // analyst can scan it just as fast.
          var topMoves = [];
          if (spendLeakers.length > 0 && scaleReady.length > 0) {
            // Match leakers to scale-ready candidates by OBJECTIVE family.
            // A reroute is only meaningful when source and destination
            // share an objective (lead-gen budget shouldn't silently
            // become traffic budget). If no same-objective scale-ready
            // destination exists, the move becomes "pause + hold" with
            // the explicit reason surfaced.
            var objKey = function(c) { return String(c.objective || "unknown").toLowerCase(); };
            var leakObj = {}, scaleObj = {};
            spendLeakers.forEach(function(x) { var k = objKey(x.c); (leakObj[k] = leakObj[k] || []).push(x); });
            scaleReady.forEach(function(x) { var k = objKey(x.c); (scaleObj[k] = scaleObj[k] || []).push(x); });
            // Pick the matched objective with the highest leaked spend.
            var matchedPairs = Object.keys(leakObj)
              .filter(function(k) { return scaleObj[k] && scaleObj[k].length > 0; })
              .map(function(k) {
                var ls = leakObj[k].reduce(function(s, x) { return s + (x.c.delivery.spendPeriod || 0); }, 0);
                return { obj: k, leakers: leakObj[k], scaleReady: scaleObj[k], spend: ls };
              })
              .sort(function(a, b) { return b.spend - a.spend; });
            var nameWithCtr = function(x) { return "'" + x.c.campaignName + "' (CTR " + fmtPct(x.c.delivery.ctr || 0) + ", spent " + fR2(x.c.delivery.spendPeriod || 0) + ")"; };
            var nameWithCtrScale = function(x) { return "'" + x.c.campaignName + "' (CTR " + fmtPct(x.c.delivery.ctr || 0) + ")"; };
            if (matchedPairs.length > 0) {
              var pair = matchedPairs[0];
              var objLabel = pair.obj === "unknown" ? "" : pair.obj + " ";
              var leakerNames = pair.leakers.slice(0, 3).map(nameWithCtr).join("; ");
              var scaleNames = pair.scaleReady.slice(0, 3).map(nameWithCtrScale).join("; ");
              topMoves.push({
                action: "Move " + fR2(pair.spend) + " out of " + pair.leakers.length + " under-performing " + objLabel + "campaign" + (pair.leakers.length === 1 ? "" : "s") + " into " + Math.min(pair.scaleReady.length, 3) + " same-objective scale-ready campaign" + (Math.min(pair.scaleReady.length, 3) === 1 ? "" : "s"),
                why: "Under-performing: " + leakerNames + ". Each is below 0.80% CTR with ≥10K impressions — the algorithm is spending but not finding clickers. Same-objective scale-ready candidates: " + scaleNames + " (CTR ≥ 1.5%, healthy frequency, results coming through). Because the objective family matches, this is a true budget shift, the algorithm picks up where it already converts instead of starting from scratch.",
                how: [
                  "Match the OBJECTIVE before anything else: only reroute between campaigns with the same outcome family (leads → leads, traffic → traffic, followers → followers). The lift only holds when source and destination measure success the same way.",
                  "Pause the under-performing campaign(s) at CAMPAIGN level in Ads Manager (not ad-set, so all delivery stops in one click).",
                  "Open each same-objective scale-ready campaign and raise its daily/lifetime budget by 15-20%. Don't double overnight, the algorithm needs a gentle ramp.",
                  "Check tomorrow that the scale-ready campaigns are still hitting their cost-per-result at the new spend. Cut the bump back if cost drifts ≥20% off baseline."
                ],
                impact: "Typically 30-50% lift in blended efficiency inside 14 days when source and destination share the same objective",
                // Split thumb groups so the operator can see at a glance
                // which campaigns to PAUSE vs which to GIVE BUDGET TO. A
                // single mixed strip was the previous UX and it left the
                // operator guessing which thumbnail belonged to which side.
                thumbGroups: [
                  { label: "Pause these", color: P.critical || "#ef4444", items: campThumbs(pair.leakers.slice(0, 3)) },
                  { label: "Give budget to these", color: P.mint || "#34D399", items: campThumbs(pair.scaleReady.slice(0, 3)) }
                ]
              });
            } else {
              // No same-objective destination. Surface as pause + hold.
              var leakNamesPlain = spendLeakers.slice(0, 3).map(function(x) { return "'" + x.c.campaignName + "' (" + (x.c.objective || "obj?") + ", CTR " + fmtPct(x.c.delivery.ctr || 0) + ", spent " + fR2(x.c.delivery.spendPeriod || 0) + ")"; }).join("; ");
              topMoves.push({
                action: "Pause " + fR2(leakSpend) + " across " + spendLeakers.length + " under-performing campaign" + (spendLeakers.length === 1 ? "" : "s") + " — no same-objective scale-ready home for the budget yet",
                why: "Under-performing: " + leakNamesPlain + ". Each is below 0.80% CTR with ≥10K impressions, so the algorithm is taking the budget without converting it. None of the scale-ready campaigns share the same objective, so rerouting the cash without a same-outcome destination would muddy the read (and could hide a real performance regression). Pause first, free the budget, then rebuild on the same objective.",
                how: [
                  "Pause the under-performers at CAMPAIGN level in Ads Manager.",
                  "Hold the freed budget — don't reroute it into a different-objective scale-ready campaign, that breaks the like-for-like read on every reporting surface.",
                  "Spin up new creative variants on the same objective(s) at 30-50% of the paused spend.",
                  "Revisit in 7 days: any new variant clearing 1.2% CTR earns the rerouted budget."
                ],
                impact: "Stops the leak immediately. Sets up a clean same-objective rebuild instead of a noisy reroute.",
                thumbGroups: [
                  { label: "Pause these", color: P.critical || "#ef4444", items: campThumbs(spendLeakers.slice(0, 3)) }
                ]
              });
            }
          }
          if (topPerf && (topMoves.length < 3)) {
            topMoves.push({
              action: "Build new campaigns using ‘" + topPerf.c.campaignName + "’ as the template",
              why: "This is the highest-CTR campaign on this client (" + fmtPct(topPerfCtr) + " vs " + fmtPct(blCtr) + " account average). The creative + audience combination in that campaign is clearly working. Re-using the same structure on other same-objective campaigns is faster and lower-risk than inventing new ones from scratch.",
              how: [
                "In Meta Ads Manager, find the winning campaign and click Duplicate.",
                "Match these three things on the new campaign: the same creative format (e.g. 9:16 video), the same hook structure (the first 3 seconds), and the same audience width (broad vs interest vs lookalike).",
                "Swap in the new product, offer, or message — but don't change the format or audience type.",
                "Launch with a similar budget. If results match within 7 days, scale up; if not, the variable that changed (product/offer/copy) is what to test next."
              ],
              impact: "Replicating a known winner is the single biggest near-term lift on this account",
              thumbs: campThumbs([topPerf])
            });
          }
          if (fatiguedAds.length > 0 && topMoves.length < 3) {
            topMoves.push({
              action: "Refresh " + fatiguedAds.length + " tired ad" + (fatiguedAds.length === 1 ? "" : "s") + " by changing the hook, colour, or call-to-action",
              why: "These ads are showing to the same people too many times (frequency above 3 on Meta or 6 on TikTok). Once frequency crosses that line, click-through rate drops 15-25% within days because audiences scroll past creative they've already seen. Even a small change to the first 3 seconds resets the curve.",
              how: [
                "Pick the lowest-performing ad in the list below.",
                "Don't rebuild from scratch — keep the body of the ad. Just swap ONE of: the opening 1-3 seconds, the dominant colour, the CTA wording, or the talent's face.",
                "Upload as a new ad in the same ad set (don't pause the original yet — let the algorithm split-test).",
                "After 5-7 days, pause whichever underperforms."
              ],
              impact: "Resets the frequency curve and extends the ad's productive lifespan by 30-40 days",
              thumbs: adThumbs(fatiguedAds.slice(0, 3))
            });
          }
          if (hasMeta && fatigued.length > 0 && topMoves.length < 3) {
            topMoves.push({
              action: "Switch fatigued Meta campaigns to ‘Advantage+ Audience’ broad targeting",
              why: "Frequency is climbing on these campaigns because the audience is too narrow — the same people see the ad over and over. In 2026, Meta's algorithm finds new converters better when you let it explore broadly than when you constrain it with lookalikes or interests. Switching to Advantage+ Audience opens the pool back up.",
              how: [
                "In Ads Manager, open one of the campaigns below.",
                "Go to the ad set → Audience section.",
                "Toggle ON ‘Advantage+ Audience’. Keep age and country, remove the interest/lookalike constraints (or move them to ‘Audience Suggestions’).",
                "Save. Let it run 3-5 days before judging — the algorithm needs that window to re-learn."
              ],
              impact: "Lower CPM, refreshed delivery, typically 15-25% efficiency gain over 2-3 weeks",
              thumbs: campThumbs(fatigued.slice(0, 3))
            });
          }
          if (topMoves.length < 3 && hasTikTok && byPlat.TikTok && byPlat.TikTok.n > 0) {
            topMoves.push({
              action: "Brief 3 creator partners to make Spark Ads for TikTok",
              why: "TikTok rewards content that feels native to the platform. Creator-made content (also called Spark Ads or UGC) outperforms polished brand creative by 30-50% on click-through rate because the algorithm treats it like organic content and the audience trusts it more. Brand-polished ads actively get suppressed in delivery.",
              how: [
                "Identify 3 creators whose content fits the client's brand voice (the client may already have a roster, or use TikTok Creator Marketplace).",
                "Brief them on the offer + the trending audio for the week (Top 100 in TikTok Library).",
                "Once they post on their personal accounts, get the Spark Ad code from them and use it to boost the post through the brand's ad account.",
                "Run 2-3 creators per fortnight as a standing pipeline, not a one-off."
              ],
              impact: "30-50% CTR uplift over brand-polished video on TikTok",
              thumbs: []
            });
          }
          if (topMoves.length === 0) {
            topMoves.push({
              action: "Structure is healthy — focus this week on shipping new creative",
              why: "No campaigns are leaking budget and no audiences are fatigued. The bottleneck on growth from here is creative volume: more variants in market means more A/B tests running in parallel, which means more winners to scale next month.",
              how: [
                "Pick the top-performing campaign (shown below).",
                "Ship 3-5 new creative variants this fortnight, varying one element at a time (hook, format, CTA).",
                "Let them run 7-10 days before deciding winners.",
                "Scale the winning variants 15-20% and document the winning hook structure so it can be re-used."
              ],
              impact: "Sustained algorithmic learning compounds into ~10-15% efficiency per quarter",
              thumbs: topPerf ? campThumbs([topPerf]) : []
            });
          }

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
              <div style={{ fontSize: 10, color: P.caption, fontFamily: fm, fontStyle: "italic", marginBottom: 22, letterSpacing: 1 }}>Top-1% global benchmark · {camps.length} campaign{camps.length === 1 ? "" : "s"} · {clientAds.length} ad{clientAds.length === 1 ? "" : "s"} · {dateFrom} to {dateTo}</div>

              {/* Mini stats strip removed: the same numbers live in the
                  client-header strip above (LIVE / PERIOD / TODAY /
                  RESULTS / ALERTS) and re-stating them here under the
                  Growth Plan title just added vertical chrome before
                  the TL;DR moves. Going straight into the plan keeps
                  the memo punchy. */}

              {/* TL;DR · Top moves this week — unpacked for a junior
                  account manager. Each card has four labelled blocks:
                    DO THIS  – the headline action
                    WHY      – the data signal behind the recommendation
                    HOW      – numbered steps the team can execute
                    IMPACT   – realistic expected lift
                  Still scannable for a senior analyst because the DO
                  THIS line on its own is enough at a glance. */}
              <div style={{ marginBottom: 22, padding: "18px 20px", background: "linear-gradient(135deg," + (P.warning || "#fbbf24") + "18," + (P.warning || "#fbbf24") + "04)", border: "1px solid " + (P.warning || "#fbbf24") + "55", borderRadius: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ background: P.warning || "#fbbf24", color: "#2a1605", padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>TOP MOVES</span>
                  <span style={{ fontSize: 13, color: P.warning || "#fbbf24", fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>{topMoves.length} priorit{topMoves.length === 1 ? "y" : "ies"} this week</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {topMoves.map(function(m, i) { return <div key={i} style={{ display: "flex", gap: 14, padding: "16px 18px", background: "rgba(0,0,0,0.3)", border: "1px solid " + (P.warning || "#fbbf24") + "30", borderRadius: 10 }}>
                    <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", background: (P.warning || "#fbbf24") + "30", border: "1px solid " + (P.warning || "#fbbf24") + "66", color: P.warning || "#fbbf24", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900, fontFamily: fm }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* DO THIS · the headline action sentence. */}
                      <div style={{ fontSize: 9, fontWeight: 900, color: P.warning || "#fbbf24", fontFamily: fm, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 4 }}>Do this</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: P.txt, fontFamily: ff, lineHeight: 1.4, marginBottom: 12 }}>{m.action}</div>

                      {/* WHY · the data signal driving the move. */}
                      {m.why && <div style={{ marginBottom: 12, paddingLeft: 10, borderLeft: "2px solid " + (P.cyan || "#22D3EE") + "55" }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: P.cyan || "#22D3EE", fontFamily: fm, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 3 }}>Why this matters</div>
                        <div style={{ fontSize: 12, color: P.label, fontFamily: ff, lineHeight: 1.65 }}>{m.why}</div>
                      </div>}

                      {/* HOW · numbered Ads Manager steps. */}
                      {m.how && m.how.length > 0 && <div style={{ marginBottom: 12, paddingLeft: 10, borderLeft: "2px solid " + (P.mint || "#34D399") + "55" }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: P.mint || "#34D399", fontFamily: fm, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 6 }}>How to do it</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {m.how.map(function(step, si) {
                            return <div key={si} style={{ display: "flex", gap: 8, fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.55 }}>
                              <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: (P.mint || "#34D399") + "22", color: P.mint || "#34D399", border: "1px solid " + (P.mint || "#34D399") + "55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, fontFamily: fm }}>{si + 1}</span>
                              <span>{step}</span>
                            </div>;
                          })}
                        </div>
                      </div>}

                      {/* IMPACT · what to expect. */}
                      <div style={{ paddingLeft: 10, borderLeft: "2px solid " + (P.ember || "#F96203") + "55" }}>
                        <div style={{ fontSize: 9, fontWeight: 900, color: P.ember || "#F96203", fontFamily: fm, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 3 }}>Expected impact</div>
                        <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.55 }}>{m.impact}</div>
                      </div>

                      {/* Labelled thumbnail groups (e.g. "Pause these" /
                          "Give budget to these"). Falls back to a single
                          unlabeled strip for moves that don't split. */}
                      {m.thumbGroups && m.thumbGroups.length > 0 ? <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                        {m.thumbGroups.map(function(g, gi) {
                          if (!g || !g.items || g.items.length === 0) return null;
                          return <div key={gi}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: g.color || P.label, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{g.label} · {g.items.length}</div>
                            {thumbStrip(g.items)}
                          </div>;
                        })}
                      </div> : (m.thumbs && m.thumbs.length > 0 && thumbStrip(m.thumbs))}
                    </div>
                  </div>; })}
                </div>
                {/* Single-line jargon legend so a junior PM never has to
                    Google a term. Sized tiny on purpose — it's safety
                    net, not chrome. */}
                <div style={{ marginTop: 12, fontSize: 9.5, color: P.caption, fontFamily: fm, fontStyle: "italic", lineHeight: 1.6, letterSpacing: 0.4 }}>
                  Quick glossary · <strong style={{ color: P.label }}>CTR</strong> = clicks ÷ impressions × 100 (engagement rate) · <strong style={{ color: P.label }}>CPM</strong> = cost per 1,000 impressions (delivery price) · <strong style={{ color: P.label }}>Frequency</strong> = average times the same person saw your ad · <strong style={{ color: P.label }}>Scale-ready</strong> = a campaign that's already converting efficiently and can take more budget · <strong style={{ color: P.label }}>Advantage+ Audience</strong> = Meta's broad-targeting mode that lets the algorithm find converters rather than constraining it.
                </div>
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

              {/* THIS WEEK · tactical reallocation */}
              <div style={{ marginBottom: 16, padding: "18px 20px", background: "linear-gradient(135deg," + P.mint + "15," + P.mint + "06)", border: "1px solid " + P.mint + "40", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ background: P.mint, color: "#062014", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>This week</span>
                  <span style={{ fontSize: 12, color: P.mint, fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>Move the budget to where it works</span>
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

              {/* STRUCTURAL PLAY · 60-90 day rebuild (renamed from "10X PLAY"
                  because the multiplier framing read as a promise) */}
              <div style={{ padding: "18px 20px", background: "linear-gradient(135deg," + (P.ember || "#F96203") + "15," + (P.blaze || "#FF3D00") + "08)", border: "1px solid " + (P.ember || "#F96203") + "40", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ background: "linear-gradient(135deg," + (P.ember || "#F96203") + "," + (P.blaze || "#FF3D00") + ")", color: "#fff", padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 900, fontFamily: fm, letterSpacing: 2 }}>Structural play</span>
                  <span style={{ fontSize: 12, color: P.ember || "#F96203", fontFamily: fm, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase" }}>60-90 day rebuild</span>
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 22px", fontSize: 13, color: P.txt, fontFamily: ff, lineHeight: 1.85 }}>
                  {tenx.map(function(p, i) { return <li key={i} style={{ marginBottom: 6 }}>{p}</li>; })}
                </ul>
              </div>

              {/* INSIDE THE CRYSTAL BALL · the ideal-setup blueprint
                  for this client based on the platforms in play. Sits
                  visually apart from the rest of the memo (gold/purple
                  on a slightly tinted background) so it reads as the
                  destination/vision rather than another to-do item.
                  Directional only — no R-amounts. */}
              {crystalBall.length > 0 && <div style={{ marginTop: 16, padding: "22px 22px 20px", borderRadius: 14, background: "linear-gradient(135deg," + (P.solar || "#fbbf24") + "12 0%," + (P.orchid || "#A855F7") + "10 50%," + (P.solar || "#fbbf24") + "08 100%)", border: "1px solid " + (P.solar || "#fbbf24") + "55", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, background: "radial-gradient(circle," + (P.orchid || "#A855F7") + "30 0%, transparent 70%)", pointerEvents: "none" }}></div>
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 20 }}>🔮</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, fontFamily: fm, letterSpacing: 2.5, textTransform: "uppercase", background: "linear-gradient(135deg," + (P.solar || "#fbbf24") + "," + (P.orchid || "#A855F7") + ")", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>Inside the Crystal Ball</div>
                      <div style={{ fontSize: 11, color: P.label, fontFamily: fm, marginTop: 2, letterSpacing: 0.5 }}>What this client's perfect setup looks like, per platform</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: P.caption, fontFamily: fm, fontStyle: "italic", marginBottom: 16, letterSpacing: 0.5 }}>Directional blueprint based on 2026 platform best practices. The destination, not next week's to-do — the Structural Play above gets you here over 60-90 days.</div>

                  {/* Per-platform blueprint cards. */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
                    {crystalBall.map(function(cb, ci) {
                      var accent = cb.platform === "Meta" ? (P.fb || "#1877F2") : cb.platform === "TikTok" ? (P.tt || "#22D3EE") : cb.platform === "Google" ? (P.gd || "#34D399") : (P.label || "#9ca3af");
                      return <div key={ci} style={{ padding: "14px 16px", background: "rgba(0,0,0,0.35)", border: "1px solid " + accent + "40", borderLeft: "3px solid " + accent, borderRadius: "0 12px 12px 0" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                          <span style={{ background: accent + "22", border: "1px solid " + accent + "66", color: accent, fontSize: 10, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, padding: "3px 9px", borderRadius: 5, textTransform: "uppercase" }}>{cb.platform}</span>
                          <span style={{ fontSize: 12, color: P.txt, fontFamily: ff, fontWeight: 700 }}>{cb.headline}</span>
                        </div>
                        <table role="presentation" cellPadding="0" cellSpacing="0" border="0" style={{ width: "100%", borderCollapse: "collapse", fontFamily: ff }}>
                          <tbody>
                            {cb.blueprint.map(function(b, bi) {
                              return <tr key={bi}>
                                <td style={{ verticalAlign: "top", width: 140, padding: "5px 12px 5px 0", fontSize: 10, fontWeight: 800, color: P.label, fontFamily: fm, letterSpacing: 1.2, textTransform: "uppercase", whiteSpace: "nowrap" }}>{b.label}</td>
                                <td style={{ verticalAlign: "top", padding: "5px 0", fontSize: 12, color: P.txt, lineHeight: 1.65 }}>{b.value}</td>
                              </tr>;
                            })}
                          </tbody>
                        </table>
                      </div>;
                    })}
                  </div>

                  {/* Universal rules below the per-platform cards. */}
                  <div style={{ padding: "12px 14px", background: "rgba(0,0,0,0.25)", border: "1px dashed " + (P.solar || "#fbbf24") + "55", borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 900, color: P.solar || "#fbbf24", fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Rules of the game · apply regardless of platform</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {crystalUniversal.map(function(r, ri) {
                        return <div key={ri} style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.6 }}>• {r}</div>;
                      })}
                    </div>
                  </div>

                  {/* Missing-platform nudge so the blueprint also points
                      at the platform this client should add next. */}
                  {platforms.length < 3 && <div style={{ marginTop: 12, padding: "10px 12px", background: (P.orchid || "#A855F7") + "12", border: "1px solid " + (P.orchid || "#A855F7") + "55", borderRadius: 8, fontSize: 11, color: P.txt, fontFamily: ff, lineHeight: 1.6 }}>
                    <span style={{ fontWeight: 800, color: P.orchid || "#A855F7", letterSpacing: 1, textTransform: "uppercase", fontSize: 10, fontFamily: fm }}>Missing platform · </span>
                    {(!hasTikTok ? "TikTok Smart+ is the highest-ROI add for a Meta-heavy account in 2026." : !hasMeta ? "Meta Advantage+ is the natural conversion layer for a TikTok-heavy account." : "Google Performance Max closes the search-intent gap.")}
                  </div>}
                </div>
              </div>}

              {/* Honest confidence disclaimer + flow guide so the team
                  knows what they're reading and how reliable it is.
                  Stamped with the playbook refresh date so the team can
                  see when the platform advice was last updated by the
                  monthly auto-refresh cron. */}
              <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderLeft: "3px solid " + P.label, borderRadius: "0 10px 10px 0", fontSize: 10, color: P.label, fontFamily: fm, lineHeight: 1.7, letterSpacing: 0.5 }}>
                <div style={{ fontWeight: 800, color: P.txt, marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>How to read this memo</div>
                <div>The Diagnosis findings above are 100% data-driven from this client's live campaigns in your selected window. The Audience / Creative / Objective playbooks reflect current Meta Advantage+, TikTok Smart+, and Google PMax best practices, auto-refreshed monthly from a top-1% agency benchmark. They're high-confidence direction, not absolute rules — every account has nuance. Use the Top Moves for the week, then drill into the section that matches what you're working on. Click any ad thumbnail to open the full-size creative on the platform's CDN in a new tab.{bp && bp.asOf ? " · Playbook refreshed " + bp.asOf : ""}</div>
              </div>
            </div>
          </div>;
        };

        // ===== PLATFORM-LED RESTRUCTURE =====
        // Team feedback: per-client sections were heavy and forced
        // mental-model switches. Optimisation work runs platform-by-
        // platform (one person owns Facebook for the morning, another
        // owns TikTok). New structure: flat by platform, with Issues
        // / Fixes / Scaling / Paused under each platform header. The
        // client name still appears on every campaign row so context
        // isn't lost, but the page is read top-to-bottom one platform
        // at a time. Per-client Growth Plan memos dropped; account-
        // wide best practices live in the Crystal Ball footer at the
        // bottom of the page.

        // Canonical platform key. Maps every Meta-derived label
        // (Facebook, Instagram, Facebook Ads, IG) and every Google
        // surface (Google Display, YouTube, Google Search) to one of
        // the four buckets the team operates against.
        var canonPlatform = function(p) {
          var s2 = String(p || "").toLowerCase();
          if (s2.indexOf("instagram") >= 0) return "Instagram";
          if (s2.indexOf("facebook") >= 0) return "Facebook";
          if (s2.indexOf("tiktok") >= 0) return "TikTok";
          if (s2.indexOf("google") >= 0 || s2.indexOf("youtube") >= 0) return "Google";
          return "Other";
        };

        // Per-alert-code fix template. One Issue card = one Fix card,
        // matched by alert code. Each template carries a media-expert
        // WHY and 3-4 HOW steps so a junior PM can execute without a
        // glossary. Templates are static — actual numbers from the
        // alert message are substituted at render time, not here.
        var fixTemplate = function(code, platform) {
          var plat = platform;
          var fb = plat === "Facebook" || plat === "Instagram";
          if (code === "frequency_high") {
            return {
              label: "Refresh creative",
              why: "Frequency above 3 on " + (fb ? "Meta" : "TikTok at 6") + " is the line where the same person scrolls past your ad without registering it. CTR drops 15-25% within days once you cross. Even a small change to the first 3 seconds resets the curve and extends the productive life by 30-40 days.",
              how: [
                "Pick the lowest-performing ad in the ad set.",
                "Keep the body, swap ONE of: opening 1-3 seconds, dominant colour, CTA wording, or talent face.",
                "Upload as a NEW ad in the same ad set (don't pause the original, let the algorithm split-test).",
                "After 5-7 days, pause whichever variant underperforms."
              ]
            };
          }
          if (code === "pacing_behind") {
            return {
              label: "Catch up the spend",
              why: "Behind-pace burns the back of the window: the budget concentrates into the last week, so the algorithm gets less time to find converters and CPM rises with the rushed delivery. Lift daily by ~20% or extend the end date rather than letting the catch-up happen organically.",
              how: [
                "Open the campaign in Ads Manager → budget.",
                "If you have flexibility on the end date: extend by 5-7 days and the existing daily budget catches up naturally.",
                "If the end date is fixed: raise daily/lifetime by ~20% so spend lands on plan.",
                "Don't double the budget overnight — Meta's algorithm needs a gentle ramp to stay in learning-stable."
              ]
            };
          }
          if (code === "no_clicks") {
            return {
              label: "Investigate the click break",
              why: "Spend with impressions but zero clicks is one of three problems: a destination URL that's broken or geo-blocked, creative that doesn't ask for the click, or audience that's not in market. Worth ten minutes of human attention before paying for another day of delivery.",
              how: [
                "Open the destination URL in incognito — does it load? Mobile + desktop.",
                "Open the ad preview in Ads Manager → check the CTA button is set and the URL parameters look right.",
                "If both check out, the issue is targeting fit — pause the underperforming ad-set and rebuild on broader audience (Advantage+ on Meta, Smart+ on TikTok).",
                "Re-launch with a small budget for 48h to confirm the click problem is fixed before scaling."
              ]
            };
          }
          if (code === "no_results") {
            return {
              label: "Plug the conversion leak",
              why: "Clicks but zero results means the destination isn't converting. Most common: lead-form load error, tracking pixel missing on the thank-you page, or message-to-landing mismatch (the ad promised X, the page sells Y). Find which one before you spend another rand.",
              how: [
                "Open the campaign and click through one of your own ads to the landing page.",
                "Submit the form yourself — does it confirm? Does the event fire in Events Manager / Pixel Helper?",
                "If the form works but Pixel isn't firing, fix the pixel; if Pixel fires but no conversions are reporting, check attribution window.",
                "If the form is broken or copy mismatches the ad, fix the page before resuming spend."
              ]
            };
          }
          if (code === "spend_no_delivery") {
            return {
              label: "Resolve the delivery block",
              why: "Money out, zero impressions = the platform took payment but didn't serve the ad. Usually: ad disapproval, audience-size collapse, account-level billing flag, or a recently-paused parent. Fix is mechanical, not strategic.",
              how: [
                "Open the campaign — check the disapproval/policy banner at top of Ads Manager.",
                "If disapproved: read the policy reason, edit the ad (often image text % or restricted-category copy), resubmit.",
                "If approved but no delivery: check audience size, schedule, and account billing status.",
                "Once resolved, give the algorithm 24h to resume before judging delivery."
              ]
            };
          }
          if (code === "ended_still_active") {
            return {
              label: "End or extend",
              why: "Status reads ACTIVE but the end date has already passed. The platform usually stops serving but keeps charging if billing isn't reconciled. Confirm intent: extend the flight, or turn the campaign off cleanly at the campaign level (not just ad-set).",
              how: [
                "Open the campaign in Ads Manager.",
                "Decide: extend the end date by X days, OR toggle the campaign OFF at campaign level.",
                "If turning off, double-check there's no ad-set still set to ACTIVE on a different end date underneath."
              ]
            };
          }
          if (code === "today_no_spend") {
            return {
              label: "Check delivery stall",
              why: "Was delivering at a meaningful daily pace, then stopped. Usually one of: budget exhausted for the day, account billing flag, ad disapproval, or audience cap. Worth checking now because every hour of stalled delivery is an hour of lost reach.",
              how: [
                "Open the campaign in Ads Manager — check status indicators and policy banner.",
                "Look at the daily spend chart for the last 3 days — is today a clean drop-off or has spend been trending down?",
                "If a clean drop: usually budget cap or billing — refresh card/budget. If trending down: audience fatigue, address that first."
              ]
            };
          }
          if (code === "cpl_trend_up" || code === "cpf_trend_up" || code === "cpc_trend_up" || code === "cpm_trend_up") {
            // One fix template covers every cost-per-result trend
            // alert. The metric label changes per objective so the
            // copy doesn't say "CPL" on an awareness campaign or
            // "CPC" on a lead campaign. The diagnostic playbook is
            // the same: split the drift into CPM (auction pressure)
            // vs CTR (creative / audience) and act on whichever moved.
            var metric = code === "cpl_trend_up" ? "CPL"
                       : code === "cpf_trend_up" ? "CPF"
                       : code === "cpm_trend_up" ? "CPM" : "CPC";
            var resultNoun = code === "cpl_trend_up" ? "lead"
                           : code === "cpf_trend_up" ? "follower / page like"
                           : code === "cpm_trend_up" ? "1,000 impressions" : "click";
            return {
              label: "Investigate " + metric + " drift",
              why: metric + " trending higher than the trailing median means the campaign is paying more per " + resultNoun + " than it was last week. Could be auction pressure (competitors entered), audience fatigue, creative wear-out, or seasonal drift. Diagnose the cause before scaling spend further — adding budget to a campaign that's already drifting is the most common avoidable spend leak.",
              how: [
                "Split the drift into CPM vs CTR vs frequency. " + metric + " = CPM × (1 / CTR) ÷ result-rate. If CPM is up, it's auction pressure; if CTR is down, it's creative or audience; if frequency is up, it's audience fatigue.",
                "Auction pressure: hold spend, don't try to outbid. Focus on creative quality (the algorithm rewards CTR more than budget at this stage).",
                "Audience fatigue: refresh creative (see the frequency_high fix) or widen audience to Advantage+ / Smart+.",
                "Creative wear-out: ship 2-3 new variants this week. Even a small change to the first 3 seconds resets the curve."
              ]
            };
          }
          return {
            label: "Review and decide",
            why: "This alert is informational. Review the campaign performance against the client's KPI, decide if action is needed.",
            how: ["Open the campaign in Ads Manager and review against the client's KPI.", "If action needed, pause/refresh/rebrief as appropriate.", "If not, dismiss and revisit next week."]
          };
        };

        // Group every campaign across every client by platform. Apply
        // the existing classify() so we keep the same severity logic;
        // the difference is the rows are bucketed by platform rather
        // than by client. The client name is preserved on each row
        // so the operator never loses context.
        var platformDefs = [
          { key: "Facebook", label: "Facebook", color: "#1877F2", sub: "Meta — Facebook placement" },
          { key: "Instagram", label: "Instagram", color: "#E1306C", sub: "Meta — Instagram placement" },
          { key: "TikTok", label: "TikTok", color: "#00F2EA", sub: "TikTok Ads" },
          { key: "Google", label: "Google Ads", color: "#FBBC05", sub: "Google Display / YouTube / Search" }
        ];
        var platformBuckets = {};
        platformDefs.forEach(function(d) {
          platformBuckets[d.key] = {
            issues: [], scale: [], paused: [], all: [],
            // Per-platform totals so the top-row summary tiles can
            // recalculate when the operator picks a platform chip.
            // Earlier behaviour: the tiles always read the cross-
            // platform summary from the API, so picking Facebook
            // didn't change the CAMPAIGNS / LIVE NOW / SPEND
            // headline — that broke the mental model of "I'm
            // working Facebook now, show me Facebook's load".
            campaigns: 0, live: 0, needsAttention: 0, alerts: 0,
            spendToday: 0, spendPeriod: 0
          };
        });
        s.data.clients.forEach(function(grp) {
          grp.campaigns.forEach(function(c) {
            var key = canonPlatform(c.platform);
            if (!platformBuckets[key]) return; // skip "Other"
            var k = classify(c);
            // Attention filter applies to active priorities only
            // (issues / scale-ready). PAUSED THIS PERIOD is
            // informational ("what state is in flight on this
            // platform today?") so it surfaces regardless of filter
            // — earlier behaviour was hiding paused rows without
            // alerts when filter == attention, which dropped 3 of
            // the 4 MTN MoMo Pay paused rows from view (only the
            // Google one had a pacing alert).
            if (k !== "paused" && k !== "ended" && !passFilter(c)) return;
            var entry = { client: grp.client, c: c };
            var pb = platformBuckets[key];
            pb.all.push(entry);
            pb.campaigns += 1;
            if (c.live) pb.live += 1;
            pb.spendToday += (c.delivery && c.delivery.spendToday) || 0;
            pb.spendPeriod += (c.delivery && c.delivery.spendPeriod) || 0;
            if (c.alerts && c.alerts.length > 0) {
              pb.needsAttention += 1;
              pb.alerts += c.alerts.length;
            }
            if (k === "attention" || k === "watch") pb.issues.push(Object.assign({ sev: k }, entry));
            else if (k === "scale") pb.scale.push(entry);
            else if (k === "paused" || k === "ended") pb.paused.push(Object.assign({ bucket: k }, entry));
          });
        });
        // Sort within each bucket: high-severity first, then spend.
        Object.keys(platformBuckets).forEach(function(k) {
          var b = platformBuckets[k];
          b.issues.sort(function(a, c) {
            // Attention > Watch
            if (a.sev !== c.sev) return a.sev === "attention" ? -1 : 1;
            return (c.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0);
          });
          b.scale.sort(function(a, c) { return (c.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
          b.paused.sort(function(a, c) { return (c.c.delivery.spendPeriod || 0) - (a.c.delivery.spendPeriod || 0); });
        });

        // Apply platform filter
        var platforms = platformDefs.filter(function(d) {
          if (platformFilter && platformFilter !== "all") return d.key === platformFilter;
          // Hide platforms with literally nothing in any bucket so a
          // client without TikTok doesn't show an empty TikTok header.
          var b = platformBuckets[d.key];
          return (b.issues.length + b.scale.length + b.paused.length) > 0;
        });

        if (platforms.length === 0) {
          if (filterMode === "attention") {
            return <Glass st={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: P.mint, fontFamily: ff, fontWeight: 700 }}>Nothing needs attention right now.</div>
              <div style={{ fontSize: 11, color: P.caption, fontFamily: fm, marginTop: 6 }}>Every in-flight campaign is healthy in this window. Switch to All to see the live load.</div>
            </Glass>;
          }
          if (platformFilter) {
            return <Glass st={{ padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: P.label, fontFamily: fm }}>‘{platformFilter}’ has nothing in this window.</div>
              <button onClick={function() { setPlatformFilter(""); }} style={{ marginTop: 10, background: "transparent", border: "1px solid " + P.rule, borderRadius: 8, padding: "7px 14px", color: P.solar, fontSize: 11, fontWeight: 800, fontFamily: fm, cursor: "pointer", letterSpacing: 1.5, textTransform: "uppercase" }}>Show all platforms</button>
            </Glass>;
          }
          return null;
        }

        // Layered thumbnail: platform-glyph div always rendered, signed
        // CDN image overlaid on top. Meta thumbnail URLs are time-
        // limited (signed CDN), so a card that's a few hours old can
        // get a 403 / expired URL — onError hides the image, exposing
        // the glyph beneath. Used by Issue / Scale / Paused cards.
        var thumbBox = function(c, size) {
          var sz = size || 72;
          return <div style={{ flexShrink: 0, width: sz, height: sz, borderRadius: 10, overflow: "hidden", border: "1px solid " + P.rule, background: "linear-gradient(135deg," + (P.cyan || "#22D3EE") + "22," + (P.ember || "#F96203") + "15)", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: Math.max(10, sz / 6), fontWeight: 900, fontFamily: fm, letterSpacing: 1 }}>{platShort(c.platform)}</div>
            {c.thumbnail && <img src={c.thumbnail} alt="" loading="lazy" decoding="async" onError={function(e) { e.target.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}/>}
          </div>;
        };

        // Issue card: thumbnail + client + campaign name + alert + one-line context.
        var renderIssueCard = function(entry, idx) {
          var c = entry.c;
          var alert = c.alerts && c.alerts[0];
          var sev = entry.sev || (alert ? alert.severity : "low");
          var col = sev === "attention" ? (P.critical || "#ef4444") : (P.warning || "#fbbf24");
          var amUrl = c.adsManagerUrl || "";
          return <div key={c.campaignId + "-issue-" + idx} style={{ display: "flex", gap: 14, padding: 14, marginBottom: 10, background: "rgba(0,0,0,0.3)", border: "1px solid " + col + "55", borderLeft: "4px solid " + col, borderRadius: 10, alignItems: "flex-start" }}>
            <a href={amUrl || undefined} target={amUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>{thumbBox(c, 72)}</a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ background: col + "26", color: col, padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>#{idx + 1} · {sev === "attention" ? "Urgent" : "Watch"}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: P.mint, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase" }}>{entry.client}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: fm, lineHeight: 1.4, wordBreak: "break-word", marginBottom: 4 }}>{c.campaignName}</div>
              {alert && <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.5 }}>{alert.message}</div>}
              <div style={{ marginTop: 6, fontSize: 10, color: P.label, fontFamily: fm, letterSpacing: 0.5 }}>
                Spend {R(c.delivery.spendPeriod)} · CTR {Number(c.delivery.ctr || 0).toFixed(2)}% · Freq {Number(c.delivery.frequency || 0).toFixed(2)}
              </div>
            </div>
            {amUrl && <a href={amUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, background: col + "22", border: "1px solid " + col + "66", borderRadius: 8, padding: "8px 12px", color: col, fontSize: 10, fontWeight: 800, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap" }}>Open ↗</a>}
          </div>;
        };

        var renderFixCard = function(entry, idx, plat) {
          var c = entry.c;
          var alert = c.alerts && c.alerts[0];
          var fix = fixTemplate(alert ? alert.code : "", plat);
          return <div key={c.campaignId + "-fix-" + idx} style={{ padding: 14, marginBottom: 10, background: "rgba(0,0,0,0.3)", border: "1px solid " + (P.mint || "#34D399") + "44", borderLeft: "4px solid " + (P.mint || "#34D399"), borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ background: (P.mint || "#34D399") + "26", color: P.mint || "#34D399", padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>Fix #{idx + 1} · {fix.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: P.label, fontFamily: fm }}>‘{c.campaignName}’</span>
            </div>
            <div style={{ fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.6, marginBottom: 8 }}>{fix.why}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {fix.how.map(function(step, si) {
                return <div key={si} style={{ display: "flex", gap: 8, fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: (P.mint || "#34D399") + "22", color: P.mint || "#34D399", border: "1px solid " + (P.mint || "#34D399") + "55", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, fontFamily: fm }}>{si + 1}</span>
                  <span>{step}</span>
                </div>;
              })}
            </div>
          </div>;
        };

        var renderScaleCard = function(entry, idx) {
          var c = entry.c;
          var amUrl = c.adsManagerUrl || "";
          var col = P.mint || "#34D399";
          return <div key={c.campaignId + "-scale-" + idx} style={{ display: "flex", gap: 14, padding: 14, marginBottom: 10, background: "rgba(0,0,0,0.3)", border: "1px solid " + col + "44", borderLeft: "4px solid " + col, borderRadius: 10, alignItems: "flex-start" }}>
            <a href={amUrl || undefined} target={amUrl ? "_blank" : undefined} rel="noopener noreferrer" style={{ display: "block", textDecoration: "none" }}>{thumbBox(c, 72)}</a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ background: col + "26", color: col, padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 900, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase" }}>Scale candidate</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: P.mint, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase" }}>{entry.client}</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: P.txt, fontFamily: fm, lineHeight: 1.4, wordBreak: "break-word", marginBottom: 4 }}>{c.campaignName}</div>
              <div style={{ fontSize: 11, color: P.txt, fontFamily: ff, lineHeight: 1.5 }}>
                CTR {Number(c.delivery.ctr || 0).toFixed(2)}% is clearing the 1.50% scale bar with healthy frequency. Algorithm has already learned this audience-creative pair; a 15-20% daily-budget lift compounds before efficiency drifts.
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: P.label, fontFamily: fm, letterSpacing: 0.5 }}>
                Spend {R(c.delivery.spendPeriod)} · CTR {Number(c.delivery.ctr || 0).toFixed(2)}% · Freq {Number(c.delivery.frequency || 0).toFixed(2)} · {(c.delivery.resultLabel || "Results").toUpperCase()} {N(c.delivery.result || 0)}
              </div>
            </div>
            {amUrl && <a href={amUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, background: col + "22", border: "1px solid " + col + "66", borderRadius: 8, padding: "8px 12px", color: col, fontSize: 10, fontWeight: 800, fontFamily: fm, letterSpacing: 1, textTransform: "uppercase", textDecoration: "none", whiteSpace: "nowrap" }}>Open ↗</a>}
          </div>;
        };

        var sectionHeader = function(label, count, color, sub) {
          return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 10, borderBottom: "2px solid " + color + "88" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ background: color + "26", border: "2px solid " + color + "88", color: color, fontSize: 14, fontWeight: 900, fontFamily: fm, letterSpacing: 2, padding: "8px 16px", borderRadius: 8, textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span>{label}</span>
                <span style={{ background: color + "44", color: color, padding: "2px 9px", borderRadius: 12, fontSize: 13, fontWeight: 900, letterSpacing: 0.5 }}>{count}</span>
              </span>
              {sub && <span style={{ fontSize: 12, color: P.label, fontFamily: fm, fontStyle: "italic" }}>{sub}</span>}
            </div>
          </div>;
        };

        return <React.Fragment>
          {/* Platform filter chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22, alignItems: "center" }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: P.label, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginRight: 4 }}>Platform</span>
            <button onClick={function() { setPlatformFilter(""); }}
              style={{ background: !platformFilter || platformFilter === "all" ? P.mint + "22" : "rgba(0,0,0,0.3)", border: "1px solid " + (!platformFilter || platformFilter === "all" ? P.mint : P.rule), borderRadius: 8, padding: "8px 14px", fontSize: 11, fontWeight: 800, fontFamily: fm, color: !platformFilter || platformFilter === "all" ? P.mint : P.label, letterSpacing: 1, textTransform: "uppercase", cursor: "pointer" }}>
              All platforms
            </button>
            {platformDefs.map(function(d) {
              var b = platformBuckets[d.key];
              var totalRows = b.issues.length + b.scale.length + b.paused.length;
              if (totalRows === 0) return null;
              var isOn = platformFilter === d.key;
              var issueCount = b.issues.length;
              return <button key={d.key} onClick={function() { setPlatformFilter(isOn ? "" : d.key); }}
                style={{ background: isOn ? d.color + "22" : "rgba(0,0,0,0.3)", border: "1px solid " + (isOn ? d.color : P.rule), borderLeft: "3px solid " + d.color, borderRadius: 8, padding: "8px 12px", display: "flex", alignItems: "center", gap: 10, fontFamily: fm, cursor: "pointer", outline: "none" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: isOn ? d.color : P.txt }}>{d.label}</span>
                <span style={{ fontSize: 9, color: P.label, letterSpacing: 1 }}>{totalRows}</span>
                {issueCount > 0 && <span style={{ fontSize: 9, fontWeight: 900, color: P.critical || "#ef4444", letterSpacing: 1 }}>{issueCount} FLAGS</span>}
              </button>;
            })}
          </div>

          {/* Per-platform sections */}
          {platforms.map(function(d) {
            var b = platformBuckets[d.key];
            return <section key={d.key} style={{ marginBottom: 36, paddingBottom: 22, borderBottom: "1px solid " + P.rule }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 18, padding: "16px 0", borderBottom: "2px solid " + d.color + "55" }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: d.color, fontFamily: fm, letterSpacing: 1, lineHeight: 1 }}>{d.label}</div>
                  <div style={{ fontSize: 11, color: P.caption, fontFamily: fm, marginTop: 4 }}>{d.sub}</div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontFamily: fm }}>
                  {[
                    ["FLAGS", N(b.issues.length), b.issues.length > 0 ? (P.critical || "#ef4444") : P.label],
                    ["SCALE", N(b.scale.length), P.mint],
                    ["PAUSED", N(b.paused.length), P.solar]
                  ].map(function(m, i) {
                    return <div key={i} style={{ padding: "8px 12px", background: "rgba(0,0,0,0.3)", border: "1px solid " + P.rule, borderRadius: 8, textAlign: "right", minWidth: 70 }}>
                      <div style={{ fontSize: 8, color: P.label, letterSpacing: 1, marginBottom: 2 }}>{m[0]}</div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: m[2] }}>{m[1]}</div>
                    </div>;
                  })}
                </div>
              </div>

              {b.issues.length > 0 && <div style={{ marginBottom: 22 }}>
                {sectionHeader(d.label + " Flags", b.issues.length, P.critical || "#ef4444", "Campaigns to triage today")}
                {b.issues.map(function(e, i) { return renderIssueCard(e, i); })}
              </div>}

              {b.issues.length > 0 && <div style={{ marginBottom: 22 }}>
                {sectionHeader(d.label + " Fixes", b.issues.length, P.mint || "#34D399", "How to resolve each flag above, in order")}
                {b.issues.map(function(e, i) { return renderFixCard(e, i, d.key); })}
              </div>}

              {b.scale.length > 0 && <div style={{ marginBottom: 22 }}>
                {sectionHeader(d.label + " Scaling Opportunities", b.scale.length, P.mint || "#34D399", "Strong CTR, healthy frequency, ready for more budget")}
                {b.scale.map(function(e, i) { return renderScaleCard(e, i); })}
              </div>}

              {b.paused.length > 0 && <div style={{ marginBottom: 8 }}>
                {sectionHeader(d.label + " Paused", b.paused.length, P.solar || "#fbbf24", "Operator turned these off — reactivate or extend if needed")}
                {b.paused.map(function(r) { return renderCampaignRow(r.c, true); })}
              </div>}
            </section>;
          })}

          {/* Inside the Crystal Ball — bottom-of-page best-practices
              training. Account-wide, not per-client. Pulled from the
              auto-refreshing playbook (/api/best-practices) so the
              guidance stays current month-on-month. Acts as the
              team's reference for what good looks like on each
              platform, regardless of which client they're working on. */}
          <section style={{ marginTop: 22, padding: "28px 30px", borderRadius: 16, background: "linear-gradient(135deg,#0a0418 0%,#100624 50%,#1a0a30 100%)", border: "1px solid " + (P.orchid || "#A855F7") + "44" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: "linear-gradient(135deg," + (P.orchid || "#A855F7") + "40," + (P.cyan || "#22D3EE") + "40)", border: "1px solid " + (P.orchid || "#A855F7") + "66", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: P.orchid || "#A855F7", fontSize: 22, fontWeight: 900, fontFamily: fm }}>✦</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: P.orchid || "#A855F7", fontFamily: fm, letterSpacing: 2, textTransform: "uppercase", lineHeight: 1.1 }}>Inside the Crystal Ball</div>
                <div style={{ fontSize: 11, color: P.caption, fontFamily: fm, marginTop: 4, letterSpacing: 1 }}>Training reference · what top-1% accounts do on each platform · auto-refreshed monthly{bp && bp.asOf ? " · last update " + bp.asOf : ""}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {[
                { key: "meta", title: "Meta (Facebook + Instagram)", color: "#1877F2", fallback: ["Advantage+ Audience over interest stacks — algorithm-led broad targeting outperforms manual lookalikes in 2026.", "Ship 3-5 fresh creatives per fortnight per ad set so frequency stays under 3 and the algorithm keeps a fresh winner to scale.", "Conversions API + Pixel both firing — first-party signal is non-negotiable for cost-cap and value optimisation."] },
                { key: "tiktok", title: "TikTok", color: "#00F2EA", fallback: ["Smart+ Campaigns — let TikTok's algorithm find the audience; manual targeting underperforms 25-40% on CPM.", "Spark Ads from creator content beat brand-polished video by 30-50% on CTR. Run 2-3 creators per fortnight as a standing pipeline.", "9:16 native, first 1.5 seconds is a face + hook + on-screen text. Anything that reads as a brand ad gets suppressed."] },
                { key: "google", title: "Google Ads", color: "#FBBC05", fallback: ["Performance Max (PMax) with rich asset groups + good audience signals — outperforms manual Search + Display split for most direct-response budgets.", "Enhanced Conversions on every PMax campaign — closes the privacy/IDFA attribution gap by 15-25%.", "Don't over-segment: PMax wants ≥30 conversions/30 days per asset group to optimise. Below that, consolidate."] }
              ].map(function(pl) {
                var rows = bp && bp[pl.key] && bp[pl.key].rules ? bp[pl.key].rules : pl.fallback;
                return <div key={pl.key} style={{ padding: "14px 16px", background: "rgba(0,0,0,0.35)", border: "1px solid " + pl.color + "55", borderLeft: "3px solid " + pl.color, borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: pl.color, fontFamily: fm, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>{pl.title}</div>
                  <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: P.txt, fontFamily: ff, lineHeight: 1.7 }}>
                    {rows.map(function(r, ri) { return <li key={ri} style={{ marginBottom: 4 }}>{r}</li>; })}
                  </ul>
                </div>;
              })}
            </div>
          </section>
        </React.Fragment>;
      })()}

      <div style={{ fontSize: 9.5, color: P.caption, fontFamily: fm, fontStyle: "italic", marginTop: 8, lineHeight: 1.6 }}>
        Internal operations view, scoped to your selected dates. The headline metric and cost match the campaign's own KPI (leads, page likes on Facebook, profile visits on Instagram, follows on TikTok, app store clicks, traffic clicks, or impressions for awareness). Pacing covers daily and lifetime budgets over days elapsed in the window; ABO budgets resolve at ad-set level via Graph. Not shown to clients.
      </div>

    </div>}
  </div>;
}
