// core/petitions.js
// SAN-grade petition builder (police-special + general) + fallback.

const { getOpenAI } = require("./openaiClient");

// FALLBACK PETITION (NO OPENAI OR ERROR)
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
${(inst.ccList || []).map((x) => x.org).join("\n")}

Dear Sir/Madam,

RE: FORMAL COMPLAINT / PETITION

${c.description}

I respectfully request an immediate investigation and appropriate remedies.

Yours faithfully,
${c.fullName}
${c.phone || ""}
${c.email || ""}
`.trim();
}

// PETITION BUILDERS (PDPS-2.2)
async function buildPetition(complainant, inst, sector) {
  const openai = getOpenAI();
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
      ?.map((c) => `${c.org}\n${c.address || ""}`.trim())
      .join("\n\n") || "None";

  const primaryBlock = `
${inst.primary?.title || ""}
${inst.primary?.org || ""}
${inst.primary?.address || ""}`.trim();

  const throughBlock =
    inst.through && inst.through.org
      ? `Through:
${inst.through.title || ""}
${inst.through.org}
${inst.through.address || ""}`.trim()
      : "";

  let systemPrompt;
  let userPrompt;

  // --- POLICE SPECIAL TEMPLATE (SAN-grade) ---
  if (sector === "police") {
    systemPrompt = `
You are a top-tier Nigerian human rights and criminal justice lawyer (SAN level).
Write an EXTREMELY STRONG but respectful police-related petition.

STRICT FORMAT:
- Nigerian official letter style.
- No placeholders (no [Your Name], [Address], etc.).
- Use ONLY real details from the prompt.
- Tone: firm, legal, authoritative, respectful, fearless.
- Use numbered paragraphs for the facts (2, 3, 4...).
- Include a short "Legal Basis" section referencing:
  * Section 34(1) of the 1999 Constitution (right to dignity).
  * Section 35 (right to personal liberty).
  * Section 36 (fair hearing) – where relevant.
  * Relevant provisions of the Administration of Criminal Justice Act (ACJA) 2015 on arrest/detention.
  * Police Act 2020 & Anti-Torture Act 2017 where relevant.
- Include a clear "Reliefs Sought" section with numbered prayers.
- Closing must be strong but courteous, affirming trust in the institution.

ADDRESSING RULES:
- Use the provided primary and "Through" blocks EXACTLY as given.
- If "Through" is present, show it under the primary block.
- "CC" section should list key watchdogs provided (PCC, NHRC, others).

OUTPUT:
- Fully ready-to-print letter.
- No explanations, no markdown, no commentary – ONLY the petition letter text.
`;

    userPrompt = `
${header}

${primaryBlock}

${throughBlock ? "\n\n" + throughBlock : ""}

CC:
${ccText}

SUBJECT:
Write a strong, all-caps subject line that clearly captures UNLAWFUL ARREST, ILLEGAL DETENTION, EXTORTION, THREAT TO LIFE or other police misconduct based strictly on the facts below.

FACTS OF THE CASE (use this to build clear, numbered facts):
${description}

INSTRUCTIONS:
- Do NOT invent new facts.
- Do NOT invent institutions that are not in the addressing / CC.
- Make the story clear: date, place (checkpoint / station), officers (if named), actions taken, threats, breaches.
- Then add a short "Legal Basis" section citing the relevant laws.
- Then add a numbered "Reliefs Sought" section (investigation, discipline, apology, compensation, etc. as appropriate).
- End with "Yours faithfully," and the complainant's name.`;
  } else {
    // --- GENERAL / OTHER SECTORS (still strong, SAN-like) ---
    systemPrompt = `
You are an expert Nigerian petition drafting lawyer (SAN standard).
Write a VERY STRONG, highly formal petition.

Rules:
- Nigerian official letter style.
- No placeholders (no [Your Name], [Address], etc.).
- Use only the real-world details provided.
- Tone: firm, legal, respectful, authoritative.
- Structure:
  * Header with complainant details and date.
  * Proper addressing of primary institution (and "Through" block if any).
  * CC list.
  * Clear subject line.
  * Facts of the case in numbered or well-structured paragraphs.
  * Short legal / rights basis (e.g., Public Complaints Commission Act, Consumer protection laws, sector regulators, Constitution) where appropriate.
  * Numbered "Reliefs Sought" section.
  * Strong closing paragraph.
  * "Yours faithfully" and complainant details.

- Do NOT invent new institutions beyond those in the addressing / CC.
- Do NOT add fake statutes; only use well-known Nigerian frameworks (Constitution, PCC Act, sector regulators, consumer protection, etc.).
`;

    userPrompt = `
${header}

${primaryBlock}

${throughBlock ? "\n\n" + throughBlock : ""}

CC:
${ccText}

SUBJECT:
Generate a strong, precise subject line based strictly on the description.

Description of complaint (use this to build the facts):
${description}

Write the full petition letter now following all rules. Do NOT invent new facts or new institutions.`;
  }

  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.22,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return (
      r.choices?.[0]?.message?.content ||
      fallbackPetition(complainant, inst)
    );
  } catch (err) {
    console.error("AI petition error:", err);
    return fallbackPetition(complainant, inst);
  }
}

module.exports = {
  buildPetition,
  fallbackPetition,
};
