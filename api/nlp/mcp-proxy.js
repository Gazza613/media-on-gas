// GAS approval-gated MCP proxy (audit fix #1 + #2).
//
// Anthropic's remote MCP integration connects directly from Anthropic's
// servers to the MCP endpoint configured in `mcp_servers[].url`. That
// means our Vercel function normally never sees the tool invocations
// Sami makes. To interpose a server-side approval gate + idempotency
// layer we point Anthropic at THIS endpoint instead of Markifact
// directly. This proxy speaks the same MCP JSON-RPC over HTTP transport
// and forwards to Markifact, refusing any run_write_operation whose
// (operation_id, input_data) hash does not match a human-authorised
// nonce (see _samiNonce.js for the store).
//
// Rollout is opt-in: sami-hub.js checks for SAMI_MCP_PROXY_URL and
// SAMI_MCP_PROXY_TOKEN and, when both are present, routes through this
// endpoint. When they are not set, Sami keeps talking to Markifact
// direct (the pre-audit behaviour). So deploying this file does
// nothing until the env vars are added in Vercel.
//
// Environment:
//   SAMI_MCP_PROXY_TOKEN  A random shared secret. Anthropic sends this
//                         as its Bearer to us; we verify it inbound.
//                         Also configured as authorization_token in
//                         sami-hub.js's mcp_servers config.
//   MARKIFACT_MCP_TOKEN   The real upstream credential. We authenticate
//                         to Markifact with this on every outbound call.
//   MARKIFACT_MCP_URL     Optional override for the upstream endpoint.

import crypto from "crypto";
import { verifyNonceForCall, consumeNonce } from "../_samiNonce.js";
import { validateWriteInput } from "../_samiWriteGuard.js";

export const config = { maxDuration: 240 };

