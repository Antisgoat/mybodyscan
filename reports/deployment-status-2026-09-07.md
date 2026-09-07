# Deployment status — September 7, 2026

## Released

- PR #812 merged to main at `1a76d14c675639e45debbd4130159a2e85beee91`.
- GitHub verification run `34167015013` passed; production deployment run `34167327939` succeeded (Firebase functions, rules, storage, hosting).
- Android version 1.0, version code 6 built from that main revision with the version-code increment. Release build, Android lint, and configured unit-test tasks completed successfully; this is not a physical-device test.
- Bundle: `android/app/build/outputs/bundle/release/app-release.aab`.
- SHA-256: `90a21c63ae8354cf6f972e25af09a9edb45bd1eb0f59c0609976ba93c310f80e`.
- Google Play internal release `1.0 Internal Test 6` published September 7. Console explicitly reports **Available to internal testers**. This is not a public production release.
- Google warned about a missing deobfuscation file; this build has `minifyEnabled false`. No blocking release errors were shown.

## Still outstanding

- Apple requires the Account Holder to review and accept its updated Developer Program License Agreement. No agreement was accepted by the agent, and no new iOS build was uploaded during this pass.
- Google public-launch setup is incomplete: content rating, target audience, data safety, health declaration, category/contact information, and store listing require completion and verification.
- Member meal-photo analysis remains disabled pending live validation and cost verification. Deployment does not establish that provider calls work or that unit economics are acceptable.
- Physical-device acceptance testing (including camera/barcode, sign-in, scan-to-plan, and purchase/restore behavior) is still required before claiming submission readiness.
- No purchases or billing-setting changes were made. Actual cloud/API charges have not been reconciled in this report.

## Source control

The Android version-code increment is maintained separately from the already-deployed web/backend revision to avoid an unnecessary repeat deployment.
