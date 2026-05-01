import { rateLimit } from "./_rateLimit.js";
import { checkAuth } from "./_auth.js";
import { issueToken } from "./_jwt.js";

// Admin-only endpoint: takes the current campaign selection + date range + a client slug
// and returns a signed share URL. The token carries the campaign allowlist and date range
// so the downstream data endpoints can enforce scope server-side.

export default async function handler(req, res) {
  if (!rateLimit(req, res, { maxPerMin: 20, maxPerHour: 200 })) return;
  if (!(await checkAuth(req, res))) return;
  // Only admins can issue client tokens
  if (!req.authPrincipal || req.authPrincipal.role !== "admin") {
    res.status(403).json({ error: "Admin-only" });
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var body = req.body || {};
  // Preserve spaces + case so the slug survives round-trips to the email
  // header / share modal. Strip anything outside letters, digits, hyphens,
  // spaces, collapse runs of whitespace.
  var clientSlug = (body.clientSlug || "").toString().replace(/[^a-zA-Z0-9\- ]/g, "").replace(/\s+/g, " ").trim();
  var campaignIds = Array.isArray(body.campaignIds) ? body.campaignIds.map(String) : [];
  var campaignNames = Array.isArray(body.campaignNames) ? body.campaignNames.map(String) : [];
  var from = body.from || "";
  var to = body.to || "";
  var expiresInDays = parseInt(body.expiresInDays || 30, 10);
  if (!expiresInDays || expiresInDays < 1) expiresInDays = 30;
  if (expiresInDays > 365) expiresInDays = 365;

  if (!clientSlug) { res.status(400).json({ error: "clientSlug required" }); return; }
  if (campaignIds.length === 0 && campaignNames.length === 0) {
    res.status(400).json({ error: "At least one campaignId or campaignName required" });
    return;
  }
  if (!from || !to) { res.status(400).json({ error: "from and to dates required" }); return; }

  try {
    var token = issueToken({
      sub: clientSlug,
      camps: campaignIds,
      names: campaignNames,
      from: from,
      to: to
    }, expiresInDays * 24 * 60 * 60);
    var origin = (req.headers.origin || req.headers.Origin || "https://media-on-gas.vercel.app").replace(/\/$/, "");
    var shareUrl = origin + "/view/?token=" + encodeURIComponent(token);
    var expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    res.status(200).json({ token: token, shareUrl: shareUrl, expiresAt: expiresAt, clientSlug: clientSlug });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
