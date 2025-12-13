
/**
 * core/aiAuthorityGraph.js
 *
 * Entity-first authority graph builder (AI + deterministic guardrails).
 * - Extracts: jurisdiction + entities + primary/secondary/oversight CC
 * - Uses Severity Engine to force escalation for HIGH/CRITICAL cases
 * - Uses OpenAI if available; falls back to heuristics if not
 *
 * IMPORTANT: This module ONLY builds the authority graph.
 * Petition writing / formatting happens elsewhere.
 */

const fs = require("fs");
const path = require("path");

const { getOpenAI, isOpenAIReady } = require("./openaiClient");
const { analyzeSeverity } = require("./aiSeverity");

// -----------------------------
// Helpers
// -----------------------------
function safeJsonLoad(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function normalize(str = "") {
  return String(str || "").trim();
}

function normLower(str = "") {
  return normalize(str).toLowerCase();
}

function uniqByKey(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr || []) {
    const k = keyFn(item);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function asArray(x) {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

// -----------------------------
// Optional local datasets (do NOT hard-fail if missing)
// -----------------------------
const DATA_DIR = path.join(process.cwd(), "data");

const datasets = {
  banks: safeJsonLoad(path.join(DATA_DIR, "banks.json")),
  bankingRegs: safeJsonLoad(path.join(DATA_DIR, "banking_regulators.json")),
  policeStates: safeJsonLoad(path.join(DATA_DIR, "police_states.json")),
  federal: safeJsonLoad(path.join(DATA_DIR, "federal.json")),
  education: safeJsonLoad(path.join(DATA_DIR, "education.json")),
  health: safeJsonLoad(path.join(DATA_DIR, "health.json")),
  transport: safeJsonLoad(path.join(DATA_DIR, "transport.json")),
  maritime: safeJsonLoad(path.join(DATA_DIR, "maritime.json")),
  aviation: safeJsonLoad(path.join(DATA_DIR, "aviation.json")),
};

// Normalize a dataset structure to a flat list if possible
function flattenDataset(ds) {
  if (!ds) return [];
  if (Array.isArray(ds)) return ds;
  if (typeof ds === "object") {
    // common patterns: { institutions: [...] } OR { items: [...] } OR nested groups
    if (Array.isArray(ds.institutions)) return ds.institutions;
    if (Array.isArray(ds.items)) return ds.items;

    // try shallow flatten
    const out = [];
    for (const k of Object.keys(ds)) {
      if (Array.isArray(ds[k])) out.push(...ds[k]);
    }
    return out;
  }
  return [];
}

function findByNameInDataset(name, ds) {
  const n = normLower(name);
  if (!n) return null;

  const list = flattenDataset(ds);
  if (!list.length) return null;

  // try exact contains match by common fields
  for (const item of list) {
    const cand =
      normLower(item.name) ||
      normLower(item.title) ||
      normLower(item.institution) ||
      normLower(item.agency);
    if (!cand) continue;
    if (cand === n) return item;
  }

  // loose contains
  for (const item of list) {
    const cand =
      normLower(item.name) ||
      normLower(item.title) ||
      normLower(item.institution) ||
      normLower(item.agency);
    if (!cand) continue;
    if (cand.includes(n) || n.includes(cand)) return item;
  }

  return null;
}

// Convert dataset record to a unified entity object used by routing/petition writer
function toEntity(record, fallbackName) {
  if (!record && !fallbackName) return null;

  const name =
    normalize(record?.name) ||
    normalize(record?.title) ||
    normalize(record?.institution) ||
    normalize(record?.agency) ||
    normalize(fallbackName);

  const country = normalize(record?.country) || "Nigeria";
  const address = normalize(record?.address || record?.hq_address || record?.location);
  const email = normalize(record?.email);
  const phone = normalize(record?.phone || record?.telephone);
  const website = normalize(record?.website || record?.url);

  return {
    name,
    country,
    address,
    email,
    phone,
    website,
    // keep raw for debugging (safe)
    source: record ? "dataset" : "inferred",
  };
}

// -----------------------------
// Heuristic extractors (fallback mode)
// -----------------------------
function guessJurisdiction(text) {
  const t = normLower(text);

  // super light heuristic – AI will do better when available
  const nigeriaHints = ["abuja", "lagos", "kubwa", "fct", "nigeria", "kaduna", "kano"];
  const rwandaHints = ["rwanda", "kigali"];
  const usaHints = ["united states", "u.s.", "washington dc", "congress", "house committee"];

  if (rwandaHints.some((k) => t.includes(k))) return { country: "Rwanda" };
  if (usaHints.some((k) => t.includes(k))) return { country: "United States" };
  if (nigeriaHints.some((k) => t.includes(k))) return { country: "Nigeria" };

  return { country: "" };
}

function guessEntities(text) {
  const t = normLower(text);
  const entities = [];

  // Banks: simple pattern capture
  const bankKeywords = [
    "gtbank",
    "guaranty trust bank",
    "access bank",
    "zenith bank",
    "first bank",
    "uba",
    "ecobank",
    "stanbic",
    "fidelity bank",
    "union bank",
    "fcmb",
    "polaris",
    "wema",
    "sterling",
    "keystone",
    "jaiz",
    "providus",
    "suntrust",
    "globus bank",
    "titan trust bank",
  ];

  for (const bk of bankKeywords) {
    if (t.includes(bk)) {
      entities.push({ type: "BANK", name: bk.toUpperCase() });
      break;
    }
  }

  // Police: Nigerian state pattern hints
  if (t.includes("police") || t.includes("officer") || t.includes("officers")) {
    // crude state/city scan
    const states = [
      "abuja",
      "fct",
      "nasarawa",
      "zamfara",
      "kaduna",
      "kano",
      "rivers",
      "enugu",
      "anambra",
      "imo",
      "kwara",
      "plateau",
      "benue",
      "borno",
      "yobe",
      "ogun",
      "oyo",
      "ondo",
      "ekiti",
      "lagos",
      "delta",
      "edo",
      "bayelsa",
      "kogi",
      "bauchi",
      "gombe",
      "taraba",
      "jigawa",
      "katsina",
      "sokoto",
      "kebbi",
      "osun",
      "abia",
      "akwa ibom",
      "cross river",
      "ebonyi",
      "adamawa",
      "niger",
    ];
    for (const s of states) {
      if (t.includes(s)) {
        entities.push({ type: "POLICE_STATE", name: `${s} state police command` });
        break;
      }
    }
    if (!entities.some((e) => e.type === "POLICE_STATE")) {
      entities.push({ type: "POLICE", name: "NIGERIA POLICE FORCE" });
    }
  }

  // Hospital/health
  if (t.includes("hospital") || t.includes("doctor") || t.includes("medical")) {
    // try capture common hospital mention
    if (t.includes("kubwa") && t.includes("hospital")) {
      entities.push({ type: "HOSPITAL", name: "KUBWA GENERAL HOSPITAL" });
    } else {
      entities.push({ type: "HEALTH_FACILITY", name: "PUBLIC HEALTH FACILITY" });
    }
  }

  // Human rights / international bodies – not a “primary” target normally, but helps CC
  if (t.includes("human rights")) {
    entities.push({ type: "THEME", name: "HUMAN RIGHTS" });
  }

  return uniqByKey(entities, (x) => `${x.type}:${normLower(x.name)}`);
}

// -----------------------------
// AI Call
// -----------------------------
async function aiExtract(text) {
  const openai = getOpenAI();
  if (!openai) return null;

  // Works with modern OpenAI SDK patterns; if yours differs, fallback below still works.
  const prompt = `
You are an expert legal routing assistant for petitions/complaints.

TASK:
Given a complaint, extract:
1) jurisdiction: country, state_or_region, city_or_locality
2) entities_identified: list of entities with type + canonical name + any locality hints (branch/city)
   - types examples: BANK, BANK_BRANCH, BANK_HQ, REGULATOR, POLICE_STATE_COMMAND, POLICE_HQ, HOSPITAL, MINISTRY, COMMISSION, EMBASSY/HIGH_COMMISSION
3) authority_graph: primary[], secondary[], oversight_or_cc[]
   - primary: the direct institution responsible for fixing the issue first
   - secondary: escalation path ("Through") e.g. HQ, ministry parent, inspector-general
   - oversight_or_cc: regulators/oversight bodies to copy
4) routing_notes: short reason
5) overall_confidence: 0..1

RULES (VERY IMPORTANT):
- Be specific when possible (branch vs HQ).
- If country is NOT Nigeria, still route to that country's relevant institutions AND include Nigeria embassy/high commission if a Nigerian citizen abroad is involved.
- Do not return "None" for CC when severity is HIGH/CRITICAL; include oversight bodies.
- Output STRICT JSON only (no markdown).

COMPLAINT:
"${text}"
`.trim();

  try {
    // Try responses API shape first
    if (openai.responses && openai.responses.create) {
      const resp = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
      });

      const outText =
        resp.output_text ||
        (Array.isArray(resp.output) ? resp.output.map((o) => o.content?.map((c) => c.text).join("")).join("") : "");

      if (!outText) return null;

      return JSON.parse(outText);
    }

    // Fallback: chat.completions style
    if (openai.chat && openai.chat.completions && openai.chat.completions.create) {
      const resp = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      });

      const outText = resp.choices?.[0]?.message?.content;
      if (!outText) return null;
      return JSON.parse(outText);
    }

    return null;
  } catch (e) {
    return null;
  }
}

