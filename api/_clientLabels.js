// Client display-name map for the daily report grouping.
//
// Campaigns are bucketed by the first underscore-segment of the campaign
// name (the "Client" token in the {Client}_{Obj}_{Funding}_{YYYYMM}_{Variant}
// convention). That token is camel/PascalCase like "MTNMoMoPOS" so we
// translate it to a presentable label here.
//
// Adding a new client: append the camelCase prefix as the key, and the
// display label as the value. Anything not in the map renders the raw key
// with a "needs label" footer warning so we notice immediately.

export var clientLabels = {
  // Hyphenated variants — match the actual Meta campaign naming, e.g.
  // "MTN-MoMo_META_Like&Follow_..." where the first underscore-segment
  // carries an internal hyphen.
  "MTN-MoMo": "MTN MoMo",
  "MTN-MoMoPOS": "MTN MoMo POS",
  "MTN-MoMo-POS": "MTN MoMo POS",
  "MTN-Khava": "MTN Khava",
  // PascalCase variants for compatibility with anything that drops the
  // hyphen during creation.
  MTNMoMo: "MTN MoMo",
  MTNMoMoPOS: "MTN MoMo POS",
  MTNKhava: "MTN Khava",
  Willowbrook: "Willowbrook",
  ConcordCollege: "Concord College",
  EdenCollege: "Eden College",
  PsychoBunny: "Psycho Bunny ZA",
  PsychoBunnyZA: "Psycho Bunny ZA",
  GAS: "GAS Agency",
  GASAgency: "GAS Agency"
};

// Best-effort fallback. For an unmapped key, split camelCase into words
// (MTNMoMoPOS -> "MTN Mo Mo POS") so the email is still readable while
// flagging the missing entry. Acronym-runs (≥2 caps) stay clumped.
export function prettifyKey(key) {
  if (!key) return "Unsorted";
  var s = String(key).replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2").replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.trim();
}

export function labelFor(key) {
  if (clientLabels[key]) return { label: clientLabels[key], known: true };
  return { label: prettifyKey(key), known: false };
}
