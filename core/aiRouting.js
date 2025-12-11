// core/aiRouting.js
// PDPS-3.0 – Intelligent Routing Engine (Conservative International Escalation)

const fs = require("fs");
const path = require("path");
const { getOpenAIClient } = require("./openaiClient");

// --------------------------------------------------------------
// LOAD institutions.json
// --------------------------------------------------------------
let INSTITUTIONS = {};
try {
  const filePath = path.join(__dirname, "..", "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS = JSON.parse(raw);
  console.log("[aiRouting] institutions.json loaded");
} catch (err) {
  console.error("[aiRouting] Failed to load institutions.json:", err);
  INSTITUTIONS = {};
}

// Small helpers
function textIncludesAny(text, arr) {
  const t = (text || "").toLowerCase();
  return arr.some((w) => t.includes(w.toLowerCase()));
}

function normaliseOrgName(name) {
  return (name || "").trim().toLowerCase();
}

function dedupeByOrg(list) {
  const out = [];
  const seen = new Set();
  (list || []).forEach((item) => {
    if (!item || !item.org) return;
    const key = normaliseOrgName(item.org);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({
      org: item.org,
      title: item.title || "",
      email: item.email || "",
      address: item.address || "",
    });
  });
  return out;
}

// --------------------------------------------------------------
// ELECTRICITY ROUTING (DISCO + NERC)
// --------------------------------------------------------------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();

  const electricTriggers = [
    "electricity",
    "light",
    "power",
    "disco",
    "distribution company",
    "meter",
    "prepaid",
    "token",
    "overbilling",
    "over billing",
    "billing",
    "transformer",
    "load shedding",
  ];

  if (!textIncludesAny(d, electricTriggers)) return null;

  const elecData =
    (INSTITUTIONS.sectors && INSTITUTIONS.sectors.electricity) ||
    INSTITUTIONS.electricity ||
    {};

  const discos = elecData.discos || [];
  const regulator = elecData.regulator || null;

  // Try to detect specific Disco by name or state/area keywords
  let primary = null;

  // 1) Direct mention of Disco name
  for (const dis of discos) {
    if (
      textIncludesAny(d, [dis.short_name, dis.org]) ||
      (dis.aliases && textIncludesAny(d, dis.aliases))
    ) {
      primary = {
        org: dis.org,
        title: dis.title || "",
        email: dis.email || "",
        address: dis.address || "",
      };
      break;
    }
  }

  // 2) If still not found, try matching by state coverage
  if (!primary) {
    for (const dis of discos) {
      const states = dis.states || [];
      if (states.length && textIncludesAny(d, states)) {
        primary = {
          org: dis.org,
          title: dis.title || "",
          email: dis.email || "",
          address: dis.address || "",
        };
        break;
      }
    }
  }

  // 3) Fallback: generic Disco if nothing clearly matched
  if (!primary) {
    const fallback = discos[0];
    if (fallback) {
      primary = {
        org: fallback.org,
        title: fallback.title || "",
        email: fallback.email || "",
        address: fallback.address || "",
      };
    } else {
      primary = {
        org: "Electricity Distribution Company",
        title: "",
        email: "",
        address: "",
      };
    }
  }

  // Through: NERC if present
  let through = null;
  if (regulator && regulator.org) {
    through = {
      org: regulator.org,
      title: regulator.title || "",
      email: regulator.email || "",
      address: regulator.address || "",
    };
  }

  return {
    primary,
    through,
    ccList: [],
  };
}

