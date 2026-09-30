# PetitionDesk Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested, auditable PetitionDesk backend candidate that routes and drafts correctly across all 16 sectors, fails closed for durable state and payments, and can be promoted to Cloud Run only after candidate verification.

**Architecture:** Keep the deterministic jurisdiction engine authoritative and add focused modules around its unsafe boundaries: configuration, request validation, payment assessment, durable runtime state, and readiness. Release correctness is enforced through all-sector fixtures, official-source evidence, source/container integrity checks, and a no-traffic deployment followed by explicit revision promotion.

**Tech Stack:** Node.js 20+ ESM, Express 4, Google Cloud Firestore, Firebase Admin, Flutterwave HTTP API, Gemini, PDFKit, Docker, Google Cloud Build, Cloud Run.

**Spec:** `docs/superpowers/specs/2026-09-28-petitiondesk-release-hardening-design.md`

## Global Constraints

- Preserve the current price of ₦550 and the two-free-petition allowance.
- Preserve all 16 supported sectors and the existing deterministic resolver registry.
- Gemini may not select or alter `TO`, `CC`, jurisdiction, route key, or verified delivery contacts.
- A generated petition has exactly one system-selected `TO`; controlled oversight follows the approved sector policy.
- Production Firestore failures must never fall back to instance-local state for petitions, payments, unlocks, entitlements, or admin sessions.
- Direct delivery contacts require an official source and functional verification; portal-only records must stay portal-only.
- No production traffic reaches a candidate until the exact revision passes `/health`, `/ready`, routing-capability, and representative contract smoke tests.
- Each behavioral defect receives a failing regression test before its implementation change.
- Every new deterministic test script receives a named npm command and is added to `test:all` in dependency-safe order; the live official-source audit remains an explicit release command rather than a network-dependent unit test.
- Do not modify the frontend; maintain existing response fields unless the spec explicitly adds a field or controlled error.

## Review Focus

- Mixed-sector wording such as hospital detention plus insurance language must select the correct health subtype and not the generic insurance or security route; Task 5 owns this test.
- Missing institution or issue location must produce a bounded validation error rather than a guessed jurisdiction; Task 3 owns this test.
- Firestore failure after an attempted write must return an unavailable error and must not leave an unlockable memory record; Task 7 owns this test.
- Flutterwave responses with an empty/mismatched `tx_ref`, reused transaction, wrong currency, or underpayment must never unlock; Task 6 owns these tests.
- A candidate with missing secrets or unreachable Firestore must fail `/ready` and receive zero traffic; Tasks 8 and 11 own these tests.

---

## File Structure

### New focused modules

- `lib/runtimeConfig.mjs` — bounded environment parsing and the immutable server configuration object.
- `lib/routingRequestValidation.mjs` — validation and normalization for `/routing/resolve`.
- `lib/paymentVerification.mjs` — pure Flutterwave result assessment.
- `lib/petitionRuntimeStore.mjs` — explicit memory or durable petition/payment/unlock/admin-session storage contract.
- `lib/readiness.mjs` — pure readiness requirement evaluation.

### New verification scripts and fixtures

- `scripts/test-release-integrity.mjs` — package, runtime source, import, JSON, and Docker allowlist checks.
- `scripts/test-runtime-config.mjs` — configuration parsing tests.
- `scripts/test-routing-request-validation.mjs` — public diagnostic input tests.
- `scripts/fixtures/all-sector-routing-cases.mjs` — expected all-sector decisions and cross-sector traps.
- `scripts/test-all-sector-routing-contract.mjs` — route/delivery assertions for the fixture matrix.
- `scripts/test-all-sector-petition-contract.mjs` — semantic/recipient assertions for all-sector sample petitions.
- `scripts/audit-routing-source-inventory.mjs` — deterministic inventory of institutions, contacts, sources, and verification dates.
- `scripts/test-payment-verification.mjs` — payment assessment and replay tests.
- `scripts/test-petition-runtime-store.mjs` — memory/durable/failure storage contract tests.
- `scripts/test-readiness.mjs` — readiness policy tests.
- `scripts/test-deployment-contract.mjs` — static no-traffic, candidate-smoke, exact-promotion, and rollback assertions.
- `scripts/smoke-release.mjs` — HTTP smoke runner for a candidate or production URL.
- `scripts/promote-cloud-run.sh` — guarded exact-revision promotion and rollback.

