/**
 * JusticeBot Backend (A7 – World Brain Routing)
 * Express + OpenAI + AI institution detection + PCC/NHRC watchdogs
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

// ----------------------------------------------------
// LOAD institutions.json (still used for electricity, etc.)
// ----------------------------------------------------
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  const raw = fs.readFileSync(filePath, "utf8");
  INSTITUTIONS_JSON = JSON.parse(raw);
  console.log("A7 institutions loaded successfully");
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
  console.log("OPENAI_API_KEY not set; using fallback petition text only");
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
  res.send("JusticeBot A7 World Brain Backend is running successfully.");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

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

// ---------- ELECTRICITY SPECIAL CASE (AEDC / NERC etc.) ----------
function detectElectricity(description) {
  const d = (description || "").toLowerCase();

  if (
    !textIncludesAny(d, [
      "electricity",
      "disco",
      "aedc",
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

  // Primary – AEDC or generic DISCO
  let primary =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "aedc") || null;

  if (!primary) {
    primary = {
      key: "generic_dis",
      org: "The Managing Director,\n[Electricity Distribution Company]",
      email: "",
    };
  }

  // Through – NERC (regulator) if configured
  const through =
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "nerc") || null;

  // Extra CCs – e.g., Power Ministry if configured
  const ccList = [
    INSTITUTIONS_JSON.electricity?.find((i) => i.key === "power_ministry"),
  ].filter(Boolean);

  return { primary, through, ccList };
}

// ---------- GLOBAL WATCHDOGS (PCC + NHRC) ----------
function applyGlobalWatchdogs(description, inst) {
  const result = inst || {};
  if (!Array.isArray(result.ccList)) result.ccList = [];

  const addCc = (orgObj) => {
    if (!orgObj || !orgObj.org) return;
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
  addCc({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng, info@pcc.gov.ng",
  });

  // 2. NHRC – ONLY for human-rights related complaints
  const d = (description || "").toLowerCase();
  const humanRightsKeywords = [
    "human right",
    "human-right",
    "human rights",
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
    "degrading treatment",
    "oppression",
  ];

  const isHR = humanRightsKeywords.some((kw) => d.includes(kw));

  if (isHR) {
    addCc({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
    });
  }

  return result;
}

// ---------- AI INSTITUTION DETECTION (WORLD-WIDE) ----------
async function aiDetectInstitutions(description) {
  if (!openai) {
    return { primary: null, through: null, ccList: [] };
  }

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You are an expert global complaints-routing assistant. " +
            "Read a complaint and determine:\n" +
            "1) The most appropriate PRIMARY institution to address the petition to (the letter's addressee).\n" +
            "2) Any SUPERVISING or oversight institutions (regulators, ministries, higher authorities).\n" +
            "3) Any additional bodies that should be CCed (ombuds, rights bodies, etc.).\n\n" +
            "Return ONLY valid JSON. No markdown, no comments. Shape:\n" +
            "{\n" +
            '  "primary": { "org": string, "title": string, "email": string | "" },\n' +
            '  "supervising": [ { "org": string, "title": string, "email": string | "" } ],\n' +
            '  "cc": [ { "org": string, "title": string, "email": string | "" } ]\n' +
            "}\n\n" +
            "If you are unsure of an email, set it to an empty string. " +
            "For Nigerian complaints, lean towards the correct Nigerian regulators / ministries / agencies. " +
            "For foreign complaints, choose the correct local institutions in that country (e.g. police chief, mayor, ministries, ombudsmen).",
        },
        {
          role: "user",
          content:
            "Complaint text:\n" +
            description +
            "\n\nReturn ONLY the JSON object with primary, supervising, and cc as described.",
        },
      ],
    });

    const text = resp.choices?.[0]?.message?.content || "";
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Failed to parse AI institutions JSON:", text);
      return { primary: null, through: null, ccList: [] };
    }

    const normalizeOrg = (o) => {
      if (!o || typeof o.org !== "string" || !o.org.trim()) return null;
      return {
        org: o.org.trim(),
        title: typeof o.title === "string" ? o.title.trim() : "",
        email: typeof o.email === "string" ? o.email.trim() : "",
      };
    };

    const primary = normalizeOrg(data.primary);
    let through = null;
    const ccList = [];

    if (Array.isArray(data.supervising) && data.supervising.length > 0) {
      const firstSuper = normalizeOrg(data.supervising[0]);
      if (firstSuper) through = firstSuper;

      for (let i = 1; i < data.supervising.length; i++) {
        const s = normalizeOrg(data.supervising[i]);
        if (s) ccList.push(s);
      }
    }

    if (Array.isArray(data.cc)) {
      for (const c of data.cc) {
        const norm = normalizeOrg(c);
        if (!norm) continue;

        const exists = ccList.some(
          (x) => x.org.toLowerCase() === norm.org.toLowerCase()
        );
        if (!exists) ccList.push(norm);
      }
    }

    return { primary, through, ccList };
  } catch (err) {
    console.error("Error during AI institution detection:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

// ---------- HYBRID DETECTION: ELECTRICITY FIRST, THEN AI ----------
async function detectInstitutionsHybrid(description) {
  // 1. Hard-coded electricity rule (AEDC / NERC etc.)
  const elec = detectElectricity(description);
  if (elec) {
    console.log("Detected electricity complaint via rule-based logic");
    return elec;
  }

  // 2. Generic AI routing for everything else
  const aiInst = await aiDetectInstitutions(description);
  console.log("AI institution routing result:", aiInst);
  return aiInst;
}

// ----------------------------------------------------
// POST: GENERATE PETITION (HYBRID)
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

  // 2 – detect institutions (hybrid AI + electricity) and apply watchdogs
  let inst = { primary: null, through: null, ccList: [] };
  try {
    inst = await detectInstitutionsHybrid(description);
  } catch (err) {
    console.error("Error in hybrid institution detection:", err);
    inst = { primary: null, through: null, ccList: [] };
  }

  inst = applyGlobalWatchdogs(description, inst);

  // Ensure ccList has no null/empty entries (avoid empty bullet in UI)
  if (!Array.isArray(inst.ccList)) inst.ccList = [];
  inst.ccList = inst.ccList.filter(
    (c) => c && typeof c.org === "string" && c.org.trim()
  );

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
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are an expert Nigerian petition-drafting lawyer working globally. " +
              "Write very formal petitions suitable for professional institutions and courts. " +
              "ALWAYS use the REAL complainant details (name, address, email, phone, date) at the top. " +
              "Do NOT use placeholders like [Your Name] or [Your Address]. " +
              "Write in clean plain-text paragraphs only – no markdown, no asterisks, no bullet points. " +
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
              "Use plain text paragraphs only, suitable for printing on A4 or saving as PDF.",
          },
        ],
      });

      petitionText =
        ai.choices?.[0]?.message?.content ||
        `Petition Draft:\n\n${description}`;
    } else {
      // No OpenAI – simple fallback draft
      petitionText = `Petition Draft:\n\n${description}`;
    }
  } catch (err) {
    console.error("OpenAI error:", err);
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
  console.log(`JusticeBot A7 World Brain Backend running on port ${PORT}`);
});
