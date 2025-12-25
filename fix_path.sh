#!/bin/bash
sed -i "s|/\\${sector}.json|${sector}.json|g" server.cjs
echo "Patched successfully"
