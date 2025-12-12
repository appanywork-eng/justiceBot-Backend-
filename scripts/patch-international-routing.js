const fs = require("fs");

const FILE = "core/aiRouting.js";
let src = fs.readFileSync(FILE, "utf8");

// anchor: after sector detection helper
const ANCHOR = "// 5) HARD RULE routing (the main thing you requested)";
const idx = src.indexOf(ANCHOR);

if (idx === -1) {
  console.error("❌ Anchor not found. Aborting.");
  process.exit(1);
}

const INSERT = `

// ================= INTERNATIONAL ROUTING (STRICT) =================

// Detect foreign jurisdiction keywords
function detectJurisdiction(text = "", addr = "") {
  const t = norm(text + " " + addr);

  if (/(usa|united states|america|california|new york|texas)/.test(t)) return "us";
  if (/(uk|united kingdom|england|london|britain)/.test(t)) return "uk";
  if (/(eu|european union|europe|brussels)/.test(t)) return "eu";

  return null;
}

// International regulators (fallback-safe)
function getInternationalRegulators(jurisdiction) {
  if (jurisdiction === "us") {
    return {
      primary: toInstShape({
        id: "us-ftc",
        org: "Federal Trade Commission (FTC)",
        title: "The Chair",
        address: "Washington, D.C., USA",
        category: "regulator",
        sector: "international"
      }),
      cc: [
        toInstShape({
          id: "us-doj",
          org: "U.S. Department of Justice",
          title: "The Attorney General",
          address: "Washington, D.C., USA",
          category: "law",
          sector: "international"
        })
      ]
    };
  }

  if (jurisdiction === "uk") {
    return {
      primary: toInstShape({
        id: "uk-fca",
        org: "Financial Conduct Authority (FCA)",
        title: "The Chief Executive",
        address: "London, United Kingdom",
        category: "regulator",
        sector: "international"
      }),
      cc: [
        toInstShape({
          id: "uk-cma",
          org: "Competition and Markets Authority (CMA)",
          title: "The Chief Executive",
          address: "London, United Kingdom",
          category: "regulator",
          sector: "international"
        })
      ]
    };
  }

  if (jurisdiction === "eu") {
    return {
      primary: toInstShape({
        id: "eu-dgcomp",
        org: "European Commission – DG Competition",
        title: "The Commissioner",
        address: "Brussels, Belgium",
        category: "regulator",
        sector: "international"
      }),
      cc: [
        toInstShape({
          id: "echr",
          org: "European Court of Human Rights",
          title: "The Registrar",
          address: "Strasbourg, France",
          category: "court",
          sector: "international"
        })
      ]
    };
  }

  return null;
}

// ================= END INTERNATIONAL ROUTING =================
`;

src =
  src.slice(0, idx) +
  INSERT +
  src.slice(idx);

fs.writeFileSync(FILE, src);
console.log("✅ International routing block injected successfully");
