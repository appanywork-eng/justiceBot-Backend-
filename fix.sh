#!/data/data/com.termux/files/usr/bin/bash

echo "⚙️ Fixing JusticeBot environment..."

# Install required packages
pkg update -y
pkg upgrade -y
pkg install -y nodejs-lts python git nano

# Install frontend dependencies
cd ~/justicebot-frontend || exit
npm install

# Fix API URL in frontend
echo 'export const API_URL = "http://192.168.0.100:5000";' > src/api.js

# Install backend dependencies
cd ~/justicebot-backend || exit
npm install express cors

echo " "
echo "🔥 JusticeBot FIX COMPLETE"
echo "Run backend: node server.js"
echo "Run frontend: npm run dev -- --host"
