/*
 * Verified direct complaint and support channels
 * for Nigerian banking and payment providers.
 *
 * Every record must contain:
 * - at least one published support email;
 * - an official submission/contact URL;
 * - one or more verification sources.
 *
 * These records supplement the CBN provider-identity
 * registry. They do not replace provider-first routing
 * or the banking escalation timing safeguards.
 */

const VERIFIED_ON =
  "2026-08-04";


function verifiedChannel({
  emails = [],
  url = "",
  sources = [],
  verifiedOn = VERIFIED_ON,
} = {}) {
  const cleanEmails = [
    ...new Set(
      emails
        .map(
          value =>
            String(value || "").trim()
        )
        .filter(Boolean)
    ),
  ];

  const cleanSources = [
    ...new Set(
      [
        url,
        ...sources,
      ]
        .map(
          value =>
            String(value || "").trim()
        )
        .filter(Boolean)
    ),
  ];

  if (!cleanEmails.length) {
    throw new Error(
      "A verified banking channel requires at least one email."
    );
  }

  for (const email of cleanEmails) {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      throw new Error(
        `Invalid verified banking email: ${email}`
      );
    }
  }

  if (
    !url ||
    !/^https:\/\//i.test(url)
  ) {
    throw new Error(
      `A verified banking channel requires an HTTPS submission URL: ${url}`
    );
  }

  if (!cleanSources.length) {
    throw new Error(
      "A verified banking channel requires source URLs."
    );
  }

  return Object.freeze({
    emails:
      Object.freeze(cleanEmails),

    url,

    sources:
      Object.freeze(cleanSources),

    verifiedOn:
      verifiedOn,
  });
}


