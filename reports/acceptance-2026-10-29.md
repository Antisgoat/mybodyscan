# MyBodyScan acceptance checks — October 29, 2026

## Scope and evidence

- Production website `4e558bd` verified via `/build.txt`; production deployment run `40944505810` and main CI `40944505859` succeeded.
- Baseline app suite: 149 files / 479 tests passed. Backend: 185 tests passed. Backend initially hit local server permission restrictions; rerunning with local-server access passed all 185.
- TypeScript passed. Scoped lint: zero errors; existing explicit-any warnings remain.
- Root and Functions dependency audits: zero known vulnerabilities at check time. Secret-pattern scanner passed across 1,247 tracked files. These checks are not proof of zero security risk.
- Four acceptance tests against production passed: Firebase initialization, App Check initialization, read-only demo, and member food/search/photo/fridge page layout.
- Production `/health` and `/systemHealth` checks succeeded.
- Deployment also passed Firestore/Storage emulator rules and scan/credit/refund/account-deletion pipeline checks. No live account was deleted.

## Live signed-in checks

The available browser session belongs to the dedicated store-review account, not the founder's developer test account. The approved synthetic review profile uses age 30 and 200 lb from its existing scan. The founder confirmed their own age is 36; their personal profile was not changed.

- Meal photo: one public sample showing eight peeled boiled eggs was recognized as eight peeled hard-boiled eggs without a text hint. The review UI exposed editable assumptions. No diary entry was saved. Estimated weight/calories were not validated against weighed ground truth.
- Transformation: one explicitly consented request from the existing completed adult scan reached Ready and displayed the private generated image. Duplicate creation was blocked while processing. No repeated generation or credit purchase was performed. This is an illustration, not a forecast or medical measurement.
- Workout controls accepted three and seven days, changed the recommended structure, exposed daily low-intensity cardio and an ideal start date, and produced a seven-day preview including active recovery. The preview was not activated.
- Earlier live checks on October 28 covered fridge recognition and three recipes, gym equipment recognition with uncertain items unselected, coach refusal of off-topic coding, and food leanness/raw/cooked search distinctions.

## Issue found and corrected during this pass

Manual dumbbell/bodyweight selections could include bench, hanging-bar, or back-extension exercises because only saved detailed gym inventories received strict auxiliary-equipment checks. Minimal manual choices now resolve to a conservative inventory used by generation, swap options, and start-plan validation. Explicit full-gym choices and saved confirmed inventories remain unchanged. Regression coverage exercises eight generator variants with a seven-day schedule.

## Remaining release gates

- Physical iPhone acceptance: camera and library flows, video capture, actual Apple/Google sign-in, interruption/resume, purchase/restore, and a fresh full scan-to-plan flow. Browser smoke tests do not establish these work on every phone.
- Apple browser session expired during this pass. Verify the newest processed binary, Internal QA assignment, and matching App Store draft after the owner signs in. Upload success alone does not prove TestFlight availability.
- Fridge recipe ideas do not yet have independently verified per-serving macro totals. Do not market them as exact macro-fit recipes.
- Body metrics and the parametric 3D visualization are estimates/illustrations, not a DEXA replacement or a photo-derived unique mesh.
- App Check remains in soft mode pending real-device attestation. The owner requested that the existing Firebase browser API key remain unchanged.
- Final App Store submission remains pending owner acceptance. No final review submission was made.
