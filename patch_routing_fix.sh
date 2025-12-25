#!/bin/bash
apply_patch() {
  sed -i "s/path.join(__dirname, 'data', \`\\/\${sector}.json\`)/path.join(__dirname, 'data', \`\${sector}.json\`)/g" server.cjs
  sed -i "s/path.join(__dirname, 'data', \`\\/\${sector}.json\`)/path.join(__dirname, 'data', \`\${sector}.json\`)/g" sectorResolver.js
}
apply_patch
echo "Routing lookup patched successfully"
