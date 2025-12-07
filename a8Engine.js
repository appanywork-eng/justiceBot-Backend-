/**
 * JUSTICEBOT – FULL OPENAI MODE (NO institutions.json)
 * ----------------------------------------------------
 * - OpenAI figures out:
 *      * primary institution (To)
 *      * through institution (Through) – optional
 *      * CC list – optional
 *      * subject + short routing summary
 * - Second OpenAI call writes a full Senior-Advocate-level petition.
 *
 * NOTE: OpenAI CANNOT truly “verify” emails from the live internet.
 * We only tell it:
 *   - use ONLY well-known official emails it is very confident about
 *   - otherwise leave email fields empty ("").
 */

const OpenAI = require("openai");

// ---------------------------------------------
// OPENAI CLIENT
// ---------------------------------------------
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log("[A8] OpenAI client initialised (FULL AI MODE)");
  } else {
    console.warn("[A8] OPENAI_API_KEY not set – will always use fallback petition.");
  }
} catch (err) {
  console.error("[A8] Error initialising OpenAI client:", err);
  openai = null;
}

// ---------------------------------------------
// Small helpers
// ---------------------------------------------
function safeString(v) {
  return typeof v === "string" ? v : "";
}

function buildRoutingSummary(primary, through, ccList) {
  const parts = [];
  if (primary && primary.org) parts.push(`Primary: ${primary.org}`);
  if (through && through.org) parts.push(`Through: ${through.org}`);
  if (Array.isArray(ccList) && ccList.length) {
    const names = ccList
      .filter((c) => c && c.org)
      .map((c) => c.org)
      .join("; ");
    if (names) parts.push(`CC: ${names}`);
  }
  return parts.length ? parts.join(" | ") : null;
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

// ---------------------------------------------
// FALLBACK PETITION – when OpenAI is not available
// ---------------------------------------------
function buildFallbackPetition(complainant, description) {
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

  let text = "";
  text +=
    [
      fullName || "",
      address || "",
      email ? `Email: ${email}` : "",
      phone ? `Phone: ${phone}` : "",
      dateString,
    ]
      .filter(Boolean)
      .join("\n") + "\n\n";

  text += "The Appropriate Authority\n\n";
  text += "Dear Sir/Madam,\n\n";
  text += "RE: FORMAL COMPLAINT / PETITION\n\n";
  text +=
    "I am writing to formally lodge a complaint regarding the matter described below:\n\n";
  text += safeString(description).trim() + "\n\n";
  text +=
    "I respectfully request that your good office investigate this complaint and take all necessary steps to ensure that justice is done.\n\n";
  text += "Yours faithfully,\n\n";
  text += (fullName || "The Complainant") + "\n";
  if (phone) text += phone + "\n";
  if (email) text += email + "\n";

  return text;
}

// ---------------------------------------------
// 1st CALL – ask OpenAI ONLY for JSON routing
// ---------------------------------------------
async function buildRoutingWithOpenAI({ complainant, description }) {
  if (!openai) {
    throw new Error("OpenAI client not available");
  }

  const routingSystemPrompt = `
You are a "ROUTING ENGINE" for a Nigerian / international petition platform.

Your job:
- Read the complaint description and complainant details.
- Decide the MOST APPROPRIATE institutions for:
  * primary (main addressee)
  * through (if routing through another authority is best)
  * cc (other bodies that should be copied)

IMPORTANT LIMITATIONS ABOUT EMAILS:
- You DO NOT have live internet.
- You MUST NOT pretend to browse websites or social media.
- Use ONLY official, well-known email addresses you are VERY confident about
  based on your training data.
- If you are not at least 90% sure an email is correct, set "email": "" for that institution.
- NEVER invent random-looking emails just to fill the field.

Geography:
- Default focus is Nigeria and West Africa, but you may include regional /
  international bodies (UN, AU, ECOWAS, etc.) for serious human rights cases.

Output format:
Return ONE JSON object ONLY, with NO extra text, like this example:

{
  "primary": { "org": "...", "title": "...", "address": "...", "email": "", "phone": "" },
  "through": { "org": "...", "title": "...", "address": "...", "email": "", "phone": "" } | null,
  "cc": [
    { "org": "...", "title": "...", "address": "...", "email": "", "phone": "" }
  ],
  "subject": "COMPLAINT ABOUT ...",
  "summary": "2–4 sentence legal-style summary of the complaint.",
  "emails_confidence": "high" | "medium" | "low"
}

Rules:
- JSON ONLY. No commentary, no markdown, no backticks.
- No trailing commas.
- If you truly don't know who to send to, set:
    "primary": { "org": "The Appropriate Authority", "title": "", "address": "", "email": "", "phone": "" }
  and leave "through": null and "cc": [].
`;

  const complainantBlock = `
Name: ${safeString(complainant.fullName)}
Email: ${safeString(complainant.email)}
Phone: ${safeString(complainant.phone)}
Address: ${safeString(complainant.address)}
`;

  const userPrompt = `
COMPLAINANT:
${complainantBlock}

COMPLAINT DESCRIPTION:
${safeString(description)}
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: routingSystemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = resp.choices?.[0]?.message?.content || "";
  if (!raw.trim()) {
    throw new Error("OpenAI routing call returned empty content");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("[A8] Failed to parse routing JSON, raw output:", raw);
    throw new Error("Routing JSON parse error: " + err.message);
  }

  const primary = normaliseInstitution(parsed.primary);
  const through = normaliseInstitution(parsed.through);
  const cc = Array.isArray(parsed.cc)
    ? parsed.cc.map(normaliseInstitution).filter(Boolean)
    : [];

  const subject = safeString(parsed.subject) || "FORMAL COMPLAINT / PETITION";
  const summary = safeString(parsed.summary);
  const emailsConfidence = safeString(parsed.emails_confidence || parsed.emailsConfidence);

  return {
    primary,
    through,
    cc,
    subject,
    summary,
    emailsConfidence,
  };
}

// ---------------------------------------------
// 2nd CALL – draft the full petition letter
// ---------------------------------------------
async function buildPetitionWithOpenAI({ complainant, description, routing }) {
  if (!openai) {
    throw new Error("OpenAI client not available");
  }

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

  const primary = routing.primary || {};
  const through = routing.through || null;
  const ccList = routing.cc || [];
  const subject = routing.subject || "FORMAL COMPLAINT / PETITION";

  const routingSummary = buildRoutingSummary(primary, through, ccList);

  const systemPrompt = `
You are a Senior Advocate of Nigeria / international human-rights lawyer.

Your job:
- Draft a HIGH-QUALITY petition letter based ONLY on:
  * the complainant's details,
  * the complaint description,
  * the routing information (primary, through, cc, subject) provided.
- DO NOT invent new institutions, addresses or emails.
- Use the institutions EXACTLY as given.
- If an institution has no address or email, simply omit those lines.

Tone:
- Formal, firm, respectful, precise.
- Clear structure, easy to read for real authorities.

Structure the petition:

1) Complainant details at the top (name, address if given, email, phone, date).
2) Primary institution block (title, org, address).
3) "Through:" block (if any).
4) "CC:" block listing each CC institution on its own line (title, org, address).
5) Subject line starting with "RE: ...".
6) Opening paragraph: introduce complainant and purpose.
7) Facts of the case: well organised, no invented facts.
8) Legal / rights basis (brief but solid) when possible.
9) Numbered reliefs / prayers (1., 2., 3., ...).
10) Closing paragraph (urgency & respect).
11) "Yours faithfully," + complainant name and contact.

