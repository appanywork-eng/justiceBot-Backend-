// buildInstitutions.js
// Run with: node buildInstitutions.js
// It will create/overwrite: ./data/institutions.json

const fs = require("fs");
const path = require("path");

// -----------------------------------------------------
// 1. NATIONAL INSTITUTIONS
// -----------------------------------------------------
const national = {
  PCC: {
    org: "Public Complaints Commission",
    title: "Honourable Chief Commissioner",
    address: "25 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    email: "",
    phone: "",
  },
  NHRC: {
    org: "National Human Rights Commission",
    title: "Executive Secretary",
    address: "19 Aguiyi Ironsi Street, Maitama, Abuja, Nigeria.",
    email: "info@nhrc.gov.ng",
    phone: "",
  },
  CBN_CPD: {
    org: "Central Bank of Nigeria – Consumer Protection Department",
    title: "Director, Consumer Protection Department",
    address: "Central Business District, Abuja, Nigeria.",
    email: "cpd@cbn.gov.ng",
    phone: "",
  },
  FCCPC: {
    org: "Federal Competition and Consumer Protection Commission",
    title: "Executive Vice Chairman",
    address: "23 Jimmy Carter Street, Asokoro, Abuja, Nigeria.",
    email: "contact@fccpc.gov.ng",
    phone: "",
  },
  NERC: {
    org: "Nigerian Electricity Regulatory Commission",
    title: "Chairman",
    address:
      "Adamawa Plaza, Plot 1099, First Avenue, Central Business District, Abuja.",
    email: "customerservice@nerc.gov.ng",
    phone: "",
  },
  NCC: {
    org: "Nigerian Communications Commission",
    title: "Executive Vice Chairman",
    address: "Plot 423 Aguiyi Ironsi Street, Maitama, Abuja.",
    email: "consumerportal@ncc.gov.ng",
    phone: "622",
  },
  POLICE_IGP: {
    org: "Nigeria Police Force – Inspector General of Police",
    title: "Inspector General of Police",
    address: "Louis Edet House, Garki II, Abuja.",
    email: "",
    phone: "",
  },
  PSC: {
    org: "Police Service Commission",
    title: "Chairman",
    address: "Jabi, Abuja, Nigeria.",
    email: "info@psc.gov.ng",
    phone: "",
  },
  PENCOM: {
    org: "National Pension Commission",
    title: "Director General",
    address: "Plot 174 Adetokunbo Ademola Crescent, Wuse II, Abuja.",
    email: "",
    phone: "",
  },
  PTAD: {
    org: "Pension Transitional Arrangement Directorate",
    title: "Executive Secretary",
    address: "Abuja, Nigeria.",
    email: "",
    phone: "",
  },
  MOJ_FEDERAL: {
    org: "Federal Ministry of Justice",
    title: "Attorney-General of the Federation",
    address: "Federal Ministry of Justice, Abuja.",
    email: "",
    phone: "",
  },
};

