function titleCase(s) {
  return String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function isFCT(state) {
  const s = String(state || "").toLowerCase();
  return s.includes("federal capital territory") || s === "fct";
}

function resolveAuthority({ sector, location, cc = [] }) {
  const state = location?.state || "Nigeria";
  const stateLabel = isFCT(state) ? "FCT" : titleCase(state);

  // Always include PCC in CC (you want this for JusticeBot mission)
  const ensureCC = (arr, name) => {
    const low = arr.map((x) => String(x).toLowerCase());
    if (!low.includes(String(name).toLowerCase())) arr.push(name);
    return arr;
  };

  let primary = null;
  let through = null;

  if (sector === "police_security") {
    primary = {
      title: "The Inspector-General of Police",
      org: "Nigeria Police Force (Force Headquarters)",
      city: "Abuja"
    };
    through = {
      title: "The Commissioner of Police",
      org: isFCT(state) ? "FCT Police Command" : `${stateLabel} State Police Command`,
      city: isFCT(state) ? "Abuja" : stateLabel
    };
    ensureCC(cc, "Police Service Commission");
    ensureCC(cc, "National Human Rights Commission Nigeria");
    ensureCC(cc, "Public Complaints Commission");
  } else if (sector === "health") {
    primary = {
      title: "The Honourable Minister",
      org: "Federal Ministry of Health and Social Welfare",
      city: "Abuja"
    };
    through = {
      title: isFCT(state) ? "The Honourable Minister" : "The Honourable Commissioner for Health",
      org: isFCT(state) ? "FCT Health Secretariat" : `${stateLabel} State Ministry of Health`,
      city: isFCT(state) ? "Abuja" : stateLabel
    };
    ensureCC(cc, "Medical and Dental Council of Nigeria");
    ensureCC(cc, "Public Complaints Commission");
  } else {
    // Generic fallback
    primary = {
      title: "The Appropriate Authority",
      org: "Relevant Government Authority",
      city: "Nigeria"
    };
    through = null;
    ensureCC(cc, "Public Complaints Commission");
  }

  return { primary, through, cc };
}

module.exports = { resolveAuthority };
