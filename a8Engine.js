/**
 * JUSTICEBOT - FULL OPENAI MODE
 * Fix: Mandatory CC enforcement applied BEFORE any rendering.
 */

const OpenAI = require("openai");

// ---------------- OPENAI CLIENT ----------------
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("[A8] OpenAI client initialised");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set - will use fallback petition");
  }
} catch (err) {
  console.error("[A8] Error initialising OpenAI client:", err);
  openai = null;
}

// ---------------- helpers ----------------
function safeString(v) {
  return typeof v === "string" ? v : "";
}

function normaliseInstitution(i) {
  if (!i || typeof i !== "object") return null;
  return {
    org: safeString(i.org || i.name),
    title: safeString(i.title),
    address: safeString(i.address),
    email: safeString(i.email),
    phone: safeString(i.phone),
  };
}

function uniqueByOrg(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = (item?.org || "").trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * 🔥 Mandatory CC enforcement
 * Rule: CC must never be empty for justice-type petitions.
 * - Always: PCC
 * - If rights/abuse/denial/negligence: NHRC
 * - If health keywords: MDCN
 */
function enforceMandatoryCC(ccList = [], description = "") {
  const enforced = Array.isArray(ccList) ? [...ccList] : [];

  const has = (needle) =>
    enforced.some(
      (c) =>
        c &&
        c.org &&
        c.org.toLowerCase().includes(String(needle).toLowerCase())
    );

  // Always copy PCC
  if (!has("Public Complaints Commission")) {
    enforced.push({
      org: "Public Complaints Commission",
      title: "Public Complaints Commission",
      address: "",
      email: "",
      phone: "",
    });
  }

  // Rights / denial / abuse / negligence -> NHRC
  if (
    /denial|abuse|inhuman|negligence|rights|life|medical|assault|detention|extortion|harassment|torture|brutality/i.test(
      description || ""
    )
  ) {
    if (!has("National Human Rights Commission")) {
      enforced.push({
        org: "National Human Rights Commission",
        title: "National Human Rights Commission",
        address: "",
        email: "",
        phone: "",
      });
    }
  }

  // Health sector -> MDCN
  if (/hospital|doctor|medical|health|clinic|patient|nurse/i.test(description || "")) {
    if (!has("Medical and Dental Council")) {
      enforced.push({
        org: "Medical and Dental Council of Nigeria",
        title: "Medical and Dental Council of Nigeria",
        address: "",
        email: "",
        phone: "",
      });
    }
  }

  return uniqueByOrg(enforced);
}

function buildRoutingSummary(primary, through, ccList) {
  const parts = [];
  if (primary?.org) parts.push(`Primary: ${primary.org}`);
  if (through?.org) parts.push(`Through: ${through.org}`);
  if (Array.isArray(ccList) && ccList.length) {
    parts.push(`CC: ${ccList.map((x) => x.org).filter(Boolean).join(", ")}`);
  }
  return parts.length ? parts.join(" | ") : null;
}

// ---------------- FALLBACK PETITION ----------------
function buildFallbackPetition(complainant, description, routing = {}) {
  const {
    fullName = "",
    email = "",
    phone = "",
    address = "",
  } = complainant || {};

  const dateString = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const primary = routing.primary?.org ? routing.primary : null;
  const through = routing.through?.org ? routing.through : null;
  const ccList = Array.isArray(routing.cc) ? routing.cc : [];

  let text = "";
  text +=
    [fullName || "", address || "", email ? `Email: ${email}` : "", phone ? `Phone: ${phone}` : "", dateString]
      .filter(Boolean)
      .join("\n") + "\n\n";

  if (primary) {
    text += [primary.title, primary.org, primary.address].filter(Boolean).join("\n") + "\n\n";
  } else {
    text += "The Appropriate Authority\n\n";
  }

  if (through) {
    text += "Through:\n";
    text += [through.title, through.org, through.address].filter(Boolean).join("\n") + "\n\n";
  }

  // ✅ CC block always prints real items (never NONE)
  if (ccList.length) {
    text += "CC:\n";
    for (const c of ccList) {
      const bits = [c.title, c.org, c.address].filter(Boolean).join("\n");
      if (bits) text += bits + "\n\n";
    }
  }

  const subject = safeString(routing.subject) || "FORMAL COMPLAINT / PETITION";
  text += `SUBJECT: ${subject}\n\n`;

  text += "Dear Sir/Madam,\n\n";
  text += "I am writing to formally lodge a complaint regarding the matter described below.\n\n";
  text += safeString(description).trim() + "\n\n";
  text += "I respectfully request that your office urgently investigate this complaint and take appropriate action.\n\n";
  text += "Yours faithfully,\n";
  text += (fullName || "The Complainant") + "\n";
  if (phone) text += phone + "\n";
  if (email) text += email + "\n";

  return text.trim();
}

// ---------------- 1st CALL: ROUTING JSON ----------------
async function buildRoutingWithOpenAI({ complainant, description }) {
  if (!openai) throw new Error("OpenAI client not available");

  const routingSystemPrompt = `
You are a "ROUTING ENGINE" for a Nigerian / international petition platform.

Your job:
- Read the complaint description and complainant details.
- Decide the MOST APPROPRIATE institutions for:
  * primary (main addressee)
  * through (optional)
  * cc (bodies that should be copied)

IMPORTANT LIMITATIONS ABOUT EMAILS:
- You do NOT have live internet.
- Use ONLY official, well-known emails you are confident in.
- If not at least 90% sure, leave email empty "".
- NEVER invent random-looking emails just to fill fields.

Output format:
Return ONE JSON object ONLY, no commentary, no markdown, no trailing commas.

Schema example:
{
  "primary": {"org":"...","title":"...","address":"...","email":"","phone":""},
  "through": {"org":"...","title":"...","address":"...","email":"","phone":""} | null,
  "cc": [
    {"org":"...","title":"...","address":"...","email":"","phone":""}
  ],
  "subject": "COMPLAINT ABOUT ...",
  "summary": "2-4 sentence legal-style summary",
  "emails_confidence": "high" | "medium" | "low"
}

Critical rule:
- If you don't know emails/addresses, leave them empty.
- Still provide org/title where possible.
`;

  const complainantBlock = [
    `Name: ${safeString(complainant?.fullName)}`,
    `Email: ${safeString(complainant?.email)}`,
    `Phone: ${safeString(complainant?.phone)}`,
    `Address: ${safeString(complainant?.address)}`,
  ].join("\n");

  const userPrompt = `
COMPLAINANT:
${complainantBlock}

COMPLAINT DESCRIPTION:
${safeString(description)}
`.trim();

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: routingSystemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content || "";
  if (!raw.trim()) throw new Error("OpenAI routing call returned empty content");

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[A8] Failed to parse routing JSON, raw output:", raw);
    throw new Error("Routing JSON parse error: " + err.message);
  }

  const primary = normaliseInstitution(parsed.primary);
  const through = normaliseInstitution(parsed.through);

  // ✅ Parse CC then ENFORCE BEFORE ANY RENDERING
  let cc = Array.isArray(parsed.cc)
    ? parsed.cc.map(normaliseInstitution).filter(Boolean)
    : [];
  cc = enforceMandatoryCC(cc, description);

  const subject = safeString(parsed.subject) || "FORMAL COMPLAINT / PETITION";
  const summary = safeString(parsed.summary);
  const emailsConfidence = safeString(parsed.emails_confidence) || "low";

  return {
    primary,
    through,
    cc,
    subject,
    summary,
    emailsConfidence,
  };
}