// -----------------------------------------------------
// 2. STATES LIST – 36 + FCT
//    We will auto-generate each state's institutions
// -----------------------------------------------------
const stateConfigs = [
  { key: "abia", name: "Abia State", capital: "Umuahia" },
  { key: "adamawa", name: "Adamawa State", capital: "Yola" },
  { key: "akwa_ibom", name: "Akwa Ibom State", capital: "Uyo" },
  { key: "anambra", name: "Anambra State", capital: "Awka" },
  { key: "bauchi", name: "Bauchi State", capital: "Bauchi" },
  { key: "bayelsa", name: "Bayelsa State", capital: "Yenagoa" },
  { key: "benue", name: "Benue State", capital: "Makurdi" },
  { key: "borno", name: "Borno State", capital: "Maiduguri" },
  { key: "cross_river", name: "Cross River State", capital: "Calabar" },
  { key: "delta", name: "Delta State", capital: "Asaba" },
  { key: "ebonyi", name: "Ebonyi State", capital: "Abakaliki" },
  { key: "edo", name: "Edo State", capital: "Benin City" },
  { key: "ekiti", name: "Ekiti State", capital: "Ado-Ekiti" },
  { key: "enugu", name: "Enugu State", capital: "Enugu" },
  { key: "gombe", name: "Gombe State", capital: "Gombe" },
  { key: "imo", name: "Imo State", capital: "Owerri" },
  { key: "jigawa", name: "Jigawa State", capital: "Dutse" },
  { key: "kaduna", name: "Kaduna State", capital: "Kaduna" },
  { key: "kano", name: "Kano State", capital: "Kano" },
  { key: "katsina", name: "Katsina State", capital: "Katsina" },
  { key: "kebbi", name: "Kebbi State", capital: "Birnin Kebbi" },
  { key: "kogi", name: "Kogi State", capital: "Lokoja" },
  { key: "kwara", name: "Kwara State", capital: "Ilorin" },
  { key: "lagos", name: "Lagos State", capital: "Ikeja" },
  { key: "nasarawa", name: "Nasarawa State", capital: "Lafia" },
  { key: "niger", name: "Niger State", capital: "Minna" },
  { key: "ogun", name: "Ogun State", capital: "Abeokuta" },
  { key: "ondo", name: "Ondo State", capital: "Akure" },
  { key: "osun", name: "Osun State", capital: "Oshogbo" },
  { key: "oyo", name: "Oyo State", capital: "Ibadan" },
  { key: "plateau", name: "Plateau State", capital: "Jos" },
  { key: "rivers", name: "Rivers State", capital: "Port Harcourt" },
  { key: "sokoto", name: "Sokoto State", capital: "Sokoto" },
  { key: "taraba", name: "Taraba State", capital: "Jalingo" },
  { key: "yobe", name: "Yobe State", capital: "Damaturu" },
  { key: "zamfara", name: "Zamfara State", capital: "Gusau" },
  // FCT
  { key: "fct", name: "Federal Capital Territory", capital: "Abuja" },
];

// Factory to generate a standard state block
function makeStateEntry(conf) {
  const c = conf.capital;
  const name = conf.name;

  if (conf.key === "fct") {
    // Special handling for FCT
    return {
      meta: { name, capital: c },
      police_command: {
        org: "FCT Police Command",
        title: "Commissioner of Police",
        address: `Garki, ${c}.`,
        email: "",
        phone: "",
      },
      pcc: {
        org: "Public Complaints Commission – FCT",
        title: "Resident Commissioner",
        address: `Maitama, ${c}.`,
        email: "",
        phone: "",
      },
      nhrc: {
        org: "National Human Rights Commission – FCT",
        title: "State Coordinator",
        address: `Maitama, ${c}.`,
        email: "",
        phone: "",
      },
      governor: {
        org: "Federal Capital Territory Administration",
        title: "Honourable Minister of the FCT",
        address: "FCTA Secretariat, Area 11, Garki, Abuja.",
        email: "",
        phone: "",
      },
      attorney_general: {
        org: "FCT Legal Services Secretariat",
        title: "Attorney-General",
        address: "Garki, Abuja.",
        email: "",
        phone: "",
      },
    };
  }

  return {
    meta: { name, capital: c },
    police_command: {
      org: `${name} Police Command`,
      title: `Commissioner of Police, ${name}`,
      address: `${c}.`,
      email: "",
      phone: "",
    },
    pcc: {
      org: `Public Complaints Commission – ${name}`,
      title: "Resident Commissioner",
      address: `${c}.`,
      email: "",
      phone: "",
    },
    nhrc: {
      org: `National Human Rights Commission – ${name}`,
      title: "State Coordinator",
      address: `${c}.`,
      email: "",
      phone: "",
    },
    governor: {
      org: `${name} Government`,
      title: "Executive Governor",
      address: `Government House, ${c}.`,
      email: "",
      phone: "",
    },
    attorney_general: {
      org: `${name} Ministry of Justice`,
      title: "Attorney-General",
      address: `${c}.`,
      email: "",
      phone: "",
    },
  };
}

