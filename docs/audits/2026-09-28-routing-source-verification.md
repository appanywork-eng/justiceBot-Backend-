# PetitionDesk Routing Source Verification

**Audit date:** 2026-09-28  
**Scope:** All 16 production sectors and every institution-like routing record in `data/*.json`  
**Release gate:** `npm run audit:routing-sources`

## Result

The release inventory contains 169 institution records backed by 315 official-source references. All records have a supported verification status, a valid verification date, at least one HTTPS official source, a unique stable identity, and an accurately classified contact channel. No placeholder hosts, placeholder emails, stale verification warnings, or ungated unverified email routes remain.

| Sector | Records | Verified direct contact | Portal/non-email | Unverified email gated |
|---|---:|---:|---:|---:|
| Anti-corruption | 4 | 4 | 0 | 0 |
| Aviation | 12 | 12 | 0 | 0 |
| Banking and finance | 44 | 44 | 0 | 0 |
| Civil disputes | 5 | 1 | 4 | 0 |
| Diaspora and consular matters | 5 | 4 | 1 | 0 |
| Education | 7 | 5 | 2 | 0 |
| General administrative complaints | 6 | 4 | 2 | 0 |
| Health and public health insurance | 8 | 8 | 0 | 0 |
| Insurance | 1 | 1 | 0 | 0 |
| International escalation | 13 | 8 | 5 | 0 |
| Judiciary | 10 | 6 | 4 | 0 |
| Power and electricity | 36 | 29 | 7 | 0 |
| Pensions and retirement benefits | 2 | 2 | 0 | 0 |
| Security and law enforcement | 9 | 7 | 2 | 0 |
| Telecommunications | 5 | 4 | 1 | 0 |
| Urban planning and development control | 2 | 1 | 1 | 0 |
| **Total** | **169** | **140** | **29** | **0** |

## Method

The audit walks the 16 files registered by `NATIONAL_SECTOR_POLICIES`; it does not rely on a manually maintained filename list. For every institution-like record it:

1. builds a stable sector/name/role identity and rejects duplicates;
2. applies the same contact-verification policy used by production routing;
3. requires a supported verified status, an ISO verification date, and one or more HTTPS official-source URLs;
4. rejects placeholder email addresses and source hosts;
5. identifies email, telephone, physical, and official-web channels;
6. fails if a verified record has no functional channel label; and
7. counts direct, portal/non-email, and gated records by sector.

Verification dates older than 90 days are reported as release warnings. The current inventory produces zero warnings.

This automated gate verifies completeness, traceability, freshness metadata, channel classification, and safe production gating. Live editorial checks remain necessary when a cited authority changes its contact page; the power records below were live-rechecked during this release because they lacked complete provenance in the imported dataset.

## Power-sector corrections live-rechecked in this release

| Institution | Correct production contact | Official evidence |
|---|---|---|
| Federal Ministry of Power | `info@power.gov.ng` | <https://www.power.gov.ng/>; <https://www.power.gov.ng/e-tender/> |
| Nigerian Electricity Management Services Agency (NEMSA) | `info@nemsa.gov.ng`; official telephone contacts | <https://nemsa.gov.ng/contact-us-2/>; <https://nemsa.gov.ng/national-head-quarters/> |
| Transmission Company of Nigeria (TCN) | `info@tcn.org.ng` | <https://www.tcn.org.ng/page_contact.php> |
| Nigeria Bulk Electricity Trading Plc (NBET) | `info@nbet.com.ng` | <https://nbet.com.ng/contact.html> |
| Niger Delta Power Holding Company (NDPHC) | `cpr@ndphc.net` | <https://ndphc.net/contact> |
| Nigeria Electricity Liability Management Company (NELMCO) | `info@nelmco.gov.ng`; official telephone contacts and address | <https://nelmco.gov.ng/2025/10/16/nelmco-seeks-civil-society-partnership-to-address-power-sector-liabilities/> |
| Rural Electrification Agency / Nigeria Electrification Project | `info@rea.gov.ng`; `nep@rea.gov.ng` | <https://rea.gov.ng/contactus.html>; <https://nep.rea.gov.ng/contact.html> |

Two unsafe legacy choices were corrected:

- NELMCO's procurement mailbox was replaced with its official general-information mailbox. Procurement is not an appropriate citizen-complaint route.
- The unsubstantiated REA mailbox `ref.info@rea.gov.ng` was replaced with the general REA contact published on the agency's official contact page; the NEP mailbox remains for NEP-specific matters.

All seven records now carry `VERIFIED_OFFICIAL_SOURCE`, a `2026-09-28` verification date, explicit official-source URLs, and a positive direct-email verification flag.

## Release commands

```sh
npm run audit:routing-sources
npm run test:power-nationwide
npm run test:national-sectors
npm run test:routing-contact-contract
```

Expected release totals:

```text
TOTAL_SECTORS=16
TOTAL_RECORDS=169
TOTAL_SOURCE_REFERENCES=315
VERIFIED_DIRECT_RECORDS=140
PORTAL_OR_NON_EMAIL_RECORDS=29
UNVERIFIED_EMAIL_RECORDS_GATED=0
WARNINGS=0
```
