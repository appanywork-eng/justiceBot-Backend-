/**

A8 Petition Engine (AI-first, fallback-safe)

Uses data/sector_map.json to route (primary/through/cc)


Builds a proper legal-style petition text


If OPENAI_API_KEY is set, enriches the petition using AI


Preview locking: unpaid => short preview + lock line
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
Nigeria location/state inference (NO guessing beyond reasonable confidence)
========================= */
const NIGERIA_STATES = [
"Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
"Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa",
"Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger",
"Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"
];

const CITY_TO_STATE = {
// FCT / Abuja
"abuja": "FCT, Abuja",
"fct": "FCT, Abuja",
"garki": "FCT, Abuja",
"wuse": "FCT, Abuja",
"maitama": "FCT, Abuja",
"asokoro": "FCT, Abuja",
"gwarinpa": "FCT, Abuja",
"kubwa": "FCT, Abuja",
"utako": "FCT, Abuja",
"kubwa abuja": "FCT, Abuja",
"kuje": "FCT, Abuja",
"bwari": "FCT, Abuja",
"gwagwalada": "FCT, Abuja",
"abaji": "FCT, Abuja",
"kwali": "FCT, Abuja",
// A few common city->state anchors (expand later safely)
"ikeja": "Lagos",
"lekki": "Lagos",
"surulere": "Lagos",
"ikorodu": "Lagos",
"port harcourt": "Rivers",
"ph": "Rivers",
"benin": "Edo",
"benin city": "Edo",
"warri": "Delta",
"asaba": "Delta",
"ilorin": "Kwara",
"aba": "Abia",
"onitsha": "Anambra",
"awka": "Anambra",
"enugu": "Enugu",
"jos": "Plateau",
"makurdi": "Benue",
"yola": "Adamawa",
"maiduguri": "Borno",
"kano": "Kano",
"kaduna": "Kaduna",
"minna": "Niger",
"lafia": "Nasarawa",
"lokoja": "Kogi",
"gombe": "Gombe"
};

function inferStateFromText(text = "") {
const t = clean(text).toLowerCase();
if (!t) return null;

// explicit FCT/Abuja wins
if (/\b(fct|abuja)\b/.test(t)) return "FCT, Abuja";

// explicit state name match (e.g. "Gombe State")
for (const st of NIGERIA_STATES) {
const key = st.toLowerCase();
const rx = new RegExp(\\b${escapeRegExp(key)}\\b, "i");
if (rx.test(t)) return st; // state name only
const rx2 = new RegExp(\\b${escapeRegExp(key)}\\s+state\\b, "i");
if (rx2.test(t)) return st;
}

// city/LGA anchors (e.g. Kubwa -> FCT, Abuja)
// choose the longest matching phrase first
const keys = Object.keys(CITY_TO_STATE).sort((a, b) => b.length - a.length);
for (const k of keys) {
if (t.includes(k)) return CITY_TO_STATE[k];
}

return null;
}

function escapeRegExp(s) {
return String(s).replace(/[.*+?^${}()|[]\]/g, "\$&");
}

