#!/bin/bash
FILE="server.mjs"

# Replace the broken function line safely
sed -i "166s/^.*extractsSubjectFromPetition.*$/function extractsSubjectFromPetition(text = \"\") { return (text || \"\").toString().split(\"\\\\n\")[0].slice(0,120); }/g" "$FILE"

echo "✅ Syntax fixed safely!"
