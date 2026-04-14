var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var MIN_DATE = new Date("2024-01-01");
var MAX_DATE = new Date("2027-12-31");

export var ALLOWED_META_ACCOUNTS = [
  "act_8159212987434597",
  "act_3600654450252189",
  "act_825253026181227",
  "act_1187886635852303",
  "act_9001636663181231",
  "act_542990539806888"
];

export var ALLOWED_LEVELS = ["campaign", "adset", "ad"];

export var ALLOWED_CLIENTS = ["mtn-momo"];

export function validateDate(str) {
  if (!DATE_RE.test(str)) return false;
  var parts = str.split("-");
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);
  var date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return false;
  if (date < MIN_DATE || date > MAX_DATE) return false;
  return true;
}

export function validateDates(req, res) {
  var from = req.query.from;
  var to = req.query.to;
  if (from && !validateDate(from)) {
    res.status(400).json({ error: "Invalid date format" });
    return false;
  }
  if (to && !validateDate(to)) {
    res.status(400).json({ error: "Invalid date format" });
    return false;
  }
  return true;
}
