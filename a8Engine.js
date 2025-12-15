/**
 * A8 Petition Engine (AI-first, fallback-safe)
 * - Uses data/sector_map.json to route (primary/through/cc)
 * - Builds a proper legal-style petition text
 * - If OPENAI_API_KEY is set, enriches the petition using AI
 * - Preview locking: unpaid => short preview + lock line
 */

const fs = require("fs");
const path = require("path");

let OpenAI = null;
try {
  OpenAI = require("openai").OpenAI || require("openai");
} catch (_) {
  OpenAI = null;
}

/* =========================
   CONFIG
========================= */
const PRICE = 1150;
const CURRENCY = "NGN";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/* =========================
   Sector map loader
========================= */
function loadSectorMap() {
  try {
    const p = path.join(__dirname, "data", "sector_map.json");
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sectors)) return null;
    return parsed;
  } catch (e) {
    console.warn("[A8] sector_map.json not found/invalid:", e?.message || e);
    return null;
  }
}

const SECTOR_MAP = loadSectorMap();

/* =========================
   OpenAI client
========================= */
let openai = null;
try {
  const key = String(process.env.OPENAI_API_KEY || "").trim();
  if (OpenAI && key) {
    openai = new OpenAI({ apiKey: key });
    console.log("[A8] OpenAI client initialised");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set - fallback mode active.");
  }
} catch (err) {
  console.warn("[A8] OpenAI init error:", err?.message || err);
  openai = null;
}

