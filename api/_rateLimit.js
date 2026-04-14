var store = {};
var lastCleanup = Date.now();
var CLEANUP_INTERVAL = 5 * 60 * 1000;

function cleanup() {
  var now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  var hourAgo = now - 3600000;
  Object.keys(store).forEach(function(ip) {
    store[ip] = store[ip].filter(function(t) { return t > hourAgo; });
    if (store[ip].length === 0) delete store[ip];
  });
}

function getIp(req) {
  var forwarded = req.headers["x-forwarded-for"] || "";
  return (forwarded.split(",")[0] || "").trim() || (req.socket && req.socket.remoteAddress) || "unknown";
}

export function rateLimit(req, res, opts) {
  cleanup();
  var maxPerMin = (opts && opts.maxPerMin) || 60;
  var maxPerHour = (opts && opts.maxPerHour) || 500;
  var ip = getIp(req);
  var now = Date.now();
  if (!store[ip]) store[ip] = [];
  store[ip].push(now);

  var minuteAgo = now - 60000;
  var hourAgo = now - 3600000;
  var inMinute = 0;
  var inHour = 0;
  for (var i = store[ip].length - 1; i >= 0; i--) {
    var t = store[ip][i];
    if (t < hourAgo) break;
    inHour++;
    if (t > minuteAgo) inMinute++;
  }

  if (inMinute > maxPerMin || inHour > maxPerHour) {
    res.status(429).json({ error: "Too many requests" });
    return false;
  }
  return true;
}
