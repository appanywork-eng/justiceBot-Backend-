# PetitionDesk Release Hardening Design

**Date:** 2026-09-28  
**Source baseline:** release archive for commit `74b69e9`  
**Status:** proposed for user review

## 1. Purpose

Prepare the current PetitionDesk backend for a safe Cloud Run production release without changing the product's pricing, user journey, supported sectors, or intended legal-routing policy.

The release must do more than start successfully. It must generate a complaint-specific petition, classify the complaint into the correct sector, select a jurisdictionally appropriate primary recipient, use only verified delivery channels, and fail safely when the facts are insufficient or the platform's durable services are unavailable.

## 2. Confirmed baseline

The supplied source archive was inspected as the `74b69e9` release baseline. The existing complete test command passes, including 795 logged assertions and scenario checks across the 16-sector national framework. Coverage measured across `lib/**/*.mjs` is 85.87% statements, 73.22% branches, 92% functions, and 85.87% lines.

The dedicated security regression suite also passes. It currently proves:

- nine registered Nigerian security and law-enforcement authorities;
- seven verified direct-contact routes and two portal-only routes;
- active emergencies are blocked from ordinary petition generation;
- serious security-rights abuse routes to the National Human Rights Commission;
- police misconduct routes to the Police Service Commission;
- crime reports route to the relevant State Police Command or nearest police station;
- Nigerian Correctional Service, Army, Navy, Immigration, Civil Defence, and Air Force complaint channels follow the registered official route; and
- portal-only authorities do not receive guessed email addresses.

This is meaningful evidence, but it is not by itself a production guarantee. The release work will add boundary, adversarial, and end-to-end contract tests so that a healthy server cannot pass while producing a wrong petition or wrong route.

## 3. Scope and non-goals

### In scope

- routing and jurisdiction correctness across all current sectors;
- security-sector petition and routing correctness;
- petition semantic integrity after AI drafting;
- durable petition, payment, unlock, transaction, entitlement, and admin-session state;
- Flutterwave verification and replay protection;
- runtime configuration, readiness, input limits, rate limits, and safe errors;
- dependency and container cleanup;
- staged Cloud Build and Cloud Run deployment;
- automated release-integrity checks and a documented rollback path.

### Out of scope

- redesigning the frontend;
- changing the current price or free-petition allowance;
- adding new commercial features;
- replacing Gemini or rewriting the proven routing engine;
- inventing legal conclusions, recipients, email addresses, or jurisdictions;
- automatically sending a petition on behalf of the user.

## 4. Core routing contract

The deterministic routing engine remains authoritative. Gemini may draft and classify only within the boundaries supplied by the application; it may not invent or replace the system-selected `TO`, `CC`, jurisdiction, delivery method, or verified contact channel.

Every generated result must carry a traceable routing decision containing at least:

- detected sector and detection reason;
- case type;
- jurisdiction and route key;
- one primary institution for the `TO` block;
- system-controlled `CC` institutions;
- delivery method and whether direct email is verified;
- official source URLs used by the registry; and
- an explanation or user action when generation is blocked.

Each generated petition has exactly one system-selected `TO` recipient. PCC remains the standing administrative-oversight copy for generated domestic sector petitions. Human-rights cases additionally use NHRC, service-delivery cases use the applicable SERVICOM/FCCPC oversight, and international escalation uses its separate verified policy. Active emergencies and other workflows that deliberately do not produce a petition do not create artificial `TO` or `CC` entries.

If PetitionDesk cannot resolve a safe recipient from the complaint, institution, location, and escalation stage, it must request the missing facts or refuse to generate the routed petition. It must not silently fall back to a plausible-sounding authority.

## 5. All-sector correctness contract

The release gate applies equally to every supported sector. Each sector must have table-driven cases proving correct detection, jurisdiction, complaint stage, `TO`, controlled `CC`, delivery method, verified contact channel, document purpose, petition semantics, and safe behavior when required facts are missing. Tests must also include complaints that contain overlapping words from other sectors so PetitionDesk does not choose a superficially plausible but wrong route.

