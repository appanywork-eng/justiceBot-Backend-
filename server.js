// server.js - JusticeBot backend (auto-routing + institutions API)

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

// -----------------------------------------------------------------------------
// Load institutions from JSON (for admin view)
// -----------------------------------------------------------------------------
let institutionsData = {};
const institutionsPath = path.join(__dirname, "data", "institutions.json");

try {
  const raw = fs.readFileSync(institutionsPath, "utf8");
  institutionsData = JSON.parse(raw);
  console.log("✅ institutions.json loaded");
} catch (err) {
  console.error("⚠️ Could not load institutions.json:", err.message);
  institutionsData = {};
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function normalize(text = "") {
  return text.toLowerCase();
}

// Basic classification logic
function classifyComplaint(text) {
  const t = normalize(text);

  if (
    t.includes("police") ||
    t.includes("sars") ||
    t.includes("npf") ||
    t.includes("cell") ||
    t.includes("detain") ||
    t.includes("torture") ||
    t.includes("beating")
  ) {
    return "Possible human rights violation";
  }

  if (
    t.includes("bribe") ||
    t.includes("kickback") ||
    t.includes("419") ||
    t.includes("fraud") ||
    t.includes("embezzle") ||
    t.includes("money laundering") ||
    t.includes("corruption")
  ) {
    return "Possible corruption / financial crime";
  }

  if (
    t.includes("land") ||
    t.includes("house") ||
    t.includes("building") ||
    t.includes("property") ||
    t.includes("demolition")
  ) {
    return "Land / property dispute";
  }

  if (
    t.includes("salary") ||
    t.includes("pension") ||
    t.includes("allowance") ||
    t.includes("promotion") ||
    t.includes("benefit") ||
    t.includes("gratuity")
  ) {
    return "Employment / labour dispute";
  }

  if (
    t.includes("passport") ||
    t.includes("visa") ||
    t.includes("immigration") ||
    t.includes("deport") ||
    t.includes("border")
  ) {
    return "Immigration / travel issue";
  }

  return "General complaint / administrative injustice";
}

// -----------------------------------------------------------------------------
// Institution suggestion rules
// -----------------------------------------------------------------------------

const INSTITUTION_RULES = [
  {
    keywords: ["police", "sars", "npf", "detain", "cell", "custody", "bail"],
    institutions: [
      {
        name: "Nigeria Police Force (NPF)",
        reason: "Complaint mentions police or arrest."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC handles abuse of office and administrative injustice by public authorities."
      },
      {
        name: "National Human Rights Commission (NHRC)",
        reason: "Handles human rights violations by state actors."
      }
    ]
  },
  {
    keywords: ["efcc", "419", "fraud", "money laundering", "advance fee"],
    institutions: [
      {
        name: "Economic and Financial Crimes Commission (EFCC)",
        reason: "Handles financial crimes, fraud and 419 cases."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC can receive complaints on maladministration and abuse of power related to financial matters."
      }
    ]
  },
  {
    keywords: ["bribe", "kickback", "corrupt", "icpc"],
    institutions: [
      {
        name: "Independent Corrupt Practices Commission (ICPC)",
        reason: "Handles corruption in public institutions."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC deals with administrative injustice in ministries, agencies and departments."
      }
    ]
  },
  {
    keywords: [
      "passport",
      "visa",
      "immigration",
      "border",
      "deport",
      "nis",
      "residence permit"
    ],
    institutions: [
      {
        name: "Nigeria Immigration Service (NIS)",
        reason: "Handles immigration, passports and visas."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC can intervene where immigration officials abuse power or delay services unjustly."
      }
    ]
  },
  {
    keywords: ["customs", "import", "export", "duty", "seizure"],
    institutions: [
      {
        name: "Nigeria Customs Service (NCS)",
        reason: "Handles customs duties, seizures and trade-related border issues."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC can look into abuse of office or unfair treatment by customs officers."
      }
    ]
  },
  {
    keywords: ["land", "property", "building", "demolition", "fcda", "fcta"],
    institutions: [
      {
        name: "Federal Capital Development Authority (FCDA)",
        reason:
          "Handles land allocation, planning and development issues within the FCT."
      },
      {
        name: "Federal Capital Territory Administration (FCTA)",
        reason: "Supervises overall administration of the FCT."
      },
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "PCC can receive petitions on wrongful demolition, land disputes involving agencies and unfair treatment."
      }
    ]
  },
  {
    keywords: ["salary", "pension", "promotion", "employment", "worker", "staff"],
    institutions: [
      {
        name: "Public Complaints Commission (PCC)",
        reason:
          "Handles complaints by workers about unfair treatment, delayed salaries, pensions and promotion issues in public institutions."
      },
      {
        name: "National Industrial Court",
        reason:
          "Hears labour and employment disputes when formal litigation is required."
      }
    ]
  }
];

function suggestInstitutions(text) {
  const t = normalize(text);
  const suggestions = [];

  for (const rule of INSTITUTION_RULES) {
    const hit = rule.keywords.some((kw) => t.includes(kw));
    if (hit) {
      for (const inst of rule.institutions) {
        if (!suggestions.find((s) => s.name === inst.name)) {
          suggestions.push(inst);
        }
      }
    }
  }

  // Always fall back to PCC if nothing matched
  if (suggestions.length === 0) {
    suggestions.push({
      name: "Public Complaints Commission (PCC)",
      reason:
        "General administrative injustice or unfair treatment by public institutions."
    });
  }

  return suggestions;
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

app.get("/", (req, res) => {
  res.json({ status: "JusticeBot backend is running ✅" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Admin: return full institutions JSON
app.get("/institutions", (req, res) => {
  res.json(institutionsData);
});

// Main analyze endpoint
app.post("/analyze", (req, res) => {
  const { complaint } = req.body || {};

  if (!complaint || !complaint.trim()) {
    return res.status(400).json({ error: "No complaint provided" });
  }

  const classification = classifyComplaint(complaint);
  const institutions = suggestInstitutions(complaint);

  // Generic advice text (can later be customized per classification)
  let advice =
    "You may submit this as a formal petition at PCC or a court of law.";
  let recommendation =
    "Provide date, location, and names of officers or officials if possible.";

  if (classification === "Possible human rights violation") {
    advice =
      "You may submit this as a formal petition at PCC, the National Human Rights Commission or seek legal advice.";
  }

  if (classification === "Possible corruption / financial crime") {
    advice =
      "You may report this to EFCC or ICPC, and also submit a petition to PCC if public officials are involved.";
  }

  const payload = {
    received: complaint,
    classification,
    advice,
    recommendation,
    institutions
  };

  return res.json(payload);
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 JusticeBot backend listening on port ${PORT}`);
});