// -----------------------------
// Escalation Defaults (Guardrails)
// -----------------------------
function nigeriaBankOversightDefaults() {
  // Regulators to CC for banking issues
  const cbn = toEntity(findByNameInDataset("Central Bank of Nigeria (CBN)", datasets.bankingRegs), "Central Bank of Nigeria (CBN)");
  const ndic = toEntity(findByNameInDataset("Nigeria Deposit Insurance Corporation (NDIC)", datasets.bankingRegs), "Nigeria Deposit Insurance Corporation (NDIC)");
  const ccp = toEntity(findByNameInDataset("Federal Competition and Consumer Protection Commission (FCCPC)", datasets.federal), "Federal Competition and Consumer Protection Commission (FCCPC)");
  return uniqByKey([cbn, ndic, ccp].filter(Boolean), (x) => normLower(x.name));
}

function nigeriaPoliceOversightDefaults() {
  const nhcr = toEntity(findByNameInDataset("National Human Rights Commission (NHRC)", datasets.federal), "National Human Rights Commission (NHRC)");
  const psc = toEntity(findByNameInDataset("Police Service Commission (PSC)", datasets.federal), "Police Service Commission (PSC)");
  return uniqByKey([nhcr, psc].filter(Boolean), (x) => normLower(x.name));
}

