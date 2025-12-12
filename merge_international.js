/**
 * STEP 1.5 — Normalize ALL international bodies into core/data
 * Safe: append-only, no deletions
 */

const fs = require('fs');

const ROOT_PATH = 'data/institutions.json';
const CORE_PATH = 'core/data/institutions.json';
const OUT_PATH  = 'core/data/institutions.MERGE.json';

const root = JSON.parse(fs.readFileSync(ROOT_PATH, 'utf8'));
const core = JSON.parse(fs.readFileSync(CORE_PATH, 'utf8'));

const international = [];

// helper to push safely
function pushBody(id, body, category = 'international') {
  international.push({
    id,
    org: body.name || body.org || '',
    email: body.email || '',
    address: body.address || '',
    category
  });
}

/* -----------------------------
   1. UN & existing international
------------------------------*/
if (root.international) {
  for (const [id, body] of Object.entries(root.international)) {
    if (typeof body === 'object') {
      pushBody(id, body, 'international');
    }
  }
}

/* -----------------------------
   2. Top-level INTERNATIONAL KEYS
------------------------------*/
const INTERNATIONAL_PREFIXES = [
  'us_',
  'uk_',
  'eu_',
  'au_',
  'ecowas_',
  'achpr'
];

for (const [key, body] of Object.entries(root)) {
  if (
    INTERNATIONAL_PREFIXES.some(p => key.startsWith(p)) &&
    typeof body === 'object'
  ) {
    pushBody(key, body, 'international');
  }
}

/* -----------------------------
   3. De-duplicate by ID
------------------------------*/
const unique = {};
for (const item of international) {
  unique[item.id] = item;
}

core.international_bodies = Object.values(unique);

// write merged file
fs.writeFileSync(OUT_PATH, JSON.stringify(core, null, 2));

console.log('✔ International bodies normalized into core');
console.log('✔ Total:', core.international_bodies.length);
console.log('✔ Output:', OUT_PATH);
