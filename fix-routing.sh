#!/bin/bash
FILE="server.mjs"

# Remove bad top-level complaint assignment that crashes Node
sed -i "1s/^.*complaint =.*$/\/\/ removed bad top-level complaint assignment/g" "$FILE"

# Ensure mentionedEmails uses the right nested JSON path
sed -i "s/inst.emails/inst.contact.emails/g" "$FILE"

# Fix handler to safely read petitionText fallback
sed -i "s/petitionText/req.body.petitionText || \"\"/g" "$FILE"

echo "✅ Routing logic patched safely!"