### Existing files modified

- `server.mjs` — consume the new modules, add `/ready`, reduce body size, validate/rate-limit routing, and remove unsafe state/payment logic.
- `lib/firestoreRedisCompat.mjs` — add a non-mutating connectivity check.
- `data/*.json` and `lib/nigeria*Registry.mjs` — only verified contact/source corrections and honest verification dates.
- `package.json`, `package-lock.json` — PetitionDesk identity, test scripts, and compatible dependency upgrades.
- `Dockerfile`, `.dockerignore` — runtime allowlist and artifact exclusions.
- `cloudbuild.yaml`, `cloudrun.env.example` — verified build, no-traffic candidate deployment, and readiness configuration.
- `scripts/test-production-security.mjs` — updated security/deployment invariants.

### Existing files removed after reference checks

- `a8Engine.js` — unreferenced syntactically invalid legacy entry point.
- `mailer.mjs` — unreferenced legacy module with a missing import and duplicate binding.

---

### Task 1: Release source and container integrity

**Files:**
- Create: `scripts/test-release-integrity.mjs`
- Modify: `package.json`, `Dockerfile`, `.dockerignore`
- Delete: `a8Engine.js`, `mailer.mjs`

**Interfaces:**
- Consumes: current runtime roots `server.mjs`, `lib/`, and `data/`.
- Produces: `npm run test:release-integrity`, a clean production allowlist, and PetitionDesk package identity.

- [ ] **Step 1: Write the failing integrity test**

Assert package name is `petitiondesk-backend`, `main` is `server.mjs`, every `.mjs` shipped by the Docker allowlist passes `node --check`, all relative imports resolve, every shipped JSON file parses, Docker copies only `package*.json`, `server.mjs`, `lib/`, and `data/`, and the two broken legacy files are absent.

- [ ] **Step 2: Run the test and verify RED**

Run: `node scripts/test-release-integrity.mjs`  
Expected: FAIL on stale package identity, broad `COPY . .`, and the legacy files.

- [ ] **Step 3: Apply the minimal source/package/container cleanup**

Set package identity and entry point, remove only the two confirmed unreferenced broken files, and replace broad Docker copying with the declared runtime allowlist. Add `test:release-integrity` to `package.json`.

- [ ] **Step 4: Verify GREEN and build the image**

Run: `npm run test:release-integrity && docker build -t petitiondesk-audit:task1 .`  
Expected: integrity test passes and the image builds as non-root.

- [ ] **Step 5: Commit**

Run: `git commit -am "chore: enforce PetitionDesk release integrity"` after staging the created/deleted files.

### Task 2: Bounded runtime configuration

**Files:**
- Create: `lib/runtimeConfig.mjs`, `scripts/test-runtime-config.mjs`
- Modify: `server.mjs`, `package.json`, `cloudrun.env.example`

**Interfaces:**
- Produces: `parseIntegerEnv(value, { name, defaultValue, min, max })` and `loadRuntimeConfig(env)` returning the price, TTLs, rate limits, Flutterwave timeouts, free limit, and `jsonBodyLimit: "256kb"`.

- [ ] **Step 1: Write failing parser tests**

Cover unset values, numeric strings, zero where permitted, decimals, `NaN`, infinity, negatives, below/above bounds, whitespace, and the pinned defaults: price `550`, free limit `2`, petition/admin TTL `7200`, Flutterwave timeout `20000`, pending window `900000`, and security window `900000`.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-runtime-config.mjs`  
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement and wire the immutable configuration**

Create the two exported functions, freeze the returned object, replace direct numeric `process.env` conversions in `server.mjs`, and document every supported variable in `cloudrun.env.example` without secret values.

- [ ] **Step 4: Verify GREEN and regression safety**

Run: `node scripts/test-runtime-config.mjs && npm run test:production-security`  
Expected: both pass with ₦550/two-free policy unchanged.

- [ ] **Step 5: Commit**

Run: `git commit -am "fix: validate PetitionDesk runtime configuration"` after staging new files.

### Task 3: Request-size, routing-input, and rate-limit hardening

**Files:**
- Create: `lib/routingRequestValidation.mjs`, `scripts/test-routing-request-validation.mjs`
- Modify: `server.mjs`, `scripts/test-production-security.mjs`, `package.json`

**Interfaces:**
- Consumes: `runtimeConfig.jsonBodyLimit` and `createRequestLimiter`.
- Produces: `validateRoutingResolveBody(body)` returning `{ ok: true, value }` or `{ ok: false, error, code }` with the same normalized fields consumed by `resolveComplaintRouting`.

- [ ] **Step 1: Write failing input-contract tests**

Assert complaint max `10000`, institution/location/address max `300`, sector/stage/country max `100`, references max `150`, valid object types, rejection of arrays/objects as strings, missing institution/location errors, and the mixed malicious oversized payload case.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-routing-request-validation.mjs`  
Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement and wire validation, body errors, and limiter**