| Sector | Minimum routing and petition behavior to prove |
| --- | --- |
| Anti-corruption | Distinguish EFCC, ICPC, Code of Conduct Bureau, and Bureau of Public Procurement matters by allegation type and institution; use allegation-safe wording and reporter-safety controls. |
| Aviation | Route to the airline first when appropriate, escalate an evidenced unresolved passenger complaint to NCAA, route accident or serious safety reporting to NSIB, and handle unknown airlines without inventing contacts. |
| Banking | Route to the bank or regulated provider first; enforce complaint-reference and applicable 14-day/30-day escalation evidence before CBN routing; correctly handle failed transfers, unauthorized debits, loans, fintechs, and provider identity. |
| Civil disputes | Distinguish private civil matters from public complaints; apply location-sensitive FCT, Lagos, other-state ADR, formal-notice, and court-registry routes without presenting legal advice or promising a judicial outcome. |
| Diaspora reports | Distinguish consular welfare, passport/immigration, trafficking, detention, and country-specific assistance; select the correct Nigerian mission or competent verified channel. |
| Education | Route to the school or institution first where required and distinguish JAMB, WAEC, NECO, tertiary-regulator, admission, examination, certificate, and institutional-service complaints. |
| General complaints | Use PCC-led routing only when no more specific sector applies; add NHRC, SERVICOM, or FCCPC oversight only when the complaint facts justify it. |
| Health | Distinguish hospital/provider service, clinical professional misconduct, unsafe products, health insurance, human-rights, and consumer matters; route among provider, NHIA, MDCN and other professional councils, NAFDAC, NHRC, and FCCPC as appropriate. |
| Insurance | Route ordinary policy, premium, claim, insurer, or broker complaints through the provider and NAICOM process; exclude health-insurance complaints that belong in the health/NHIA route. |
| International escalation | Confirm the correct international subject and exhaustion/escalation stage; distinguish UN, ICC, African Commission, ECOWAS, and diplomatic advocacy routes and never treat an international body as a substitute for an available domestic emergency or ordinary complaint channel. |
| Judiciary | Distinguish court administration, judicial misconduct, legal-practitioner discipline, justice-chain rights issues, and appeal/review matters; never disguise an appeal against a judicial decision as an administrative petition. |
| Pensions | Distinguish contributory-pension matters under PenCom from defined-benefit or legacy matters under PTAD and preserve provider-first evidence where applicable. |
| Power | Identify the correct distribution company/provider, apply provider-first handling, distinguish the FCT Forum and transitioned-state regulators from national NERC escalation, and avoid routing unrelated metering or billing facts to the wrong state authority. |
| Security | Apply the complete issue-specific security contract in Section 6, including emergency, crime-reporting, human-rights, disciplinary, and agency-specific routes. |
| Telecommunications | Route to the verified network/provider first, escalate evidenced unresolved matters through the NCC channel, distinguish number/SIM/data/billing/service complaints, and handle unknown providers without invented contacts. |
| Urban planning | Use issue location to distinguish FCT Development Control, Lagos building-control authorities, and the applicable state or local planning authority; do not guess a jurisdiction when the location is insufficient. |

For all 16 sectors, every production routing/contact record must be rechecked during this release audit against its cited official source. The verification date may be renewed only after the institution, function, and delivery channel match the source. Direct email delivery is permitted only when the address is verified for that complaint function. Where an authority provides only a portal, command directory, physical submission, or telephone channel, PetitionDesk must say so instead of manufacturing an email address.

The AI-generated document must be sector-specific: its subject, factual summary, requested remedy, legal-safety wording, and supporting-document guidance must match the deterministic case type. A correct recipient paired with a generic, unrelated, or legally misleading petition is a failed release test.

## 6. Security-sector detail

Security complaints require issue-specific handling rather than one generic security template.

