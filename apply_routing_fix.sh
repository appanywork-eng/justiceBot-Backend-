#!/bin/bash
sed -i "s|path.join(__dirname, 'data', \`/\\${sector}.json\`)|path.join(__dirname, 'data', \`\${sector}.json\`)|g" server.cjs
echo "Lookup path fixed successfully"
