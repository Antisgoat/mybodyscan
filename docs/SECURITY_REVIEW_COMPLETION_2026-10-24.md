# Remaining security reviews — October 24, 2026

Baseline: `1b6067b`. This is an incremental remediation and verification record,
not a certification, independent penetration test, or guarantee of zero risk.

## Review inventory

Inventoried all 88 open pull requests and their 84 unresolved review threads.
Many threads describe historical, unmerged implementations; they are not proof
that the current production branch has the reported behavior. No stale branch
was blindly merged, no historical thread was marked resolved without proof,
and no major Stripe/TypeScript/dependency upgrade was accepted merely because
its version was newer.

The active security/release findings were checked against current source:

| Review area                                                                              | Current disposition/evidence                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mock authentication and caller-host SSRF in the API gateway (#711)                       | Current gateway has no mock-UID authentication flag; destinations come from `legacyFunctionUrl`, not request host/protocol. Real HTTP gateway tests remain in `functions/test/apiRoutes.test.js`.                                                                                                                                           |
| Non-JSON successful responses (#711)                                                     | The shared `apiFetchJson` still accepted HTML/malformed JSON as success. Fixed to fail explicitly; three new regression tests. The gateway's own invalid-JSON handling was already present.                                                                                                                                                 |
| Legacy checkout authentication, redirects and subscription metadata (#69–71, #194, #332) | Current legacy endpoint already authenticates. Removed caller-controlled return origins, added an HTTPS first-party origin policy, rate limiting, integer quantity limits, and subscription UID metadata. Active webhook uses customer UID lookup, signature validation and idempotent ledger entries. No real checkout or charge was made. |
| Scan status/response/upload paths (#168–169, #535)                                       | Old `functions/src/scan.ts` is empty; the current four-pose pipeline and existing debit/refund behavior pass the mocked end-to-end verifier. Deleted `uploadScanPhotoHttp.ts`/`src/lib/scan.ts` findings do not describe current entrypoints.                                                                                               |
| Native network plugin/persistence findings (#684, #691)                                  | Current network module uses bounded browser reachability polling, not the obsolete Capacitor Network promise. Native Auth now uses the canonical persisted Firebase JS session plus native OAuth/App Check bridges; bundle isolation guards pass.                                                                                           |
| Unverified signed release check (#676)                                                   | Release build script now verifies signing by default. Unsigned compilation requires explicit `MBS_IOS_COMPILE_ONLY=1` and is clearly labeled. Build number advanced to 41 for the security client changes.                                                                                                                                  |
| Removed Firebase modules/preview workflows                                               | Their old review comments cannot be applied to current files. Current CI uses keyless production credentials only after local-style checks; credential checks and rules tests are required.                                                                                                                                                 |

This inventory does not claim every historical review comment was independently
reproduced on its old branch. Historical branch cleanup remains separate work.

## Additional privacy fixes

- Sign-out no longer suppresses Firebase logout failure or navigates as if the
  session ended. UI failures request a retry instead of claiming success.
- Private photo-URL, application-memory and query caches clear before publishing
  a new account identity. Same-account token refreshes do not clear useful data.
- Member screen trees remount on identity changes, removing old local React
  state as well as shared caches.
- In-flight old-session photo URL requests cannot return or re-populate private
  URLs after cache reset, even if they resolve or fail later.
- Existing external Firebase download URLs remain bearer capabilities. Cache
  cleanup is not token revocation and does not recall copies already shared.

## Dependency remediation

The complete root npm tree now reports **zero known advisories**, including
development tools, after scoped fixes to PostCSS selector parsing (7.1.7), the
UUID dependency used by Google HTTP tooling, and the OpenTelemetry core API
used by Firebase's Pub/Sub emulator. The latter was scoped and tested against
the existing tracing interface rather than forcing a major Firebase SDK change.
The default production web CSS output remained byte-for-byte identical to the
previous build. CI now rejects moderate-or-higher development advisories too.

New tests cover Tailwind/Radix selector round-tripping, Pub/Sub topic creation
objects, W3C trace propagation and CommonJS UUID compatibility. No production
Cloud Pub/Sub messages or paid AI calls were made.

## Verified locally

- 442 app/toolchain tests; 185 backend tests.
- TypeScript checks and native release web bundle passed.
- Existing 15 desktop/Android-size/iPhone-WebKit browser tests passed.
- Full mocked scan pipeline passed, including SDK upload, exactly-once credits,
  refunds, duplicate submissions and account deletion.
- Lint: zero errors, 1,428 pre-existing warnings.
- Native Auth/App Check isolation and iOS release configuration guards passed.

These automated/browser checks do not replace a physical iPhone acceptance run.

## Live controls / remaining approval

GitHub secret scanning, push protection, Dependabot security updates and strict
main-branch CI protection were already enabled in the preceding pass.

Cloud console inspection confirmed Android/iOS keys have API allowlists, while
the two browser keys are unrestricted. A 17-service Firebase-related allowlist
was prepared for the newer browser key but **not saved**: safety review blocked
the production credential-control change pending explicit approval and a
compatibility/rollback check. No key was rotated, deleted, or exposed in this
review. The three GitHub client-key alerts remain open for that restriction
review; Firebase client keys are public project identifiers, not Admin SDK keys.

App Check remains soft pending browser and physical-device attestation
verification. Operational MFA, broader live IAM, backup restore drills,
strict web script-CSP rollout, bearer-URL delivery redesign and an independent
penetration test remain separate controls. This report must not be used to claim
that the website or native app is unhackable or fully audited in every respect.
