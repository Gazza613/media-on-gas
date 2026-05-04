// Storage backends for the rate limiter. Split out from _rateLimit.js so
// the public surface stays tiny (one async rateLimit() call) while the
// Redis vs memory implementation details stay here.
//
// Why two backends:
//   - Redis (Upstash REST): globally consistent across function invocations,
//     survives cold starts. Used as the primary path.
//   - In-memory: fail-open fallback for when Redis is unreachable so the
//     team doesn't get locked out of the dashboard during an Upstash
//     incident. Catches single-instance bursts only.

function getCreds() {
  var url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  var token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token: token };
}

async function redisCmd(args, timeoutMs) {
  var creds = getCreds();
  if (!creds) throw new Error("redis-not-configured");
  var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var t = ctrl ? setTimeout(function(){ ctrl.abort(); }, timeoutMs || 1500) : null;
  try {
    var r = await fetch(creds.url, {
      method: "POST",
      headers: { "Authorization": "Bearer " + creds.token, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: ctrl ? ctrl.signal : undefined
    });
    if (!r.ok) throw new Error("redis-http-" + r.status);
    return r.json();
  } finally {
    if (t) clearTimeout(t);
  }
}

// Fixed-window counters, one per minute and one per hour. INCR returns the
// new count; on first INCR (count === 1) we set the expiry. Both windows
// have to be under their cap for the request to be allowed. Returns true
// when allowed, false when limited. Throws on Redis errors so the caller
// can fall back.
export async function rateLimitRedisIncr(ip, nowMs, maxPerMin, maxPerHour) {
  var minuteWindow = Math.floor(nowMs / 60000);
  var hourWindow = Math.floor(nowMs / 3600000);
  var minuteKey = "rl:m:" + ip + ":" + minuteWindow;
  var hourKey = "rl:h:" + ip + ":" + hourWindow;

  // Two pipelined INCR + EXPIRE pairs. Upstash supports the [["INCR",k],["EXPIRE",k,...]]
  // multi-command pipeline format via the bulk POST endpoint. Falling back to
  // sequential calls if the pipeline path isn't available.
  var mRes, hRes;
  try {
    mRes = await redisCmd(["INCR", minuteKey]);
    hRes = await redisCmd(["INCR", hourKey]);
    var mCount = parseInt((mRes && mRes.result) || 0, 10);
    var hCount = parseInt((hRes && hRes.result) || 0, 10);
    if (mCount === 1) { try { await redisCmd(["EXPIRE", minuteKey, "120"]); } catch (_) {} }
    if (hCount === 1) { try { await redisCmd(["EXPIRE", hourKey, "7200"]); } catch (_) {} }
    if (mCount > maxPerMin) return false;
    if (hCount > maxPerHour) return false;
    return true;
  } catch (err) {
    throw err;
  }
}

// In-memory fallback. Module-level array of timestamps per IP. Cheap,
// imperfect (lost on cold start), only used when Redis is unreachable.
var memStore = {};
var memLastCleanup = Date.now();
var MEM_CLEANUP_INTERVAL = 5 * 60 * 1000;

export function rateLimitMemoryFallback(ip, nowMs, maxPerMin, maxPerHour) {
  if (nowMs - memLastCleanup > MEM_CLEANUP_INTERVAL) {
    memLastCleanup = nowMs;
    var hourAgo = nowMs - 3600000;
    Object.keys(memStore).forEach(function(k){
      memStore[k] = memStore[k].filter(function(t){ return t > hourAgo; });
      if (memStore[k].length === 0) delete memStore[k];
    });
  }
  if (!memStore[ip]) memStore[ip] = [];
  memStore[ip].push(nowMs);
  var minuteAgo = nowMs - 60000;
  var hourAgo2 = nowMs - 3600000;
  var inMin = 0, inHour = 0;
  for (var i = memStore[ip].length - 1; i >= 0; i--) {
    var t = memStore[ip][i];
    if (t < hourAgo2) break;
    inHour++;
    if (t > minuteAgo) inMin++;
  }
  if (inMin > maxPerMin) return false;
  if (inHour > maxPerHour) return false;
  return true;
}