| Complaint type | Required behavior |
| --- | --- |
| Active attack, kidnapping in progress, or immediate danger | Block ordinary petition generation; clearly direct the user to the nearest police station or appropriate emergency security agency. |
| Kidnapping, robbery, missing person, death threat, or other crime report | Route first to the relevant State Police Command or nearest police station; do not invent a national email when the official path is command/station reporting. |
| Unlawful detention, torture, police brutality, forced confession, extrajudicial killing, or comparable rights abuse | Classify as human-rights/security; route primarily to NHRC and retain only the system-approved administrative and disciplinary oversight required by the deterministic resolver. |
| Police extortion, illegal checkpoint, bail-money demand, bribery, harassment, or professional misconduct | Route primarily to the Police Service Commission disciplinary channel and identify the responsible police command where supplied. |
| Complaint against Correctional Service, NSCDC, Immigration, Army, Navy, or Air Force | Route to that agency's verified complaint, headquarters, inspectorate, SERVICOM, ombudsman, or official portal channel according to the registry and escalation evidence. |
| Ambiguous security complaint | Request the missing agency, location, incident type, and urgency rather than guessing. |

Security petition content must describe the user's allegations as allegations, preserve dates and places provided by the user, avoid unsupported criminal conclusions, request lawful investigation or redress, and never tell a person in immediate danger to wait for a generated document.

The implementation plan must add table-driven tests for detection, route key, primary recipient, controlled copies, delivery method, verified contacts, petition purpose, emergency blocking, and misleading near-matches from other sectors. The test set must include every registered security authority and representative federal, state, local, rights-abuse, disciplinary, criminal-reporting, and escalation cases.

## 7. Petition semantic integrity

The application will continue to treat recipient headers as system-controlled. After Gemini drafts a petition, a semantic validation and recovery stage must verify:

- the required `TO` recipient is present and unchanged;
- no unauthorized recipient has been introduced;
- complaint facts, institution, issue location, and requested remedy have not been replaced by unrelated facts;
- the document remains within the detected sector and case type;
- the wording distinguishes allegations from established findings;
- the petition does not promise an outcome or present PetitionDesk as a law firm, court, emergency service, or government body; and
- unsafe or malformed output is rejected or regenerated within bounded retry rules.

## 8. Durable-state architecture

Petitions, payment markers, Flutterwave transaction identifiers, unlock records, free entitlements, and admin sessions are correctness-critical state. When Firestore is enabled in production, a Firestore read or write failure must return a controlled service-unavailable error. The server must never substitute instance-local memory for failed durable storage.

An isolated runtime-store component will expose the existing operations while making the storage mode explicit:

- local memory is allowed only when durable storage is intentionally disabled for local development or tests;
- production durable mode propagates sanitized storage failures;
- no stale local value may hide a Firestore failure; and
- atomic or idempotent operations are used for payment, free-entitlement, and unlock decisions.

Local fallback remains acceptable for non-authoritative telemetry and best-effort rate-limit counters, provided it cannot grant payment, entitlement, petition ownership, or administrative access.

## 9. Payment and unlock contract

A paid unlock may succeed only when either a previously authenticated webhook marker exists or Flutterwave verification returns all of the following:

- a successful transaction status;
- an exact, non-empty transaction reference equal to PetitionDesk's expected `tx_ref`;
- NGN currency;
- an amount at least equal to the configured petition price; and
- a transaction not already applied to another unlock.

Missing, malformed, mismatched, replayed, underpaid, wrong-currency, pending, or failed transactions must be rejected. The comparison logic will be extracted into a pure module and covered by unit tests before the endpoint is changed.

## 10. Configuration, input, and readiness

All numeric environment variables will use bounded finite parsers with explicit defaults or startup errors. Invalid values must never become `NaN` and silently alter access, price, expiry, retry, or timeout behavior.

Global JSON bodies will be limited to the smallest size that safely supports existing petition fields. Public routing endpoints will validate type and maximum length for complaint, institution, location, sector, and escalation inputs and will receive an appropriate request limiter.