Use `256kb` JSON limit, return JSON code `request_body_too_large` for parser size errors, validate before resolving, and apply a routing limiter of 60 requests per 15 minutes using the existing shared/local limiter behavior.

- [ ] **Step 4: Verify GREEN**

Run: `node scripts/test-routing-request-validation.mjs && npm run test:production-security && npm run test:routing-contact-contract`  
Expected: all pass and successful routing response fields remain unchanged.

- [ ] **Step 5: Commit**

Run: `git commit -am "fix: bound public routing requests"` after staging new files.

### Task 4: Official-source inventory and re-verification

**Files:**
- Create: `scripts/audit-routing-source-inventory.mjs`, `docs/audits/2026-09-28-routing-source-verification.md`
- Modify when evidence requires: `data/*.json`, `lib/nigeria*Registry.mjs`, `lib/nigeriaVerifiedBankingChannels.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run audit:routing-sources`, a stable record key per institution/channel, and a report covering all production records.

- [ ] **Step 1: Write the inventory/audit assertions**

Require all 16 sectors, unique institution keys, valid verification status/date, HTTPS official-source URLs, functional-channel labeling, no placeholder contacts, and direct-contact gating. Output counts must reconcile with the records discovered rather than hard-code the prior count of 169.

- [ ] **Step 2: Run the audit on the baseline**

Run: `node scripts/audit-routing-source-inventory.mjs`  
Expected: a deterministic inventory plus explicit failures/warnings for any missing, malformed, duplicate, stale, or non-official evidence.

- [ ] **Step 3: Recheck every cited production record against official sources**

For each record, verify institution identity, complaint function, email/portal/address/telephone role, and source URL. Record `confirmed`, `corrected`, `portal-only`, `unavailable-gated`, or `removed`; never renew a verification date without checking the cited source.

- [ ] **Step 4: Add regression cases for every correction and update data**

For each changed route/contact, first add the expected decision to the relevant sector test, observe failure, then update only the affected JSON/registry record and its honest verification date.

- [ ] **Step 5: Verify the complete source contract**

Run: `npm run audit:routing-sources && npm run test:national-sectors && npm run test:routing-contact-contract`  
Expected: zero critical failures, no exposed unverified direct contact, and report totals matching the runtime catalogue.

- [ ] **Step 6: Commit**

Run: `git commit -am "data: reverify all PetitionDesk routing sources"` after staging the report and script.

### Task 5: All-16-sector routing and petition matrix