// Build states object
const states = {};
for (const conf of stateConfigs) {
  states[conf.key] = makeStateEntry(conf);
}

// -----------------------------------------------------
// 3. DISCOs
// -----------------------------------------------------
const discos = {
  AEDC: {
    org: "Abuja Electricity Distribution Company (AEDC)",
    title: "Managing Director/CEO",
    address: "No. 1 Ziquinchor Street, Wuse Zone 4, Abuja, Nigeria.",
    regions: ["FCT", "Niger", "Kogi", "Nasarawa"],
    email: "customercare@aedc.co",
    phone: "",
  },
  BEDC: {
    org: "Benin Electricity Distribution Company (BEDC)",
    title: "Managing Director/CEO",
    address: "Benin City, Edo State, Nigeria.",
    regions: ["Edo", "Delta", "Ondo", "Ekiti"],
    email: "",
    phone: "",
  },
  EEDC: {
    org: "Enugu Electricity Distribution Company (EEDC)",
    title: "Managing Director/CEO",
    address: "Enugu, Enugu State, Nigeria.",
    regions: ["Abia", "Anambra", "Ebonyi", "Enugu", "Imo"],
    email: "",
    phone: "",
  },
  IBEDC: {
    org: "Ibadan Electricity Distribution Company (IBEDC)",
    title: "Managing Director/CEO",
    address: "Ibadan, Oyo State, Nigeria.",
    regions: ["Oyo", "Ogun", "Osun", "Kwara", "Kogi (part)"],
    email: "",
    phone: "",
  },
  IKEDC: {
    org: "Ikeja Electric (IKEDC)",
    title: "Managing Director/CEO",
    address: "Ikeja, Lagos State, Nigeria.",
    regions: ["Lagos (Ikeja axis)"],
    email: "",
    phone: "",
  },
  EKEDC: {
    org: "Eko Electricity Distribution Company (EKEDC)",
    title: "Managing Director/CEO",
    address: "Lagos Island, Lagos State, Nigeria.",
    regions: ["Lagos (Eko axis)"],
    email: "",
    phone: "",
  },
  JEDC: {
    org: "Jos Electricity Distribution Company (JED)",
    title: "Managing Director/CEO",
    address: "Jos, Plateau State, Nigeria.",
    regions: ["Plateau", "Gombe", "Bauchi", "Benue"],
    email: "",
    phone: "",
  },
  KEDCO: {
    org: "Kano Electricity Distribution Company (KEDCO)",
    title: "Managing Director/CEO",
    address: "Kano, Kano State, Nigeria.",
    regions: ["Kano", "Jigawa", "Katsina"],
    email: "",
    phone: "",
  },
  PHED: {
    org: "Port Harcourt Electricity Distribution Company (PHED)",
    title: "Managing Director/CEO",
    address: "Port Harcourt, Rivers State, Nigeria.",
    regions: ["Rivers", "Cross River", "Akwa Ibom", "Bayelsa"],
    email: "",
    phone: "",
  },
  YEDC: {
    org: "Yola Electricity Distribution Company",
    title: "Managing Director/CEO",
    address: "Yola, Adamawa State, Nigeria.",
    regions: ["Adamawa", "Taraba", "Borno", "Yobe"],
    email: "",
    phone: "",
  },
};

