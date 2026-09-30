#!/bin/bash
FILE="$HOME/justicebot-backend/server.mjs"

# Remove the invalid first-line assignment
sed -i '1s/^.*complaint =.*$/ /g' "$FILE"

# Inject safe complaint initialization AFTER imports
sed -i '/import express from "express";/a \
const complaint = (typeof req !== "undefined" && req.body && req.body.complaint ? req.body.complaint : "");' "$FILE"

# Fix email path references safely
sed -i 's/\.emails/\.contact\.emails/g' "$FILE"

echo "Scope fixed safely!"
