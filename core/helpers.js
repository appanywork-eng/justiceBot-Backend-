// core/helpers.js
// Small shared text helpers.

function textIncludesAny(t, arr) {
  t = (t || "").toLowerCase();
  return arr.some((x) => t.includes(x.toLowerCase()));
}

function normaliseOrgName(o) {
  return (o || "").trim().toLowerCase();
}

module.exports = {
  textIncludesAny,
  normaliseOrgName,
};