// -----------------------------------------------------
// 4. INTERNATIONAL BODIES
// -----------------------------------------------------
const international = {
  UN_HRC: {
    org: "United Nations Human Rights Council",
    title: "Petitions and Communications Unit",
    address: "Palais des Nations, Geneva, Switzerland.",
    email: "",
    portal: "https://spsubmission.ohchr.org/",
    phone: "",
  },
  UN_WORKING_GROUP_AD: {
    org: "UN Working Group on Arbitrary Detention",
    title: "Secretariat",
    address:
      "Office of the High Commissioner for Human Rights, Geneva, Switzerland.",
    email: "",
    portal: "https://spsubmission.ohchr.org/",
    phone: "",
  },
  AU_COMMISSION: {
    org: "African Union Commission",
    title: "Chairperson",
    address: "AU Headquarters, Addis Ababa, Ethiopia.",
    email: "",
    phone: "",
  },
  ECOWAS_COMMISSION: {
    org: "ECOWAS Commission",
    title: "President",
    address: "101 Yakubu Gowon Crescent, Asokoro, Abuja, Nigeria.",
    email: "",
    phone: "",
  },
  EU_PARLIAMENT_DROI: {
    org: "European Parliament – Subcommittee on Human Rights (DROI)",
    title: "Secretariat",
    address: "Brussels/Strasbourg, European Union.",
    email: "droi-secretariat@ep.europa.eu",
    phone: "",
  },
  UK_PARLIAMENT_JCHR: {
    org: "UK Parliament – Joint Committee on Human Rights",
    title: "Committee Secretariat",
    address: "Houses of Parliament, London, United Kingdom.",
    email: "jchr@parliament.uk",
    phone: "",
  },
  US_CONGRESS_HFAC: {
    org: "United States House Committee on Foreign Affairs",
    title: "Subcommittee on Global Human Rights",
    address: "Washington, D.C., USA.",
    email: "",
    portal: "https://foreignaffairs.house.gov/contact/",
    phone: "",
  },
  US_SENATE_SFR: {
    org: "United States Senate Committee on Foreign Relations",
    title: "Committee Staff",
    address: "Washington, D.C., USA.",
    email: "",
    portal: "https://www.foreign.senate.gov/contact",
    phone: "",
  },
  COMMONWEALTH_SECRETARIAT: {
    org: "Commonwealth Secretariat",
    title: "Human Rights Unit",
    address: "Marlborough House, London, United Kingdom.",
    email: "info@commonwealth.int",
    phone: "",
  },
};

// -----------------------------------------------------
// 5. NGOs
// -----------------------------------------------------
const ngos = {
  AMNESTY_INTL_NG: {
    org: "Amnesty International Nigeria",
    title: "Country Director",
    address: "Abuja, Nigeria.",
    email: "info@amnesty.org.ng",
    phone: "",
  },
  HRW_GLOBAL: {
    org: "Human Rights Watch",
    title: "Headquarters",
    address: "350 Fifth Avenue, New York, NY, USA.",
    email: "hrwnyc@hrw.org",
    phone: "",
  },
};

// -----------------------------------------------------
// 6. PRIVATE SECTOR (sample starter)
// -----------------------------------------------------
const private_sector = {
  banks: {
    GTBANK: {
      org: "Guaranty Trust Bank Plc",
      title: "Head of Complaints / CX",
      address: "Plot 1669 Oyin Jolayemi Street, Victoria Island, Lagos.",
      email: "complaints@gtbank.com",
      phone: "",
    },
  },
  telecom: {
    MTN: {
      org: "MTN Nigeria Communications Plc",
      title: "Customer Care",
      address: "Falomo, Ikoyi, Lagos.",
      email: "customercare@mtnnigeria.net",
      phone: "180",
    },
  },
  media: {
    DSTV: {
      org: "MultiChoice Nigeria (DStv)",
      title: "Customer Care",
      address: "Victoria Island, Lagos.",
      email: "",
      phone: "",
    },
  },
};

// -----------------------------------------------------
// 7. MERGE EVERYTHING & WRITE FILE
// -----------------------------------------------------
const institutions = {
  national,
  states,
  discos,
  international,
  ngos,
  private_sector,
};

const outDir = path.join(__dirname, "data");
const outFile = path.join(outDir, "institutions.json");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outFile, JSON.stringify(institutions, null, 2), "utf8");

console.log("✅ institutions.json generated at:", outFile);
