#!/bin/bash
FILE="server.mjs"

sed -i "/const sector =/a\\
\\nconst sectorJson = loadSectorJson(sector);\
const catalog = buildInstitutionCatalog(sectorJson);\
\\n// 1) Find institutions actually mentioned\
const mentioned = findMentionedInstitutions(petitionText || complaint, catalog);\
\\n// 2) Collect only official HQ emails from matched institutions\
let mentionedEmails = [];\
for (const inst of mentioned) {\
  if (inst?.emails?.length) {\
    mentionedEmails.push(...inst.emails.filter(isLikelyOfficialEmail));\
  }\
}\
mentionedEmails = [...new Set(mentionedEmails)].filter(Boolean).slice(0, 10);\
\\n// 3) If none matched, fallback ONLY to oversight watchdogs\
if (mentionedEmails.length === 0 && sectorJson?.oversight) {\
  mentionedEmails = [...new Set(\
    extractEmailsDeep(sectorJson.oversight).filter(isLikelyOfficialEmail)\
  )].slice(0, 10);\
}\
\\n// 4) Build final mailto link\
const subject = extractSubjectFromPetition(petitionText) ||\
  \`Official Petition Submission — \${new Date().toLocaleDateString("en-GB")}\`;\
\\nconst body = (petitionText || complaint || \"\").toString();\
\\nconst mailto = buildMailto({\
  to: mentionedEmails,\
  cc: OVERSIGHT_EMAILS.PCC && OVERSIGHT_EMAILS.FCCPC\
    ? [OVERSIGHT_EMAILS.PCC, OVERSIGHT_EMAILS.FCCPC]\
    : [],\
  subject,\
  body\
});\
\\nif (!mailto) {\
  return res.status(404).json({\
    error: \"No verified official HQ emails found for routing.\",\
    sector,\
    mentionedInstitutions: mentioned.map(m => m.name),\
    to: mentionedEmails,\
    cc: [OVERSIGHT_EMAILS.PCC, OVERSIGHT_EMAILS.FCCPC].filter(Boolean),\
    note: \"Ensure sector JSON contains official HQ emails in regulators or oversight section.\"\
  });\
}\
\\nres.json({\
  sector,\
  caseType,\
  subject,\
  mentionedInstitutions: mentioned.map(m => m.name),\
  to: mentionedEmails,\
  cc: [OVERSIGHT_EMAILS.PCC, OVERSIGHT_EMAILS.FCCPC].filter(Boolean),\
  mailto_to: mentionedEmails,\
  mailto_cc: [OVERSIGHT_EMAILS.PCC, OVERSIGHT_EMAILS.FCCPC].filter(Boolean),\
  mailto\
});
