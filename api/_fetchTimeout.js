// fetch() wrappers with timeout + a "graceful failure" variant.
//
// Why these exist:
// - Vercel Functions now ceiling at 300s. Without per-call timeouts a
//   single hung Meta / Google / TikTok call can stall the whole response
//   for minutes, leaving the dashboard spinning forever from the team's
//   point of view.
// - AbortController is built into Node 18+. We just bolt a timer onto it.
//
// Two helpers:
//   fetchWithTimeout(url, opts, ms)
//     Same as fetch() but throws on timeout. Use when the caller already
//     has a try/catch that handles failure.
//
//   safeFetch(url, opts, ms)
//     Returns { ok, status, data, error }. Never throws. Use when the
//     caller wants to fall through with empty / partial data on failure.
//
// Default timeout: 8 seconds. Most platform calls land in 200-2000 ms; 8s
// gives reasonable headroom for slow days without holding the function
// hostage indefinitely.

export var DEFAULT_FETCH_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(url, opts, timeoutMs) {
  var ms = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var t = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms) : null;
  try {
    var merged = Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {});
    return await fetch(url, merged);
  } finally {
    if (t) clearTimeout(t);
  }
}

// Returns a result envelope so callers can check .ok without try/catch.
// Always parses JSON when status is 200-299; on non-2xx the data field
// holds whatever the server sent (helpful for error envelopes from Meta /
// Google), and .error is a short reason string for logging.
export async function safeFetch(url, opts, timeoutMs) {
  var ms = typeof timeoutMs === "number" ? timeoutMs : DEFAULT_FETCH_TIMEOUT_MS;
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var t = ctrl ? setTimeout(function(){ ctrl.abort(); }, ms) : null;
  try {
    var merged = Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {});
    var r = await fetch(url, merged);
    var data = null;
    try { data = await r.json(); } catch (_) {}
    return { ok: r.ok, status: r.status, data: data, error: r.ok ? null : "http-" + r.status };
  } catch (err) {
    var name = err && err.name || "";
    var msg = err && err.message || String(err || "unknown");
    return { ok: false, status: 0, data: null, error: name === "AbortError" ? "timeout-" + ms + "ms" : "fetch-error: " + msg };
  } finally {
    if (t) clearTimeout(t);
  }
}