// --------------------------------------------------------------
// CONSERVATIVE INTERNATIONAL ESCALATION
// (Genocide, mass atrocities, systemic torture, etc.)
// --------------------------------------------------------------
function detectInternational(description) {
  const d = (description || "").toLowerCase();

  // Strong triggers – only very serious issues
  const atrocityTriggers = [
    "genocide",
    "ethnic cleansing",
    "war crime",
    "war crimes",
    "crimes against humanity",
    "mass killing",
    "massacre",
    "systematic torture",
    "extra judicial killing",
    "extrajudicial killing",
    "political prisoner",
    "forced disappearance",
    "enforced disappearance",
    "state-sponsored violence",
    "state sponsored violence",
    "religious persecution",
    "ethnic persecution",
  ];

  // Must also be clearly human-rights / state actor related
  const stateActorHints = [
    "military",
    "army",
    "police",
    "security forces",
    "state agents",
    "government forces",
    "paramilitary",
    "secret police",
    "intelligence service",
  ];

  if (!textIncludesAny(d, atrocityTriggers)) return null;
  if (!textIncludesAny(d, stateActorHints)) return null;

  const intl = INSTITUTIONS.international || {};

  // Strong global primary: e.g. UN Human Rights or US House FA Committee
  const primarySource =
    intl.un_human_rights ||
    intl.us_house_foreign_affairs ||
    intl.eu_parliament_droi ||
    intl.au_commission ||
    {};

  const primary = {
    org:
      primarySource.org ||
      primarySource.name ||
      "United Nations Human Rights Mechanism",
    title: primarySource.title || "",
    email: primarySource.email || "",
    address:
      primarySource.address ||
      "Office of the High Commissioner for Human Rights, Geneva, Switzerland",
  };

  // Through: Federal Ministry of Justice (AGF) – to be diplomatic
  const through = {
    org: "Attorney General of the Federation, Federal Ministry of Justice",
    title: "Attorney General of the Federation",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
  };

  // Conservative CCs – a few key bodies
  const ccListRaw = [];

  if (intl.us_house_foreign_affairs) {
    ccListRaw.push({
      org: intl.us_house_foreign_affairs.name || "US House Foreign Affairs Committee",
      title: intl.us_house_foreign_affairs.title || "",
      email: intl.us_house_foreign_affairs.email || "",
      address: intl.us_house_foreign_affairs.address || "",
    });
  }

  if (intl.us_senate_foreign_relations) {
    ccListRaw.push({
      org:
        intl.us_senate_foreign_relations.name ||
        "US Senate Foreign Relations Committee",
      title: intl.us_senate_foreign_relations.title || "",
      email: intl.us_senate_foreign_relations.email || "",
      address: intl.us_senate_foreign_relations.address || "",
    });
  }

  if (intl.uk_parliament) {
    ccListRaw.push({
      org: intl.uk_parliament.name || "UK Parliament Committees",
      title: intl.uk_parliament.title || "",
      email: intl.uk_parliament.email || "",
      address: intl.uk_parliament.address || "",
    });
  }

  if (intl.eu_parliament_droi) {
    ccListRaw.push({
      org:
        intl.eu_parliament_droi.name ||
        "EU Parliament Subcommittee on Human Rights (DROI)",
      title: intl.eu_parliament_droi.title || "",
      email: intl.eu_parliament_droi.email || "",
      address: intl.eu_parliament_droi.address || "",
    });
  }

  if (intl.au_commission) {
    ccListRaw.push({
      org:
        intl.au_commission.name ||
        "African Commission on Human and Peoples’ Rights",
      title: intl.au_commission.title || "",
      email: intl.au_commission.email || "",
      address: intl.au_commission.address || "",
    });
  }

  if (intl.ecowas_commission) {
    ccListRaw.push({
      org: intl.ecowas_commission.name || "ECOWAS Commission",
      title: intl.ecowas_commission.title || "",
      email: intl.ecowas_commission.email || "",
      address: intl.ecowas_commission.address || "",
    });
  }

  const ccList = dedupeByOrg(ccListRaw);

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// GENERIC AI-BASED DETECTION (Worldwide / private sector, etc.)
// --------------------------------------------------------------
async function aiDetect(description) {
  const openai = getOpenAIClient();
  if (!openai) {
    return { primary: null, through: null, ccList: [] };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: `
You are a global institutions routing engine.

Return ONLY a valid JSON object of this exact shape:

{
  "primary": { "org": "", "title": "", "email": "", "address": "" },
  "supervising": [ { "org": "", "title": "", "email": "", "address": "" } ],
  "cc": [ { "org": "", "title": "", "email": "", "address": "" } ]
}

Rules:
- Prefer OFFICIAL or likely-official institutions and regulators.
- Use ONLY realistic emails (gov, gov.ng, org, int, or clear corporate domains).
- If unsure of email, leave it as an empty string "".
- Do NOT invent fake domains like example.com or placeholder.com.
- Focus on routing within Nigeria when the complaint clearly relates to Nigeria.
- No markdown, no extra text, ONLY the JSON object.
        `.trim(),
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\n\nReturn ONLY the JSON object. No explanations, no backticks.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(txt);
    } catch {
      parsed = {};
    }

    const clean = (obj) => {
      if (!obj || !obj.org) return null;
      return {
        org: obj.org.trim(),
        title: (obj.title || "").trim(),
        email: (obj.email || "").trim(),
        address: (obj.address || "").trim(),
      };
    };

    const primary = clean(parsed.primary);

    let through = null;
    const supervising = Array.isArray(parsed.supervising)
      ? parsed.supervising
      : [];

    if (supervising.length) {
      through = clean(supervising[0]);
    }

    const ccRaw = [];

    supervising.slice(1).forEach((s) => {
      const c = clean(s);
      if (c) ccRaw.push(c);
    });

    const extraCC = Array.isArray(parsed.cc) ? parsed.cc : [];
    extraCC.forEach((c) => {
      const x = clean(c);
      if (x) ccRaw.push(x);
    });

    const ccList = dedupeByOrg(ccRaw);

    return { primary, through, ccList };
  } catch (err) {
    console.error("[aiRouting] aiDetect error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// --------------------------------------------------------------
// HYBRID DETECTION PIPELINE (ELECTRICITY → INTERNATIONAL → AI)
// --------------------------------------------------------------
async function detectHybrid(description) {
  const desc = (description || "").trim();
  if (!desc) {
    return { primary: null, through: null, ccList: [] };
  }

  // 1) Electricity cases (billing, meter, etc.) – rule-based, very reliable
  const elec = detectElectricity(desc);
  if (elec) {
    console.log("[aiRouting] Routed via ELECTRICITY rules");
    return elec;
  }

  // 2) Very serious atrocity / genocide / mass-violation cases – conservative
  const intl = detectInternational(desc);
  if (intl) {
    console.log("[aiRouting] Routed via INTERNATIONAL (conservative) rules");
    return intl;
  }

  // 3) All other matters – generic AI routing (then refined by watchdogs + sector)
  const aiResult = await aiDetect(desc);
  console.log("[aiRouting] Routed via AI generic detection");
  return aiResult;
}

module.exports = {
  detectHybrid,
};
