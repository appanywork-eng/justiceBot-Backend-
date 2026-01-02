#!/bin/bash
FILE="server.mjs"

# Ensure mention extractor reads the correct nested emails
sed -i "s/inst.emails/inst.contact.emails/g" "$FILE"
sed -i "s/inst.emails.length/inst.contact.emails.length/g" "$FILE"

echo "✔ Mention extractor email path fixed"
