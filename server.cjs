/**
 * PetitionDesk / JusticeBot Backend (A10 – Global Oversight Intelligence Mode)
 * Express + OpenAI + AI institution detection
 * + PCC/NHRC watchdogs
 * + International routing (UN/ICC/ECOWAS etc.)
 * + Media escalation
 * + Severity engine (1–10) with tags
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// --------------------------------------------------------------
// LOAD institutions.json
// --------------------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("A10 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// --------------------------------------------------------------
// OPENAI INIT
// --------------------------------------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
  }
} else {
  console.log("OPENAI_API_KEY not set; fallback mode active.");
}

// --------------------------------------------------------------
// EXPRESS INIT
// --------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --------------------------------------------------------------
// BASIC ROUTES
// --------------------------------------------------------------
app.get("/", (req, res) =>
  res.send("JusticeBot A10 Backend (Global Oversight Intelligence) is running 💡")
);
app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);
app.get("/test", (req, res) =>
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  })
);

// --------------------------------------------------------------
// HELPERS
// --------------------------------------------------------------
function textIncludesAny(t, arr) {
  t = (t || "").toLowerCase();
  return arr.some((x) => t.includes(x.toLowerCase()));
}

function pushUniqueCc(list, obj) {
  if (!obj || !obj.org) return;
  const org = (obj.org || "").trim();
  if (!org) return;
  if (
    list.some(
      (c) =>
        c &&
        typeof c.org === "string" &&
        c.org.trim().toLowerCase() === org.toLowerCase()
    )
  ) {
    return;
  }
  list.push({
    org,
    email: (obj.email || "").trim(),
    address: (obj.address || "").trim(),
    title: (obj.title || "").trim(),
  });
}

// --------------------------------------------------------------
// ELECTRICITY DETECTION (AEDC / NERC)
// --------------------------------------------------------------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();
  const k = [
    "electricity",
    "aedc",
    "disco",
    "meter",
    "billing",
    "token",
    "power",
    "light",
  ];
  if (!textIncludesAny(d, k)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];
  let primary = null;

  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }
  if (!primary)
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || { org: "Electricity Distribution Company", email: "" };

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "Nigerian Electricity Regulatory Commission (NERC)",
      email: "",
    };

  const ccList = [];
  list
    .filter((i) => !["aedc", "generic_dis", "nerc"].includes(i.key))
    .forEach((i) =>
      pushUniqueCc(ccList, {
        org: i.org,
        email: i.email || "",
        address: i.address || "",
        title: i.title || "",
      })
    );

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// INTERNATIONAL ROUTING (Parliaments / ECOWAS etc.)
// --------------------------------------------------------------
function detectInternational(description) {
  const d = (description || "").toLowerCase();
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "war crime",
    "crimes against humanity",
    "massacre",
    "religious minority",
    "international intervention",
    "foreign intervention",
    "united states",
    "us congress",
    "uk parliament",
    "european parliament",
    "african union",
    "ecowas",
    "icc",
  ];
  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};

  const ccList = [];
  Object.values(intl).forEach((i) =>
    pushUniqueCc(ccList, {
      org: i.name,
      email: i.email || "",
      address: i.address || "",
      title: "",
    })
  );

  // Default primary: US House Foreign Affairs (good global entry point)
  const primary = {
    org: intl.us_congress_house?.name || "US House Foreign Affairs Committee",
    email: intl.us_congress_house?.email || "",
    address: intl.us_congress_house?.address || "House Committee on Foreign Affairs, Washington, D.C., USA",
    title: "",
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
    title: "Attorney General of the Federation",
  };

  return { primary, through, ccList };
}

// --------------------------------------------------------------
// GLOBAL WATCHDOGS (PCC + NHRC)
// --------------------------------------------------------------
function applyWatchdogs(description, inst) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  // PCC ALWAYS
  pushUniqueCc(out.ccList, {
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng,info@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    title: "The Honourable Chief Commissioner",
  });

  // NHRC if rights-related
  const d = (description || "").toLowerCase();
  const rights = [
    "human right",
    "brutality",
    "torture",
    "unlawful",
    "illegal detention",
    "detention without trial",
    "detained without trial",
    "violence",
    "abuse",
    "oppression",
    "rape",
    "sexual assault",
    "killing",
    "genocide",
    "extrajudicial",
    "extra judicial",
  ];
  if (rights.some((x) => d.includes(x))) {
    pushUniqueCc(out.ccList, {
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      address: "19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
      title: "The Executive Secretary",
    });
  }

  return out;
}

// --------------------------------------------------------------
// A10: SEVERITY ENGINE (RULE-BASED + OPTIONAL AI)
// --------------------------------------------------------------
function computeSeverityRule(description) {
  const d = (description || "").toLowerCase();
  let score = 1;
  const tags = new Set();

  if (!d.trim()) return { score: 1, tags: ["empty"], flags: {} };

  // Baseline
  score = 3;

  // Very severe indicators
  const killers = [
    "genocide",
    "ethnic cleansing",
    "massacre",
    "war crime",
    "crimes against humanity",
    "extra judicial",
    "extrajudicial",
    "killed",
    "murdered",
    "torture",
  ];
  if (textIncludesAny(d, killers)) {
    score = 9;
    tags.add("mass_violence");
    tags.add("lethal");
  }

  // Detention / freedom issues
  const detention = [
    "detained",
    "detention",
    "custody",
    "prison",
    "jail",
    "cell",
    "awaiting trial",
    "no trial",
    "without trial",
    "unlawful arrest",
    "illegal arrest",
  ];
  if (textIncludesAny(d, detention)) {
    score = Math.max(score, 7);
    tags.add("detention");
    tags.add("liberty");
  }

  // Police / security brutality
  const brutality = [
    "beaten",
    "flogged",
    "tortured",
    "tear gas",
    "shot",
    "gunshot",
    "assaulted",
    "police brutality",
    "military brutality",
  ];
  if (textIncludesAny(d, brutality)) {
    score = Math.max(score, 7);
    tags.add("brutality");
  }

  // Economic / employment / contract
  const economic = [
    "salary",
    "pension",
    "benefit",
    "entitlement",
    "sacked",
    "dismissed",
    "loan",
    "bank",
    "deduction",
    "over charge",
    "overcharge",
    "debt",
  ];
  if (textIncludesAny(d, economic)) {
    score = Math.max(score, 4);
    tags.add("economic");
  }

  // Health and life
  const health = [
    "life threatening",
    "critical condition",
    "hospital",
    "denied treatment",
    "medical",
    "emergency",
    "ambulance",
  ];
  if (textIncludesAny(d, health)) {
    score = Math.max(score, 8);
    tags.add("health");
  }

  // Child / vulnerable
  const vulnerable = [
    "child",
    "children",
    "minor",
    "disabled",
    "pregnant",
    "elderly",
  ];
  if (textIncludesAny(d, vulnerable)) {
    score = Math.max(score, 6);
    tags.add("vulnerable");
  }

  const flags = {
    potentialGenocide: textIncludesAny(d, ["genocide", "ethnic cleansing"]),
    humanRights:
      textIncludesAny(d, [
        "human right",
        "fundamental right",
        "torture",
        "brutality",
        "detention",
        "genocide",
        "oppression",
      ]) || tags.has("detention") || tags.has("brutality"),
    emergency: score >= 8,
  };

  return { score, tags: Array.from(tags), flags };
}

async function computeSeverity(description) {
  const base = computeSeverityRule(description);

  if (!openai) {
    return {
      score: base.score,
      label: severityLabel(base.score),
      tags: base.tags,
      flags: base.flags,
    };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content:
            "You are a human-rights severity classifier. " +
            "Return ONLY JSON with this shape: " +
            '{"severity": 1-10, "tags": [string], "human_rights": bool, "emergency": bool}',
        },
        {
          role: "user",
          content:
            "Complaint text:\n" +
            description +
            "\n\nRate overall severity from 1 (minor) to 10 (extreme emergency). Return ONLY JSON.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    let score = Number(data.severity) || base.score;
    if (score < 1) score = 1;
    if (score > 10) score = 10;

    const tagsSet = new Set(base.tags || []);
    if (Array.isArray(data.tags)) {
      data.tags.forEach((t) => {
        if (typeof t === "string" && t.trim()) tagsSet.add(t.trim());
      });
    }

    const flags = {
      ...base.flags,
      humanRights:
        base.flags.humanRights ||
        Boolean(data.human_rights) ||
        tagsSet.has("human_rights"),
      emergency: base.flags.emergency || Boolean(data.emergency),
    };

    return {
      score,
      label: severityLabel(score),
      tags: Array.from(tagsSet),
      flags,
    };
  } catch (err) {
    console.error("Severity AI error:", err);
    return {
      score: base.score,
      label: severityLabel(base.score),
      tags: base.tags,
      flags: base.flags,
    };
  }
}

function severityLabel(score) {
  if (score >= 9) return "CRITICAL";
  if (score >= 7) return "HIGH";
  if (score >= 4) return "MEDIUM";
  return "LOW";
}

// --------------------------------------------------------------
// A10: INTERNATIONAL ESCALATION (UN / ICC)
// --------------------------------------------------------------
function applyInternationalEscalation(description, inst, severityObj) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const score = severityObj?.score || 1;
  const tags = new Set(severityObj?.tags || []);
  const d = (description || "").toLowerCase();

  const isMassAtrocity =
    score >= 8 ||
    tags.has("mass_violence") ||
    textIncludesAny(d, [
      "genocide",
      "ethnic cleansing",
      "war crime",
      "crimes against humanity",
      "massacre",
    ]);

  if (!isMassAtrocity) return out;

  const unBodies = INSTITUTIONS_JSON.un_bodies || {};
  Object.values(unBodies).forEach((i) =>
    pushUniqueCc(out.ccList, {
      org: i.name,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    })
  );

  // ICC if mentioned or extremely severe
  if (
    textIncludesAny(d, ["icc", "international criminal court"]) ||
    score >= 9
  ) {
    const icc = INSTITUTIONS_JSON.icc;
    if (icc) {
      pushUniqueCc(out.ccList, {
        org: icc.name,
        email: icc.email || "",
        address: icc.address || "",
        title: icc.title || "",
      });
    }
  }

  return out;
}

// --------------------------------------------------------------
// A10: MEDIA ESCALATION LAYER
// --------------------------------------------------------------
function applyMediaLayer(description, inst, severityObj) {
  const out = inst || {};
  if (!Array.isArray(out.ccList)) out.ccList = [];

  const score = severityObj?.score || 1;
  const tags = new Set(severityObj?.tags || []);
  const d = (description || "").toLowerCase();

  const shouldMedia =
    score >= 8 ||
    tags.has("mass_violence") ||
    tags.has("brutality") ||
    textIncludesAny(d, ["genocide", "ethnic cleansing", "massacre"]);

  if (!shouldMedia) return out;

  const mediaGroup = INSTITUTIONS_JSON.media || {};
  Object.values(mediaGroup).forEach((i) =>
    pushUniqueCc(out.ccList, {
      org: i.name,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    })
  );

  return out;
}

// --------------------------------------------------------------
// AI INSTITUTION DETECTION (GENERIC)
// --------------------------------------------------------------
async function aiDetect(description) {
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            `You are a global institutions routing engine. RETURN ONLY JSON:

{
 "primary": {"org":"", "title":"", "email":"", "address":""},
 "supervising":[{"org":"", "title":"", "email":"", "address":""}],
 "cc":[{"org":"", "title":"", "email":"", "address":""}]
}

Rules:
- Use ONLY verified or realistic emails (.gov, .gov.ng, .org, .int, official domains).
- If unsure of email, leave email as an empty string.
- No placeholders. No fake domains. No markdown.`,
        },
        {
          role: "user",
          content:
            "Complaint:\n" +
            description +
            "\nReturn ONLY JSON, no markdown.",
        },
      ],
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    function clean(o) {
      if (!o || !o.org) return null;
      return {
        org: o.org.trim(),
        title: (o.title || "").trim(),
        email: (o.email || "").trim(),
        address: (o.address || "").trim(),
      };
    }

    const primary = clean(data.primary);
    const through =
      Array.isArray(data.supervising) && data.supervising.length
        ? clean(data.supervising[0])
        : null;
    const ccList = [];

    if (Array.isArray(data.supervising)) {
      data.supervising.slice(1).forEach((x) => {
        const c = clean(x);
        if (c) pushUniqueCc(ccList, c);
      });
    }

    if (Array.isArray(data.cc)) {
      data.cc.forEach((x) => {
        const c = clean(x);
        if (c) pushUniqueCc(ccList, c);
      });
    }

    return { primary, through, ccList };
  } catch (err) {
    console.error("AI routing error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// --------------------------------------------------------------
// HYBRID INSTITUTION DETECTION
// --------------------------------------------------------------
async function detectHybrid(description) {
  // 1. Electricity rule
  const e = detectElectricity(description);
  if (e) return e;

  // 2. International escalation rule
  const intl = detectInternational(description);
  if (intl) return intl;

  // 3. AI detection
  const ai = await aiDetect(description);
  return ai;
}

// --------------------------------------------------------------
// PETITION BUILDERS
// --------------------------------------------------------------
async function buildPetition(complainant, inst, severityObj) {
  const { fullName, email, phone, address, description } = complainant;
  if (!openai) return fallbackPetition(complainant, inst);

  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const header = [
    fullName,
    address,
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    today,
  ]
    .filter(Boolean)
    .join("\n");

  const ccText =
    inst.ccList
      ?.map((c) => `${c.org}\n${c.address || ""}`)
      .join("\n\n") || "None";

  const severityLine = `Overall severity: ${severityObj.label} (${severityObj.score}/10).`;
  const tagLine =
    severityObj.tags && severityObj.tags.length
      ? `Tags: ${severityObj.tags.join(", ")}.`
      : "";

  const systemPrompt = `
You are an expert Nigerian and international petition-drafting lawyer.
Write VERY STRONG, formal petitions for regulators, law-enforcement, courts,
international bodies, and human-rights institutions.

STRICT RULES:
- Use only the real complainant details and institutions provided.
- NO placeholders like [Your Name], [Address], [Bank], etc.
- Tone: firm, legal, respectful, authoritative.
- Structure:
  1. Complainant details at top.
  2. Recipient block and Through block.
  3. CC block.
  4. Clear subject line (bold style using **SUBJECT:**).
  5. Facts in numbered paragraphs with dates, locations, and actions.
  6. Legal analysis referencing Constitution, African Charter, and relevant laws WHEN appropriate.
  7. Reliefs as a numbered list.
  8. Strong closing and "Yours faithfully" with complainant name, phone, email.
`;

  const userPrompt = `
${header}

${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}

${inst.through?.org ? "Through:\n" + inst.through.org : ""}
${inst.through?.address || ""}

CC:
${ccText}

SEVERITY ANALYSIS (for your understanding – summarise, do not copy verbatim):
${severityLine}
${tagLine}

Complaint Description:
${description}

TASK:
Write a FULL petition letter based on this information.
- Automatically generate a strong legal-style subject line.
- Use numbered paragraphs for FACTS and RELIEFS.
- Bring out human-rights angles where applicable.
- Do NOT invent new facts; only interpret what is given.
`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.25,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return (
      r.choices?.[0]?.message?.content || fallbackPetition(complainant, inst)
    );
  } catch (err) {
    console.error("AI petition error:", err);
    return fallbackPetition(complainant, inst);
  }
}

// --------------------------------------------------------------
// FALLBACK PETITION
// --------------------------------------------------------------
function fallbackPetition(c, inst) {
  const today = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return `
${c.fullName}
${c.address || ""}
Email: ${c.email || ""}
Phone: ${c.phone || ""}
${today}

${inst.primary?.org || "The Appropriate Authority"}
${inst.primary?.address || ""}

Through:
${inst.through?.org || ""}

CC:
${inst.ccList?.map((x) => x.org).join("\n")}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION

${c.description}

I respectfully request investigation and appropriate remedial action.

Yours faithfully,
${c.fullName}
${c.phone}
${c.email}
`;
}

// --------------------------------------------------------------
// POST: GENERATE PETITION
// --------------------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming request:", req.body);

  const description = req.body.description || "";
  if (!description.trim())
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      severity: null,
      severityLabel: null,
      tags: [],
    });

  const complainant = {
    fullName: req.body.fullName || "",
    email: req.body.email || "",
    phone: req.body.phone || "",
    address: req.body.address || "",
    description,
  };

  // A10: severity analysis
  const severityObj = await computeSeverity(description);

  // Routing
  let inst = await detectHybrid(description);
  inst = applyWatchdogs(description, inst);
  inst = applyInternationalEscalation(description, inst, severityObj);
  inst = applyMediaLayer(description, inst, severityObj);
  inst.ccList = inst.ccList?.filter((c) => c?.org) || [];

  // Petition drafting
  const petitionText = await buildPetition(complainant, inst, severityObj);

  res.status(200).json({
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList,
    severity: severityObj.score,
    severityLabel: severityObj.label,
    tags: severityObj.tags,
  });
});

// --------------------------------------------------------------
// START SERVER
// --------------------------------------------------------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot A10 Backend running on ${PORT}`)
);
