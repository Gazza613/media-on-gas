// Create-tab asset library endpoint. Lets the wizard list previously
// uploaded creatives for an account (so the team re-picks instead of
// re-uploading), and supports manual register / delete.
//
// Auth: same checkCreateAuth gate; account scoped by the existing
// isAccountAllowed allowlist.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, isAccountAllowed } from "../_createAuth.js";
import { listAssets, registerAsset, deleteAsset } from "./_assetLibrary.js";

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 60 }))) return;

  try {
    if (req.method === "GET") {
      var accountId = String(req.query.accountId || "").trim();
      if (!accountId || !isAccountAllowed(accountId)) { res.status(403).json({ error: "Account not in allowlist" }); return; }
      var clientCode = String(req.query.clientCode || "").trim().toLowerCase();
      var all = await listAssets(accountId);
      var items = clientCode
        ? all.filter(function(a){ return a && String(a.clientCode || "").toLowerCase() === clientCode; })
        : all;
      res.status(200).json({ assets: items });
      return;
    }

    if (req.method === "POST") {
      var body = req.body;
      if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
      body = body || {};
      var acc = String(body.accountId || "").trim();
      if (!acc || !isAccountAllowed(acc)) { res.status(403).json({ error: "Account not in allowlist" }); return; }
      var rec = await registerAsset(acc, body.asset || {});
      if (!rec) { res.status(400).json({ error: "asset needs an imageHash or videoId" }); return; }
      res.status(200).json({ ok: true, asset: rec });
      return;
    }

    if (req.method === "DELETE") {
      var dAcc = String(req.query.accountId || "").trim();
      if (!dAcc || !isAccountAllowed(dAcc)) { res.status(403).json({ error: "Account not in allowlist" }); return; }
      var id = String(req.query.id || "").trim();
      if (!id) { res.status(400).json({ error: "id required" }); return; }
      var remaining = await deleteAsset(dAcc, id);
      res.status(200).json({ ok: true, assets: remaining });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("assets endpoint error", err);
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
