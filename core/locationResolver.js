const fs = require("fs");
const path = require("path");

function safeReadJson(p) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

const LOCATION_MAP_PATH = path.join(__dirname, "..", "data", "location_map.json");
const LOCATION_MAP = safeReadJson(LOCATION_MAP_PATH) || {};

// Minimal Nigeria states list for direct detection in text
const NIGERIA_STATES = [
  "abia state","adamawa state","akwa ibom state","anambra state","bauchi state","bayelsa state","benue state",
  "borno state","cross river state","delta state","ebonyi state","edo state","ekiti state","enugu state",
  "federal capital territory","fct","gombe state","imo state","jigawa state","kaduna state","kano state",
  "katsina state","kebbi state","kogi state","kwara state","lagos state","nasarawa state","niger state",
  "ogun state","ondo state","osun state","oyo state","plateau state","rivers state","sokoto state",
  "taraba state","yobe state","zamfara state"
];

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectStateFromText(text) {
  const t = norm(text);
  for (const s of NIGERIA_STATES) {
    if (t.includes(s)) {
      if (s === "fct" || s === "federal capital territory") return "Federal Capital Territory";
      return s.replace(/\b\w/g, (c) => c.toUpperCase()); // Title case
    }
  }
  return null;
}

function detectLocation(text) {
  const t = norm(text);
  // First: explicit map hits (district/city/LGA)
  for (const key of Object.keys(LOCATION_MAP)) {
    if (t.includes(key)) {
      const hit = LOCATION_MAP[key];
      return {
        place: key.replace(/\b\w/g, (c) => c.toUpperCase()),
        state: hit.state || "Nigeria",
        stateCode: hit.stateCode || "",
        country: hit.country || "Nigeria"
      };
    }
  }

  // Second: direct "X State" mention
  const state = detectStateFromText(text);
  if (state) {
    return { place: "", state, stateCode: state === "Federal Capital Territory" ? "FCT" : "", country: "Nigeria" };
  }

  // Third: Abuja/FCT heuristics
  if (t.includes("abuja") || t.includes("fct")) {
    return { place: "Abuja", state: "Federal Capital Territory", stateCode: "FCT", country: "Nigeria" };
  }

  return { place: "", state: "Nigeria", stateCode: "", country: "Nigeria" };
}

module.exports = { detectLocation };
