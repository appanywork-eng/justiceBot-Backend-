# PetitionDesk complete release audit

Date: 29 September 2026  
Release branch: `petitiondesk-mother-update`  
Imported source commit: `2f2c47c`  
Imported archive SHA-256: `af2875db57f61d5da422adf44cbef743fc2d4cdf95d52a3238a735cb71bf6432`

## Release conclusion

The audited backend is a verified release candidate. It preserves the ₦550 price and two-free-petition allowance, keeps deterministic jurisdiction selection authoritative, covers every one of the 16 production sectors, fails closed for payment and runtime state, and prevents unverified candidates from receiving Cloud Run traffic.

This audit does **not** claim that production traffic has already been changed. The execution environment had neither Docker nor an authenticated `gcloud` CLI. Container construction, the zero-traffic candidate deployment, candidate smoke evidence, and the final promotion must therefore run through the checked-in Cloud Build and promotion controls below.

## Verified functional scope

| Control | Final evidence |
|---|---:|
| Active sectors | 16 |
| Institution/channel records | 169 |
| Official source references | 315 |
| Verified direct-contact records | 140 |
| Portal/physical/non-email records | 29 |
| Exposed unverified email records | 0 |
| All-sector routing fixtures | 55 |
| Explicit security authorities tested | 9 |
| Production dependency vulnerabilities | 0 |
| Static-analysis warnings/errors | 0 / 0 |

Every active sector has an active deterministic resolver: anti-corruption, aviation, banking, civil disputes, diaspora/consular, education, general administration, health, insurance, international escalation, judiciary, pensions, power, security/law enforcement, telecommunications, and urban planning.

The fixture matrix verifies initial complaints, evidenced escalations, missing-information blocks, cross-sector traps, the nine security authorities, one system-selected `TO`, approved oversight recipients, route-specific remedies, allegation-safe language, and emergency/non-petition blocking.

## Material corrections and upgrades

- Reverified the complete routing inventory against cited official sources. Corrected power-sector channels, including NELMCO and REA records, without inventing unavailable email addresses.
- Added strict bounded input parsing, a 256 KB JSON limit, normalized routing diagnostics, and shared/local request limits.
- Fixed demonstrated sector defects involving aviation safety wording, alleged diversion of public funds, judicial bribery/decision distinctions, and explicit-sector preservation.
- Added semantic rejection for incorrect `TO`, unauthorized `CC`, unrelated sector content, missing material facts, and wrong petition purpose.
- Required exact Flutterwave reference, successful status, NGN currency, minimum amount, and non-empty provider transaction ID. Provider transaction IDs are atomically claimed before paid state or unlock storage, preventing cross-reference replay.
- Removed production memory fallback for petitions, payment state, transaction IDs, unlocks, and admin sessions. Durable failures now return sanitized HTTP 503 responses instead of silently continuing.
- Hashed stored admin bearer-token keys with SHA-256.
- Added `/ready`; production readiness requires reachable Firestore plus configured Gemini, Flutterwave, and webhook controls. `/health` remains liveness-only.
- Upgraded the runtime to Node 22 and current compatible production dependencies while retaining Express 4. Production audit findings fell from nine moderate vulnerabilities to zero.
- Added an immutable-digest, zero-traffic Cloud Run candidate pipeline and an exact-revision promotion script with automatic rollback.

## Verification evidence

Final clean verification commands:

```bash
npm ci --ignore-scripts
npm test
npm audit --omit=dev
npx --no-install oxlint server.mjs lib scripts
```

Result: all commands exited successfully; the complete test matrix ended with `SUPPORT ALERT IDEMPOTENCY PASSED`; `npm audit` reported `found 0 vulnerabilities`; oxlint produced no findings.

Coverage command:

```bash
npx --no-install c8 --all --include='lib/**/*.mjs' --reporter=text-summary npm test
```

| Coverage | Baseline | Final |
|---|---:|---:|
| Statements | 85.87% | 86.36% |
| Branches | 73.22% | 75.70% |
| Functions | 92.00% | 93.49% |
| Lines | 85.87% | 86.36% |

The new payment assessor, durable runtime store, readiness policy, runtime configuration, routing request validation, deployment contract, and all-sector routing/petition contracts each have direct deterministic tests.

The HTTP smoke runner was also executed against a local server. It verified `/health`, `/ready`, revision identity, 16 total sectors, 16 active resolvers, and zero legacy fallback sectors. That run found and corrected a capabilities-array field mismatch before release.

## Commit trail

| Commit | Purpose |
|---|---|
| `2136944` | Enforce release source/container integrity |
| `df24b2f` | Validate bounded runtime configuration |
| `3edf3b0`, `ebeef9a` | Bound routing requests and preserve explicit sector handoff |
| `c4288a9` | Reverify all routing sources |
| `4eccc2d` | Enforce all-sector routing and petition contracts |
| `1a16952` | Require exact Flutterwave payment identity |
| `2c3067a` | Fail closed on durable runtime state |
| `48b320e` | Add production readiness gate |
| `15edffa` | Upgrade production dependencies and static quality |
| `f83d485` | Stage and verify zero-traffic Cloud Run candidates |
| `1856c5a` | Guard exact-revision promotion and rollback |
| `9cfceec` | Align release smoke with the live capabilities contract |

## Candidate deployment

Run from an authenticated Google Cloud Shell in this exact repository checkout:

```bash
export PROJECT_ID='YOUR_GOOGLE_CLOUD_PROJECT_ID'
gcloud config set project "$PROJECT_ID"
gcloud builds submit \
  --project="$PROJECT_ID" \
  --config=cloudbuild.yaml \
  .
```

Cloud Build will clean-install, test, audit, lint, build and push once, resolve the image digest, deploy a tagged candidate with `--no-traffic`, capture its exact revision and URL, and run the release smoke. It contains no production traffic command.

After the build succeeds, capture the candidate evidence:

```bash
export REGION='europe-west1'
export SERVICE='petitiondesk-backend'

export CANDIDATE_REVISION="$(
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format='value(status.latestCreatedRevisionName)'
)"

export CANDIDATE_URL="$(
  gcloud run services describe "$SERVICE" \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --format="value(status.traffic[?revisionName='${CANDIDATE_REVISION}'].url)"
)"

BASE_URL="$CANDIDATE_URL" \
EXPECTED_REVISION="$CANDIDATE_REVISION" \
  node scripts/smoke-release.mjs
```

## Exact promotion and rollback

Only after the candidate smoke passes:

```bash
PROJECT_ID="$PROJECT_ID" \
REGION="$REGION" \
SERVICE="$SERVICE" \
CANDIDATE_REVISION="$CANDIDATE_REVISION" \
CANDIDATE_URL="$CANDIDATE_URL" \
  npm run deploy:promote
```

The script refuses missing inputs or an unready revision, re-smokes the exact candidate, records the previous 100%-serving revision, promotes only `${CANDIDATE_REVISION}=100`, and verifies the production URL. If that verification fails, it automatically restores `${PREVIOUS_REVISION}=100`.

## Residual operational limitations

- The local executor could not build the container because no Docker-compatible engine was installed. Dockerfile structure and the runtime allowlist passed deterministic integrity checks; the real image build remains a mandatory Cloud Build step.
- The local executor could not create or promote a Cloud Run revision because `gcloud` and cloud credentials were unavailable. No unsupported deployment claim is made.
- Official contact evidence is point-in-time. The deterministic inventory should be rerun whenever an institution changes its complaint channel, and direct delivery must remain gated if official verification becomes unavailable.
- PetitionDesk drafts complaints and routing guidance; it does not replace emergency services, a court appeal, or professional legal advice.