// ---------------- 2nd CALL: DRAFT PETITION ----------------
async function buildPetitionWithOpenAI({ complainant, description, routing }) {
  if (!openai) throw new Error("OpenAI client not available");

  const { primary, through, cc, subject } = routing || {};
  const ccList = Array.isArray(cc) ? cc : [];

  const routingSummary = buildRoutingSummary(primary, through, ccList);

  const dateString = new Date().toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const {
    fullName = "",
    email = "",
    phone = "",
    address = "",
  } = complainant || {};

  const primaryBlock = [primary?.title, primary?.org, primary?.address].filter(Boolean).join("\n") || "NONE";

  const throughBlock = through
    ? [through.title, through.org, through.address].filter(Boolean).join("\n")
    : "NONE";

  const ccBlockText = ccList
    .map((c) => {
      const bits = [];
      if (c.title) bits.push(c.title);
      if (c.org) bits.push(c.org);
      if (c.address) bits.push(c.address);
      return bits.join("\n");
    })
    .filter(Boolean)
    .join("\n\n");

  const complainantBlock = [
    fullName || "",
    address || "",
    email ? `Email: ${email}` : "",
    phone ? `Phone: ${phone}` : "",
    dateString,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `
You are a Senior Advocate of Nigeria / international human rights counsel.

Your job:
- Draft a HIGH-QUALITY petition letter based ONLY on:
  * the complainant's details
  * the complaint description
  * the routing info (primary, through, cc, subject)
- DO NOT invent new institutions, addresses or emails.
- Use institutions exactly as given.

Tone:
- Formal, firm, respectful, precise.
- Clear structure, easy to read for real authorities.

Structure:
1) Complainant details at top
2) Primary institution block
3) "Through:" block (if any)
4) "CC:" block listing each CC institution on its own lines
5) Subject line starting with "SUBJECT:"
6) Opening paragraph
7) Facts of the case
8) Legal/rights basis (brief but solid when possible)
9) Numbered reliefs
10) Closing
11) "Yours faithfully," + name and contact

Output:
ONE plain-text letter (no markdown).
`.trim();

  const userPrompt = `
COMPLAINANT:
${complainantBlock}

PRIMARY INSTITUTION:
${primaryBlock}

THROUGH INSTITUTION:
${throughBlock}

CC INSTITUTIONS:
${ccBlockText || "NONE"}

ROUTING SUMMARY (FOR YOUR UNDERSTANDING ONLY - DO NOT COPY):
${routingSummary || "N/A"}

SUBJECT:
${safeString(subject)}

COMPLAINT DESCRIPTION:
${safeString(description)}
`.trim();

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = resp.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new Error("OpenAI petition call returned empty content");
  return text.trim();
}

// ---------------- MAIN EXPORTED FUNCTION ----------------
async function generatePetitionA8(args) {
  const { description, complainant } = args || {};
  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new Error("Description is missing or too short");
  }

  const realComplainant = complainant || {};

  // If OpenAI is not available, use fallback (still with enforced CC)
  if (!openai) {
    const routing = {
      primary: null,
      through: null,
      cc: enforceMandatoryCC([], description),
      subject: "FORMAL COMPLAINT / PETITION",
    };

    const petitionText = buildFallbackPetition(realComplainant, description, routing);

    return {
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: routing.cc,
      routingSummary: buildRoutingSummary(null, null, routing.cc),
      subject: routing.subject,
    };
  }

  // 1) Routing
  let routing;
  try {
    routing = await buildRoutingWithOpenAI({ complainant: realComplainant, description });
  } catch (err) {
    console.error("[A8] Routing step failed, falling back:", err?.message || err);
    routing = {
      primary: null,
      through: null,
      cc: enforceMandatoryCC([], description),
      subject: "FORMAL COMPLAINT / PETITION",
      summary: "",
      emailsConfidence: "low",
    };
  }

  // 2) Petition drafting
  let petitionText;
  try {
    petitionText = await buildPetitionWithOpenAI({
      complainant: realComplainant,
      description,
      routing,
    });
  } catch (err) {
    console.error("[A8] Petition drafting failed, using fallback:", err?.message || err);
    petitionText = buildFallbackPetition(realComplainant, description, routing);
  }

  const routingSummary = buildRoutingSummary(routing.primary, routing.through, routing.cc);

  return {
    petitionText,
    primaryInstitution: routing.primary,
    throughInstitution: routing.through,
    ccList: routing.cc,
    routingSummary,
    subject: routing.subject || "FORMAL COMPLAINT / PETITION",
  };
}

module.exports = {
  generatePetitionA8,
};
