#!/bin/bash
sed -i '/app.post(\"\/email-draft/,/});/c\
app.post(\"/email-draft\", async (req, res) => {\
  try {\
    const { petitionText = \"\", sector = \"\" } = req.body;\
    const dataPath = `./data/${sector.toLowerCase()}.json`;\
    if (!fs.existsSync(dataPath)) {\
      return res.status(404).json({ ok: false, error: \"Sector JSON not found.\" });\
    }\
    const sectorData = JSON.parse(fs.readFileSync(dataPath, \"utf8\"));\
    const catalog = buildInstitutionCatalog(sectorData);\
    const matched = findMentionedInstitutions(petitionText, catalog);\
    const watchdogs = [\
      sectorData.watchdogs?.find(w => w.name.includes(\"Public Complaints Commission\"))?.emails?.[0],\
      sectorData.watchdogs?.find(w => w.name.includes(\"Competition and Consumer Protection\"))?.emails?.[0]\
    ].filter(Boolean);\
    if (matched.length === 0) {\
      return res.status(400).json({ ok: false, error: \"No institutions matched in petition.\" });\
    }\
    let emails = [];\
    for (const inst of matched) {\
      if (inst.contact?.emails?.length) {\
        emails.push(...inst.contact.emails);\
      }\
    }\
    emails = [...new Set(emails.filter(isLikelyOfficialEmail))].slice(0, 10);\
    return res.json({\
      ok: true,\
      sector,\
      to: emails,\
      cc: watchdogs,\
      note: \"Emails extracted from matched institutions only.\"\
    });\
  } catch (err) {\
    console.error(\"Email draft error:\", err);\
    return res.status(500).json({ ok: false, error: \"Email draft build failed.\" });\
  }\
});'
