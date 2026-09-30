#!/bin/bash
FILE="server.mjs"

# Remove the bad top-level complaint assignment at line 1
sed -i "1s/^complaint.*$/\/\/ removed bad top-level complaint assignment/g" "$FILE"

echo "✅ Top-level scope fixed safely!"