/* =========================
   Helpers
========================= */
const safeString = (v) => (typeof v === "string" ? v : "");
const clean = (s) =>
  safeString(s)
    .replace(/\s+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

function uniqueByOrg(list = []) {
  const seen = new Set();
  return (list || []).filter((i) => {
    const org = clean(i?.org || i?.name || "");
    const key = org.toLowerCase();
    if (!org) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* =========================
   Nigeria location/state inference
========================= */
const NIGERIA_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa",
  "Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger",
  "Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"
];

const CITY_TO_STATE = {
  "abuja":"FCT, Abuja","fct":"FCT, Abuja","kubwa":"FCT, Abuja","gwarinpa":"FCT, Abuja",
  "ikeja":"Lagos","lekki":"Lagos","surulere":"Lagos",
  "onitsha":"Anambra","awka":"Anambra","enugu":"Enugu"
};

function inferStateFromText(text = "") {
  const t = clean(text).toLowerCase();
  if (!t) return null;

  if (/\b(fct|abuja)\b/.test(t)) return "FCT, Abuja";

  for (const st of NIGERIA_STATES) {
    const rx = new RegExp(`\\b${st.toLowerCase()}(\\s+state)?\\b`, "i");
    if (rx.test(t)) return st;
  }

  const keys = Object.keys(CITY_TO_STATE).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (t.includes(k)) return CITY_TO_STATE[k];
  }
  return null;
}

/* =========================
   Routing
========================= */
function detectSector(description = "") {
  if (!SECTOR_MAP?.sectors?.length) return null;
  const text = clean(description).toLowerCase();

  let best = null, bestScore = 0;
  for (const s of SECTOR_MAP.sectors) {
    let score = 0;
    for (const k of (s.keywords || [])) {
      if (text.includes(String(k).toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore > 0 ? best : null;
}

function enforceMandatoryCC(cc = [], description = "") {
  const out = [...(cc || [])];
  const has = (n) => out.some((c) => clean(c?.org).toLowerCase().includes(n));

  if (!has("public complaints")) out.push({ org: "Public Complaints Commission" });

  if (/(arrest|detention|extortion|police|abuse|rights)/i.test(description)) {
    if (!has("human rights")) out.push({ org: "National Human Rights Commission Nigeria" });
  }

  return uniqueByOrg(out);
}

function buildRouting(description) {
  const sector = detectSector(description);
  const routing = {
    sector: sector?.sector || null,
    primary: sector?.federal_primary ? { org: sector.federal_primary } : { org: "Nigeria Police Force (Force Headquarters)" },
    through: sector?.state_through ? { org: sector.state_through } : null,
    cc: [],
    subject: "FORMAL COMPLAINT / PETITION",
  };

  routing.cc = enforceMandatoryCC(sector?.mandatory_cc || [], description);

  if (/(unlawful arrest|illegal arrest|detention|extortion|bribe|police)/i.test(description)) {
    routing.subject = "PETITION AGAINST UNLAWFUL ARREST, EXTORTION, AND ABUSE OF AUTHORITY BY POLICE OFFICERS";
  }

  return routing;
}

function buildRoutingSummary(primary, through, cc) {
  const parts = [];
  if (primary?.org) parts.push(`Primary: ${primary.org}`);
  if (through?.org) parts.push(`Through: ${through.org}`);
  if (cc?.length) parts.push(`CC: ${cc.map((x) => x.org).join(", ")}`);
  return parts.join(" | ");
}

/* =========================
   Petition Builders
========================= */
function formatDate() {
  return new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
}

function buildDeterministicPetition({ complainant, description, routing }) {
  const fullName = clean(complainant?.fullName) || "A Concerned Citizen";
  const email = clean(complainant?.email);
  const phone = clean(complainant?.phone);
  const address = clean(complainant?.address);

  const lines = [];
  lines.push(fullName);
  if (address) lines.push(address);
  if (email) lines.push(`Email: ${email}`);
  if (phone) lines.push(`Phone: ${phone}`);
  lines.push("", formatDate(), "");

  lines.push(routing.primary.org);
  if (routing.through?.org) lines.push(`Through: ${routing.through.org}`);
  lines.push("");

  if (routing.cc.length) {
    lines.push("CC:");
    routing.cc.forEach((c) => lines.push(`- ${c.org}`));
    lines.push("");
  }

  lines.push(`Subject: ${routing.subject}`, "");

  if (/force headquarters/i.test(routing.primary.org)) {
    lines.push("Dear Inspector-General of Police,");
  } else {
    lines.push("Dear Sir/Madam,");
  }

  lines.push("", "BACKGROUND / SUMMARY");
  lines.push(clean(description), "");

  lines.push(
    "The acts complained of include unlawful arrest, attempted extortion, abuse of authority, and violation of fundamental rights."
  );
  lines.push("");

  lines.push("RELIEFS SOUGHT");
  lines.push("- Immediate investigation and written findings.");
  lines.push("- Appropriate corrective or disciplinary action.");
  lines.push("- Written response with a clear timeline.", "");

  lines.push("Yours faithfully,", fullName);
  return lines.join("\n");
}

/* =========================
   MAIN
========================= */
async function generatePetitionA8(args = {}) {
  const description = clean(args.description || "");
  const complainant = args.complainant || {};
  const paid = args.paid === true;

  if (description.length < 10) throw new Error("Description too short.");

  const routing = buildRouting(description);
  const fullPetition = buildDeterministicPetition({ complainant, description, routing });

  const cutPoint = fullPetition.indexOf("RELIEFS SOUGHT");
  const previewLimit = cutPoint > 0 ? cutPoint : 900;

  const petitionText = paid
    ? fullPetition
    : fullPetition.slice(0, previewLimit) +
      `\n\n🔒 FULL PETITION LOCKED\nPay ₦${PRICE.toLocaleString("en-NG")} to unlock full access.`;

  return {
    petitionText,
    primaryInstitution: routing.primary,
    throughInstitution: routing.through,
    ccList: paid ? routing.cc : routing.cc.slice(0, 2),
    routingSummary: buildRoutingSummary(routing.primary, routing.through, routing.cc),
    subject: routing.subject,
    access: {
      paid,
      price: PRICE,
      currency: CURRENCY,
      canViewFull: paid,
      canCopy: paid,
      canDownloadPdf: paid,
      canEmail: paid,
    },
  };
}

module.exports = { generatePetitionA8 };
