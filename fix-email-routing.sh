#!/bin/bash
FILE="server.mjs"

# Fix typos and inconsistent variable names first
sed -i "s/isLiklyOfficialEmail/isLikelyOfficialEmail/g" $FILE
sed -i "s/isLiklyOfficialEmail/isLikelyOfficialEmail/g" $FILE
sed -i "s/buildMailto/buildMailto/g" $FILE

# Insert the new routing logic after sector declaration
sed -i "/const sector =/a\\
\\nconst sectorJson = loadSectorJson(sector);\\
const catalog = buildInstitutionCatalog(sectorJson);\\
\\n// 1) Find institutions actually mentioned\\
const mentioned = findMentionedInstitutions(petitionText || complaint, catalog);\\
\\n// 2) Collect only official HQ emails from matched institutions\\
let mentionedEmails = [];\\
for (const inst of mentioned) {\\
  if (inst?.emails?.length) {\\
    mentionedEmails.push(...inst.emails.filter(isLikelyOfficialEmail));\\
  }\\
}\\
mentionedEmails = [...new Set(mentionedEmails)].filter(Boolean).slice(0, 10);\\
\\n// 3) If no institution matched, fallback ONLY to oversight section\\
if (mentionedEmails.length === 0 && sectorJson?.oversight) {\\
  mentionedEmails = [...new Set(\\
    extractEmailsDeep(sectorJson.oversight).filter(isLikelyOfficialEmail)\\
  )].slice(0, 10);\\
}\\
\\n// 4) Build final mailto link\\
const subject = extractSubjectFromPetition(petitionText) || \`Official Petition Submission — \${new Date().toLocaleDateString("en-GB")}\`;\\
const body = (petitionText || complaint || \\"\").toString();\\
\\nconst watchdogCC = [process.env.PCC_EMAIL, process.env.FCCPC_EMAIL].filter(Boolean).slice(0, 10);\\
\\nconst mailto = buildMailto({ to: mentionedEmails, cc: watchdogCC, subject, body });\\
\\nif (!mailto) {\\
  return res.status(404).json({\\
    error: \\"No verified official HQ emails found for routing.\\",\\
    sector,\\
    mentionedInstitutions: mentioned.map(m => m.name),\\
    to: mentionedEmails,\\
    cc: watchdogCC,\\
    note: \\"Ensure sector JSON contains official HQ emails in regulators or oversight section.\\"\\
  });\\
}\\
\\nres.json({ sector, caseType: inferCaseType(sector), subject, mentionedInstitutions: mentioned.map(m => m.name), to: mentionedEmails, cc: watchdogCC, mailto });
EOF'

chmod +x fix-email-routing.sh
./fix-email-routing.sh
