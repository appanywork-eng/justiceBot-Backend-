import fs from "fs";

const FILE = "server.mjs";
let src = fs.readFileSync(FILE, "utf8");

// 1) Fix the specific debug line that crashes: complaint || petitionText (out of scope)
src = src.replace(
  /console\.log\(\s*["'`]\[DEBUG\]\s*Petition text received for routing\s*-\s*["'`]\s*,\s*complaint\s*\|\|\s*petitionText\s*\)\s*;?/g,
  'console.log("[DEBUG] Petition text received for routing -", (req?.body?.complaint || req?.body?.petitionText || ""));'
);

// 2) Any other accidental uses of `complaint || petitionText` (make them safe)
src = src.replace(
  /complaint\s*\|\|\s*petitionText/g,
  '(req?.body?.complaint || req?.body?.petitionText || "")'
);

// 3) Ensure /email-draft destructuring includes petitionText default (if missing/changed)
src = src.replace(
  /const\s*\{\s*complaint\s*=\s*["'`]["'`]\s*,\s*sector:\s*sectorIn\s*=\s*["'`]["'`]\s*(,)?\s*\}\s*=\s*req\.body\s*\|\|\s*\{\}\s*;/g,
  'const { complaint = "", sector: sectorIn = "", petitionText = "" } = req.body || {};'
);

// If destructuring already exists but petitionText lacks default, enforce default
src = src.replace(
  /const\s*\{\s*complaint\s*=\s*["'`]["'`]\s*,\s*sector:\s*sectorIn\s*=\s*["'`]["'`]\s*,\s*petitionText\s*\}\s*=\s*req\.body\s*\|\|\s*\{\}\s*;/g,
  'const { complaint = "", sector: sectorIn = "", petitionText = "" } = req.body || {};'
);

fs.writeFileSync(FILE, src, "utf8");
console.log("✅ Fixed: petitionText scope crash + safe routing debug + ensured petitionText default.");