**Files:**
- Create: `scripts/fixtures/all-sector-routing-cases.mjs`, `scripts/test-all-sector-routing-contract.mjs`, `scripts/test-all-sector-petition-contract.mjs`
- Modify if a test exposes a defect: the owning resolver/registry and `server.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: fixture objects with `name`, `sector`, `context`, `expectedRouteKey`, `expectedPrimary`, `expectedCc`, `expectedDelivery`, and `blocked`, consumed by both new contract scripts.

- [ ] **Step 1: Add the failing routing matrix**

Include at least initial, evidenced-escalation, and ambiguous/missing-information cases for each of the 16 sectors; explicit cases for all nine registered security authorities; and cross-sector traps for health insurance, hospital detention, aviation safety, election violence, pension type, judicial decision versus misconduct, and corruption versus ordinary service failure.

- [ ] **Step 2: Run the routing matrix and capture RED defects**

Run: `node scripts/test-all-sector-routing-contract.mjs`  
Expected: every discovered mismatch is reported by fixture name with actual sector/route/recipient.

- [ ] **Step 3: Fix only demonstrated routing defects**

Change the smallest owning resolver, sector-priority rule, or registry record; do not add broad keywords that make an unrelated fixture pass.

- [ ] **Step 4: Add and run the all-sector petition-semantic matrix**

For each sector, assert exactly one correct `TO`, PCC administrative oversight on generated domestic sector petitions, any case-specific NHRC/SERVICOM/FCCPC oversight, route-specific subject/purpose/remedy, allegation-safe wording, and rejection of an unauthorized recipient or unrelated sector content. Active emergency/non-petition routes must not fabricate recipients. Run: `node scripts/test-all-sector-petition-contract.mjs`.

- [ ] **Step 5: Run all national routing suites**

Run: `npm run test:national-sectors && npm run test:additional-sectors && npm run test:routing-contact-contract && npm run test:all-sector-routing && npm run test:all-sector-petitions`  
Expected: all pass across all 16 sectors.

- [ ] **Step 6: Commit**

Run: `git commit -am "test: enforce all-sector routing and petition contracts"` after staging new fixtures/scripts and any narrow fixes.

### Task 6: Exact Flutterwave payment verification

**Files:**
- Create: `lib/paymentVerification.mjs`, `scripts/test-payment-verification.mjs`
- Modify: `server.mjs`, `package.json`

**Interfaces:**
- Produces: `assessFlutterwavePayment({ transaction, expectedTxRef, expectedCurrency, minimumAmount })` returning `{ ok, code, transactionId, txRef, amount, currency, status }`.

- [ ] **Step 1: Write failing payment tests**

Cover success; empty/mismatched reference; pending/failed status; wrong currency; underpayment; non-finite amount; missing transaction ID; and array response normalization. Assert empty `tx_ref` returns `payment_reference_missing`, not success. Durable replay is tested in Task 7.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-payment-verification.mjs`  
Expected: FAIL because the module does not exist and the current endpoint accepts a missing reference.

- [ ] **Step 3: Implement the pure assessor and use it in webhook/unlock paths**

Require exact non-empty reference equality, successful status, NGN, amount `>= 550` through runtime config, and a non-empty provider transaction ID before marking paid/unlocked.

- [ ] **Step 4: Verify GREEN and payment regressions**

Run: `node scripts/test-payment-verification.mjs && npm run test:production-security && npm test`  
Expected: all pass with pending responses still returning the existing 202 behavior during the configured window.

- [ ] **Step 5: Commit**

Run: `git commit -am "fix: require exact Flutterwave payment identity"` after staging new files.

### Task 7: Fail-closed durable petition state

**Files:**
- Create: `lib/petitionRuntimeStore.mjs`, `scripts/test-petition-runtime-store.mjs`
- Modify: `lib/firestoreRedisCompat.mjs`, `server.mjs`, `package.json`

**Interfaces:**
- Produces: `PetitionRuntimeStore({ store, ttlSeconds, now, schedule })` with `putPetition`, `getPetition`, `deletePetition`, `markPaid`, `isPaid`, `putUnlocked`, `getUnlocked`, `putTransactionId`, `getTransactionId`, `claimPaymentTransaction`, `putAdminSession`, and `hasAdminSession`; `FirestoreRedisCompat.claim(key, value, ttlSeconds)` as an atomic set-if-absent operation; and `RuntimeStoreUnavailableError` with code `runtime_store_unavailable`.

- [ ] **Step 1: Write failing storage-contract tests**

