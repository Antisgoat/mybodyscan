# Release verification — 2026-09-05

## Status

Local improvements are tested. This is **not** a production or store-submission sign-off. No paid provider calls, purchases, billing changes, deployments, or store submissions were performed during this verification.

## Changes

- Fixed EXIF double rotation in both scan photo preprocessing paths. The supplied iPhone JPEGs previously became sideways with clipped/black regions despite valid dimensions.
- Added repeatable synthetic-image browser regression tests covering all eight EXIF orientations, decoded pixels, aspect ratios, and output metadata across Chromium and iPhone WebKit, including bitmap and HTML-image fallbacks. Personal photos are not committed.
- Refined dashboard typography, spacing, contrast, metric presentation, and direct gym/fridge entry points. Body fat now includes a percent sign and an estimate label. No features removed.
- Fixed provider token field normalization so coaching can read the provider's prompt/completion counts correctly. Preserve unknown values rather than reporting them as zero.
- Added privacy-conscious request/usage events for both model-request boundaries (chat completions and transformation image edits). Logs contain request IDs, model, status, and numeric usage—not prompts, photos, responses, or credentials. Each chat attempt has its own correlation ID, including retries.

## Evidence

| Check | Result |
| --- | --- |
| Frontend unit suite | 126 files / 382 tests passed |
| Backend suite | 122 tests passed; local server permissions required for three routing checks |
| Browser smoke/layout suite | 15 passed across desktop, Pixel-sized Chromium, iPhone WebKit |
| Final dashboard/layout rerun | 3 passed after estimate-label update |
| EXIF pixel regression | 6 tests passed, each covering 8 orientations |
| Real supplied photo preprocessing | 12 combinations passed; representative output images visually inspected |
| Scan emulators | Success, provider failure, refund, duplicate-submit idempotency, account deletion passed |
| Production runtime scan emulators | Repeated on installed Node 22; passed |
| Frontend/backend TypeScript | Passed |
| iOS / Android release config | Passed |
| Native Firebase / Android toolchain diagnostics | Passed |
| Production config diagnostics | Passed |

Browser emulation is not a physical-device test. Local demo data and simulated provider responses do not establish live service availability. Build warnings remain about circular/dynamic chunk boundaries; builds and tested routes complete successfully.

## API accounting interpretation

OpenAI's documented completion usage uses `prompt_tokens`, `completion_tokens`, and `total_tokens`. The existing coach expected camelCase without converting the response. The new normalizer corrects this and retains cached-input and image/text input counts when present. Reference: https://developers.openai.com/api/reference/resources/chat

Use `provider_request_started`, `provider_request_result`, and `provider_usage` events together. Count each attempt once; do not sum the same event twice. A started request without usage (timeout, network failure, malformed response, or absent provider fields) has **unknown cost**, not proven zero. Image retries must likewise be reconciled by request ID. Compare these events against provider billing before making profitability claims. Logging is not a hard spending cap, invoice, retrospective backfill, or guarantee that every provider reports usage.

Regular nutrition lookup uses USDA/Open Food Facts rather than model generation. Gym photos, fridge analysis/meal ideas, coaching, and body analysis use the shared chat boundary. Transformation preview uses the image-edit boundary. Firebase hosting/storage/functions, RevenueCat, Stripe, and store commissions are separate cost categories and have not been measured by these local tests.

## Remaining release gates

1. Deploy these tested changes and build new iOS/Android testing artifacts. Current installed builds do not contain the local fixes.
2. Verify live model access and provider billing capacity without purchasing credits automatically. The user's no-spending instruction prevents paid end-to-end requests in this run.
3. Verify real scan → report → workout/nutrition plan, coach adaptation, gym/fridge responses, and transformation preview against the deployed services. Do not substitute simulated responses as evidence.
4. Test Apple/Google sign-in, camera permissions and barcode capture, subscription purchase/restore through store sandboxes, and any enabled health integrations on native devices.
5. Confirm the intended personal test-account login. Firebase cannot reveal passwords. The reviewer account previously signed in successfully, but is not proof that the user's own profile was tested.
6. Confirm current personal profile inputs and complete photo framing before presenting a personal diet plan. Supplied originals have enough resolution but omit lower legs/feet.
7. Recheck store-console metadata, reviewer access, agreements, required declarations and selected release builds after uploading. No claim is made here that store review is approved or that all account requirements are complete.

WHOOP remains deferred by user choice. A monthly profitability guarantee is not supported: measured production usage, provider invoices, and an agreed spending-control policy are still needed.
