// Superadmin-visible Sami MCP connection diagnostic.
//
// Same probe the ?diag=1 path on /api/nlp/mcp-proxy runs (env-var
// presence + live initialize call to Markifact), but session-
// authenticated so the superadmin can trigger it from the Team Access
// UI without needing to copy the SAMI_MCP_PROXY_TOKEN into a terminal.
//
// Response shape mirrors the ?diag=1 endpoint so the frontend can
// render it identically.

import { rateLimit } from "./_rateLimit.js";
import { getSession } from "./auth.js";
import { isSuperadminEmail } from "./_users.js";

function envStr(k) {
  var v = process.env[k];
  return v == null ? "" : String(v).replace(/[\r\n\t]+/g, "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  if (!(await rateLimit(req, res, { maxPerMin: 15, maxPerHour: 60 }))) return;

  var token = req.headers["x-session-token"] || "";
  var session = await getSession(token);
  if (!session) { res.status(401).json({ error: "Sign in required" }); return; }
  if (!isSuperadminEmail(session.email)) { res.status(403).json({ error: "Superadmin only" }); return; }

  var proxyToken = envStr("SAMI_MCP_PROXY_TOKEN");
  var mcpToken = envStr("MARKIFACT_MCP_TOKEN");
  var mcpUrl = envStr("MARKIFACT_MCP_URL") || "https://api.markifact.com/mcp";

  var live = { attempted: false, status: null, ok: null, contentType: null, bodyPreview: null, error: null };
  if (mcpToken) {
    try {
      var probe = await fetch(mcpUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "accept": "application/json, text/event-stream",
          "authorization": "Bearer " + mcpToken
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "gas-diag", version: "1.0" } } })
      });
      live.attempted = true;
      live.status = probe.status;
      live.ok = probe.ok;
      live.contentType = probe.headers.get("content-type") || null;
      var probeText = await probe.text();
      live.bodyPreview = probeText.slice(0, 500);
    } catch (err) {
      live.error = String(err && err.message || err).slice(0, 300);
    }
  }

  // Verdict logic: what should the admin do next?
  var verdict;
  if (!proxyToken) verdict = { level: "critical", msg: "SAMI_MCP_PROXY_TOKEN is missing. Set it in Vercel." };
  else if (!mcpToken) verdict = { level: "critical", msg: "MARKIFACT_MCP_TOKEN is missing. Set it in Vercel." };
  else if (!live.attempted) verdict = { level: "critical", msg: "Could not attempt the upstream probe." };
  else if (live.error) verdict = { level: "critical", msg: "Cannot reach Markifact at " + mcpUrl + " — " + live.error + ". Check MARKIFACT_MCP_URL." };
  else if (live.status === 401 || live.status === 403) verdict = { level: "critical", msg: "Markifact rejected our bearer with " + live.status + ". MARKIFACT_MCP_TOKEN is wrong or expired — copy a fresh one from Markifact and update the Vercel env var." };
  else if (live.status === 404) verdict = { level: "critical", msg: "Markifact returned 404 at " + mcpUrl + ". MARKIFACT_MCP_URL is wrong. Check Markifact's docs for the current endpoint." };
  else if (live.status && live.status >= 400) verdict = { level: "warning", msg: "Markifact returned " + live.status + ". Body preview above may explain." };
  else if (live.ok) verdict = { level: "ok", msg: "Markifact responded with " + live.status + " " + (live.contentType || "unknown content-type") + ". Connection is healthy — if Sami still errors, the issue is between Anthropic and the proxy (likely SAMI_MCP_PROXY_TOKEN mismatch between sami-hub and mcp-proxy env vars)." };
  else verdict = { level: "warning", msg: "Unexpected response from Markifact." };

  res.status(200).json({
    diag: true,
    time: new Date().toISOString(),
    envPresent: {
      SAMI_MCP_PROXY_TOKEN: !!proxyToken,
      MARKIFACT_MCP_TOKEN: !!mcpToken,
      MARKIFACT_MCP_URL: !!envStr("MARKIFACT_MCP_URL")
    },
    upstreamUrl: mcpUrl,
    liveInitializeProbe: live,
    verdict: verdict
  });
}