Prove memory mode works only with `store: null`; durable reads/writes/deletes propagate a typed error; no durable failure reads or writes the memory map; expired local records disappear; transaction IDs, unlocked payloads, and admin sessions round-trip; a failed durable write cannot later be read/unlocked locally; the same transaction/reference claim is idempotent; and the same transaction ID cannot be claimed for a different petition reference.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-petition-runtime-store.mjs`  
Expected: FAIL because the class does not exist.

- [ ] **Step 3: Implement the class and replace server-local wrappers**

Instantiate once from the explicit Firestore mode, preserve existing key names and TTL, add the atomic payment claim, and map typed storage failures to HTTP 503 with sanitized code `runtime_store_unavailable` in petition, payment, unlock, free-access, PDF, and admin-session paths. Claim the provider transaction ID before marking paid or storing an unlock.

- [ ] **Step 4: Hash admin session storage keys**

Add `adminSessionStorageKey(token)` using SHA-256 and test that Firestore keys never contain the bearer token while validation still succeeds.

- [ ] **Step 5: Verify GREEN and ownership/unlock regressions**

Run: `node scripts/test-petition-runtime-store.mjs && npm run test:production-security && npm test`  
Expected: all pass and no correctness-critical `catch {}` memory fallback remains.

- [ ] **Step 6: Commit**

Run: `git commit -am "fix: fail closed on durable runtime state"` after staging new files.

### Task 8: Production readiness gate

**Files:**
- Create: `lib/readiness.mjs`, `scripts/test-readiness.mjs`
- Modify: `lib/firestoreRedisCompat.mjs`, `server.mjs`, `package.json`

**Interfaces:**
- Produces: `evaluateReadiness({ production, firestoreEnabled, firestoreReachable, geminiConfigured, paymentConfigured, webhookConfigured })` returning `{ ready, checks, missing }`; `FirestoreRedisCompat.healthCheck()` performs a non-mutating limited read.

- [ ] **Step 1: Write failing readiness tests**

Assert production fails for each missing secret/configuration independently, disabled or unreachable Firestore, and multiple simultaneous failures; local mode remains usable; responses expose labels/status only and never secret values or provider error text.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-readiness.mjs`  
Expected: FAIL because the module and Firestore check do not exist.

- [ ] **Step 3: Implement `/ready` and Firestore health check**

Keep `/health` as HTTP 200 liveness, add `/ready` returning 200 only when ready and 503 otherwise, bound the Firestore check with a short timeout, and include the Cloud Run revision in both responses.

- [ ] **Step 4: Verify GREEN**

Run: `node scripts/test-readiness.mjs && npm run test:production-security && npm test`  
Expected: all pass; a failing Firestore double yields 503 readiness.

- [ ] **Step 5: Commit**

Run: `git commit -am "feat: add production readiness gate"` after staging new files.

### Task 9: Dependency and static-quality upgrade

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify only for demonstrated compatibility: importing modules/tests.

**Interfaces:**
- Produces: clean install on Node 20+, zero unresolved production audit findings at the configured audit level, and unchanged public behavior.

- [ ] **Step 1: Record the pre-upgrade report**

Run: `npm audit --omit=dev && npm outdated`  
Expected baseline: the known nine moderate production findings and available compatible upgrades are recorded.

- [ ] **Step 2: Upgrade direct dependencies in compatible increments**

Upgrade Express within v4 first, Firebase Admin within v14, Firestore to the supported current major after compatibility checks, PDFKit, dotenv, and lockfile transitive fixes. Add pinned `c8` and `oxlint` development dependencies so release verification does not download unpinned tools. Do not move to Express v5 in this release.

- [ ] **Step 3: Verify after each dependency family**

Run after each increment: `npm ci --ignore-scripts && npm test && npm audit --omit=dev`  
Expected: no regression; final production audit reports zero known vulnerabilities at the configured level.

- [ ] **Step 4: Run static checks**

Run: `npx oxlint server.mjs lib scripts` and classify every warning as fixed or intentionally retained; no errors are accepted.

- [ ] **Step 5: Commit**

Run: `git commit -am "chore: upgrade PetitionDesk production dependencies"`.

### Task 10: Verified Cloud Build candidate pipeline

**Files:**
- Create: `scripts/test-deployment-contract.mjs`, `scripts/smoke-release.mjs`
- Modify: `cloudbuild.yaml`, `scripts/test-production-security.mjs`, `package.json`

**Interfaces:**
- Produces: `npm run test:deployment-contract`; smoke runner accepts `BASE_URL` and optional `EXPECTED_REVISION` and exits non-zero on contract failure.

- [ ] **Step 1: Write failing deployment-contract tests**

