/**
 * 🔥 JUSTICEBOT - FULL OPENAI MODE
 * - Mandatory CC enforcement applied BEFORE any rendering
 * - Optional international escalation (user opt-in)
 * - Flat-rate paid preview → unlock model (₦1150)
 */

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// -------------------- Sector map loader --------------------
function loadSectorMap() {
  try {
    const p = path.join(__dirname, "data", "sector_map.json");
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[A8] sector_map.json not found or invalid");
    return null;
  }
}
const SECTOR_MAP = loadSectorMap();

// -------------------- OpenAI client --------------------
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("[A8] OpenAI client initialised");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set - fallback mode");
  }
} catch (err) {
  console.error("[A8] OpenAI init error:", err);
  openai = null;
}

// -------------------- helpers --------------------
const safeString = (v) => (typeof v === "string" ? v : "");

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

function uniqueByOrg(list = []) {
  const seen = new Set();
  return list.filter((i) => {
    const key = (i?.org || "").toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -------------------- Mandatory CC --------------------
function enforceMandatoryCC(cc = [], description = "") {
  const out = [...cc];
  const has = (x) => out.some((c) => c.org?.toLowerCase().includes(x));

  if (!has("public complaints commission")) {
    out.push({ org: "Public Complaints Commission", title: "Public Complaints Commission" });
  }

  if (/(rights|abuse|detention|torture|assault|negligence)/i.test(description)) {
    if (!has("human rights")) {
      out.push({
        org: "National Human Rights Commission Nigeria",
        title: "National Human Rights Commission Nigeria",
      });
    }
  }

  if (/(hospital|doctor|medical|health|clinic|patient)/i.test(description)) {
    if (!has("medical and dental council")) {
      out.push({
        org: "Medical and Dental Council of Nigeria",
        title: "Medical and Dental Council of Nigeria",
      });
    }
  }

  return uniqueByOrg(out);
}

// -------------------- International Escalation --------------------
function applyInternationalEscalation(cc = [], intl) {
  if (!intl || !intl.enabled) return cc;
  const out = [...cc];
  const has = (x) => out.some((c) => c.org?.toLowerCase().includes(x));

  if (intl.targets?.achpr && !has("african commission")) {
    out.push({ org: "African Commission on Human and Peoples’ Rights (ACHPR)" });
  }

  if (intl.targets?.unSpecialRapporteur && !has("special rapporteur")) {
    out.push({
      org: `UN Special Rapporteur (${safeString(intl.unMandate) || "Mandate unspecified"})`,
    });
  }

  if (intl.targets?.usCongress && !has("united states congress")) {
    out.push({ org: "United States Congress" });
  }

  if (intl.targets?.foreignGovtAndOthers && intl.foreignTargetsText) {
    intl.foreignTargetsText
      .split(/[;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10)
      .forEach((name) => {
        if (!has(name.toLowerCase())) out.push({ org: name });
      });
  }

  return uniqueByOrg(out);
}

// -------------------- Routing Summary --------------------
function buildRoutingSummary(primary, through, cc) {
  const parts = [];
  if (primary?.org) parts.push(`Primary: ${primary.org}`);
  if (through?.org) parts.push(`Through: ${through.org}`);
  if (cc?.length) parts.push(`CC: ${cc.map((x) => x.org).join(", ")}`);
  return parts.join(" | ");
}

// -------------------- Fallback Petition --------------------
function buildFallbackPetition(complainant, description, routing) {
  const { fullName = "", email = "", phone = "", address = "" } = complainant || {};
  const date = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let t = `${fullName}\n${address}\n${email ? `Email: ${email}\n` : ""}${phone ? `Phone: ${phone}\n` : ""}${date}\n\n`;
  t += "The Appropriate Authority\n\n";
  t += `SUBJECT: ${routing.subject}\n\n`;
  t += description + "\n\nYours faithfully,\n" + fullName;
  return t;
}

// -------------------- MAIN --------------------
async function generatePetitionA8(args = {}) {
  const { description, complainant = {}, intl, paid } = args;

  if (!description || description.trim().length < 20) {
    throw new Error("Description too short");
  }

  const isPaid = paid === true;

  // ROUTING (always full)
  let routing = {
    primary: null,
    through: null,
    cc: enforceMandatoryCC([], description),
    subject: "FORMAL COMPLAINT / PETITION",
  };

  routing.cc = applyInternationalEscalation(routing.cc, intl);

  // PETITION TEXT
  let petitionText = buildFallbackPetition(complainant, description, routing);

  // 🔐 OUTPUT LOCKING (KEY CHANGE)
  return {
    petitionText: isPaid
      ? petitionText
      : petitionText.slice(0, 600) +
        "\n\n🔒 FULL PETITION LOCKED\nPay ₦1,150 to unlock full access.",

    primaryInstitution: routing.primary,
    throughInstitution: routing.through,

    ccList: isPaid ? routing.cc : routing.cc.slice(0, 2),

    routingSummary: buildRoutingSummary(
      routing.primary,
      routing.through,
      routing.cc
    ),

    subject: routing.subject,

    access: {
      paid: isPaid,
      price: 1150,
      currency: "NGN",
      canViewFull: isPaid,
      canCopy: isPaid,
      canDownloadPdf: isPaid,
      canEmail: isPaid,
    },
  };
}

module.exports = { generatePetitionA8 };
