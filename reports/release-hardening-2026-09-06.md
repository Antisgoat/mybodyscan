# Release hardening — September 6, 2026

## Status

Not yet certified for public release. Firestore security rules were successfully deployed to project `mybodyscan-f3daf` in this session. Meal-photo UI/backend changes remain local and the paid analysis switch remains off by default. No paid model requests, purchases, billing changes, or store submissions were performed.

## Completed security improvements

- Replaced field-difference checks that only covered existing modified fields with checks covering added, removed, and modified fields. This closes bypasses around server-owned account fields, scan result updates, and onboarding validation.
- Explicitly protected unlimited-credit and privilege mirror fields from client writes.
- Required unexpired Pro entitlements for subscriber-only Firestore access; invalid expiry values fail closed.
- Added regression cases for fabricated scan results, removed scan status, injected billing/role/Pro/unlimited-credit fields, and expired/malformed subscriptions.
- Rules compilation and production rules-only deployment succeeded. Both source rule files remain synchronized.

Firebase's field-difference semantics: https://firebase.google.com/docs/reference/rules/rules.MapDiff

## Verification in this session

- 14 Firestore emulator security tests passed, including owner isolation and provider-token access denial already present in the suite.
- Local end-to-end scan verifier passed: successful mocked analysis, duplicate submission idempotency, failure refund, and account deletion.
- Production configuration, iOS release configuration, and Android release configuration checks passed.
- No paid provider was used to generate the scan verification output. These results do not validate real-world body composition accuracy.

## Paid feature boundary review

Code inspection found authoritative Pro gates on coaching, gym inventory analysis, fridge analysis/suggestions, transformation previews, and subscriber workout-generation endpoints. New meal-photo estimates require Pro and have a three-attempt rolling daily quota. This is a bounded code review, not a penetration-test certification or exhaustive cost audit. Scan purchases and reserved credits remain a separate access path. Other feature limits are not an aggregate monetary cap.

## Remaining release gates

1. Review and publish the pending app/backend changes, then produce matching native test builds. Do not label the old installed app as updated.
2. Approve a bounded live-provider test budget before testing paid recognition and measuring cost per feature. Keep new meal-photo processing off until then. Pricing needs aggregate usage, retry, infrastructure and store-fee modeling, not just a single successful request.
3. Exercise real-device sign-in (Apple/Google), camera permissions, barcode capture, purchases/restoration, background/resume behavior, and persistence against the deployed build.
4. Confirm store privacy declarations match body/meal/kitchen/gym photos, sensitive wellness data, third-party processing and retention. Verify the reviewer account and all review instructions without publishing credentials in repository documentation.
5. Obtain qualified review of terms, privacy, health claims, age eligibility and incident-response obligations. Disclaimers do not eliminate liability. Unsupported accuracy or outcome guarantees must not appear in product or marketing copy.

Official review requirements checked:
- Apple: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google user data: https://support.google.com/googleplay/android-developer/answer/10144311
- Google health declaration: https://support.google.com/googleplay/android-developer/answer/14738291

Store policy review is not legal advice or confirmation that either store will approve the app. Full legal sign-off, live billing validation, and physical-device verification remain outstanding.