Require clean install/test/audit before build, immutable image identity, `gcloud run deploy --no-traffic`, candidate tag, no inline secret values, captured revision, candidate `/health` and `/ready` smoke, 16 active routing capabilities, and no automatic production traffic update.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-deployment-contract.mjs`  
Expected: FAIL because current Cloud Build deploys without `--no-traffic` and lacks verification/smoke steps.

- [ ] **Step 3: Implement the candidate pipeline and smoke runner**

Use a Node 20 verification step, fail on tests/audit, build and push once, deploy the exact image with zero traffic, resolve the tagged candidate URL/revision, and smoke only that candidate. Keep secrets in Cloud Run/Secret Manager rather than Cloud Build substitutions.

- [ ] **Step 4: Verify GREEN and validate YAML**

Run: `node scripts/test-deployment-contract.mjs && npm run test:production-security && npm test`  
Expected: all pass and the production traffic mutation exists nowhere in `cloudbuild.yaml`.

- [ ] **Step 5: Commit**

Run: `git commit -am "ci: stage and verify Cloud Run candidates"` after staging new scripts.

### Task 11: Guarded exact-revision promotion and rollback

**Files:**
- Create: `scripts/promote-cloud-run.sh`
- Modify: `scripts/test-deployment-contract.mjs`, `package.json`

**Interfaces:**
- Consumes: explicit `PROJECT_ID`, `REGION`, `SERVICE`, `CANDIDATE_REVISION`, and candidate URL.
- Produces: promotion that records the current serving revision, verifies the candidate, sends 100% traffic only to the exact candidate, verifies production, and restores prior traffic on failure.

- [ ] **Step 1: Extend the failing deployment test**

Assert the script rejects empty variables and non-existent/unready revisions, checks candidate revision identity, records the prior traffic target, uses `--to-revisions=<exact>=100`, and has an automatic rollback branch if post-promotion smoke fails.

- [ ] **Step 2: Verify RED**

Run: `node scripts/test-deployment-contract.mjs`  
Expected: FAIL because the promotion script does not exist.

- [ ] **Step 3: Implement the guarded script**

Use `set -euo pipefail`, explicit non-empty validation, read-only `gcloud run revisions/services describe` checks before mutation, the shared smoke runner, and a printed evidence summary containing previous revision, candidate revision, and final traffic.

- [ ] **Step 4: Verify GREEN without mutating cloud**

Run: `node scripts/test-deployment-contract.mjs && bash -n scripts/promote-cloud-run.sh`  
Expected: both pass; no live command is executed during the test.

- [ ] **Step 5: Commit**

Run: `git commit -am "ops: guard PetitionDesk revision promotion"` after staging the script.

### Task 12: Full verification, review, and release handoff

**Files:**
- Create: `docs/audits/2026-09-28-petitiondesk-release-audit.md`
- Modify: none unless verification exposes a regression, in which case return to the owning task with a failing test.

**Interfaces:**
- Produces: exact commit, reproducible reports, candidate commands, and no unsupported production-deployment claim.

- [ ] **Step 1: Run a clean full verification**

Run: `npm ci --ignore-scripts && npm test && npm audit --omit=dev && npx oxlint server.mjs lib scripts && docker build -t petitiondesk-release:verified .`  
Expected: all tests pass, audit is clean at the configured level, lint has no errors, and image builds.

- [ ] **Step 2: Re-measure coverage and compare baseline**

Run: `npx c8 --all --include='lib/**/*.mjs' npm test`  
Expected: no unexplained reduction from baseline 85.87% statements, 73.22% branches, 92% functions, and 85.87% lines; every new security-critical module has direct tests.

- [ ] **Step 3: Perform final branch review**

Review the complete diff against the approved spec, confirm all 16 sector fixtures and official-source report totals, scan for secrets/placeholders/silent catches, and verify `git diff --check` plus a clean tracked worktree.

- [ ] **Step 4: Write and commit the release audit**

Document source archive checksum, baseline and final test results, dependency findings, source-verification totals/corrections, commit IDs, residual limitations, and exact candidate/promotion/rollback commands. Commit with `docs: record PetitionDesk release audit`.

- [ ] **Step 5: Hand off the Cloud Shell candidate deployment**

Provide the exact commands generated from the verified commit. After the user supplies Cloud Run output, validate candidate revision, `/health`, `/ready`, and routing smoke evidence before authorizing the separate promotion command.