`GET /health` remains a non-secret liveness response. A new `GET /ready` endpoint becomes the deployment gate. In production it returns HTTP 503 unless required configuration is present and Firestore is reachable. Responses may name missing configuration labels but must never expose secret values, credentials, petition content, or provider responses.

## 11. Source, dependency, and container integrity

The package will be identified as PetitionDesk and its runnable entry point will match `server.mjs`. Broken or unreachable legacy files will be removed or explicitly excluded from the production artifact. A release-integrity test will parse all shipped JavaScript, validate local imports and JSON, and confirm that the container does not include backups, audit outputs, coverage files, patches, credentials, or unused broken source.

Production dependencies will be upgraded to compatible maintained releases that resolve the currently reported audit findings. Major-version upgrades will be accepted only when the full suite and focused compatibility tests pass. The final production dependency audit must report no known vulnerabilities at the configured audit level.

## 12. Deployment and rollback

Cloud Build will enforce this order:

1. clean dependency installation;
2. release-integrity, routing, security, payment, persistence, semantic, and full regression tests;
3. production dependency audit;
4. container build and push using immutable build identity;
5. Cloud Run deployment with no production traffic and a candidate tag;
6. candidate `/health` and `/ready` smoke tests plus representative API contract tests; and
7. a separate explicit promotion operation after evidence review.

Promotion will target the exact tested revision, never “latest.” The prior production revision and its traffic allocation will be recorded before promotion. Post-promotion smoke tests must pass; otherwise traffic will be restored to the recorded revision. Secrets remain Cloud Run/Secret Manager configuration and are not written into source, build logs, or promotion commands.

This workspace is not authenticated to the user's Google Cloud project, so the completed release will include guarded Cloud Shell commands for the user to run. No response will claim production deployment until Cloud Run reports the exact new revision at the intended traffic percentage and public smoke tests pass.

## 13. Testing strategy

Changes will follow test-driven development. Each defect receives a failing regression test before its implementation fix. Required layers are:

- pure unit tests for configuration parsing and payment assessment;
- storage-contract tests with successful and failing Firestore doubles;
- table-driven routing and jurisdiction tests across all 16 sectors;
- expanded security routing and petition-content tests;
- API tests for input validation, readiness, controlled errors, ownership, payment, and unlock flows;
- source and container release-integrity checks;
- the existing complete regression suite;
- production-dependency audit; and
- candidate and post-promotion smoke tests.

The release is not accepted if tests merely prove an endpoint returned 200. Routing tests must assert the expected sector, route key, primary institution, controlled copies, delivery channel, and important petition semantics.

## 14. Acceptance criteria

The candidate may be promoted only when all of the following are true:

1. Existing national routing behavior has no unexplained regression.
2. All 16 sectors pass the complete contract in Section 5, including detection, jurisdiction, complaint stage, recipients, delivery, official-source metadata, petition semantics, missing-information behavior, and cross-sector confusion cases.
3. Every registered security authority and security complaint class passes the expanded matrix.
4. Emergency security cases cannot generate a misleading ordinary petition.
5. AI output cannot override deterministic recipients or introduce an unverified contact.
6. Durable-state failures cannot grant or lose a paid/free unlock through memory fallback.
7. Payment checks reject missing/mismatched references, wrong currency, underpayment, bad status, and replay.
8. `/ready` fails when production prerequisites or Firestore are unavailable.
9. Shipped source parses, local imports resolve, and JSON data loads.
10. The complete regression suite passes from a clean install.
11. The production dependency audit has no unresolved known vulnerability at the configured level.
12. The candidate revision passes direct smoke tests before receiving traffic.
13. The exact tested revision is promoted explicitly and can be rolled back to the recorded predecessor.

## 15. Evidence delivered with the release

The handoff will include:

- a concise audit and change summary;
- before-and-after test counts, coverage, lint, and dependency-audit results;
- the exact source commit and image/revision identifiers;
- the candidate smoke-test results;
- guarded Cloud Shell deployment, promotion, verification, and rollback commands; and
- any residual limitations that could not be safely resolved in this release.
