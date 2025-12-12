const fs = require("fs");

const FILE = "core/aiRouting.js";
let src = fs.readFileSync(FILE, "utf8");

const HOOK = "const route = buildHardRoute(sector, description, userAddress);";
const idx = src.indexOf(HOOK);

if (idx === -1) {
  console.error("❌ Hook point not found");
  process.exit(1);
}

const INSERT = `
  // -------- International override (if detected) ----------
  const jurisdiction = detectJurisdiction(description, userAddress);
  if (jurisdiction) {
    const intl = getInternationalRegulators(jurisdiction);
    if (intl) {
      route.primary = intl.primary;
      intl.cc.forEach(x => pushUnique(route.cclist, x));
      pushUnique(route.cclist, PCC); // ALWAYS keep PCC for Nigerian users
    }
  }
`;

src = src.slice(0, idx + HOOK.length) + INSERT + src.slice(idx + HOOK.length);

fs.writeFileSync(FILE, src);
console.log("✅ International routing hook applied");
