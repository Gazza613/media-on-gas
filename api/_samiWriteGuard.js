// Sami Hub server-side write guard (audit fix #3).
//
// Interposed on run_write_operation calls at the MCP proxy, this file
// runs the same "R5k/day, R50k lifetime, always PAUSED on create"
// safety rails the system prompt describes, but does it server-side so
// a hallucinated payload or a poisoned client-memory note cannot slip a
// runaway budget past the approval gate. If a rule is broken, the write
// is refused before it ever reaches Markifact.
//
// Deliberately conservative: only block on clear violations, warn on
// ambiguous cases. False negatives (letting a bad write through) hurt
// the client, but false positives (blocking a legit write) hurt the
// team's trust in the tool. Ranges chosen to have no false positives
// on typical Meta payloads (which use cents in ZAR).
//
// Coverage: Meta cent-based budgets (the highest volume + risk).
// Google Ads uses micros in a nested campaign_budget object; that
// path is currently only warned on, not blocked. Add a micros-aware
// branch here as we see real payloads. LinkedIn dailyBudget /
// totalBudget already caught by the alias list.

var MAX_DAILY_BUDGET_CENTS = 500000;      // R5,000 per ad set per day
var MAX_LIFETIME_BUDGET_CENTS = 5000000;  // R50,000 lifetime

var DAILY_BUDGET_KEYS = ["daily_budget", "dailybudget", "daily_spend_cap", "daily_spend"];
var LIFETIME_BUDGET_KEYS = ["lifetime_budget", "lifetimebudget", "total_budget", "totalbudget"];
var STATUS_KEYS = ["status", "state", "campaign_status", "adset_status", "ad_status"];

// Walk the input_data tree and collect every field whose key (case-
// insensitive) is in the alias list. Depth-first with a hard iteration
// cap so a pathologically nested payload can't stall the request.
function findFields(root, keys) {
  var found = [];
  if (!root || typeof root !== "object") return found;
  var lower = keys.map(function (k) { return String(k).toLowerCase(); });
  var stack = [{ node: root, path: "" }];
  var iters = 0;
  while (stack.length && iters < 1000) {
    iters++;
    var frame = stack.pop();
    var node = frame.node;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var child = node[i];
        if (child && typeof child === "object") {
          stack.push({ node: child, path: frame.path + "[" + i + "]" });
        }
      }
      continue;
    }
    var ks = Object.keys(node);
    for (var j = 0; j < ks.length; j++) {
      var k = ks[j];
      var v = node[k];
      var p = frame.path ? frame.path + "." + k : k;
      if (lower.indexOf(String(k).toLowerCase()) >= 0) {
        found.push({ path: p, value: v, key: k });
      }
      if (v && typeof v === "object") {
        stack.push({ node: v, path: p });
      }
    }
  }
  return found;
}

function toNumber(v) {
  if (v == null) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v.trim())) {
    return parseFloat(v);
  }
  return null;
}

function formatRand(cents) {
  return "R" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Main entry point. Returns { ok: boolean, reason?: string, warnings: string[] }.
// Reasons are user-visible (relayed by Sami as tool errors), so keep
// them concise and actionable.
export function validateWriteInput(opId, inputData) {
  var warnings = [];
  var reasons = [];
  if (!inputData || typeof inputData !== "object") {
    return { ok: true, warnings: warnings };
  }

  var opStr = String(opId || "").toLowerCase();
  var isCreate = opStr.indexOf("create") >= 0 || opStr.indexOf("new_") >= 0;

  // 1. Daily budget cap (R5,000).
  var dailyMatches = findFields(inputData, DAILY_BUDGET_KEYS);
  dailyMatches.forEach(function (m) {
    var val = toNumber(m.value);
    if (val === null) return;
    if (val > MAX_DAILY_BUDGET_CENTS && val < 100000000) {
      reasons.push(
        "Daily budget " + m.path + " is " + val + " cents (" + formatRand(val) +
        "), which exceeds the R5,000/day per ad set cap. The user must explicitly override the cap in-conversation before you retry."
      );
    } else if (val >= 100000000) {
      // Value looks like micros (Google Ads scale). R5,000/day in
      // micros = 5,000,000,000. Cap the equivalent.
      if (val > 5000000000) {
        reasons.push(
          "Daily budget " + m.path + " is " + val + " micros (" + formatRand(val / 10000) +
          "), which exceeds the R5,000/day cap."
        );
      } else {
        warnings.push("Daily budget " + m.path + " interpreted as micros = " + formatRand(val / 10000) + "/day");
      }
    }
  });

  // 2. Lifetime budget cap (R50,000).
  var lifeMatches = findFields(inputData, LIFETIME_BUDGET_KEYS);
  lifeMatches.forEach(function (m) {
    var val = toNumber(m.value);
    if (val === null) return;
    if (val > MAX_LIFETIME_BUDGET_CENTS && val < 1000000000) {
      reasons.push(
        "Lifetime budget " + m.path + " is " + val + " cents (" + formatRand(val) +
        "), which exceeds the R50,000 lifetime cap. High-spend campaigns need explicit sign-off in-conversation with the exact amount before you retry."
      );
    } else if (val >= 1000000000) {
      if (val > 50000000000) {
        reasons.push(
          "Lifetime budget " + m.path + " is " + val + " micros (" + formatRand(val / 10000) +
          "), which exceeds the R50,000 lifetime cap."
        );
      } else {
        warnings.push("Lifetime budget " + m.path + " interpreted as micros = " + formatRand(val / 10000));
      }
    }
  });

  // 3. Everything Sami creates must be PAUSED. Reject the obvious
  // launch-live states on create ops. Update / pause / status-change
  // ops legitimately set ACTIVE, so we don't block those.
  if (isCreate) {
    var statusMatches = findFields(inputData, STATUS_KEYS);
    statusMatches.forEach(function (m) {
      var sv = String(m.value == null ? "" : m.value).toUpperCase().trim();
      if (!sv) return;
      if (sv === "ACTIVE" || sv === "ENABLED" || sv === "RUNNING") {
        reasons.push(
          "Cannot create with " + m.path + "=" + sv + ". Every new campaign, ad set and ad must be created PAUSED. Emit a fresh card with status=PAUSED."
        );
      }
    });
  }

  // 4. Name-field sanity.
  var nameField = null;
  if (typeof inputData.name === "string") nameField = inputData.name;
  else if (inputData.name && typeof inputData.name === "object" && typeof inputData.name.value === "string") {
    nameField = inputData.name.value;
  }
  if (typeof nameField === "string") {
    var n = nameField.trim();
    if (n.length === 0) {
      reasons.push("Name is empty. Every campaign, ad set and ad needs a descriptive name.");
    } else if (n.length > 400) {
      reasons.push("Name is " + n.length + " characters, exceeding the 400-char cap. Trim it.");
    } else if (/<script|<iframe|javascript:/i.test(n)) {
      reasons.push("Name contains script or iframe tags. Use plain-text names only.");
    } else if (isCreate && opStr.indexOf("campaign") >= 0 && n.indexOf(" ") >= 0 && n.indexOf("_") < 0) {
      warnings.push(
        "Campaign name '" + n + "' uses spaces and no underscores. GAS convention is Client_Objective_Funding_YYYYMM_Variant."
      );
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reason: reasons.join(" | "), warnings: warnings };
  }
  return { ok: true, warnings: warnings };
}
