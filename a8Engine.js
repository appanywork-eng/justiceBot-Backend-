/**
 * A8 Petition Engine (AI-first, fallback-safe)
 * - Uses data/sector_map.json to route (primary/through/cc)
 * - AI FIRST: reads complaint -> extracts facts -> decides best outcome
 * - Structure/logic validates + routes + enforces mandatory CCs
 * - Preview locking: unpaid => short preview + lock line
 */

const fs = require("fs");
const path = require("path");
const { SYSTEM_PROMPT_V1_1 } = require("./core/systemPrompt.v1_1");

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
  }
} catch (_) {
  openai = null;
}

/* =========================
   Helpers
========================= */
const safeString = (v) => (typeof v === "string" ? v : "");
const clean = (s) =>
  safeString(s).replace(/\s+/g, " ").replace(/[ \t]+\n/g, "\n").trim();

function uniqueByOrg(list = []) {
  const seen = new Set();
  return list.filter((i) => {
    const org = clean(i?.org || "");
    if (!org || seen.has(org.toLowerCase())) return false;
    seen.add(org.toLowerCase());
    return true;
  });
}

/* =========================
   LOCATION INFERENCE (UNCHANGED)
========================= */
const CITY_TO_STATE = {
  "abuja": "FCT, Abuja",
  "kubwa": "FCT, Abuja",
  "gwarinpa": "FCT, Abuja",
  "ikeja": "Lagos",
  "lekki": "Lagos",
  "onitsha": "Anambra",
  "awka": "Anambra",
  "enugu": "Enugu",
  "jos": "Plateau",
  "kaduna": "Kaduna",
  "kano": "Kano",
};

function inferStateFromText(text = "") {
  const t = clean(text).toLowerCase();
  for (const k of Object.keys(CITY_TO_STATE)) {
    if (t.includes(k)) return CITY_TO_STATE[k];
  }
  return null;
}

/* =========================
   Routing (UNCHANGED)
========================= */
function detectSector(description = "") {
  if (!SECTOR_MAP?.sectors?.length) return null;
  const text = clean(description).toLowerCase();
  let best = null, score = 0;

  for (const s of SECTOR_MAP.sectors) {
    let hits = 0;
    for (const k of s.keywords || []) {
      if (text.includes(k.toLowerCase())) hits++;
    }
    if (hits > score) {
      score = hits;
      best = s;
    }
  }
  return best;
}

function enforceMandatoryCC(cc = [], description = "") {
  const out = [...cc];
  if (!out.some(x => x.org?.toLowerCase().includes("public complaints"))) {
    out.push({ org: "Public Complaints Commission" });
  }
  if (/arrest|police|extort|bribe|detain/i.test(description)) {
    out.push({ org: "National Human Rights Commission Nigeria" });
  }
  return uniqueByOrg(out);
}

function buildRouting(description) {
  const sector = detectSector(description);
  const routing = {
    primary: sector?.federal_primary ? { org: sector.federal_primary } : null,
    through: sector?.state_through ? { org: sector.state_through } : null,
    cc: [],
    subject: "FORMAL COMPLAINT / PETITION",
  };
  if (Array.isArray(sector?.mandatory_cc)) {
    routing.cc = sector.mandatory_cc.map(x => ({ org: x }));
  }
  routing.cc = enforceMandatoryCC(routing.cc, description);
  return routing;
}

/* =========================
   AI PETITION (PATCHED)
========================= */
async function buildAIPetition({ complainant, description, routing, inferredState }) {
  const baseText = `FORMAL COMPLAINT\n\n${description}`;
  if (!openai) return baseText;

  const payload = {
    complainant,
    description,
    routing,
    inferredState,
  };

  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT_V1_1 },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });

    return res.choices?.[0]?.message?.content?.trim() || baseText;
  } catch {
    return baseText;
  }
}

/* =========================
   MAIN EXPORT
========================= */
async function generatePetitionA8(args = {}) {
  const description = clean(args.description || "");
  if (description.length < 10) throw new Error("Description too short");

  const complainant = args.complainant || {};
  const paid = args.paid === true;

  const inferredState = inferStateFromText(
    `${complainant.address || ""} ${description}`
  );

  const routing = buildRouting(description);
  const fullText = await buildAIPetition({
    complainant,
    description,
    routing,
    inferredState,
  });

  return {
    petitionText: paid
      ? fullText
      : fullText.slice(0, 900) +
        `\n\n🔒 FULL PETITION LOCKED\nPay ₦${PRICE.toLocaleString("en-NG")} to unlock full access.`,
    routingSummary: routing,
    inferredState,
    access: {
      paid,
      price: PRICE,
      currency: CURRENCY,
    },
  };
}

module.exports = { generatePetitionA8 };
