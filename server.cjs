/**
 * PetitionDesk / JusticeBot Backend (A12+ PAYMENT LOCK + Dual Currency)
 * Express + Flutterwave + OpenAI + Routing Engine
 */

const express = require("express");
const cors = require("cors");
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

/* --------------------------------------------------------------
   LOAD institutions.json  
-------------------------------------------------------------- */
let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("Institutions JSON loaded");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

/* --------------------------------------------------------------
   OPENAI INIT
-------------------------------------------------------------- */
let openai = null;
if (process.env.OPENAI_API_KEY) {
  try {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("OpenAI initialised");
  } catch (err) {
    console.error("OpenAI init error:", err);
  }
}

/* --------------------------------------------------------------
   EXPRESS INIT
-------------------------------------------------------------- */
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: "GET,POST",
  })
);

const PORT = process.env.PORT || 5000;

/* --------------------------------------------------------------
   BASIC ROUTES
-------------------------------------------------------------- */
app.get("/", (req, res) => {
  res.send("JusticeBot A12 Backend is running");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

/* --------------------------------------------------------------
   HELPER FUNCTIONS
-------------------------------------------------------------- */
function textIncludesAny(t, arr) {
  t = (t || "").toLowerCase();
  return arr.some((x) => t.includes(x.toLowerCase()));
}
function normalise(o) {
  return (o || "").trim().toLowerCase();
}

/* --------------------------------------------------------------
   ELECTRICITY DETECTION
-------------------------------------------------------------- */
function detectElectricity(description) {
  const d = description.toLowerCase();
  const keywords = [
    "light",
    "electricity",
    "power",
    "billing",
    "meter",
    "prepaid",
    "transformer",
  ];

  if (!textIncludesAny(d, keywords)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];
  let primary = list.find((e) => e.key === "generic_dis");

  const through =
    list.find((e) => e.key === "nerc") || list.find((e) => e.key === "generic_nerc");

  const cc = list
    .filter((i) => i.key !== "generic_dis" && i.key !== "nerc")
    .map((i) => ({
      org: i.org,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    }));

  return { primary, through, ccList: cc };
}

/* --------------------------------------------------------------
   INTERNATIONAL ROUTING
-------------------------------------------------------------- */
function detectInternational(description) {
  const d = description.toLowerCase();
  const triggers = [
    "genocide",
    "extrajudicial",
    "ethnic cleansing",
    "systematic torture",
    "biafra",
    "nnamdi kanu",
    "mass killing",
    "war crime",
  ];

  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};

  const primary = {
    org: intl.us_congress_house?.name || "US House Foreign Affairs Committee",
    email: intl.us_congress_house?.email || "",
    address:
      intl.us_congress_house?.address ||
      "House Committee on Foreign Affairs, Washington, D.C., USA",
    title: "",
  };

  const through = {
    org: "Federal Ministry of Justice",
    title: "Attorney General of the Federation",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
  };

  const cc = Object.values(intl).map((x) => ({
    org: x.name,
    email: x.email || "",
    address: x.address || "",
    title: "",
  }));

  return { primary, through, ccList: cc };
}

/* --------------------------------------------------------------
   AI ROUTING (GENERIC)
-------------------------------------------------------------- */
async function aiDetect(description) {
  if (!openai) return { primary: null, through: null, ccList: [] };

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
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
No placeholders. No fake emails.`,
        },
        {
          role: "user",
          content: description,
        },
      ],
    });

    const data = JSON.parse(r.choices[0].message.content || "{}");

    const clean = (o) =>
      o && o.org
        ? {
            org: o.org.trim(),
            title: o.title?.trim() || "",
            email: o.email?.trim() || "",
            address: o.address?.trim() || "",
          }
        : null;

    const primary = clean(data.primary);
    const through = clean(data.supervising?.[0] || null);

    const ccList = [];
    (data.cc || []).forEach((c) => {
      const obj = clean(c);
      if (obj) ccList.push(obj);
    });

    return { primary, through, ccList };
  } catch (err) {
    console.error("AI routing error:", err);
    return { primary: null, through: null, ccList: [] };
  }
}

/* --------------------------------------------------------------
   FULL HYBRID DETECTION PIPELINE
-------------------------------------------------------------- */
async function detectHybrid(description) {
  const elec = detectElectricity(description);
  if (elec) return elec;

  const intl = detectInternational(description);
  if (intl) return intl;

  return await aiDetect(description);
}

/* --------------------------------------------------------------
   WATCHDOG (PCC + NHRC)
-------------------------------------------------------------- */
function applyWatchdogs(description, inst) {
  if (!inst.ccList) inst.ccList = [];

  const add = (o) => {
    if (!o || !o.org) return;
    if (!inst.ccList.some((c) => normalise(c.org) === normalise(o.org))) {
      inst.ccList.push(o);
    }
  };

  add({
    org: "Public Complaints Commission",
    email: "complaints@pcc.gov.ng",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja",
    title: "Hon. Chief Commissioner",
  });

  const rights = [
    "torture",
    "brutality",
    "violence",
    "killing",
    "rape",
    "discrimination",
    "detention",
  ];

  if (textIncludesAny(description.toLowerCase(), rights)) {
    add({
      org: "National Human Rights Commission",
      email: "info@nhrc.gov.ng",
      address: "Maitama, Abuja",
      title: "Executive Secretary",
    });
  }

  return inst;
}

/* --------------------------------------------------------------
   PETITION BUILDER (OpenAI)
-------------------------------------------------------------- */
async function buildPetition(c, inst) {
  if (!openai) return fallbackPetition(c, inst);

  const header = `
${c.fullName}
${c.address || ""}
Email: ${c.email || ""}
Phone: ${c.phone || ""}
${new Date().toLocaleDateString("en-NG")}
  `.trim();

  const ccText =
    inst.ccList?.map((x) => `${x.org}\n${x.address}`).join("\n\n") || "";

  const primaryBlock = `
${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}
  `.trim();

  const throughBlock =
    inst.through && inst.through.org
      ? `Through:
${inst.through.title || ""}
${inst.through.org}
${inst.through.address || ""}`
      : "";

  const prompt = `
${header}

${primaryBlock}

${throughBlock}

CC:
${ccText}

SUBJECT: Generate subject based on complaint.

Description:
${c.description}

Write a formal, strong Nigerian petition letter. No placeholders.
`;

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a professional petition writer." },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
    });

    return r.choices[0].message.content;
  } catch (err) {
    console.error("OpenAI petition error:", err);
    return fallbackPetition(c, inst);
  }
}

/* --------------------------------------------------------------
   FALLBACK PETITION
-------------------------------------------------------------- */
function fallbackPetition(c, inst) {
  return `
${c.fullName}
${c.address}
Email: ${c.email}
Phone: ${c.phone}

${inst.primary?.org}
${inst.primary?.address}

Through:
${inst.through?.org}

CC:
${inst.ccList.map((x) => x.org).join(", ")}

Dear Sir/Madam,
${c.description}

Yours faithfully,
${c.fullName}
`.trim();
}

/* --------------------------------------------------------------
   POST /generate-petition
-------------------------------------------------------------- */
app.post("/generate-petition", async (req, res) => {
  const { fullName, email, phone, address, description } = req.body;

  if (!description) {
    return res.json({
      error: "Please enter your complaint description.",
    });
  }

  const detect = await detectHybrid(description);
  let inst = applyWatchdogs(description, detect);

  const petitionText = await buildPetition(
    { fullName, email, phone, address, description },
    inst
  );

  res.json({
    petitionText,
    primaryInstitution: inst.primary,
    throughInstitution: inst.through,
    ccList: inst.ccList,
  });
});

/* --------------------------------------------------------------
   PAYMENT (FLUTTERWAVE)
-------------------------------------------------------------- */
app.post("/pay", async (req, res) => {
  try {
    const SECRET = process.env.FLW_SECRET_KEY;
    if (!SECRET) return res.status(500).json({ error: "Payment not configured" });

    const { amount, email, name, description } = req.body;

    const payload = {
      tx_ref: `PDK-${Date.now()}-${Math.floor(Math.random() * 99999)}`,
      amount,
      currency: "NGN",
      redirect_url: process.env.FLW_REDIRECT_URL || "https://petitiondesk.com/",
      customer: {
        email,
        name,
      },
      customizations: {
        title: "PetitionDesk Payment",
        description: description || "AI Petition Payment",
      },
    };

    const resp = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json();

    if (!data?.data?.link) {
      console.error("Flutterwave error:", data);
      return res.json({ error: "Unable to initialize payment" });
    }

    return res.json({
      paymentLink: data.data.link,
      txRef: payload.tx_ref,
    });
  } catch (err) {
    console.error("Payment route error:", err);
    res.json({ error: "Payment processing failed" });
  }
});

/* --------------------------------------------------------------
   START SERVER
-------------------------------------------------------------- */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`JusticeBot Backend running on port ${PORT}`);
});
