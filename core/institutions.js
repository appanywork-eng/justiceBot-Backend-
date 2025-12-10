// core/institutions.js
// Load institutions.json and provide electricity + international routing helpers.

const fs = require("fs");
const path = require("path");
const { textIncludesAny } = require("./helpers");

let INSTITUTIONS_JSON = {};
try {
  const filePath = path.join(__dirname, "..", "data", "institutions.json");
  INSTITUTIONS_JSON = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.log("Institutions JSON loaded successfully");
} catch (err) {
  console.error("Failed to load institutions.json:", err);
  INSTITUTIONS_JSON = {};
}

// ELECTRICITY DETECTION (AEDC / NERC etc.)
function detectElectricity(description) {
  const d = (description || "").toLowerCase();
  const k = [
    "electricity",
    "light",
    "power",
    "disco",
    "distribution company",
    "meter",
    "prepaid",
    "billing",
    "over billing",
    "overbilling",
    "token",
    "transformer",
  ];
  if (!textIncludesAny(d, k)) return null;

  const list = INSTITUTIONS_JSON.electricity || [];
  let primary = null;

  // Try to detect AEDC by Abuja area
  if (d.includes("abuja") || d.includes("gwarinpa") || d.includes("kubwa")) {
    primary = list.find((i) => i.key === "aedc") || null;
  }

  if (!primary) {
    primary =
      list.find((i) => i.key === "generic_dis") ||
      list[0] || {
        org: "Electricity Distribution Company",
        email: "",
        address: "",
        title: "",
      };
  }

  const through =
    list.find((i) => i.key === "nerc") || {
      org: "Nigerian Electricity Regulatory Commission (NERC)",
      email: "",
      address: "",
      title: "",
    };

  const ccList = list
    .filter((i) => !["aedc", "generic_dis", "nerc"].includes(i.key))
    .map((i) => ({
      org: i.org,
      email: i.email || "",
      address: i.address || "",
      title: i.title || "",
    }));

  return { primary, through, ccList };
}

// INTERNATIONAL GENOCIDE / MASS ATROCITY ROUTING
function detectInternational(description) {
  const d = (description || "").toLowerCase();
  const triggers = [
    "genocide",
    "ethnic cleansing",
    "mass killing",
    "massacre",
    "war crime",
    "crimes against humanity",
    "religious persecution",
    "political prisoner",
    "extra judicial killing",
    "extrajudicial killing",
    "systematic torture",
    "nnamdi kanu",
    "biafra",
    "faith-based violence",
    "minority community",
  ];
  if (!textIncludesAny(d, triggers)) return null;

  const intl = INSTITUTIONS_JSON.international || {};

  const ccList = Object.values(intl).map((i) => ({
    org: i.name,
    email: i.email || "",
    address: i.address || "",
    title: "",
  }));

  // Pick a strong global primary: US House Foreign Affairs Committee
  const primarySource = intl.us_congress_house || {};
  const primary = {
    org: primarySource.name || "US House Foreign Affairs Committee",
    email: primarySource.email || "",
    address:
      primarySource.address ||
      "House Committee on Foreign Affairs, Washington, D.C., USA",
    title: "",
  };

  const through = {
    org: "Federal Ministry of Justice",
    email: "info@justice.gov.ng",
    address: "Federal Secretariat, Abuja, Nigeria.",
    title: "Attorney General of the Federation",
  };

  return { primary, through, ccList };
}

module.exports = {
  INSTITUTIONS_JSON,
  detectElectricity,
  detectInternational,
};
