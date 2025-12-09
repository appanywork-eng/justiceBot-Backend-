/**
 * PetitionDesk / JusticeBot Backend (A12.2 – Payments + Supervisory Escalation Engine)
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const https = require("https"); // IMPORTANT FIX – replaces fetch
const OpenAI = require("openai");

/* -------------------------------------------------------------
   LOAD institutions.json
------------------------------------------------------------- */
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("A10 institutions loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

/* -------------------------------------------------------------
   OPENAI INIT (Optional)
------------------------------------------------------------- */
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI client initialised");
  } catch (err) {
    console.error("OpenAI init error:", err);
    openai = null;
  }
} else {
  console.log("No OPENAI_API_KEY – fallback mode active");
}

/* -------------------------------------------------------------
   EXPRESS INIT
------------------------------------------------------------- */
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

/* -------------------------------------------------------------
   BASIC ROUTES
------------------------------------------------------------- */
app.get("/", (req, res) =>
  res.send("JusticeBot A12.2 Backend (Escalation Engine + Payments) running")
);

app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

/* -------------------------------------------------------------
   HELPERS
------------------------------------------------------------- */
function textIncludesAny(t, arr) {
  t = (t || "").toLowerCase();
  return arr.some((x) => t.includes(x.toLowerCase()));
}

function normaliseOrgName(o) {
  return (o || "").trim().toLowerCase();
}

/* -------------------------------------------------------------
   ELECTRICITY DETECTION
------------------------------------------------------------- */
function detectElectricity(description) {
  const d = (description || "").toLowerCase();

  const keys = [
    "electricity",
    "power",
    "disco",
    "meter",
    "billing",
    "token",
    "transformer",
    "prepaid"
  ];

  if (!textIncludesAny(d, keys)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];

  let primary = null;
  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }

  if (!primary) {
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || {
        org: "Electricity Distribution Company",
        email: "",
        address: ""
      };
  }

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "NERC – Nigerian Electricity Regulatory Commission",
      email: "",
      address: ""
    };

  const ccList = list
    .filter((i) => !["aedc", "generic_dis", "nerc"].includes(i.key))
    .map((i) => ({
      org: i.org,
      email: i.email || "",
      address: i.address || ""
    }));

  return { primary, through, ccList };
}

/* -------------------------------------------------------------
   INTERNATIONAL GENOCIDE DETECTION
------------------------------------------------------------- */
function detectInternational(description) {
  const d = (description || "").toLowerCase();

  const triggers = [
    "genocide",
    "massacre",
    "ethnic cleansing",
    "war crime",
    "crimes against humanity",
    "extrajudicial",
    "political prisoner",
    "nnamdi kanu",
    "biafra"
  ];

  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};

  const ccList = Object.values(intl).map((i) => ({
    org: i.name,
    email: i.email || "",
    address: i.address || ""
  }));

  const primary = intl.us_congress_house || {
    name: "US House Foreign Affairs Committee",
    email: "",
    address: "Washington, D.C."
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "",
    address: "Federal Secretariat, Abuja"
  };

  return {
    primary: {
      org: primary.name,
      email: primary.email,
      address: primary.address
    },
    through,
    ccList
  };
}