/* =========================
Routing using sector_map.json
========================= */
function detectSector(description = "") {
if (!SECTOR_MAP?.sectors?.length) return null;
const text = clean(description).toLowerCase();

let best = null;
let bestScore = 0;

for (const s of SECTOR_MAP.sectors) {
const kws = Array.isArray(s.keywords) ? s.keywords : [];
let score = 0;
for (const k of kws) {
const kk = String(k || "").toLowerCase();
if (!kk) continue;
if (text.includes(kk)) score += 1;
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
const has = (needle) =>
out.some((c) => clean(c?.org).toLowerCase().includes(clean(needle).toLowerCase()));

// Always PCC
if (!has("public complaints commission")) {
out.push({ org: "Public Complaints Commission" });
}

// Add sector hints based on complaint language (broad, not risky)
const t = clean(description).toLowerCase();

if (/(rights|abuse|detention|torture|assault|unlawful arrest|illegal arrest|police)/i.test(t)) {
if (!has("human rights")) {
out.push({ org: "National Human Rights Commission Nigeria" });
}
}

if (/(hospital|doctor|medical|health|clinic|patient|nurse)/i.test(t)) {
if (!has("medical and dental")) {
out.push({ org: "Medical and Dental Council of Nigeria" });
}
}

return uniqueByOrg(out);
}

function buildRouting(description) {
const sector = detectSector(description);
const routing = {
sector: sector?.sector || null,
primary: sector?.federal_primary ? { org: sector.federal_primary } : null,
through: sector?.state_through ? { org: sector.state_through } : null,
cc: [],
subject: "FORMAL COMPLAINT / PETITION",
};

// Sector-provided CC
if (Array.isArray(sector?.mandatory_cc)) {
routing.cc = sector.mandatory_cc.map((x) => ({ org: String(x) }));
}

routing.cc = enforceMandatoryCC(routing.cc, description);
return routing;
}

/**

Decorate "Through" line using inferred state/FCT so it doesn't look incomplete.

This does NOT invent officials, addresses, or unit names beyond state/FCT context.
*/
function decorateThroughOrg(rawThroughOrg, inferredState) {
const throughOrg = clean(rawThroughOrg);
const st = clean(inferredState);


if (!throughOrg) return throughOrg;
if (!st) return throughOrg;

// Normalize state label for display
const isFCT = st.toLowerCase().includes("fct");
const stateLabel = isFCT ? "FCT, Abuja" : st;

// Police “State Police Command / Commissioner of Police”
if (throughOrg.toLowerCase().includes("state police command")) {
// If FCT, use FCT Police Command
if (isFCT) return "FCT Police Command / Commissioner of Police (FCT, Abuja)";
return ${stateLabel} State Police Command / Commissioner of Police (${stateLabel} State);
}

// Generic “State Ministry of …”
if (throughOrg.toLowerCase().startsWith("state ministry")) {
if (isFCT) return throughOrg.replace(/^State\s+/i, "FCT ");
return ${stateLabel} ${throughOrg};
}

// Generic “State … Agency/Commission/Board/Command”
if (/\bstate\b/i.test(throughOrg) && !/federal/i.test(throughOrg)) {
if (isFCT && !/fct/i.test(throughOrg)) return FCT ${throughOrg.replace(/\bState\b/i, "").trim()}.trim();
if (!isFCT) return throughOrg.replace(/\bState\b/i, ${stateLabel} State);
}

return throughOrg;
}

function buildRoutingSummary(primary, through, cc) {
const parts = [];
if (primary?.org) parts.push(Primary: ${primary.org});
if (through?.org) parts.push(Through: ${through.org});
if (cc?.length) parts.push(CC: ${cc.map((x) => x.org).filter(Boolean).join(", ")});
return parts.join(" | ");
}

/* =========================
Deterministic legal template (fallback-safe)
========================= */
function formatDate() {
try {
return new Date().toLocaleDateString("en-NG", {
day: "numeric",
month: "long",
year: "numeric",
});
} catch (_) {
return new Date().toDateString();
}
}

function buildDeterministicPetition({ complainant, description, routing, inferredState }) {
const fullName = clean(complainant?.fullName) || "A Concerned Citizen";
const email = clean(complainant?.email);
const phone = clean(complainant?.phone);
const address = clean(complainant?.address);

const primaryOrg = clean(routing?.primary?.org) || "The Appropriate Authority";
const throughRaw = clean(routing?.through?.org);
const throughOrg = decorateThroughOrg(throughRaw, inferredState);

const ccList = uniqueByOrg(routing?.cc || []);
const subject = clean(routing?.subject) || "FORMAL COMPLAINT / PETITION";

const lines = [];

// Sender block
if (fullName) lines.push(fullName);
if (address) lines.push(address);
if (email) lines.push(Email: ${email});
if (phone) lines.push(Phone: ${phone});
lines.push("");
lines.push(formatDate());
lines.push("");

// Addressee
lines.push(primaryOrg);
if (throughOrg) lines.push(Through: ${throughOrg});
lines.push("");

// CC block
if (ccList.length) {
lines.push("CC:");
for (const c of ccList) lines.push(- ${c.org});
lines.push("");
}

// Subject
lines.push(Subject: ${subject});
lines.push("");

// Salutation
lines.push("Dear Sir/Madam,");
lines.push("");

// Body (structured)
lines.push("I write to formally lodge this complaint and request your urgent intervention in respect of the matter described below.");
lines.push("");
lines.push("1) BACKGROUND / SUMMARY");
lines.push(- ${clean(description)});
lines.push("");
lines.push("2) FACTS / ISSUES (BRIEF)");
lines.push("- Kindly insert the specific date(s), time(s), location, names (if known), and what exactly occurred.");
lines.push("- State whether you were threatened, detained, assaulted, extorted, denied service, or otherwise harmed.");
lines.push("- Attach/keep evidence: screenshots, receipts, witness details, hospital report, video/audio, etc.");
lines.push("");
lines.push("3) WHY THIS MATTER REQUIRES URGENT ACTION");
lines.push("- The circumstances complained of suggest possible misconduct, abuse of office, negligence, or violation of lawful procedure and citizens’ rights.");
lines.push("");
lines.push("4) RELIEFS SOUGHT");
lines.push("- Immediate investigation and written findings.");
lines.push("- Appropriate corrective action and accountability measures where wrongdoing is established.");
lines.push("- Clear timeline for resolution and feedback to the complainant.");
lines.push("");
lines.push("5) REQUEST FOR ACKNOWLEDGEMENT");
lines.push("I respectfully request a written acknowledgement of receipt of this petition and a reference number (where applicable), as well as a timeline for response.");
lines.push("");
lines.push("Yours faithfully,");
lines.push(fullName);

return lines.join("\n");
}

/* =========================
AI enhancement
========================= */
async function buildAIPetition({ complainant, description, routing, inferredState }) {
const base = buildDeterministicPetition({ complainant, description, routing, inferredState });
if (!openai) return base;

const primaryOrg = clean(routing?.primary?.org) || "The Appropriate Authority";
const throughRaw = clean(routing?.through?.org);
const throughOrg = decorateThroughOrg(throughRaw, inferredState);
const ccOrgs = uniqueByOrg(routing?.cc || []).map((x) => x.org).filter(Boolean);

const system = [
"You are a senior Nigerian legal drafting assistant.",
"Write a professional, formal petition/complaint letter suitable for submission.",
"Keep it factual, structured, and legally cautious (no case law citations).",
"Do NOT invent addresses, names of officials, unit names, or case numbers.",
"Use ONLY the provided agencies exactly as the addressee/through/cc.",
"If some facts (date/time) are missing, include short neutral placeholders like [insert date].",
"Output ONLY the letter (no markdown).",
].join(" ");

const user = {
complainant: {
fullName: clean(complainant?.fullName),
email: clean(complainant?.email),
phone: clean(complainant?.phone),
address: clean(complainant?.address),
},
date: formatDate(),
inferred_state_or_fct: inferredState || null,
addressee_primary: primaryOrg,
through: throughOrg || null,
cc: ccOrgs,
subject: clean(routing?.subject || "FORMAL COMPLAINT / PETITION"),
complaint_description: clean(description),
required_sections: [
"Background/Summary",
"Facts/Issues",
"Reliefs sought",
"Request for acknowledgement and timeline",
"Closing",
],
};

try {
const resp = await openai.chat.completions.create({
model: MODEL,
temperature: 0.2,
messages: [
{ role: "system", content: system },
{ role: "user", content: JSON.stringify(user) },
],
});

const text = resp?.choices?.[0]?.message?.content || "";  
const out = text.trim();  
return out.length > 200 ? out : base;

} catch (err) {
console.warn("[A8] OpenAI generation failed, using deterministic fallback:", err?.message || err);
return base;
}
}

/* =========================
MAIN
========================= */
async function generatePetitionA8(args = {}) {
const description = clean(args.description || "");
const complainant = args.complainant || {};
const paid = args.paid === true;

if (!description || description.length < 10) {
throw new Error("Description too short.");
}

// Infer state/FCT from complainant address + description (best effort)
const inferredState =
inferStateFromText(${complainant?.address || ""} ${description}) ||
inferStateFromText(description) ||
inferStateFromText(complainant?.address || "") ||
null;

// Build routing from sector map
const routing = buildRouting(description);

// Decorate through using inferred state (for better letter quality)
if (routing?.through?.org) {
routing.through.org = decorateThroughOrg(routing.through.org, inferredState);
}

// Build petition (AI-first, deterministic fallback)
const fullPetition = await buildAIPetition({ complainant, description, routing, inferredState });

// Locking
const previewLimit = 900;
const petitionText = paid
? fullPetition
: fullPetition.slice(0, previewLimit) +
\n\n🔒 FULL PETITION LOCKED\nPay ₦${PRICE.toLocaleString("en-NG")} to unlock full access.;

return {
petitionText,
primaryInstitution: routing.primary,
throughInstitution: routing.through,
ccList: paid ? routing.cc : (routing.cc || []).slice(0, 2),
routingSummary: buildRoutingSummary(routing.primary, routing.through, routing.cc),
subject: routing.subject,
inferredState: inferredState, // helpful for UI/debug
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
