"use strict";

/**
 * core/aiAuthorityGraph.js
 * Entity-first Authority Graph Builder (PDPS 2.6+)
 *
 * Goals:
 * - Extract explicit entities (orgs, regulators, locations, people/roles) FIRST
 * - Resolve jurisdiction (country/state/city/locality)
 * - Build an authority graph: primary / secondary / oversight_or_cc
 * - Add STRATEGIC escalation CC list using AI (not static rules)
 * - Never crash: always return a stable object with confidence score
 *
 * Works in:
 * - OpenAI mode (Render): uses OpenAI for extraction + escalation recommendations
 * - Fallback mode (local/no key): heuristic extraction + dataset mapping
 */

const fs = require("fs");
const path = require("path");

// OpenAI client wrapper you already have
const { getOpenAI, isOpenAIReady } = require("./openaiClient");

// --------------------------------------------------
// Utilities
// --------------------------------------------------

function safeStr(x) {
  return String(x || "").trim();
}

function lc(x) {
  return safeStr(x).toLowerCase();
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(arr) ? arr : []) {
    const k = keyFn(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function clamp(n, a, b) {
  n = Number(n);
  if (Number.isNaN(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function loadJsonIfExists(relPath, fallback) {
  try {
    const p = path.join(__dirname, "..", "data", relPath);
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function normalizeInstShape(x) {
  if (!x || typeof x !== "object") return null;
  const org = safeStr(x.org || x.name || "");
  if (!org) return null;
  return {
    id: safeStr(x.id || ""),
    org,
    title: safeStr(x.title || x.role || org),
    email: safeStr(x.email || ""),
    address: safeStr(x.address || x.location || "Nigeria"),
    category: safeStr(x.category || x.type || ""),
    state: safeStr(x.state || ""),
    country: safeStr(x.country || ""),
    reason: safeStr(x.reason || ""), // optional (for CC recommendations)
  };
}

function makeResultSkeleton() {
  return {
    jurisdiction: {
      country: "",
      state_or_region: "",
      city_or_locality: "",
    },
    entities_identified: [], // [{type, name, context}]
    authority_graph: {
      primary: [], // array of normalized inst-like objects
      secondary: [],
      oversight_or_cc: [],
    },
    routing_notes: "",
    overall_confidence: 0,
  };
}

// --------------------------------------------------
// Minimal datasets (for mapping/validation/fallback)
// --------------------------------------------------

const BANKS = loadJsonIfExists("banks.json", { banks: [] }).banks || [];
const BANKING_REGS = loadJsonIfExists("banking_regulators.json", { regulators: [] }).regulators || [];
const POLICE_STATES = loadJsonIfExists("police_states.json", { police_states: [] }).police_states || [];
const FEDERAL = loadJsonIfExists("federal.json", { institutions: [] }).institutions || [];

// Create a bank name index
const bankNameIndex = (() => {
  const idx = [];
  for (const b of BANKS) {
    const name = safeStr(b.name);
    if (!name) continue;
    idx.push({
      id: safeStr(b.id || ""),
      name,
      key: lc(name)
        .replace(/\(.*?\)/g, "")
        .replace(/plc|ltd|limited|bank|nigeria/gi, "")
        .replace(/\s+/g, " ")
        .trim(),
    });
    // also index short forms like GTB/GTBank, UBA, etc.
    const short = name.match(/\(([^)]+)\)/);
    if (short && short[1]) {
      idx.push({
        id: safeStr(b.id || ""),
        name,
        key: lc(short[1]).replace(/\s+/g, " ").trim(),
      });
    }
  }
  return idx;
})();

function findBankInText(text) {
  const t = lc(text);
  // look for explicit keyword patterns first
  // Example: "gtbank kubwa branch"
  let best = null;

  for (const item of bankNameIndex) {
    if (!item.key) continue;
    if (item.key.length < 3) continue;
    if (t.includes(item.key)) {
      // prefer longer keys (more specific)
      if (!best || item.key.length > best.key.length) best = item;
    }
  }

  // additional alias checks
  const aliasMap = [
    { alias: "gtb", key: "gtb" },
    { alias: "gtbank", key: "gtbank" },
    { alias: "guaranty trust", key: "guaranty trust" },
    { alias: "uba", key: "uba" },
    { alias: "access", key: "access" },
    { alias: "zenith", key: "zenith" },
    { alias: "firstbank", key: "firstbank" },
    { alias: "ecobank", key: "ecobank" },
    { alias: "stanbic", key: "stanbic" },
    { alias: "fidelity", key: "fidelity" },
    { alias: "polaris", key: "polaris" },
    { alias: "keystone", key: "keystone" },
    { alias: "wema", key: "wema" },
    { alias: "heritage", key: "heritage" },
    { alias: "providus", key: "providus" },
    { alias: "jaiz", key: "jaiz" },
    { alias: "taj", key: "taj" },
    { alias: "suntrust", key: "suntrust" },
  ];

  if (!best) {
    for (const a of aliasMap) {
      if (t.includes(a.alias)) {
        // find bank index with same alias as key
        const cand = bankNameIndex.find((x) => x.key === a.key);
        if (cand) {
          best = cand;
          break;
        }
      }
    }
  }

  return best ? best.name : "";
}

function detectNigerianState(text) {
  const t = lc(text);
  const states = Array.isArray(POLICE_STATES) ? POLICE_STATES : [];
  // Prefer explicit "<state> state" patterns
  let best = "";
  for (const s of states) {
    const st = safeStr(s);
    if (!st) continue;
    const key = lc(st);
    if (t.includes(key + " state")) return st;
    if (t.includes("state of " + key)) return st;
    if (t.includes(key)) {
      // avoid false positives: use length weighting
      if (!best || key.length > lc(best).length) best = st;
    }
  }
  return best;
}

function detectCityLocality(text) {
  // very light heuristic: if user wrote "kubwa", "keffi", etc.
  // AI will do the real work; this is fallback only.
  const t = lc(text);
  const known = [
    "kubwa",
    "gwarimpa",
    "keffi",
    "asaba",
    "gusau",
    "lafia",
    "lokoja",
    "yenagoa",
    "owerri",
    "onitsha",
    "aba",
    "ibadan",
    "ikeja",
    "surulere",
    "ajegunle",
    "lekki",
    "yaba",
    "kaduna",
    "jos",
    "makurdi",
    "minna",
    "ilorin",
    "awka",
    "enugu",
    "maiduguri",
    "yola",
    "jalingo",
    "sokoto",
    "birnin kebbi",
    "abeokuta",
    "osogbo",
    "akure",
    "uyo",
    "calabar",
    "port harcourt",
  ];
  for (const c of known) {
    if (t.includes(c)) return c.replace(/\b\w/g, (m) => m.toUpperCase());
  }
  return "";
}

// --------------------------------------------------
// OpenAI JSON call (strict)
// --------------------------------------------------

async function callOpenAIJson({ model, system, user, temperature = 0.2, max_tokens = 800 }) {
  const client = typeof getOpenAI === "function" ? getOpenAI() : null;
  if (!client) return null;

  // Support both SDK styles safely
  // openai v4: client.chat.completions.create(...)
  try {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_tokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const content = resp?.choices?.[0]?.message?.content || "";
    if (!content) return null;

    try {
      return JSON.parse(content);
    } catch (e) {
      // sometimes model returns text around JSON, try to extract first {...}
      const m = content.match(/\{[\s\S]*\}/);
      if (m) {
        return JSON.parse(m[0]);
      }
      return null;
    }
  } catch (e) {
    return null;
  }
}

// --------------------------------------------------
// AI prompts (Entity-first + Escalation strategist)
// --------------------------------------------------

function buildExtractionPrompt(description, userAddress) {
  const d = safeStr(description);
  const a = safeStr(userAddress);

  return `
You are PetitionDesk's routing brain. Extract entities and jurisdiction FIRST.

Return ONLY valid JSON.

Task:
1) Detect jurisdiction: country, state_or_region, city_or_locality (best guess)
2) Identify entities in the complaint (banks, police commands, ministries, companies, regulators, courts, committees, embassies, etc.)
3) Propose authority graph nodes:
   - primary_targets: who the petition should be addressed to FIRST (the most directly responsible authority)
   - secondary_targets: "through" or escalation within same system (HQ, parent org, supervising ministry)
4) Provide notes + confidence (0-1)

Rules:
- Prefer concrete named bodies. If user mentions a bank branch, primary is the bank branch manager and secondary is bank head office.
- If police rights violation in a Nigerian state/city, primary is "<State> State Police Command" (or "FCT Police Command") and secondary is "Inspector-General of Police".
- If international target is explicitly requested (e.g., "US House Committee on Foreign Affairs"), include it as a primary target with country = USA.
- Do NOT invent emails/addresses. You may leave them blank.

JSON schema:
{
  "jurisdiction": {"country":"","state_or_region":"","city_or_locality":""},
  "entities": [{"type":"org|person|place|role","name":"","context":""}],
  "primary_targets": [{"org":"","title":"","country":"","state":"","address":"","category":""}],
  "secondary_targets": [{"org":"","title":"","country":"","state":"","address":"","category":""}],
  "notes": "",
  "confidence": 0.0
}

Complaint:
${d}

User address (may be empty):
${a}
`.trim();
}

function buildEscalationPrompt(description, jurisdiction, primaryTargets, secondaryTargets) {
  const d = safeStr(description);
  const j = jurisdiction || {};
  const p = Array.isArray(primaryTargets) ? primaryTargets : [];
  const s = Array.isArray(secondaryTargets) ? secondaryTargets : [];

  return `
You are PetitionDesk's escalation strategist.

Goal:
Recommend the BEST oversight / CC institutions to copy for maximum accountability.

Return ONLY valid JSON.

Inputs:
- Complaint
- Jurisdiction
- Primary targets (directly addressed)
- Secondary targets (through/escalation)

Rules:
- Recommend 2 to 7 oversight bodies.
- Avoid duplicates and avoid copying the same primary target again.
- Think "who can discipline, investigate, regulate, or sanction?"
- For banking issues in Nigeria: consider CBN, NDIC, Consumer Protection (FCCPC) where relevant.
- For police abuse in Nigeria: consider Police Service Commission, National Human Rights Commission, relevant state government security/justice authorities where appropriate.
- For urban planning/zoning in FCT: consider FCDA/FCTA departments + enforcement agencies, and optionally NHRC if rights/safety issues exist.
- For international human rights petitions: consider UN OHCHR, AU, ECOWAS, relevant embassies/foreign offices depending on context.
- Do NOT invent emails/addresses. Names only are fine.

JSON schema:
{
  "recommended_cc": [
    {"name":"","reason":"","country":"","state_or_region":""}
  ],
  "confidence": 0.0,
  "notes":""
}

Jurisdiction:
${JSON.stringify(j, null, 2)}

Primary targets:
${JSON.stringify(p, null, 2)}

Secondary targets:
${JSON.stringify(s, null, 2)}

Complaint:
${d}
`.trim();
}

// --------------------------------------------------
// Mapping CC names to known/standard orgs (light normalization)
// --------------------------------------------------

function mapCCNameToInstitution(name, jurisdiction) {
  const n = safeStr(name);
  const key = lc(n);

  // Common Nigeria mappings
  if (key.includes("central bank") || key === "cbn") {
    return normalizeInstShape({
      org: "Central Bank of Nigeria (CBN)",
      title: "The Governor",
      address: "Nigeria",
      country: "Nigeria",
      category: "regulator",
    });
  }
  if (key.includes("deposit insurance") || key.includes("ndic")) {
    return normalizeInstShape({
      org: "Nigeria Deposit Insurance Corporation (NDIC)",
      title: "The Managing Director/Chief Executive",
      address: "Nigeria",
      country: "Nigeria",
      category: "regulator",
    });
  }
  if (key.includes("fccpc") || key.includes("consumer protection")) {
    return normalizeInstShape({
      org: "Federal Competition and Consumer Protection Commission (FCCPC)",
      title: "The Executive Vice Chairman/Chief Executive Officer",
      address: "Nigeria",
      country: "Nigeria",
      category: "regulator",
    });
  }
  if (key.includes("police service commission") || key.includes("psc")) {
    return normalizeInstShape({
      org: "Police Service Commission (PSC)",
      title: "The Chairman",
      address: "Nigeria",
      country: "Nigeria",
      category: "oversight",
    });
  }
  if (key.includes("national human rights commission") || key.includes("nhrc")) {
    return normalizeInstShape({
      org: "National Human Rights Commission (NHRC)",
      title: "The Executive Secretary",
      address: "Nigeria",
      country: "Nigeria",
      category: "oversight",
    });
  }

  // If it's already a specific committee/agency, keep it as a generic institution
  // (Global support: we allow unknown names but keep them clean)
  const j = jurisdiction || {};
  return normalizeInstShape({
    org: n,
    title: n,
    address: safeStr(j.country || "Nigeria"),
    country: safeStr(j.country || ""),
    category: "oversight",
  });
}

// --------------------------------------------------
// Fallback authority graph (when OpenAI not available)
// --------------------------------------------------

function fallbackAuthorityGraph(description, userAddress) {
  const out = makeResultSkeleton();
  const text = `${safeStr(description)}\n${safeStr(userAddress)}`;

  // jurisdiction guess
  const state = detectNigerianState(text);
  const city = detectCityLocality(text);

  out.jurisdiction.country = "Nigeria";
  out.jurisdiction.state_or_region = state || "";
  out.jurisdiction.city_or_locality = city || "";

  // entity detection (bank/police)
  const bank = findBankInText(text);
  const mentionsPolice = /\bpolice\b|\bigp\b|\binspector[- ]general\b/i.test(text);

  if (bank) {
    out.entities_identified.push({ type: "org", name: bank, context: "bank" });
    // primary (branch manager if branch mentioned)
    const branch = /\bbranch\b/i.test(text) ? "Branch Manager" : "Customer Care / Complaints Unit";
    const locStr = [city, state ? `${state} State` : "", "Nigeria"].filter(Boolean).join(", ");

    out.authority_graph.primary.push(
      normalizeInstShape({
        org: bank,
        title: branch,
        address: locStr || "Nigeria",
        country: "Nigeria",
        category: "bank",
        state,
      })
    );

    out.authority_graph.secondary.push(
      normalizeInstShape({
        org: `${bank} Head Office`,
        title: `${bank} Head Office`,
        address: "Nigeria",
        country: "Nigeria",
        category: "bank",
      })
    );

    // default CC suggestions (fallback)
    out.authority_graph.oversight_or_cc.push(mapCCNameToInstitution("Central Bank of Nigeria (CBN)", out.jurisdiction));
    out.authority_graph.oversight_or_cc.push(mapCCNameToInstitution("Nigeria Deposit Insurance Corporation (NDIC)", out.jurisdiction));

    out.routing_notes = "Fallback mode: bank detected, built branch->HQ->CBN/NDIC.";
    out.overall_confidence = 0.62;
    return out;
  }

  if (mentionsPolice) {
    out.entities_identified.push({ type: "org", name: "Nigeria Police Force", context: "police" });

    const stateName = state || "Nigeria";
    const command = state
      ? `${state} State Police Command`
      : "Nigeria Police Force Command";

    out.authority_graph.primary.push(
      normalizeInstShape({
        org: command,
        title: state ? "Commissioner of Police" : command,
        address: "Nigeria",
        country: "Nigeria",
        category: "police",
        state,
      })
    );

    out.authority_graph.secondary.push(
      normalizeInstShape({
        org: "Inspector-General of Police, Nigeria Police Force",
        title: "The Inspector-General of Police",
        address: "Force Headquarters, Louis Edet House, Abuja, Nigeria",
        country: "Nigeria",
        category: "police",
      })
    );

    // Oversight
    out.authority_graph.oversight_or_cc.push(mapCCNameToInstitution("Police Service Commission (PSC)", out.jurisdiction));
    out.authority_graph.oversight_or_cc.push(mapCCNameToInstitution("National Human Rights Commission (NHRC)", out.jurisdiction));

    out.routing_notes = `Fallback mode: police detected, primary=${command}, secondary=IGP, CC=PSC+NHRC.`;
    out.overall_confidence = 0.66;
    return out;
  }

  // default fallback: PCC (Nigeria)
  out.authority_graph.primary.push(
    normalizeInstShape({
      org: "Public Complaints Commission",
      title: "The Honourable Chief Commissioner",
      address: "Nigeria",
      country: "Nigeria",
      category: "government",
    })
  );

  out.routing_notes = "Fallback mode: no strong entity detected; defaulted to PCC.";
  out.overall_confidence = 0.45;
  return out;
}

// --------------------------------------------------
// MAIN: getAuthorityGraph
// --------------------------------------------------

async function getAuthorityGraph(description, userAddress = "") {
  const out = makeResultSkeleton();
  const desc = safeStr(description);
  const addr = safeStr(userAddress);

  if (!desc) {
    out.routing_notes = "Empty complaint text.";
    out.overall_confidence = 0;
    return out;
  }

  // If OpenAI isn't ready (locally), return fallback graph
  const openaiOk = typeof isOpenAIReady === "function" ? isOpenAIReady() : false;
  if (!openaiOk) {
    return fallbackAuthorityGraph(desc, addr);
  }

  // 1) Extraction pass (entities + jurisdiction + primary/secondary)
  const extractionSystem = `You are a precise JSON extraction engine. Return JSON only.`;
  const extractionUser = buildExtractionPrompt(desc, addr);

  const extraction = await callOpenAIJson({
    model: process.env.OPENAI_MODEL_ROUTING || "gpt-4.1-mini",
    system: extractionSystem,
    user: extractionUser,
    temperature: 0.15,
    max_tokens: 900,
  });

  if (!extraction || typeof extraction !== "object") {
    // If OpenAI fails unexpectedly, fallback safely
    return fallbackAuthorityGraph(desc, addr);
  }

  // Fill base fields
  const j = extraction.jurisdiction || {};
  out.jurisdiction = {
    country: safeStr(j.country || ""),
    state_or_region: safeStr(j.state_or_region || ""),
    city_or_locality: safeStr(j.city_or_locality || ""),
  };

  // entities
  out.entities_identified = Array.isArray(extraction.entities)
    ? extraction.entities
        .filter((e) => e && typeof e === "object")
        .map((e) => ({
          type: safeStr(e.type || "org"),
          name: safeStr(e.name || ""),
          context: safeStr(e.context || ""),
        }))
        .filter((e) => e.name)
    : [];

  // primary/secondary targets
  const primaryTargets = Array.isArray(extraction.primary_targets) ? extraction.primary_targets : [];
  const secondaryTargets = Array.isArray(extraction.secondary_targets) ? extraction.secondary_targets : [];

  out.authority_graph.primary = uniqBy(
    primaryTargets.map(normalizeInstShape).filter(Boolean),
    (x) => lc(x.org)
  );

  out.authority_graph.secondary = uniqBy(
    secondaryTargets.map(normalizeInstShape).filter(Boolean),
    (x) => lc(x.org)
  );

  out.routing_notes = safeStr(extraction.notes || "");

  let baseConf = clamp(extraction.confidence, 0, 1);

  // 2) Escalation pass (strategic CC recommendations)
  const escalationSystem = `You recommend oversight bodies to CC. Return JSON only.`;
  const escalationUser = buildEscalationPrompt(desc, out.jurisdiction, out.authority_graph.primary, out.authority_graph.secondary);

  const escalation = await callOpenAIJson({
    model: process.env.OPENAI_MODEL_ESCALATION || "gpt-4.1-mini",
    system: escalationSystem,
    user: escalationUser,
    temperature: 0.25,
    max_tokens: 700,
  });

  let cc = [];
  if (escalation && typeof escalation === "object") {
    const rec = Array.isArray(escalation.recommended_cc) ? escalation.recommended_cc : [];
    cc = rec
      .map((r) => {
        const inst = mapCCNameToInstitution(r?.name, out.jurisdiction);
        if (!inst) return null;
        inst.reason = safeStr(r?.reason || "");
        // If AI provided country/state, keep it if present
        const ctry = safeStr(r?.country || "");
        const st = safeStr(r?.state_or_region || "");
        if (ctry && !inst.country) inst.country = ctry;
        if (st && !inst.state) inst.state = st;
        return inst;
      })
      .filter(Boolean);

    // Add escalation confidence influence
    const escConf = clamp(escalation.confidence, 0, 1);
    baseConf = clamp((baseConf * 0.7) + (escConf * 0.3), 0, 1);

    if (safeStr(escalation.notes)) {
      out.routing_notes = (out.routing_notes ? out.routing_notes + " | " : "") + safeStr(escalation.notes);
    }
  }

  // 3) Enforce non-empty CC in high-impact categories (WITHOUT hardcoding WHO)
  // If AI gave none, we add minimal safe oversight suggestions based on detected context.
  const textAll = lc(desc + " " + addr);
  const looksBank = /\bbank\b|\btransfer\b|\breversal\b|\bchargeback\b|\bpos\b|\bussd\b/i.test(textAll) || !!findBankInText(textAll);
  const looksPolice = /\bpolice\b|\bdetain\b|\barrest\b|\btorture\b|\bextortion\b|\brights\b/i.test(textAll);
  const looksRights = /\bhuman rights\b|\babuse\b|\bviolation\b|\btorture\b|\bextrajudicial\b/i.test(textAll);

  // Deduplicate CC and ensure it doesn't repeat primary/secondary
  const primaryOrgs = new Set(out.authority_graph.primary.map((x) => lc(x.org)));
  const secondaryOrgs = new Set(out.authority_graph.secondary.map((x) => lc(x.org)));

  cc = uniqBy(cc, (x) => lc(x.org)).filter((x) => !primaryOrgs.has(lc(x.org)) && !secondaryOrgs.has(lc(x.org)));

  if (cc.length === 0) {
    if (looksBank && lc(out.jurisdiction.country || "") === "nigeria") {
      cc.push(mapCCNameToInstitution("Central Bank of Nigeria (CBN)", out.jurisdiction));
      cc.push(mapCCNameToInstitution("Nigeria Deposit Insurance Corporation (NDIC)", out.jurisdiction));
      baseConf = clamp(baseConf - 0.05, 0, 1);
      out.routing_notes = (out.routing_notes ? out.routing_notes + " | " : "") + "AI returned no CC; applied minimal banking oversight CC.";
    } else if (looksPolice && lc(out.jurisdiction.country || "") === "nigeria") {
      cc.push(mapCCNameToInstitution("Police Service Commission (PSC)", out.jurisdiction));
      cc.push(mapCCNameToInstitution("National Human Rights Commission (NHRC)", out.jurisdiction));
      baseConf = clamp(baseConf - 0.05, 0, 1);
      out.routing_notes = (out.routing_notes ? out.routing_notes + " | " : "") + "AI returned no CC; applied minimal police oversight CC.";
    } else if (looksRights) {
      // global rights safety net (names only, no fake contacts)
      cc.push(mapCCNameToInstitution("Office of the United Nations High Commissioner for Human Rights (OHCHR)", out.jurisdiction));
      cc.push(mapCCNameToInstitution("Amnesty International", out.jurisdiction));
      baseConf = clamp(baseConf - 0.08, 0, 1);
      out.routing_notes = (out.routing_notes ? out.routing_notes + " | " : "") + "AI returned no CC; applied minimal global human-rights CC.";
    }
  }

  out.authority_graph.oversight_or_cc = cc;

  // 4) Final confidence + sanity checks
  const hasPrimary = out.authority_graph.primary.length > 0;
  if (!hasPrimary) {
    // If AI failed to select primary, drop to fallback
    const fb = fallbackAuthorityGraph(desc, addr);
    fb.routing_notes = (out.routing_notes ? out.routing_notes + " | " : "") + "AI had no primary; fallback applied.";
    return fb;
  }

  out.overall_confidence = clamp(baseConf, 0, 1);

  return out;
}

module.exports = {
  getAuthorityGraph,
};