function nigeriaHealthOversightDefaults() {
  const fmh = toEntity(findByNameInDataset("Federal Ministry of Health", datasets.health), "Federal Ministry of Health");
  const mfhState = toEntity(findByNameInDataset("State Ministry of Health", datasets.health), "State Ministry of Health");
  const mdc = toEntity(findByNameInDataset("Medical and Dental Council of Nigeria (MDCN)", datasets.health), "Medical and Dental Council of Nigeria (MDCN)");
  return uniqByKey([fmh, mfhState, mdc].filter(Boolean), (x) => normLower(x.name));
}

// Foreign citizen-abroad default CC
function nigeriaMissionInCountry(countryName = "") {
  const c = normalize(countryName);
  if (!c) return null;
  return {
    name: `Nigerian High Commission / Embassy in ${c}`,
    country: c,
    address: "",
    email: "",
    phone: "",
    website: "",
    source: "inferred",
  };
}

// -----------------------------
// Build authority graph (entity-first)
// -----------------------------
function buildGraphFromEntities(entities, jurisdiction, severityInfo) {
  const primary = [];
  const secondary = [];
  let oversight_or_cc = [];

  const tEntities = entities || [];

  const hasBank = tEntities.some((e) => e.type === "BANK" || e.type === "BANK_BRANCH");
  const hasPolice = tEntities.some((e) => String(e.type).includes("POLICE"));
  const hasHospital = tEntities.some((e) => e.type === "HOSPITAL" || e.type === "HEALTH_FACILITY");

  // -------------------
  // BANK ROUTING
  // -------------------
  if (hasBank) {
    const bank = tEntities.find((e) => e.type === "BANK_BRANCH") || tEntities.find((e) => e.type === "BANK");
    if (bank) primary.push(toEntity(null, bank.name));

    // Through: HQ (if available)
    secondary.push(toEntity(null, `${bank?.name || "BANK"} HEAD OFFICE`));

    // Oversight CC: regulators
    if (jurisdiction?.country === "Nigeria" || !jurisdiction?.country) {
      oversight_or_cc = oversight_or_cc.concat(nigeriaBankOversightDefaults());
    }
  }

  // -------------------
  // POLICE ROUTING
  // -------------------
  if (hasPolice) {
    const stateCmd = tEntities.find((e) => e.type === "POLICE_STATE_COMMAND") || tEntities.find((e) => e.type === "POLICE_STATE");
    if (stateCmd) {
      primary.push(toEntity(null, stateCmd.name));
    } else {
      primary.push(toEntity(null, "NIGERIA POLICE FORCE"));
    }

    // Through: IGP
    secondary.push(
      toEntity(null, "Inspector-General of Police (IGP), Nigeria Police Force, Force Headquarters, Louis Edet House, Abuja, Nigeria")
    );

    // Oversight CC: NHRC, PSC
    if (jurisdiction?.country === "Nigeria" || !jurisdiction?.country) {
      oversight_or_cc = oversight_or_cc.concat(nigeriaPoliceOversightDefaults());
    }

    // Foreign country police scenario: add Nigeria mission CC
    if (jurisdiction?.country && jurisdiction.country !== "Nigeria") {
      oversight_or_cc.push(nigeriaMissionInCountry(jurisdiction.country));
    }
  }

  // -------------------
  // HEALTH ROUTING
  // -------------------
  if (hasHospital) {
    const hosp = tEntities.find((e) => e.type === "HOSPITAL") || tEntities.find((e) => e.type === "HEALTH_FACILITY");
    if (hosp) primary.push(toEntity(null, hosp.name));

    // Through: Ministry of Health (default)
    if (jurisdiction?.country === "Nigeria" || !jurisdiction?.country) {
      secondary.push(toEntity(null, "Federal Ministry of Health"));
      oversight_or_cc = oversight_or_cc.concat(nigeriaHealthOversightDefaults());
    } else {
      secondary.push(toEntity(null, `Ministry of Health, ${jurisdiction.country}`));
      oversight_or_cc.push(nigeriaMissionInCountry(jurisdiction.country));
    }
  }

  // -------------------
  // SEVERITY GUARDRAILS
  // -------------------
  // If severity HIGH/CRITICAL, we must not leave CC empty.
  if ((severityInfo?.severity_level === "HIGH" || severityInfo?.severity_level === "CRITICAL") && oversight_or_cc.length === 0) {
    // General human rights oversight fallback
    if (jurisdiction?.country === "Nigeria" || !jurisdiction?.country) {
      oversight_or_cc.push(toEntity(null, "National Human Rights Commission (NHRC)"));
      oversight_or_cc.push(toEntity(null, "Public Complaints Commission (PCC)"));
    } else {
      oversight_or_cc.push(nigeriaMissionInCountry(jurisdiction.country));
    }
  }

  return {
    primary: uniqByKey(primary.filter(Boolean), (x) => normLower(x.name)),
    secondary: uniqByKey(secondary.filter(Boolean), (x) => normLower(x.name)),
    oversight_or_cc: uniqByKey(oversight_or_cc.filter(Boolean), (x) => normLower(x.name)),
  };
}

