#!/bin/bash
# This script inserts a strict email-routing block into server.mjs

FILE="server.mjs"

BLOCK='
const sectorJson = loadSectorJson(sector);
const catalog = buildInstitutionCatalog(sectorJson);

// 1) Get institutions actually mentioned
const mentioned = findMentionedInstitutions(petitionText || complaint, catalog);

// 2) Extract ONLY emails from mentioned institutions
let mentionedEmails = [];
for (const inst of mentioned) {
  if (Array.isArray(inst.emails) && inst.emails.length > 0) {
    mentionedEmails.push(...inst.emails);
  }
}

// Ensure uniqueness + limit to 10
mentionedEmails = [...new Set(mentionedEmails)].filter(isEmail).slice(0, 10);

// 3) Build mail subject and body
const subject = extractSubjectFromPetition(petitionText) ||
  `Official Petition Submission — ${new Date().toLocaleDateString("en-GB")}`;

const body = (petitionText || complaint || "").toString();

// 4) Assign TO and CC strictly
const watchdogCC = [process.env.PCC_EMAIL, process.env.FCCPC_EMAIL].filter(Boolean).slice(0, 10);

const mailto = buildMailto({
  to: mentionedEmails,
  cc: watchdogCC,
  subject,
  body
});

if (!mailto) {
  return res.status(404).json({
    error: "No verified official emails found for routing.",
    sector,
    mentionedInstitutions: mentioned.map(m => m.name),
    to: mentionedEmails,
    cc: watchdogCC,
    note: "Ensure sector JSON contains official HQ emails for mentioned institutions only."
  });
}

// 5) Return clean routing result
res.json({
  sector,
  caseType: inferCaseType(sector),
  subject,
  mentionedInstitutions: mentioned.map(m => m.name),
  to: mentionedEmails,
  cc: watchdogCC,
  mailto
});
'

# Insert BLOCK right after sector line (only first match)
sed -i "0,/const sector =/s//const sector =/&\n$BLOCK/" "$FILE"
