/**
 * JusticeBot Backend (A5)
 * Express + OpenAI + Institution detection + PCC/NHRC watchdog CC
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------------------------------
// LOAD institutions.json
// ----------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("A5 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// ----------------------------------------------------
// OPENAI INIT (optional)
// ----------------------------------------------------
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("Error initialising OpenAI client:", err);
    openai = null;
  }
} else {
  console.log("OPENAI_API_KEY not set; using fallback petition text");
}

// ----------------------------------------------------
// EXPRESS INIT
// ----------------------------------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ----------------------------------------------------
// BASIC ROUTES
// ----------------------------------------------------
app.get("/", (req, res) => {
  res.send("JusticeBot A5 Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Simple test route to confirm OpenAI status from browser
app.get("/test", (req, res) => {
  res.json({
    status: "ok",
    message: "Test endpoint working",
    openai_status: openai ? "ready" : "not_initialized",
  });
});

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------
function textIncludesAny(text, keywords) {
  const t = (text || "").toLowerCase();
  return keywords.some((kw) => t.includes(kw.toLowerCase()));
}

// Normalize an institution object from JSON
function normalizeInstitution(raw, category) {
  if (!raw || typeof raw !== "object") return null;

  const org =
    raw.org ||
    raw.name ||
    raw.title ||
    raw.label ||
    "";

  const email =
    raw.email ||
    raw.emails ||
    "";

  const address = raw.address || "";
  const title = raw.title || "";
  const key = raw.key || null;

  if (!org) return null;

  return {
    org,
    email,
    address,
    title,
    category: category || "",
    key,
  };
}

// Flatten all institutions into a list with indices
function flattenInstitutions() {
  const flat = [];
  const json = INSTITUTIONS_JSON || {};

  Object.keys(json).forEach((category) => {
    const arr = json[category];
    if (!Array.isArray(arr)) return;
    arr.forEach((item) => {
      const norm = normalizeInstitution(item, category);
      if (norm) flat.push(norm);
    });
  });

  return flat;
}

// Electricity-specific fallback institution detection (AEDC / NERC / etc.)
function detectElectricityFallback(description) {
  const d = (description || "").toLowerCase();

  if (
    !textIncludesAny(d, [
      "electricity",
      "disco",
      "meter",
      "prepaid",
      "over billing",
      "overbilling",
      "power",
      "light",
    ])
  ) {
    return null;
  }

  let primary =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "aedc") || null;

  if (!primary) {
    primary = {
      org: "The Managing Director,\n[Electricity Distribution Company]",
      email: "",
    };
  } else {
    primary = normalizeInstitution(primary, "electricity");
  }

  const throughRaw =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "nerc") || null;
  const through = normalizeInstitution(throughRaw, "electricity");

  const ccRaw = INSTITUTIONS_JSON.electricity?.find(
    (i) => i.key === "power_ministry"
  );
  const ccList = [];
  const normCc = normalizeInstitution(ccRaw, "electricity");
  if (normCc) ccList.push(normCc);

  return { primary, through, ccList };
}

// Global watchdogs: PCC always, NHRC for human-rights cases
function applyGlobalWatchdogs(description, inst) {
  const result = inst || {};
  if (!Array.isArray(result.ccList)) result.ccList = [];

  const addCc = (orgObj) => {
    if (!orgObj) return;
    if (!orgObj.org) return;

    const exists = result.ccList.some(
      (c) =>
        c &&
        typeof c.org === "string" &&
        c.org.toLowerCase() === orgObj.org.toLowerCase()
    );
    if (!exists) {
      result.ccList.push(orgObj);
    }
  };

  // 1. PCC – ALWAYS CC (administrative injustice watchdog)
  addCc(
    normalizeInstitution(
      {
        org: "Public Complaints Commission",
        email: "complaints@pcc.gov.ng, info@pcc.gov.ng",
        address: "PCC Headquarters, 25 Aguiyi Ironsi Street, Maitama, Abuja",
        title: "Honourable Chief Commissioner",
      },
      "General"
    )
  );

  // 2. NHRC – ONLY for human-rights related complaints
  const d = (description || "").toLowerCase();
  const humanRightsKeywords = [
    "human right",
    "human-right",
    "police brutality",
    "brutality",
    "torture",
    "discrimination",
    "unlawful detention",
    "illegal detention",
    "extra judicial",
    "extrajudicial",
    "killing",
    "threat to life",
    "harassment",
    "sexual assault",
    "rape",
    "domestic violence",
    "violence",
    "child abuse",
    "abuse",
    "degrading treatment",
    "oppression",
  ];

  const isHR =
    humanRightsKeywords.some((kw) => d.includes(kw)) ||
    d.includes("human rights");

  if (isHR) {
    addCc(
      normalizeInstitution(
        {
          org: "National Human Rights Commission",
          email: "info@nhrc.gov.ng",
          address: "NHRC Headquarters, Maitama, Abuja",
          title: "Executive Secretary",
        },
        "HumanRights"
      )
    );
  }

  return result;
}

// ----------------------------------------------------
// OPENAI-BASED INSTITUTION DETECTION
// ----------------------------------------------------
async function detectInstitutionsWithOpenAI(description) {
  if (!openai) return null;

  const flat = flattenInstitutions();
  if (!flat.length) return null;

  // Build a compact list for the model
  const lines = flat.map((inst, idx) => {
    const n = inst.org || "Unknown";
    const cat = inst.category || "Uncategorised";
    const title = inst.title || "";
    return `${idx + 1}. [${cat}] ${n}${title ? " (" + title + ")" : ""}`;
  });

  const institutionsList = lines.join("\n");

  const prompt =
    `You are a Nigerian legal/institutional expert.\n` +
    `A citizen has written a complaint. You are given a numbered list of Nigerian institutions.\n` +
    `Your job is to choose:\n` +
    `- ONE primary institution that should receive the petition (or null if none).\n` +
    `- ZERO OR ONE supervising/through institution (e.g. regulator, supervising ministry).\n` +
    `- ZERO OR MORE additional institutions to copy (cc).\n` +
    `Also decide:\n` +
    `- isAdministrativeInjustice: true if this is about administrative injustice in any institution.\n` +
    `- isHumanRightsCase: true if this involves human rights violations.\n\n` +
    `Complaint text:\n"""${description}"""\n\n` +
    `Institutions list:\n${institutionsList}\n\n` +
    `Return ONLY valid JSON with this exact structure:\n` +
    `{\n` +
    `  "primaryIndex": number | null,\n` +
    `  "throughIndices": number[],\n` +
    `  "ccIndices": number[],\n` +
    `  "isAdministrativeInjustice": boolean,\n` +
    `  "isHumanRightsCase": boolean\n` +
    `}\n` +
    `Use 1-based indices as in the list. Do NOT include any extra text before or after the JSON.`;

  try {
    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a precise JSON-only assistant. You MUST respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
    });

    const content = ai.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("Error parsing OpenAI institution JSON:", err, content);
      return null;
    }

    if (!parsed || typeof parsed !== "object") return null;

    const primaryIndex =
      typeof parsed.primaryIndex === "number" ? parsed.primaryIndex : null;
    const throughIndices = Array.isArray(parsed.throughIndices)
      ? parsed.throughIndices
      : [];
    const ccIndices = Array.isArray(parsed.ccIndices) ? parsed.ccIndices : [];

    const getByIndex = (idx) => {
      if (!idx || typeof idx !== "number") return null;
      const zero = idx - 1;
      if (zero < 0 || zero >= flat.length) return null;
      return flat[zero];
    };

    const primary = getByIndex(primaryIndex);
    const through = getByIndex(throughIndices[0] || null);

    const ccList = [];
    ccIndices.forEach((idx) => {
      const inst = getByIndex(idx);
      if (!inst) return;
      const exists = ccList.some(
        (c) => c.org.toLowerCase() === inst.org.toLowerCase()
      );
      if (!exists) ccList.push(inst);
    });

    const result = {
      primary: primary || null,
      through: through || null,
      ccList,
      isAdministrativeInjustice: !!parsed.isAdministrativeInjustice,
      isHumanRightsCase: !!parsed.isHumanRightsCase,
    };

    return result;
  } catch (err) {
    console.error("OpenAI detection error:", err);
    return null;
  }
}

// ----------------------------------------------------
// POST: GENERATE PETITION (A5)
// ----------------------------------------------------
app.post("/generate-petition", async (req, res) => {
  console.log("Incoming /generate-petition:", req.body);

  // 1 – safely read description
  let description = "";
  try {
    if (req.body && typeof req.body.description === "string") {
      description = req.body.description;
    }
  } catch (err) {
    console.error("Error reading description from body:", err);
  }

  if (!description.trim()) {
    return res.status(200).json({
      petitionText: "Please enter your complaint description.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      error: "Description is required.",
    });
  }

  // 1b – read user details (REAL data)
  let fullName = "";
  let email = "";
  let phone = "";
  let address = "";

  try {
    if (typeof req.body.fullName === "string") fullName = req.body.fullName;
    if (typeof req.body.email === "string") email = req.body.email;
    if (typeof req.body.phone === "string") phone = req.body.phone;
    if (typeof req.body.address === "string") address = req.body.address;
  } catch (err) {
    console.error("Error reading extra fields from body:", err);
  }

  // 2 – detect institutions
  let inst = {};
  try {
    // First try OpenAI global detection
    inst = (await detectInstitutionsWithOpenAI(description)) || {};

    // If that fails and it's electricity-related, fall back
    if (!inst.primary && !inst.through && (!inst.ccList || !inst.ccList.length)) {
      const fallback = detectElectricityFallback(description);
      if (fallback) inst = fallback;
    }
  } catch (err) {
    console.error("Error detecting institutions:", err);
    inst = {};
  }

  // Apply PCC + NHRC global rules
  inst = applyGlobalWatchdogs(description, inst);

  // 3 – generate petition (OpenAI or fallback)
  let petitionText = "";

  try {
    if (openai) {
      const detailsLines = [];
      const today = new Date().toLocaleDateString("en-NG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      if (fullName) detailsLines.push(fullName);
      if (address) detailsLines.push(address);
      if (email) detailsLines.push(`Email: ${email}`);
      if (phone) detailsLines.push(`Phone: ${phone}`);
      detailsLines.push(`Date: ${today}`);

      const complainantBlock =
        detailsLines.length > 0
          ? detailsLines.join("\n")
          : "Use the complainant's real details as provided.";

      const primaryOrg = inst.primary?.org || "";
      const throughOrg = inst.through?.org || "";
      const ccOrgList = Array.isArray(inst.ccList)
        ? inst.ccList.map((c) => c.org).join("; ")
        : "";

      const ai = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert Nigerian petition-drafting lawyer. " +
              "Write very formal petitions suitable for professional institutions and courts. " +
              "ALWAYS use the REAL complainant details (name, address, email, phone, date) at the top. " +
              "Do NOT use placeholders like [Your Name] or [Your Address]. " +
              "Write in clean paragraphs only – no markdown, no asterisks, no bullet points. " +
              "Make the letter ready for the complainant to sign and submit physically or by email.",
          },
          {
            role: "user",
            content:
              `Complainant details:\n${complainantBlock}\n\n` +
              (primaryOrg ? `Primary institution:\n${primaryOrg}\n\n` : "") +
              (throughOrg ? `Through institution:\n${throughOrg}\n\n` : "") +
              (ccOrgList ? `CC institutions:\n${ccOrgList}\n\n` : "") +
              `Petition description (complainant's story):\n${description}\n\n` +
              "Write the full petition letter with proper introduction, body paragraphs, reliefs/prayers and closing. " +
              "Use plain text paragraphs, suitable for printing or saving as PDF.",
          },
        ],
        temperature: 0.3,
      });

      petitionText =
        ai.choices?.[0]?.message?.content ||
        `Petition Draft:\n\n${description}`;
    } else {
      // No OpenAI – simple fallback draft
      petitionText = `Petition Draft:\n\n${description}`;
    }
  } catch (err) {
    console.error("OpenAI error (petition drafting):", err);
    petitionText = `Petition Draft:\n\n${description}`;
  }

  // 4 – always respond safely
  try {
    return res.status(200).json({
      petitionText,
      primaryInstitution: inst.primary || null,
      throughInstitution: inst.through || null,
      ccList: Array.isArray(inst.ccList) ? inst.ccList : [],
    });
  } catch (err) {
    console.error("Error sending final JSON:", err);
    return res.status(200).json({
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
    });
  }
});

// ----------------------------------------------------
// START SERVER
// ----------------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot A5 Backend running on port ${PORT}`);
});
