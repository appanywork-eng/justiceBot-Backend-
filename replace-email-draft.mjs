import fs from "fs";

const file = "server.mjs";
let src = fs.readFileSync(file, "utf8");

const START = 'app.post("/email-draft"';
const END = 'app.get("/download-pdf"';

const s = src.indexOf(START);
const e = src.indexOf(END);

if (s === -1) {
  console.error("❌ Could not find /email-draft endpoint start in server.mjs");
  process.exit(1);
}
if (e === -1) {
  console.error("❌ Could not find /download-pdf endpoint (end marker) in server.mjs");
  process.exit(1);
}
if (e <= s) {
  console.error("❌ Invalid markers order. /download-pdf appears before /email-draft.");
  process.exit(1);
}

const replacement = `
app.post("/email-draft", async (req, res) => {
  try {
    const { complaint = "", sector: sectorIn = "", petitionText = "" } = req.body || {};
    const inputText = (petitionText || complaint || "").toString();
    const sector = (sectorIn || detectSector(inputText) || "unknown").toLowerCase();

    if (sector === "unknown") {
      return res.status(400).json({ error: "Sector not recognized." });
    }

    const caseType = inferCaseType(sector);
    const adminCC = buildAdminOversightCC({ sector, caseType });

    const sectorJson = loadSectorJson(sector);
    const catalog = buildInstitutionCatalog(sectorJson);

    // 1) institutions actually mentioned in the petition/complaint
    const mentioned = findMentionedInstitutions(inputText, catalog);

    // 2) Extract ONLY emails from mentioned institutions (NO sector-wide fallback)
    let mentionedEmails = safeUniq(
      mentioned.flatMap((m) => (Array.isArray(m.emails) ? m.emails : []))
    )
      .filter(isEmail)
      .slice(0, 10);

    if (mentionedEmails.length === 0) {
      return res.status(404).json({
        error: "No verified official emails found for routing.",
        sector,
        mentionedInstitutions: mentioned.map((m) => m.name),
        to: [],
        cc: safeUniq([process.env.PCC_EMAIL, process.env.FCCPC_EMAIL])
          .filter(isEmail)
          .slice(0, 10),
        note:
          "Your petition must clearly mention the institution name (e.g., 'NCAA', 'Air Peace', 'NIBSS', 'CBN') so routing can target ONLY the mentioned bodies. No sector-wide email fallback is allowed."
      });
    }

    // 3) subject + body
    const subject =
      extractSubjectFromPetition(inputText) ||
      \`Official Petition Submission — \${new Date().toLocaleDateString("en-GB")}\`;

    const body = inputText;

    // 4) CC watchdogs only (+ adminCC still CC only)
    const watchdogCC = safeUniq([
      process.env.PCC_EMAIL,
      process.env.FCCPC_EMAIL,
      ...(Array.isArray(adminCC) ? adminCC : [])
    ])
      .filter(isEmail)
      .slice(0, 10);

    const mailto = buildMailto({
      to: mentionedEmails,
      cc: watchdogCC,
      subject,
      body
    });

    if (!mailto) {
      return res.status(404).json({
        error: "No valid mailto could be built (missing TO).",
        sector,
        mentionedInstitutions: mentioned.map((m) => m.name),
        to: mentionedEmails,
        cc: watchdogCC
      });
    }

    // 5) Return clean routing result
    return res.json({
      sector,
      caseType,
      subject,
      mentionedInstitutions: mentioned.map((m) => m.name),
      to: mentionedEmails,
      cc: watchdogCC,
      mailto
    });
  } catch (err) {
    console.error("Email draft error:", err);
    return res.status(500).json({ error: "Failed to build email draft." });
  }
});

`;

src = src.slice(0, s) + replacement + "\n" + src.slice(e);
fs.writeFileSync(file, src, "utf8");
console.log("✅ Replaced /email-draft endpoint safely.");
