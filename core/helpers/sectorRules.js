/**
 * HARD SECTOR ROUTING RULES
 * AI CANNOT override this
 */

function policeRule(context) {
  return {
    primary: ['state_police_command'],
    through: ['igp'],
    cc: ['psc', 'pcc', 'nhrc'],
    reason: 'Police misconduct = administrative injustice'
  };
}

function discoRule(context) {
  return {
    primary: ['disco_company'],
    through: ['nerc'],
    cc: ['federal_ministry_power', 'pcc', 'fccpc', 'servicom'],
    reason: 'Power sector regulated by NERC'
  };
}

function bankingRule(context) {
  return {
    primary: ['bank_branch'],
    through: ['bank_hq'],
    cc: ['cbn', 'pcc', 'fccpc', 'ndic'],
    reason: 'Banking regulated by CBN'
  };
}

function housingRule(context) {
  return {
    primary: ['housing_authority_or_taskforce'],
    through: ['state_government'],
    cc: ['pcc', 'fccpc', 'nhrc'],
    reason: 'Housing eviction = administrative injustice'
  };
}

function telecomRule(context) {
  return {
    primary: ['telecom_company'],
    through: ['ncc'],
    cc: ['pcc', 'fccpc'],
    reason: 'Telecom sector regulated by NCC'
  };
}

function defaultRule(context) {
  return {
    primary: ['institution_involved'],
    through: [],
    cc: ['pcc'],
    reason: 'Default administrative injustice rule'
  };
}

module.exports = function resolveSectorRules(sector, context = {}) {
  switch (sector) {
    case 'police':
      return policeRule(context);
    case 'disco':
      return discoRule(context);
    case 'banking':
      return bankingRule(context);
    case 'housing':
      return housingRule(context);
    case 'telecom':
      return telecomRule(context);
    default:
      return defaultRule(context);
  }
};