// -----------------------------
// Public API: getAuthorityGraph(text)
// -----------------------------
async function getAuthorityGraph(description = "") {
  const text = normalize(description);

  // 1) Basic jurisdiction + entities (fallback)
  let jurisdiction = guessJurisdiction(text);
  let entities_identified = guessEntities(text);

  // 2) Severity (must happen early)
  const severity = analyzeSeverity(text, { jurisdiction });

  // 3) AI enrichment if available
  let ai = null;
  if (isOpenAIReady()) {
    ai = await aiExtract(text);
  }

  if (ai && typeof ai === "object") {
    // Merge AI jurisdiction if it is better
    const aiJur = ai.jurisdiction || {};
    jurisdiction = {
      country: normalize(aiJur.country) || jurisdiction.country || "",
      state_or_region: normalize(aiJur.state_or_region) || "",
      city_or_locality: normalize(aiJur.city_or_locality) || "",
    };

    // Merge entities with fallback entities
    const aiEnt = Array.isArray(ai.entities_identified) ? ai.entities_identified : [];
    const merged = [];

    for (const e of aiEnt) {
      if (!e) continue;
      merged.push({
        type: normalize(e.type) || "ENTITY",
        name: normalize(e.name) || "",
        locality: normalize(e.locality) || "",
      });
    }

    for (const e of entities_identified) {
      merged.push({
        type: normalize(e.type) || "ENTITY",
        name: normalize(e.name) || "",
        locality: normalize(e.locality) || "",
      });
    }

    entities_identified = uniqByKey(
      merged.filter((x) => x.name),
      (x) => `${normLower(x.type)}:${normLower(x.name)}:${normLower(x.locality)}`
    );

    // If AI provided authority graph, take it BUT still enforce severity guardrails
    if (ai.authority_graph) {
      const ag = ai.authority_graph;

      const primary = asArray(ag.primary).map((x) => (typeof x === "string" ? toEntity(null, x) : toEntity(x, x?.name)));
      const secondary = asArray(ag.secondary).map((x) => (typeof x === "string" ? toEntity(null, x) : toEntity(x, x?.name)));
      const oversight = asArray(ag.oversight_or_cc).map((x) =>
        typeof x === "string" ? toEntity(null, x) : toEntity(x, x?.name)
      );

      const forced = buildGraphFromEntities(entities_identified, jurisdiction, severity);

      const authority_graph = {
        primary: uniqByKey(primary.concat(forced.primary).filter(Boolean), (x) => normLower(x.name)),
        secondary: uniqByKey(secondary.concat(forced.secondary).filter(Boolean), (x) => normLower(x.name)),
        oversight_or_cc: uniqByKey(oversight.concat(forced.oversight_or_cc).filter(Boolean), (x) => normLower(x.name)),
      };

      const overall_confidence = clamp(Number(ai.overall_confidence ?? 0.7), 0, 1);

      return {
        jurisdiction,
        entities_identified,
        severity,
        authority_graph,
        routing_notes: normalize(ai.routing_notes) || "AI-extracted authority graph + severity-enforced escalation.",
        overall_confidence,
      };
    }
  }

  // 4) Fallback build graph deterministically
  const authority_graph = buildGraphFromEntities(entities_identified, jurisdiction, severity);

  // Confidence: lower in fallback mode
  const overall_confidence = isOpenAIReady() ? 0.75 : 0.45;

  const routing_notes = isOpenAIReady()
    ? "AI available but returned no usable structured routing; used deterministic entity-first fallback + severity guardrails."
    : "OpenAI not available; used deterministic entity-first fallback + severity guardrails.";

  return {
    jurisdiction,
    entities_identified,
    severity,
    authority_graph,
    routing_notes,
    overall_confidence,
  };
}

module.exports = {
  getAuthorityGraph,
};