Output: ONE plain-text letter that can be copied into an email or PDF directly.
No markdown, no bullets using "*", just normal text and numbered reliefs.
`;

  const primaryBlock = [
    primary.title || "",
    primary.org || "",
    primary.address || "",
  ]
    .filter(Boolean)
    .join("\n");

  const throughBlock = through
    ? [
        through.title || "",
        through.org || "",
        through.address || "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const ccBlockText = ccList
    .map((c) => {
      const bits = [];
      if (c.title) bits.push(c.title);
      bits.push(c.org);
      if (c.address) bits.push(c.address);
      return bits.join("\n");
    })
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

  const userPrompt = `
COMPLAINANT:
${complainantBlock}

PRIMARY INSTITUTION:
${primaryBlock || "NONE"}

THROUGH INSTITUTION:
${throughBlock || "NONE"}

CC INSTITUTIONS:
${ccBlockText || "NONE"}

ROUTING SUMMARY (FOR YOUR UNDERSTANDING ONLY – DO NOT COPY THIS LINE):
${routingSummary || "N/A"}

SUBJECT (you must use this after "RE:"):
${subject}

COMPLAINT DESCRIPTION (raw from user – organise this into facts):
${safeString(description)}
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = resp.choices?.[0]?.message?.content || "";
  if (!text.trim()) {
    throw new Error("OpenAI petition call returned empty content");
  }

  return text.trim();
}

// ---------------------------------------------
// MAIN EXPORTED FUNCTION
// ---------------------------------------------
async function generatePetitionA8(args) {
  const { description, complainant } = args || {};

  if (!description || typeof description !== "string" || description.trim().length < 10) {
    throw new Error("Description is missing or too short for A8");
  }

  const realComplainant = complainant || {};

  // If OpenAI is not available at all, just use simple fallback.
  if (!openai) {
    const petitionText = buildFallbackPetition(realComplainant, description);
    return {
      petitionText,
      primaryInstitution: null,
      throughInstitution: null,
      ccList: [],
      routingSummary: null,
      subject: "FORMAL COMPLAINT / PETITION",
    };
  }

  let routing = {
    primary: null,
    through: null,
    cc: [],
    subject: "FORMAL COMPLAINT / PETITION",
    summary: "",
    emailsConfidence: "",
  };

  try {
    routing = await buildRoutingWithOpenAI({ complainant: realComplainant, description });
  } catch (err) {
    console.error("[A8] Routing step failed, falling back to minimal routing:", err.message);
    routing = {
      primary: {
        org: "The Appropriate Authority",
        title: "",
        address: "",
        email: "",
        phone: "",
      },
      through: null,
      cc: [],
      subject: "FORMAL COMPLAINT / PETITION",
      summary: "",
      emailsConfidence: "low",
    };
  }

  let petitionText;
  try {
    petitionText = await buildPetitionWithOpenAI({
      complainant: realComplainant,
      description,
      routing,
    });
  } catch (err) {
    console.error("[A8] Petition drafting failed, using simple fallback:", err.message);
    petitionText = buildFallbackPetition(realComplainant, description);
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
