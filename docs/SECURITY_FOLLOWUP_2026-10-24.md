# Security follow-up — October 24, 2026

Baseline: `072b407`. This supplements, rather than replaces, the initial audit.

## Changes

- Scan sessions now require an available non-expired scan credit, or the existing
  trusted staff/unlimited authorization. Preflight does not spend credits; the
  existing submission transaction remains responsible for exactly-once debit.
- Server-authored upload authorization expires after one hour. Storage rules
  allow only the four canonical JPEG slots in an uploading session owned by the
  caller. Clients cannot create or extend the authorization through Firestore.
  Existing owner reads and deletes do not require an active upload lease.
- Session creation is capped at eight per rolling hour and 60 per UTC calendar
  month (120 for trusted unlimited/staff accounts). Failed and abandoned starts
  count toward abuse limits; these are not additional purchased-scan credits.
  Limits fail closed if their database cannot be reached.
- Multipart fallback is capped at 12 requests/hour, validates the scan identifier,
  and enforces credit/session checks before Admin SDK photo writes. Completed
  duplicate submissions remain idempotent, including after the last credit.
- Diagnostic Storage writes now require an admin or staff claim, as well as
  matching ownership and the existing small file-size limit.
- The Firebase Storage service agent was granted only the documented
  `roles/firebaserules.firestoreServiceAgent` cross-service lookup role. A
  read-only deployment preflight now rejects missing/unverifiable permissions;
  noninteractive Firebase deploy otherwise skips this critical check.
- Removed the unused Lighthouse CI wrapper, retained the maintained Lighthouse
  CLI (`npm run lighthouse -- <URL>`), and patched the development proxy's FTP
  parser through a scoped override. No customer functionality was removed.
- Added bounded, default-dry-run private-cache maintenance and a manual keyless
  workflow. It only updates cache metadata under private prefixes; generation
  and metageneration preconditions prevent overwriting concurrent changes. It
  does not read image contents, print object paths, rotate download tokens, or
  delete photos.

## Production metadata maintenance completed

Dry run: 30 objects inspected, all 30 needed cache updates. Apply: 30 updated,
zero conflicts, no truncation. Follow-up dry run: 30 inspected, zero remaining.
All use `private, no-store, max-age=0`. Already cached copies cannot be recalled,
and existing Firebase download URLs remain bearer capabilities.

An authentication diagnostic unexpectedly included local Firebase CLI credential
material in tool output. The CLI login was immediately revoked after maintenance.
No credential values were added to repository files. Customer Auth sessions and
the separate keyless GitHub deployment identity were not changed. Future local
CLI maintenance will require a fresh login; never use JSON account-list output
as a diagnostic because it includes tokens.

## Verification

- App: 429 tests passed across 138 files; TypeScript checks passed.
- Backend: 183 tests passed, including preflight/no-debit/expiry/limiter failure
  and metadata-only maintenance tests.
- Firestore/Storage emulators: 25 tests passed, including forged, missing,
  expired, completed and cross-user upload authorization denials.
- Complete mocked scan flow passed: no-credit rejection, real client SDK
  upload, multipart fallback, processing, deterministic plans, duplicate-submit
  idempotency, exactly-once debit/refund, and account deletion.
- Browser regression: 15 passed across desktop Chromium, Android-size Chromium,
  and iPhone WebKit. Production web bundle built successfully.
- Lint: zero errors, 1,428 existing warnings. Credential-pattern check passed.
- Production web and Functions dependency audits: zero known npm findings.
- All root dependencies including development tooling: zero high/critical, ten
  moderate findings remain in development-only Tailwind/PostCSS, telemetry,
  Firebase CLI and tagging dependency chains. Do not force obsolete tool
  downgrades or untested major parser/telemetry overrides merely to clear a scan.

## Limits and remaining work

This is not proof that the app is unhackable. Upload limits bound new sessions,
not all bandwidth from repeatedly overwriting authorized slots, all existing
storage, or coordinated multi-account abuse. Monitor Auth creation, Cloud
Storage traffic, budgets and backend error rates. Cross-service rules introduce
a small Firestore lookup cost per upload authorization evaluation.

App Check remains soft until browser and physical-device attestation have been
verified; no enforcement switch was made that could lock out members. Existing
TestFlight build 40 does not contain the client-side private-cache patch from
the previous audit. A new signed build and physical-device camera, purchase,
sign-in and scan acceptance checks remain necessary before store submission.
Live administrator MFA, broad IAM/branch-protection review, restore drills,
restrictive script CSP compatibility, historical bearer-URL delivery redesign,
and independent penetration testing remain separate launch/security work.
