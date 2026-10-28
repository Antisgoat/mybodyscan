# MyBodyScan launch gate — October 28, 2026

## Decision

Not yet cleared for final App Store submission. Automated checks are strong,
but they are not proof of perfect outputs, medical accuracy, or security.
Do not start paid acquisition based on a claim that every workflow is verified.

## Confirmed release gaps

- App Store Connect displays an updated Developer Program License Agreement
  requiring Account Holder review and acceptance. The agent must not accept it.
- The iOS 1.0 draft is Ready for Review but still references build 38.
- Build 41 was previously enabled for Internal QA. PR #845 is not in that build.
- The production website reports e7854e3 at the start of this review.
- Re-run native camera/library, Apple/Google sign-in, purchase/restore, and
  scan-to-plan tests on the exact release candidate before final submission.
- App Check remains soft pending real-device attestation verification; browser
  API-key restrictions remain unchanged at the founder's explicit request.

## Dependency security remediation

Fresh npm audits found GHSA-6pq8-jhm2-2vcw affecting qs <=6.16.0.
Patched the existing root and Functions overrides to 6.16.1 and refreshed only
the affected lockfile entries. Both complete dependency audits now return zero
known vulnerabilities. Added regression tests for hostile comma-array
serialization and ordinary form/query compatibility in both dependency trees.
This does not establish that the application has no undiscovered vulnerabilities.

Source: https://github.com/advisories/GHSA-6pq8-jhm2-2vcw

## Verification performed

- 445 app/toolchain tests passed before the qs update; six targeted qs regression
  tests passed after the update.
- 185 backend tests passed after the patch. An initial sandbox-only run failed
  four socket-listening tests with EPERM; rerunning with local-network permission
  passed all tests without changes to their assertions.
- 15 browser tests passed across desktop Chromium, Android-sized Chromium, and
  iPhone WebKit. These test boot, demo, layouts, and guards, not native hardware.
- 25 Firestore/Storage rule emulator tests passed.
- Mocked end-to-end scan verification passed upload, analysis, duplicate-submit
  idempotency, credit debit/refund, and disposable-account deletion.
- TypeScript and iOS release configuration/RevenueCat guards passed.
- Tracked-file secret-pattern scan passed without printing credential values.
- Live health/systemHealth endpoints report configured scan, coach, nutrition,
  workout, and authentication services. Configuration health is not a completed
  paid AI transaction or purchase test.

## Model routing

Source defaults are current models listed in the official OpenAI catalog:
https://developers.openai.com/api/docs/models

- Body scan: gpt-6-astra.
- Gym/fridge recognition, meal ideas/photo, workout planning/adjustment,
  complex coach messages: gpt-6.1-sol.
- Routine coach messages: gpt-6-luna.
- Difficult meal-photo escalation: gpt-6-astra.
- Transformation illustration: gpt-image-2.5-sunburst.

Environment overrides can change these routes. The public health endpoint's
general engineModel is gpt-6.1-sol; body analysis explicitly selects its separate
bodyScan feature route. Do not infer the actual model of every production call
from this general health field. Validate provider usage evidence for exact calls.
No model migration was necessary based on the official catalog today.

## Five-year product direction, not last-minute launch scope

1. Launch: dependable capture, editable food/equipment recognition, clear
   uncertainty, accessible UI, transparent subscriptions, bounded provider costs.
2. Validate: opt-in comparison studies against reference measurements, quality
   checks across devices/body types/lighting, documented error distributions,
   and improvements that demonstrably outperform the existing baseline.
3. Personalize: adherence and recovery-aware adjustments, verified equipment
   inventories, nutrition trends, and explanations users can correct/control.
4. Scale: independent security reviews, restore drills, monitoring and measured
   cost/latency/retention targets. No promise of being unhackable or DEXA-equivalent.

Every future feature should improve a measured user outcome, not simply increase
the feature count or AI spending.
