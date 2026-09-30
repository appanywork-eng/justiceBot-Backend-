const caseOf = (
  name,
  sector,
  context,
  expectedRouteKey,
  expectedPrimary,
  expectedDelivery,
  options = {}
) => Object.freeze({
  name,
  sector,
  context: Object.freeze({ country: "Nigeria", ...context }),
  expectedRouteKey,
  expectedPrimary,
  expectedCc: Object.freeze(options.expectedCc || []),
  expectedDelivery,
  blocked: options.blocked === true,
  expectedMatched: options.expectedMatched !== false,
  expectedReason: options.expectedReason || "",
  expectedSuggestedSector: options.expectedSuggestedSector || "",
  securityAuthority: options.securityAuthority || "",
  electionPriority: options.electionPriority === true,
});

export const ALL_SECTOR_ROUTING_CASES = Object.freeze([
  caseOf("power / provider first", "power", {
    institutionName: "AEDC", complaint: "My prepaid token was not delivered.", issueLocation: "Abuja", escalationStage: "initial",
  }, "power_provider_first", "Abuja Electricity Distribution Plc (AEDC)", "verified_email_or_physical_filing"),
  caseOf("power / evidenced FCT escalation", "power", {
    institutionName: "AEDC", complaint: "AEDC has not resolved my token complaint.", issueLocation: "Abuja", escalationStage: "unresolved", priorComplaintReference: "AEDC-1",
  }, "nerc_abuja_forum", "NERC Abuja Forum", "verified_email_or_physical_filing", {
    expectedCc: ["Abuja Electricity Distribution Plc (AEDC)"],
  }),
  caseOf("power / unknown provider safe channel", "power", {
    institutionName: "Unknown Electricity Cooperative", complaint: "My electricity bill is wrong.", issueLocation: "Taraba", escalationStage: "initial",
  }, "power_provider_first", "Unknown Electricity Cooperative", "official_provider_channel_resolution_required"),

  caseOf("telecoms / provider first", "telecoms", {
    institutionName: "MTN", complaint: "My airtime was deducted.", escalationStage: "initial",
  }, "telecom_provider_first", "MTN Nigeria Communications Plc", "verified_email_or_provider_complaint_channel"),
  caseOf("telecoms / evidenced NCC escalation", "telecoms", {
    institutionName: "MTN", complaint: "My earlier airtime complaint remains unresolved.", escalationStage: "unresolved", priorComplaintReference: "MTN-1",
  }, "ncc_consumer_portal", "Nigerian Communications Commission (NCC)", "official_consumer_complaint_portal", {
    expectedCc: ["MTN Nigeria Communications Plc"],
  }),
  caseOf("telecoms / unknown provider safe channel", "telecoms", {
    institutionName: "Unknown Mobile Network", complaint: "My data bundle failed.", escalationStage: "initial",
  }, "telecom_provider_first_unverified_channel", "Unknown Mobile Network", "official_provider_channel_resolution_required"),

  caseOf("banking / provider first", "banking", {
    institutionName: "GTBank", complaint: "A transfer failed.", escalationStage: "initial",
  }, "bank_provider_first", "Guaranty Trust Bank Limited", "verified_email_or_official_provider_channel"),
  caseOf("banking / evidenced CBN escalation", "banking", {
    institutionName: "GTBank", complaint: "My failed transfer complaint remains unresolved.", escalationStage: "unresolved", priorComplaintReference: "GTB-1", priorComplaintDate: "2026-01-01", bankingComplaintType: "transfer",
  }, "cbn_consumer_protection", "Central Bank of Nigeria (CBN)", "verified_email_or_complaints_portal", {
    expectedCc: ["Guaranty Trust Bank Limited"],
  }),
  caseOf("banking / missing escalation evidence", "banking", {
    institutionName: "GTBank", complaint: "My complaint remains unresolved.", escalationStage: "unresolved",
  }, "bank_provider_escalation_information_required", "Guaranty Trust Bank Limited", "verified_email_or_official_provider_channel"),

  caseOf("aviation / airline first", "aviation", {
    institutionName: "Air Peace", complaint: "My flight was cancelled.", escalationStage: "initial",
  }, "aviation_provider_first", "Air Peace Limited", "verified_email_or_official_complaint_portal"),
  caseOf("aviation / evidenced NCAA escalation", "aviation", {
    institutionName: "Air Peace", complaint: "My refund complaint remains unresolved.", escalationStage: "unresolved", priorComplaintReference: "AIR-1",
  }, "ncaa_consumer_protection", "Nigerian Civil Aviation Authority (NCAA)", "verified_email_or_official_complaint_portal", {
    expectedCc: ["Air Peace Limited"],
  }),
  caseOf("aviation safety / named airline must not suppress NSIB", "aviation", {
    institutionName: "Air Peace", complaint: "I witnessed an Air Peace aircraft that crashed near the airport after takeoff.",
  }, "nsib_accident_or_serious_incident", "Nigerian Safety Investigation Bureau (NSIB)", "emergency_line_and_secure_reporting_portal"),

  caseOf("health / provider first", "health", {
    institutionName: "National Hospital Abuja", complaint: "The hospital delayed treatment.", escalationStage: "initial",
  }, "health_provider_first", "National Hospital Abuja", "official_provider_channel_resolution_required"),
  caseOf("health insurance / evidenced NHIA escalation", "health", {
    institutionName: "Example HMO", complaint: "My HMO referral complaint remains unresolved.", escalationStage: "unresolved", priorComplaintReference: "HMO-1",
  }, "nhia_insurance_escalation", "National Health Insurance Authority (NHIA)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["Example HMO"],
  }),
  caseOf("hospital detention / human-rights route", "health", {
    institutionName: "Example Hospital", complaint: "The patient was detained over an unpaid hospital bill.",
  }, "health_rights_nhrc", "National Human Rights Commission (NHRC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["Example Hospital"],
  }),

  caseOf("education / institution first", "education", {
    institutionName: "University of Abuja", complaint: "My transcript is delayed.", escalationStage: "initial",
  }, "education_institution_first", "University of Abuja", "official_provider_channel_resolution_required"),
  caseOf("education / evidenced NUC escalation", "education", {
    institutionName: "University of Abuja", complaint: "My transcript remains delayed after internal complaints.", escalationStage: "unresolved", priorComplaintReference: "UNI-1",
  }, "nuc_grievance_escalation", "National Universities Commission (NUC)", "official_grievance_or_physical_filing", {
    expectedCc: ["University of Abuja"],
  }),
  caseOf("education / unknown institution safe channel", "education", {
    institutionName: "Unknown Training Centre", complaint: "My certificate is delayed.", escalationStage: "initial",
  }, "education_institution_first", "Unknown Training Centre", "official_provider_channel_resolution_required"),

  caseOf("general / ordinary administrative failure", "general", {
    institutionName: "Federal Ministry", complaint: "My certificate application is delayed.", escalationStage: "initial",
  }, "pcc_general_complaint", "Public Complaints Commission (PCC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["SERVICOM"],
  }),
  caseOf("general / consumer oversight", "general", {
    institutionName: "Private Service Provider", complaint: "The vendor refused my refund for defective service.",
  }, "pcc_general_complaint", "Public Complaints Commission (PCC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["Federal Competition and Consumer Protection Commission (FCCPC)"],
  }),
  caseOf("general / rights oversight", "general", {
    institutionName: "Government Agency", complaint: "I was unlawfully detained and denied a lawyer.",
  }, "pcc_general_complaint", "Public Complaints Commission (PCC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["National Human Rights Commission (NHRC)", "SERVICOM"],
  }),

  caseOf("civil disputes / FCT mediation", "civil_disputes", {
    institutionName: "Landlord", complaint: "My landlord refuses to return my tenancy deposit.", issueLocation: "Abuja", escalationStage: "initial",
  }, "fct_amdc", "Abuja Multi-Door Court (AMDC)", "official_registry_or_walk_in"),
  caseOf("civil disputes / Lagos mediation", "civil_disputes", {
    institutionName: "Landlord", complaint: "My landlord is threatening unlawful eviction.", issueLocation: "Lagos", escalationStage: "initial",
  }, "lagos_cmb", "Citizens' Mediation Bureau (CMB), Lagos State", "verified_email_or_walk_in"),
  caseOf("civil disputes / unknown location formal notice", "civil_disputes", {
    institutionName: "Landlord", complaint: "My landlord refuses to return my deposit.", issueLocation: "",
  }, "formal_notice", "The Landlord or Property Manager", "personal_delivery_or_verified_private_contact"),

  caseOf("anti-corruption / public bribery", "anti_corruption", {
    institutionName: "Federal Agency", complaint: "A public officer allegedly demanded a bribe.",
  }, "icpc_corrupt_practices_petition", "Independent Corrupt Practices and Other Related Offences Commission (ICPC)", "verified_email_or_official_portal"),
  caseOf("anti-corruption / diverted funds", "anti_corruption", {
    institutionName: "Federal Agency", complaint: "Public funds were allegedly diverted through double payment.",
  }, "efcc_economic_financial_crime", "Economic and Financial Crimes Commission (EFCC)", "verified_email_or_official_portal", {
    expectedCc: ["Bureau of Public Procurement (BPP)"],
  }),
  caseOf("anti-corruption / whistleblower emergency", "anti_corruption", {
    complaint: "I am currently under attack after reporting corruption and my life is in immediate danger.",
  }, "whistleblower_immediate_danger", "The Nearest Police Station or Appropriate Protection Authority", "immediate_emergency_report", {
    blocked: true,
  }),

  caseOf("diaspora / mission passport first", "diaspora_report", {
    issueLocation: "United Kingdom", complaint: "My passport expired and I need renewal abroad.",
  }, "nearest_nigerian_mission_passport", "The Nearest Nigerian Embassy, High Commission or Consulate", "official_mission_directory_and_consular_filing"),
  caseOf("diaspora / evidenced NIS escalation", "diaspora_report", {
    issueLocation: "United Kingdom", complaint: "My passport complaint remains unresolved.", escalationStage: "unresolved", priorComplaintReference: "NIS-1",
  }, "nis_diaspora_passport_escalation", "Nigeria Immigration Service (NIS)", "verified_email_or_official_support_channel", {
    expectedCc: ["The Nearest Nigerian Embassy, High Commission or Consulate", "Nigerians in Diaspora Commission (NiDCOM)"],
  }),
  caseOf("diaspora / active emergency", "diaspora_report", {
    issueLocation: "Saudi Arabia", complaint: "I am being held against my will abroad and my life is in immediate danger.",
  }, "diaspora_immediate_emergency", "The Relevant Host-Country Emergency Service", "immediate_emergency_and_consular_contact", {
    expectedCc: ["The Nearest Nigerian Embassy, High Commission or Consulate"], blocked: true,
  }),

  caseOf("judiciary / judge bribery is misconduct", "judiciary", {
    institutionName: "Federal High Court", complaint: "The judge allegedly demanded a bribe to decide the case.",
  }, "njc_judicial_misconduct", "National Judicial Council (NJC)", "physical_filing_with_verifying_affidavit"),
  caseOf("judiciary / decision merits require appeal", "judiciary", {
    institutionName: "Supreme Court", complaint: "I disagree with the judgment and want to overturn it.",
  }, "judicial_decision_appeal_required", "A Qualified Legal Practitioner or the Appropriate Appellate Court", "legal_advice_and_court_process", {
    blocked: true,
  }),
  caseOf("judiciary / court registry complaint", "judiciary", {
    institutionName: "Supreme Court", complaint: "The court registry has delayed my certified true copy.",
  }, "court_registry_complaint", "Supreme Court of Nigeria", "verified_email_or_official_registry_channel", {
    expectedCc: ["Public Complaints Commission (PCC)"],
  }),

  caseOf("international / domestic remedies first", "international_escalation", {
    complaint: "I suffered serious human-rights violations in Nigeria and have not complained domestically.",
  }, "domestic_fmoj_before_international", "Federal Ministry of Justice (FMOJ)", "verified_email_or_official_correspondence_channel"),
  caseOf("international / evidenced US advocacy", "international_escalation", {
    complaint: "After exhausting domestic remedies through NHRC and the courts, I seek advocacy from the United States Senate Tom Lantos Human Rights Commission.", priorComplaintReference: "NHRC-1",
  }, "international_advocacy_united_states", "Tom Lantos Human Rights Commission, United States Congress", "verified_email_or_official_correspondence_channel"),
  caseOf("international / election violence priority", "international_escalation", {
    institutionName: "A Nigerian Senator", issueLocation: "Osun State", complaint: "A senator allegedly instructed supporters to kill voters in an election. Police failed to act and the violence is widespread.",
  }, "election_violence_urgent_international_escalation", "United Nations Special Procedures of the Human Rights Council", "official_secure_submission_portal_and_verified_parallel_domestic_email", {
    expectedCc: ["National Human Rights Commission (NHRC)", "Independent National Electoral Commission (INEC)"], electionPriority: true,
  }),

  caseOf("pensions / contributory scheme", "pensions", {
    institutionName: "Example PFA", complaint: "My contributory pension remittance is missing.",
  }, "pencom_pension_complaints", "National Pension Commission (PenCom)", "verified_email_or_official_complaint_form"),
  caseOf("pensions / defined benefit", "pensions", {
    institutionName: "PTAD", complaint: "My federal defined-benefit pension verification is unresolved.",
  }, "ptad_defined_benefit_complaints", "Pension Transitional Arrangement Directorate (PTAD)", "verified_email_or_official_complaint_form"),
  caseOf("pensions / ambiguous defaults to PenCom", "pensions", {
    institutionName: "Employer", complaint: "My pension is delayed.",
  }, "pencom_pension_complaints", "National Pension Commission (PenCom)", "verified_email_or_official_complaint_form"),

  caseOf("insurance / NAICOM complaint", "insurance", {
    institutionName: "Example Insurer", complaint: "My motor claim was rejected.",
  }, "naicom_insurance_complaints", "National Insurance Commission (NAICOM)", "verified_email_or_official_complaint_portal"),
  caseOf("insurance / evidenced unresolved claim", "insurance", {
    institutionName: "Example Insurer", complaint: "My earlier insurance claim complaint remains unresolved.", priorComplaintReference: "INS-1",
  }, "naicom_insurance_complaints", "National Insurance Commission (NAICOM)", "verified_email_or_official_complaint_portal"),
  caseOf("health insurance / reject general-insurance route", "insurance", {
    institutionName: "Example HMO", complaint: "My health insurance referral was denied.",
  }, "", "", "", {
    expectedMatched: false, expectedReason: "health_insurance_belongs_to_health_sector", expectedSuggestedSector: "health",
  }),

  caseOf("urban planning / FCT", "urban_planning", {
    institutionName: "Development Control", complaint: "An unsafe structure lacks approval.", issueLocation: "Abuja",
  }, "fct_development_control", "Department of Development Control, Abuja Metropolitan Management Council (AMMC)", "official_portal_or_physical_filing"),
  caseOf("urban planning / Lagos", "urban_planning", {
    institutionName: "LASBCA", complaint: "An unsafe building is being constructed.", issueLocation: "Lagos",
  }, "lagos_building_control", "Lagos State Building Control Agency (LASBCA)", "verified_email_or_official_portal"),
  caseOf("urban planning / other state safe filing", "urban_planning", {
    institutionName: "Kano Planning Authority", complaint: "A building permit was refused.", issueLocation: "Kano",
  }, "state_planning_authority_physical_filing", "Kano Planning Authority", "official_directory_or_physical_filing", {
    expectedCc: ["Public Complaints Commission (PCC)"],
  }),

  caseOf("security / active emergency", "security", {
    complaint: "I am currently under attack and my life is in immediate danger.",
  }, "active_security_emergency", "The Nearest Police Station or Appropriate Emergency Security Agency", "immediate_emergency_report", {
    blocked: true,
  }),
  caseOf("security authority / police command", "security", {
    complaint: "My brother is missing following a kidnapping and I need to report the crime.",
  }, "crime_report_nearest_command", "Nigeria Police Force and the Relevant State Police Command", "immediate_station_or_command_report", {
    securityAuthority: "npf_national_and_state_commands",
  }),
  caseOf("security authority / PSC", "security", {
    institutionName: "Nigeria Police Force", complaint: "Police officers demanded bail money.",
  }, "psc_police_discipline", "Police Service Commission (PSC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["Nigeria Police Force and the Relevant State Police Command"], securityAuthority: "psc_police_discipline",
  }),
  caseOf("security authority / NHRC", "security", {
    institutionName: "Nigeria Police Force", complaint: "Police unlawfully detained me and denied access to my lawyer.",
  }, "security_rights_nhrc", "National Human Rights Commission (NHRC)", "verified_email_or_official_complaint_channel", {
    expectedCc: ["Nigeria Police Force and the Relevant State Police Command", "Police Service Commission (PSC)"], securityAuthority: "nhrc_security_rights_complaints",
  }),
  caseOf("security authority / correctional service", "security", {
    institutionName: "Nigerian Correctional Service", complaint: "I am reporting unsafe inmate welfare conditions.",
  }, "security_agency_first", "Nigerian Correctional Service (NCoS)", "verified_email_or_official_channel", {
    securityAuthority: "ncos_complaint_response",
  }),
  caseOf("security authority / civil defence", "security", {
    institutionName: "NSCDC", complaint: "An NSCDC officer mishandled my complaint.",
  }, "security_agency_first", "Nigeria Security and Civil Defence Corps (NSCDC)", "verified_email_or_official_channel", {
    securityAuthority: "nscdc_incident_reporting",
  }),
  caseOf("security authority / immigration", "security", {
    institutionName: "Nigeria Immigration Service", complaint: "An immigration officer delayed my passport complaint.",
  }, "security_agency_first", "Nigeria Immigration Service (NIS)", "verified_email_or_official_channel", {
    securityAuthority: "nis_servicom_complaints",
  }),
  caseOf("security authority / army", "security", {
    institutionName: "Nigerian Army", complaint: "An Army officer acted improperly.",
  }, "security_agency_first", "Nigerian Army (NA)", "verified_email_or_official_channel", {
    securityAuthority: "nigerian_army_call_centre",
  }),
  caseOf("security authority / navy", "security", {
    institutionName: "Nigerian Navy", complaint: "A Navy officer acted improperly.",
  }, "security_agency_first", "Nigerian Navy (NN)", "verified_email_or_official_channel", {
    securityAuthority: "nigerian_navy_contact",
  }),
  caseOf("security authority / air force", "security", {
    institutionName: "Nigerian Air Force", complaint: "An Air Force officer acted improperly.",
  }, "security_agency_first", "Nigerian Air Force (NAF)", "official_portal_or_command_channel", {
    securityAuthority: "nigerian_air_force_ombudsman",
  }),
]);

export const ACTIVE_SECTORS = Object.freeze([
  "anti_corruption", "aviation", "banking", "civil_disputes",
  "diaspora_report", "education", "general", "health", "insurance",
  "international_escalation", "judiciary", "power", "pensions",
  "security", "telecoms", "urban_planning",
]);
