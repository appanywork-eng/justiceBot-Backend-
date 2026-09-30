import fs from "fs";

const file = "server.mjs"; // file you want to patch
let src = fs.readFileSync(file, "utf8");

// Replace old wrong references
src = src.replace(/inst\.emails/g, "inst.contact.emails");

// Remove PCC from TO detection lines
src = src.replace(/mentionedInstitutions:.*PCC.*\n/g, "");

fs.writeFileSync(file, src, "utf8");
console.log("✅ Routing logic fixed!");