function timingSafeStrEqual(a, b) {
  var aBuf = Buffer.from(String(a || ""), "utf8");
  var bBuf = Buffer.from(String(b || ""), "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyProxyAuth(req) {
  var expected = process.env.SAMI_MCP_PROXY_TOKEN;
  if (!expected) return false;
  var authHeader = req.headers.authorization || req.headers.Authorization || "";
  if (authHeader.indexOf("Bearer ") !== 0) return false;
  return timingSafeStrEqual(authHeader.substring(7), expected);
}

// Build the MCP-shape error payload Sami will see in her tool result
// stream. isError:true + text content is the standard tool-error shape,
// so Sami will read it and relay to the user in her next turn.
function mcpToolError(id, message) {
  return {
    jsonrpc: "2.0",
    id: id == null ? null : id,
    result: {
      content: [{ type: "text", text: "Refused by GAS approval gate: " + message }],
      isError: true
    }
  };
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method === "GET") {
    // Health probe / streamable-HTTP GET for sessions. We don't hold
    // session state ourselves; if Anthropic issues a GET, we forward
    // it so Markifact can decide.
  } else if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!verifyProxyAuth(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  var mcpToken = process.env.MARKIFACT_MCP_TOKEN;
  var mcpUrl = process.env.MARKIFACT_MCP_URL || "https://api.markifact.com/mcp";
  if (!mcpToken) {
    res.status(503).json({ error: "Upstream data engine not configured" });
    return;
  }

  var body = null;
  if (req.method === "POST") {
    body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) { body = null; }
    }
    if (!body || typeof body !== "object") {
      res.status(400).json({ error: "Invalid JSON-RPC body" });
      return;
    }
  }

  var isToolsCall = body && body.method === "tools/call";
  var toolName = isToolsCall && body.params ? String(body.params.name || "") : "";
  var isWrite = toolName === "run_write_operation";

  // Enforce approval nonce + write guard on writes. Reads (tools/list,
  // resources/*, run_operation, upload_media, initialize, etc.) pass
  // through unchanged. run_operation on Markifact is limited to
  // requires_approval:false operations by design, so no gate needed.
  if (isWrite) {
    var args = (body.params && body.params.arguments) || {};

    // Audit fix #3: server-side budget / status / name validation.
    // Runs first so a bad payload gets the most human-readable error
    // message rather than a generic "nonce missing" if both fail.
    var guard = validateWriteInput(args.operation_id, args.input_data);
    if (!guard.ok) {
      console.warn("[mcp-proxy] refused write op (guard)", args.operation_id, "-", guard.reason);
      res.status(200).json(mcpToolError(body.id, guard.reason));
      return;
    }
    if (guard.warnings && guard.warnings.length) {
      console.log("[mcp-proxy] write guard warnings", args.operation_id, guard.warnings);
    }

    // Audit fix #1: server-issued approval nonce lookup.
    var check = await verifyNonceForCall(args.operation_id, args.input_data);
    if (!check.ok) {
      console.warn("[mcp-proxy] refused write op (nonce)", args.operation_id, "-", check.reason);
      res.status(200).json(mcpToolError(body.id, check.reason));
      return;
    }
    if (check.cached) {
      // Audit fix #2: retry hit the cache. Return the exact original
      // response verbatim so Anthropic/Sami treats it as if the call
      // just succeeded again. Meta / TikTok / Google were only
      // touched once (the first call).
      console.log("[mcp-proxy] idempotent replay for", args.operation_id, "card", check.cardId);
      res.status(200).json(check.cached);
      return;
    }
  }

  // Forward to Markifact. For writes we force Accept: application/json
  // so we get a single buffered response we can inspect + cache. For
  // all other methods we pass through the client's Accept so Anthropic
  // can use SSE if it wants to.
  var forwardHeaders = {
    "content-type": "application/json",
    "authorization": "Bearer " + mcpToken,
    "accept": isWrite ? "application/json" : (req.headers.accept || "application/json, text/event-stream")
  };
  var sess = req.headers["mcp-session-id"];
  if (sess) forwardHeaders["mcp-session-id"] = sess;
  var proto = req.headers["mcp-protocol-version"];
  if (proto) forwardHeaders["mcp-protocol-version"] = proto;

  var upstream;
  try {
    upstream = await fetch(mcpUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.method === "POST" ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    console.error("[mcp-proxy] upstream fetch failed", err);
    res.status(502).json({ error: "Upstream data engine unreachable" });
    return;
  }

  var upstreamCT = upstream.headers.get("content-type") || "";
  var upstreamSession = upstream.headers.get("mcp-session-id");
  if (upstreamSession) res.setHeader("mcp-session-id", upstreamSession);

  // JSON response: buffer, cache for idempotency on successful writes,
  // then forward.
  if (upstreamCT.indexOf("application/json") >= 0 || isWrite) {
    var text = await upstream.text();
    if (isWrite && upstream.status >= 200 && upstream.status < 300) {
      try {
        var parsedResp = JSON.parse(text);
        var writeArgs = (body.params && body.params.arguments) || {};
        // Only cache when the JSON-RPC response itself is a success
        // (no top-level error, no isError:true on the tool result).
        var toolIsError = parsedResp
          && parsedResp.result
          && parsedResp.result.isError === true;
        if (!parsedResp.error && !toolIsError) {
          await consumeNonce(writeArgs.operation_id, writeArgs.input_data, parsedResp);
        }
      } catch (err) {
        console.warn("[mcp-proxy] response not JSON, skipping idempotency cache", err && err.message);
      }
    }
    res.setHeader("content-type", upstreamCT || "application/json");
    res.status(upstream.status).send(text);
    return;
  }

  // SSE / other streaming: pipe through without buffering. No
  // idempotency caching in this path (writes are forced to JSON above,
  // so this branch is only reads/streams).
  res.setHeader("content-type", upstreamCT);
  res.status(upstream.status);
  var reader = upstream.body && upstream.body.getReader ? upstream.body.getReader() : null;
  if (!reader) { res.end(); return; }
  try {
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      res.write(Buffer.from(chunk.value));
    }
  } catch (err) {
    console.error("[mcp-proxy] stream pipe error", err);
  } finally {
    res.end();
  }
}
