const sectorKeywords = {
  aviation: ["airport", "flight", "airline", "plane", "runway"],
  judiciary: ["court", "judge", "lawyer", "appeal", "judiciary"],
  banking: ["bank", "debit", "credit", "fintech", "transfer"],
  power: ["electricity", "meter", "disco", "power", "grid"],
  education: ["school", "university", "nuc", "student", "education"],
  security: ["police", "army", "navy", "air force", "nscdc"],
  health: ["hospital", "clinic", "nhis", "doctor", "health"],
  telecoms: ["telecom", "sim", "network", "data", "call"],
  international_escalation: ["un", "ecowas", "au", "international", "rights"]
};

function detectSector(text) {
  const lower = text.toLowerCase();
  for (const [sector, words] of Object.entries(sectorKeywords)) {
    if (words.some(word => lower.includes(word))) {
      return sector;
    }
  }
  return "general";
}

module.exports = { detectSector };
