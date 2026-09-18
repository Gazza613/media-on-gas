// Server-side proxy for the GAS data engine's list-connections operation.
// The Sami Hub left rail calls this on mount to show a live status list
// of the connected ad platforms (Meta, TikTok, Google Ads, GA4, Drive,
// Dropbox, LinkedIn, etc). Keeps MARKIFACT_MCP_TOKEN off the browser.
//
// Response shape:
//   { connectors: [
//       { name: "Meta Ads", key: "meta_ads", status: "connected", accountLabel: "..." },
//       ...
//     ]
//   }
//
// White-label: labels get scrubbed of vendor names before send.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";

export const config = { maxDuration: 30 };

var ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
var MODEL = "claude-sonnet-5"; // Sonnet is plenty for a one-shot tool call
var SERVER_NAME = "gas-data-engine";

function scrub(text) {
  return String(text || "").replace(/markifact/gi, "GAS engine");
}

// Cheapest way to get the connections list is to have the model call
// list_connections once and return the result. We can extract structured
// data from the tool_use response block Anthropic returns.
async function callAnthropic(apiKey, mcpUrl, mcpToken) {
  var payload = {
    model: MODEL,
    max_tokens: 800,
    system: "You are a data-fetching agent. Call list_connections once and return the raw list. Do not narrate. Do not add any commentary. Just call the tool.",
    messages: [{ role: "user", content: "List all connected platforms." }],
    mcp_servers: [
      { type: "url", url: mcpUrl, name: SERVER_NAME, authorization_token: mcpToken }
    ],
    tools: [{ type: "mcp_toolset", mcp_server_name: SERVER_NAME }]
  };
  var resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "mcp-client-2025-11-20"
    },
    body: JSON.stringify(payload)
  });
  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: resp.status, data: data, rawText: text };
}

// Extract tool_use / mcp_tool_result blocks to find the connectors list.
// Anthropic returns tool inputs + outputs in the content array; the
// mcp_tool_result block carries what Markifact returned.
function parseConnectors(anthropicData) {
  if (!anthropicData || !Array.isArray(anthropicData.content)) return [];
  var out = [];
  for (var i = 0; i < anthropicData.content.length; i++) {
    var b = anthropicData.content[i];
    if (!b) continue;
    // Different Anthropic shapes for MCP tool results
    if (b.type === "mcp_tool_result" && b.content) {
      var payload = b.content;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch (_) { /* leave as string */ }
      }
      if (Array.isArray(payload)) {
        payload.forEach(function (item) {
          if (item && item.type === "text" && item.text) {
            try {
              var parsed = JSON.parse(item.text);
              if (Array.isArray(parsed)) out = out.concat(parsed);
              else if (parsed && Array.isArray(parsed.connections)) out = out.concat(parsed.connections);
              else if (parsed && Array.isArray(parsed.connectors)) out = out.concat(parsed.connectors);
            } catch (_) { /* skip */ }
          }
        });
      }
    }
  }
  // Normalise each entry to a stable shape the UI can render without
  // caring about upstream field names.
  return out.map(function (c) {
    return {
      name: scrub(c.name || c.label || c.platform || c.connector_name || "Unknown"),
      key: c.key || c.id || c.slug || "",
      status: c.status || (c.connected ? "connected" : "unknown"),
      accountLabel: scrub(c.account_label || c.account_name || c.workspace || "")
    };
  }).filter(function (c) { return c.name && c.name !== "Unknown"; });
}

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (req.method !== "GET" && req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
  if (!(await rateLimit(req, res, { maxPerMin: 30, maxPerHour: 200 }))) return;

  var apiKey = process.env.ANTHROPIC_API_KEY;
  var mcpToken = process.env.MARKIFACT_MCP_TOKEN;
  var mcpUrl = process.env.MARKIFACT_MCP_URL || "https://api.markifact.com/mcp";
  if (!apiKey || !mcpToken) {
    // Return an empty list rather than 503 — the left rail should
    // still render (just without live status) if creds are missing.
    res.status(200).json({ connectors: [], reason: "credentials_pending" });
    return;
  }

  try {
    var result = await callAnthropic(apiKey, mcpUrl, mcpToken);
    if (result.status !== 200 || !result.data) {
      console.error("connectors upstream error", result.status, result.rawText && result.rawText.slice(0, 400));
      res.status(200).json({ connectors: [], reason: "upstream_error" });
      return;
    }
    var connectors = parseConnectors(result.data);
    res.status(200).json({ connectors: connectors });
  } catch (err) {
    console.error("connectors failed", err);
    res.status(200).json({ connectors: [], reason: "exception" });
  }
}
