// Created-campaigns read endpoint. Powers the "what was created" table
// on Create-tab Step 1. Same checkCreateAuth gate as drafts/templates.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth } from "../_createAuth.js";
import { listCreated, deleteCreated } from "./_createdLog.js";

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!(await rateLimit(req, res, { maxPerMin: 60 }))) return;

  try {
    if (req.method === "GET") {
      res.status(200).json({ created: await listCreated() });
      return;
    }
    if (req.method === "DELETE") {
      var id = String(req.query.id || "").trim();
      if (!id) { res.status(400).json({ error: "id required" }); return; }
      var remaining = await deleteCreated(id);
      res.status(200).json({ ok: true, created: remaining.map(function (e) { return { id: e.id, campaignName: e.campaignName }; }) });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("created endpoint error", err);
    res.status(500).json({ error: String(err && err.message || err) });
  }
}