/* -------------------------------------------------------------
   AI DETECTION (GENERIC)
------------------------------------------------------------- */
async function aiDetect(description) {
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const resp = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
Return ONLY JSON:
{
 "primary": {"org":"","title":"","email":"","address":""},
 "supervising":[{"org":"","title":"","email":"","address":""}],
 "cc":[{"org":"","title":"","email":"","address":""}]
}
If email is not certain, leave as empty string.`
        },
        {
          role: "user",
          content: description
        }
      ]
    });

    const txt = resp.choices?.[0]?.message?.content || "{}";
    const data = JSON.parse(txt);

    const clean = (o) =>
      o && o.org
        ? {
            org: o.org.trim(),
            title: (o.title || "").trim(),
            email: (o.email || "").trim(),
            address: (o.address || "").trim()
          }
        : null;

    const primary = clean(data.primary);
    const through =
      Array.isArray(data.supervising) && data.supervising[0]
        ? clean(data.supervising[0])
        : null;

    const ccList = [];

    (data.cc || []).forEach((c) => {
      const x = clean(c);
      if (x && !ccList.some((e) => normaliseOrgName(e.org) === normaliseOrgName(x.org)))
        ccList.push(x);
    });

    return { primary, through, ccList };
  } catch (err) {
    console.error("AI detect error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

/* -------------------------------------------------------------
   WATCHDOGS (PCC + NHRC)
------------------------------------------------------------- */
function applyWatchdogs(description, inst) {
  if (!inst) inst = {};
  if (!Array.isArray(inst.ccList)) inst.ccList = [];

  function add(obj) {
    if (!obj || !obj.org) return;
    if (!inst.ccList.some((x) => normaliseOrgName(x.org) === normaliseOrgName(obj.org)))
      inst.ccList.push(obj);
  }

  add({
    org: "Public Complaints Commission",
    email: "",
    address: "Maitama, Abuja"
  });

  const d = description.toLowerCase();
  const rights = ["torture", "killing", "assault", "brutality", "violence"];

  if (rights.some((x) => d.includes(x))) {
    add({
      org: "National Human Rights Commission",
      email: "",
      address: "Abuja"
    });
  }

  return inst;
}

/* -------------------------------------------------------------
   SECTOR SUPERVISORS (POLICE / HEALTH / BANKING etc.)
------------------------------------------------------------- */
function applySectorSupervisors(description, inst) {
  if (!inst) inst = {};
  if (!Array.isArray(inst.ccList)) inst.ccList = [];

  const d = description.toLowerCase();
  const add = (o) => {
    if (!o || !o.org) return;
    if (!inst.ccList.some((c) => normaliseOrgName(c.org) === normaliseOrgName(o.org)))
      inst.ccList.push(o);
  };

  /* POLICE */
  if (textIncludesAny(d, ["police", "sars", "custody", "detention", "igp"])) {
    add({ org: "Inspector-General of Police", address: "Abuja" });
    add({ org: "Police Service Commission", address: "Abuja" });
  }

  /* HEALTH */
  if (textIncludesAny(d, ["hospital", "doctor", "nurse", "negligence"])) {
    add({ org: "Federal Ministry of Health" });
    add({ org: "Medical & Dental Council of Nigeria" });

    if (textIncludesAny(d, ["drug", "medicine", "pharmacy"])) {
      add({ org: "NAFDAC" });
    }
  }

  /* BANKING */
  if (textIncludesAny(d, ["bank", "loan", "atm", "transfer", "pos"])) {
    add({ org: "Central Bank of Nigeria – Consumer Protection" });
    add({ org: "NDIC" });
    add({ org: "FCCPC" });
  }

  /* TELECOM */
  if (textIncludesAny(d, ["mtn", "airtel", "glo", "9mobile", "network"])) {
    add({ org: "NCC – Nigerian Communications Commission" });
  }

  return inst;
}

/* -------------------------------------------------------------
   HYBRID DETECTION PIPELINE
------------------------------------------------------------- */
async function detectHybrid(description) {
  const elec = detectElectricity(description);
  if (elec) return elec;

  const intl = detectInternational(description);
  if (intl) return intl;

  return await aiDetect(description);
}

/* -------------------------------------------------------------
   PETITION BUILDERS
------------------------------------------------------------- */
async function buildPetition(c, inst) {
  if (!openai) return fallbackPetition(c, inst);

  const date = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  const header = `${c.fullName}
${c.address || ""}
${c.email ? "Email: " + c.email : ""}
${c.phone ? "Phone: " + c.phone : ""}
${date}`;

  const ccBlock = inst.ccList
    .map((x) => `${x.org}\n${x.address || ""}`)
    .join("\n\n");

  const primary = `${inst.primary?.org || ""}
${inst.primary?.address || ""}`;

  const through =
    inst.through && inst.through.org
      ? `Through:
${inst.through.org}
${inst.through.address || ""}`
      : "";

  const systemPrompt = `
You are a Nigerian senior petition lawyer.
Write a VERY STRONG, legally structured petition.
No placeholders. Use provided data only.
`;

  const userPrompt = `
${header}

${primary}

${through ? "\n" + through : ""}

CC:
${ccBlock}

SUBJECT: Generate a strong subject from the description.

Description:
${c.description}

Write full petition letter now.
`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    return r.choices?.[0]?.message?.content || fallbackPetition(c, inst);
  } catch (err) {
    console.error("Petition AI error:", err);
    return fallbackPetition(c, inst);
  }
}

/* -------------------------------------------------------------
   FALLBACK PETITION
------------------------------------------------------------- */
function fallbackPetition(c, inst) {
  return `
${c.fullName}
${c.address || ""}
${c.email || ""}
${c.phone || ""}

${inst.primary?.org || ""}

Dear Sir/Madam,

${c.description}

Yours faithfully,
${c.fullName}
`;
}

/* -------------------------------------------------------------
   GENERATE PETITION ENDPOINT
------------------------------------------------------------- */
app.post("/generate-petition", async (req, res) => {
  const { fullName, email, phone, address, description } = req.body;

  if (!description) {
    return res.json({
      petitionText: "Please enter your complaint.",
      primaryInstitution: null,
      throughInstitution: null,
      ccList: []
    });
  }

  const complainant = {
    fullName,
    email,
    phone,
    address,
    description
  };

  let inst = await detectHybrid(description);
  inst = applyWatchdogs(description, inst);
  inst = applySectorSupervisors(description, inst);

  const petitionText = await buildPetition(complainant, inst);

  return res.json({
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList
  });
});

/* -------------------------------------------------------------
   HELPER – FLUTTERWAVE HTTPS REQUEST
------------------------------------------------------------- */
function callFlutterwave(payload, secret) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);

    const options = {
      hostname: "api.flutterwave.com",
      path: "/v3/payments",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        Authorization: `Bearer ${secret}`
      }
    };

    const req = https.request(options, (resp) => {
      let data = "";

      resp.on("data", (chunk) => {
        data += chunk;
      });

      resp.on("end", () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ statusCode: resp.statusCode, data: json });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

/* -------------------------------------------------------------
   PAYMENT ENDPOINT (A12.2 FIXED)
------------------------------------------------------------- */
app.post("/pay", async (req, res) => {
  try {
    const secret = process.env.FLW_SECRET_KEY;

    if (!secret) {
      console.error("FLW_SECRET_KEY missing");
      return res.status(500).json({ error: "Payment gateway not configured." });
    }

    const { fullName, email, description } = req.body;

    const txRef = `PDK-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const payload = {
      tx_ref: txRef,
      amount: 1500,
      currency: "NGN",
      redirect_url:
        process.env.FLW_REDIRECT_URL || "https://petitiondesk.com/payment-complete",
      customer: {
        email: email || "no-email@petitiondesk.com",
        name: fullName || "PetitionDesk User"
      },
      customizations: {
        title: "PetitionDesk – Petition Draft",
        description: description ? description.slice(0, 100) : "Petition service"
      }
    };

    const fw = await callFlutterwave(payload, secret);

    if (!(fw.statusCode >= 200 && fw.statusCode < 300) || !fw.data?.data?.link) {
      console.error("Flutterwave error:", fw);
      return res.status(500).json({ error: "Unable to initialise payment." });
    }

    return res.json({
      paymentLink: fw.data.data.link,
      txRef
    });
  } catch (err) {
    console.error("PAY ERROR:", err);
    return res.status(500).json({ error: "Payment error" });
  }
});

/* -------------------------------------------------------------
   START SERVER
------------------------------------------------------------- */
app.listen(PORT, "0.0.0.0", () =>
  console.log(`JusticeBot A12.2 Backend running on ${PORT}`)
);
