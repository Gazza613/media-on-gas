// Client identity helpers. A "client" is identified by the recipient email
// domain so that a staff change on the client side (Bob leaves, Sarah joins)
// does not create a new client record, same company domain = same client.
//
// Free-mail domains (gmail, outlook, yahoo, etc.) can't uniquely identify a
// client because multiple of our clients might use them. For those we fall
// back to the slug the team typed in the share modal, so the identity
// becomes e.g. "mtnmomo (via gmail.com)".

var FREE_MAIL_DOMAINS = {
  "gmail.com": true, "googlemail.com": true,
  "outlook.com": true, "hotmail.com": true, "live.com": true, "msn.com": true,
  "yahoo.com": true, "yahoo.co.za": true, "ymail.com": true, "rocketmail.com": true,
  "icloud.com": true, "me.com": true, "mac.com": true,
  "aol.com": true,
  "proton.me": true, "protonmail.com": true, "pm.me": true,
  "mail.com": true, "gmx.com": true, "gmx.net": true,
  "webmail.co.za": true, "mweb.co.za": true, "vodamail.co.za": true,
  "telkomsa.net": true, "absamail.co.za": true
};

// Domains like `co.za`, `co.uk` where the "real" registered domain is one
// label above. We strip leading subdomains down to label-count + 1 for these.
var COMPOUND_TLD_SUFFIXES = [
  "co.za", "org.za", "net.za", "ac.za", "gov.za", "web.za",
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "net.nz", "org.nz"
];

// Given "bob@za.mtnmomo.com" -> "mtnmomo.com"
// Given "sarah@concord.co.za" -> "concord.co.za"
// Given "gary@gasmarketing.co.za" -> "gasmarketing.co.za"
export function registeredDomain(email) {
  var at = String(email || "").lastIndexOf("@");
  if (at < 0) return "";
  var host = String(email || "").slice(at + 1).toLowerCase().trim();
  if (!host) return "";
  var parts = host.split(".").filter(function(p) { return !!p; });
  if (parts.length <= 2) return parts.join(".");
  // Check compound TLD: is the last two-label tail one of our known compound TLDs?
  var lastTwo = parts.slice(-2).join(".");
  if (COMPOUND_TLD_SUFFIXES.indexOf(lastTwo) >= 0) {
    // Keep last 3 labels: <name>.<compound-tld>
    return parts.slice(-3).join(".");
  }
  // Regular TLD, keep last 2
  return parts.slice(-2).join(".");
}

export function isFreeMailDomain(domain) {
  return !!FREE_MAIL_DOMAINS[String(domain || "").toLowerCase()];
}

// Canonical client slug. Collapses the period / cycle / casing variants
// the team types into the share modal so the SAME real client always
// maps to the SAME key:
//
//   "MTN MoMo"                -> "mtnmomo"
//   "MTN MOMO APRIL 2026"     -> "mtnmomo"   (month + year stripped)
//   "MTNMoMo"                 -> "mtnmomo"
//   "Willowbrook Village Cycle2" -> "willowbrookvillage" (cycle tag stripped)
//   "MTN MoMo POS - May 2026" -> "mtnmomopos"
//
// Strips, in order: month names (full + 3-letter), 4-digit years
// 2020-2099, and recurring-period tags (cycle/phase/wave/round/flight
// + optional number). Then removes every non-alphanumeric char and
// lowercases. Pure function, safe to call anywhere.
var MONTH_RE = /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/g;
var YEAR_RE = /\b20\d{2}\b/g;
var PERIOD_TAG_RE = /\b(cycle|phase|wave|round|flight|q[1-4])\s*-?\s*\d*\b/g;
export function canonicalClientSlug(raw) {
  var s = String(raw || "").toLowerCase();
  s = s.replace(MONTH_RE, " ");
  s = s.replace(YEAR_RE, " ");
  s = s.replace(PERIOD_TAG_RE, " ");
  s = s.replace(/[^a-z0-9]+/g, "");
  return s;
}

// Produces the identity we group by. For corporate domains it is just the
// registered domain. For free-mail addresses we pair the domain with a
// slug hint so two unrelated clients using gmail don't merge.
export function clientIdentity(email, slugHint) {
  var dom = registeredDomain(email);
  if (!dom) return null;
  if (isFreeMailDomain(dom)) {
    var s = canonicalClientSlug(slugHint);
    return s ? (s + "@" + dom) : ("unknown@" + dom);
  }
  return dom;
}

// Best display name for a client: prefer whatever slug the team last typed
// for this identity (from the audit log), fall back to a capitalised
// version of the registered domain's first label.
export function displayNameFromIdentity(identity, slugHint) {
  var s = String(slugHint || "").trim();
  if (s) return s;
  var id = String(identity || "");
  // Strip any "slug@" prefix from free-mail identities.
  if (id.indexOf("@") >= 0) id = id.split("@")[1] || id;
  var first = id.split(".")[0] || "";
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Client";
}