export const VERIFIED_BANKING_CHANNELS =
  Object.freeze({
    citibank:
      verifiedChannel({
        emails: [
          "complaints.nigeria@citi.com",
        ],

        url:
          "https://www.citigroup.com/global/about-us/global-presence/nigeria",
      }),

    ecobank:
      verifiedChannel({
        emails: [
          "ENGContactCentre@ecobank.com",
        ],

        url:
          "https://www.ecobank.com/ng/personal-banking/contact-us",

        sources: [
          "https://ecobank.com/ng/personal-banking/ways-to-bank/internet-banking",
        ],
      }),

    fidelity:
      verifiedChannel({
        emails: [
          "trueserve@fidelitybank.ng",
        ],

        url:
          "https://www.fidelitybank.ng/contact-us/",

        sources: [
          "https://fidelitybank.ng/fidelity-card/credit-card/fidelity-visa-platinum-credit-card/",
        ],
      }),

    firstbank:
      verifiedChannel({
        emails: [
          "firstcontactcomplaints@firstbankgroup.com",
          "complaints@firstbankgroup.com",
        ],

        url:
          "https://complaints.firstbanknigeria.com",

        sources: [
          "https://www.firstbanknigeria.com/contact/feedback-complaints/",
          "https://www.firstbanknigeria.com/contact/",
        ],
      }),

    fcmb:
      verifiedChannel({
        emails: [
          "customerservice@fcmb.com",
        ],

        url:
          "https://www.fcmb.com/customer-service.php",
      }),

    globus:
      verifiedChannel({
        emails: [
          "contactcenter@globusbank.com",
        ],

        url:
          "https://www.globusbank.com/contact_us.html",
      }),

    jaiz:
      verifiedChannel({
        emails: [
          "contactcentre@jaizbankplc.com",
        ],

        url:
          "https://jaizonline.jaizbankplc.com/login",
      }),

    keystone:
      verifiedChannel({
        emails: [
          "contactcentre@keystonebankng.com",
        ],

        url:
          "https://www.keystonebankng.com/help-desk/complaints-channel/",

        sources: [
          "https://www.keystonebankng.com/help-desk/customer-protection-information/",
        ],
      }),

    lotus:
      verifiedChannel({
        emails: [
          "complaints@lotusbank.com",
          "support@lotusbank.com",
        ],

        url:
          "https://www.lotusbank.com/customer-support",
      }),

    nova:
      verifiedChannel({
        emails: [
          "support@novabank.ng",
          "info@novabank.ng",
        ],

        url:
          "https://www.novabank.ng/contact/",
      }),

    optimus:
      verifiedChannel({
        emails: [
          "opticonnect@optimusbank.com",
        ],

        url:
          "https://ibank.optimusbank.com/support",

        sources: [
          "https://www.optimusbank.com/security-center",
        ],
      }),

    parallex:
      verifiedChannel({
        emails: [
          "customercare@parallexbank.com",
          "info@parallexbank.com",
        ],

        url:
          "https://www.parallexbank.com/help",
      }),

    polaris:
      verifiedChannel({
        emails: [
          "yescenter@polarisbanklimited.com",
        ],

        url:
          "https://www.polarisbanklimited.com/",

        sources: [
          "https://portal.polarisbanklimited.com/bvn-nin-account-linking/initiate-process",
        ],
      }),

    premiumtrust:
      verifiedChannel({
        emails: [
          "contactpremium@premiumtrustbank.com",
        ],

        url:
          "https://premiumtrustbank.com/faq/",
      }),

    providus:
      verifiedChannel({
        emails: [
          "businessconcierge@providusbank.com",
        ],

        url:
          "https://www.providusbank.com/complaints",
      }),

    standard_chartered:
      verifiedChannel({
        emails: [
          "clientcare.ng@sc.com",
        ],

        url:
          "https://www.sc.com/ng/contact-us/",
      }),

    sterling:
      verifiedChannel({
        emails: [
          "customercare@sterling.ng",
        ],

        url:
          "https://sterling.ng/complaint/",

        sources: [
          "https://sterling.ng/support/contact-us/",
        ],
      }),

    suntrust:
      verifiedChannel({
        emails: [
          "helpdesk@suntrustng.com",
        ],

        url:
          "https://suntrustng.com/contact-us/",
      }),

    tajbank:
      verifiedChannel({
        emails: [
          "tajconnect@tajbank.com",
        ],

        url:
          "https://tajbank.com/contact/",
      }),

    alternative_bank:
      verifiedChannel({
        emails: [
          "customercare@altbank.ng",
        ],

        url:
          "https://altbank.ng/complaints/",

        sources: [
          "https://altmobile.altbank.ng/contact",
          "https://altbank.ng/contact-us/",
        ],
      }),

    titan:
      verifiedChannel({
        emails: [
          "Contactcentre@titantrustbank.com",
        ],

        url:
          "https://titantrustbank.com/contact-us/",
      }),

    union:
      verifiedChannel({
        emails: [
          "customerservice@unionbankng.com",
        ],

        url:
          "https://unionbankng.com/support/",

        sources: [
          "https://unionbankng.com/contact-us/",
        ],
      }),

    unity:
      verifiedChannel({
        emails: [
          "we_care@unitybankng.com",
        ],

        url:
          "https://www.unitybankng.com/contact",
      }),

    uba:
      verifiedChannel({
        emails: [
          "cfc@ubagroup.com",
        ],

        url:
          "https://www.ubagroup.com/nigeria/help/contact-us/",
      }),

    wema:
      verifiedChannel({
        emails: [
          "purpleconnect@wemabank.com",
        ],

        url:
          "https://www.wemabank.com/contact-us",
      }),

    zenith:
      verifiedChannel({
        emails: [
          "zenithdirect@zenithbank.com",
        ],

        url:
          "https://www.zenithbank.com/",

        sources: [
          "https://www.zenithbank.com/corporate-banking/loans-investment",
        ],
      }),

    "9psb":
      verifiedChannel({
        emails: [
          "hello@9psb.com.ng",
        ],

        url:
          "https://9psb.com.ng/contact/",
      }),

    hope_psb:
      verifiedChannel({
        emails: [
          "customercare@hopepsbank.com",
          "info@hopepsbank.com",
        ],

        url:
          "https://support.hopepsbank.com/",

        sources: [
          "https://hopepsbank.com/contact",
        ],
      }),

    smartcash:
      verifiedChannel({
        emails: [
          "customerservice@smartcashpsb.ng",
        ],

        url:
          "https://smartcashpsb.ng/",
      }),

    opay:
      verifiedChannel({
        emails: [
          "customerservice@opay-inc.com",
        ],

        url:
          "https://play.google.com/store/apps/details?id=team.opay.pay",
      }),

    palmpay:
      verifiedChannel({
        emails: [
          "support@palmpay.com",
        ],

        url:
          "https://www.palmpay.com/company/contact/",

        sources: [
          "https://play.google.com/store/apps/details?id=com.transsnet.palmpay",
          "https://h5.palmpay.app/h5/conditions/ng/palmpay",
        ],
      }),

    paga:
      verifiedChannel({
        emails: [
          "help@paga.com",
        ],

        url:
          "https://help.paga.com/support/solutions/articles/35000283460-how-do-i-contact-customer-support-for-card-related-issues-",
      }),

    moniepoint:
      verifiedChannel({
        emails: [
          "support@moniepoint.com",
        ],

        url:
          "https://moniepoint.com/ng/contact",
      }),

    flutterwave:
      verifiedChannel({
        emails: [
          "hi@flutterwavego.com",
        ],

        url:
          "https://flutterwave.com/ng/support/submit-request",

        sources: [
          "https://flutterwave.com/ng/payment-protection-promise",
          "https://flutterwave.com/ng/contact-sales",
        ],
      }),

    paystack:
      verifiedChannel({
        emails: [
          "support@paystack.com",
        ],

        url:
          "https://paystack.com/contact/support",

        sources: [
          "https://support.paystack.com/en/articles/2127554",
        ],
      }),

    interswitch:
      verifiedChannel({
        emails: [
          "support@interswitchgroup.com",
        ],

        url:
          "https://help.interswitchgroup.com/",

        sources: [
          "https://selfservice.interswitchgroup.com/support/solutions/articles/48001210990-i-want-reversal-i-have-not-gotten-my-funds-back-i-have-not-gotten-reversal",
        ],
      }),

    remita:
      verifiedChannel({
        emails: [
          "support@remita.net",
        ],

        url:
          "https://support.remita.net/portal/en/home",
      }),

    veendhq:
      verifiedChannel({
        emails: [
          "support@veendhq.com",
        ],

        url:
          "https://veendhq.com/about",

        sources: [
          "https://veendhq.com/products/remita-payroll-loan",
          "https://veendhq.com/resources/faq",
        ],

        verifiedOn:
          "2026-08-24",
      }),

    nomba:
      verifiedChannel({
        emails: [
          "support@nomba.com",
        ],

        url:
          "https://nomba.com/",

        sources: [
          "https://nomba.com/credit-terms-of-service",
        ],
      }),
  });


if (
  Object.keys(
    VERIFIED_BANKING_CHANNELS
  ).length !== 39
) {
  throw new Error(
    "Expected 39 supplementary banking-channel records."
  );
}
