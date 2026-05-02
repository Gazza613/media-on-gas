// List ad accounts available to the Create wizard.
// Server-side filtered against CREATE_TAB_ALLOWED_ACCOUNTS — the wizard never
// learns about accounts outside the allowlist, even though the underlying
// META_ACCESS_TOKEN may have access to many more.

import { rateLimit } from "../_rateLimit.js";
import { checkCreateAuth, getAllowedAccounts, META_API_VERSION } from "../_createAuth.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!checkCreateAuth(req, res)) return;
  if (!rateLimit(req, res, { maxPerMin: 30 })) return;

  var allowed = getAllowedAccounts();
  if (allowed.length === 0) {
    res.status(503).json({ error: "CREATE_TAB_ALLOWED_ACCOUNTS not set" });
    return;
  }
  var token = process.env.META_ACCESS_TOKEN;
  if (!token) { res.status(503).json({ error: "META_ACCESS_TOKEN not set" }); return; }

  // Hit Meta once and let it tell us the names + currency for each allowed
  // account. We use the user-context endpoint then filter, which is one
  // round-trip vs N. Allowlist is the source of truth — anything Meta
  // returns that isn't in it is dropped before responding.
  try {
    var url = "https://graph.facebook.com/" + META_API_VERSION +
              "/me/adaccounts?fields=name,account_id,account_status,currency,timezone_name&limit=200&access_token=" +
              encodeURIComponent(token);
    var r = await fetch(url);
    var data = await r.json();
    if (!data || !data.data) {
      res.status(502).json({ error: "Meta API returned no accounts", detail: data && data.error || null });
      return;
    }
    var byId = {};
    data.data.forEach(function(a){ byId[a.id] = a; });
    var out = allowed.map(function(id){
      var a = byId[id];
      if (!a) return { accountId: id, name: id, missing: true };
      return {
        accountId: a.id,
        name: a.name,
        accountStatus: a.account_status,
        currency: a.currency,
        timezone: a.timezone_name
      };
    }).filter(function(x){ return !x.missing; });
    res.status(200).json({ accounts: out });
  } catch (e) {
    console.error("[create/accounts] error:", e && e.message);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
}
