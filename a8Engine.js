/**
 * JUSTICEBOT - FULL OPENAI MODE (ENFORCED CC VERSION)
 */

const OpenAI = require("openai");

let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (err) {
  openai = null;
}

// ---------------- helpers ----------------
function safeString(v) {
  return typeof v === "string" ? v : "";
}

function normaliseInstitution(i) {
  if (!i || typeof i !== "object") return null;
  return {
    org: safeString(i.org || i.name),
    title: safeString(i.title),
    address: safeString(i.address),
    email: safeString(i.email),
    phone: safeString(i.phone),
  };
}

/**
 * 🔥 MANDATORY CC ENFORCEMENT
 */
function enforceMandatoryCC(ccList = [], primary = {}, description = "") {
  const enforced = [...ccList];

  const has = (org) =>
    enforced.some((c) => c && c.org && c.org.toLowerCase().includes(org.toLowerCase()));

  // Always copy PCC for administrative injustice
  if (!has("Public Complaints Commission")) {
    enforced.push({
      org: "Public Complaints Commission",
      title: "Public Complaints Commission",
      address: "",
      email: "",
      phone: "",
    });
  }

  // Rights language → NHRC
  if (
    /denial|abuse|inhuman|negligence|rights|life|medical|assault|detention/i.test(
      description
    )
  ) {
    if (!has("National Human Rights Commission")) {
      enforced.push({
        org: "National Human Rights Commission",
        title: "National Human Rights Commission",
        address: "",
        email: "",
        phone: "",
      });
    }
  }

  // Health sector → MDCN
  if (/hospital|doctor|medical|health/i.test(description)) {
    if (!has("Medical and Dental Council")) {
      enforced.push({
        org: "Medical and Dental Council of Nigeria",
        title: "Medical and Dental Council of Nigeria",
        address: "",
        email: "",
        phone: "",
      });
    }
  }

  return enforced.filter(Boolean);
}

// ---------------- MAIN ----------------
async function generatePetitionA8(args) {
  const { description, complainant } = args || {};
  if (!description || description.length < 10) {
    throw new Error("Description too short");
  }

  let routing = {
    primary: null,
    through: null,
    cc: [],
    subject: "FORMAL COMPLAINT / PETITION",
    summary: "",
    emailsConfidence: "low",
  };

  if (openai) {
    try {
      routing = await buildRoutingWithOpenAI({ complainant, description });
    } catch (err) {
      routing = routing;
    }
  }

  const primary = normaliseInstitution(routing.primary);
  const through = normaliseInstitution(routing.through);
  let ccList = Array.isArray(routing.cc)
    ? routing.cc.map(normaliseInstitution).filter(Boolean)
    : [];

  // 🔥 ENFORCE CC HERE
  ccList = enforceMandatoryCC(ccList, primary, description);

  let petitionText;
  try {
    petitionText = await buildPetitionWithOpenAI({
      complainant,
      description,
      routing: { primary, through, cc: ccList, subject: routing.subject },
    });
  } catch (err) {
    petitionText = buildFallbackPetition(complainant, description);
  }

  return {
    petitionText,
    primaryInstitution: primary,
    throughInstitution: through,
    ccList,
    routingSummary: "CC enforcement applied",
    subject: routing.subject || "FORMAL COMPLAINT / PETITION",
  };
}

module.exports = {
  generatePetitionA8,
};
