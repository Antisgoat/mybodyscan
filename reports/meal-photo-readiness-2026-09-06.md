# Member meal-photo estimates

Implemented locally, not deployed or enabled in production.

## Flow

Food diary → Estimate a meal from a photo → explicit OpenAI processing permission → camera/library → editable meal name and total macros → explicit confirmation → existing authenticated diary endpoint. Calories are derived from the reviewed macros. A stable entry ID and date allow safe save retries. The photo is not persisted by this feature; only the confirmed diary record is saved. Provider retention is not represented as zero.

## Cost and access controls

- Backend requires authentication and authoritative Pro entitlement before analysis.
- Demo and nonmember client actions are disabled and guarded in handlers.
- Backend defaults OFF: `MEAL_PHOTO_ENABLED` must equal `true` to enable. Do not enable until a bounded live test and cost approval.
- Transactional quota: 3 attempts per rolling 24 hours; failures count because upstream work may have been billed.
- One compressed JPEG, at most 700,000 data-URL characters, low-detail image and 700 output-token request limit. Shared provider retries/fallbacks can produce multiple upstream attempts; this is not a dollar spending cap.
- Shared provider request/usage accounting applies. No paid calls or billing changes were made for this work.
- No guarantee of margin: all other feature usage, provider retries, Firebase, store fees and support costs must be included in the final allowance/pricing decision.

## Verification

- Frontend typecheck and backend build passed on Node 22.
- Frontend: 127 test files, 386 tests passed.
- Backend suite passed, including 3 new offline meal-photo validation/access/quota tests.
- 3 browser layout checks passed: desktop Chrome, Pixel 7 Chrome and iPhone WebKit. New photo route included, demo actions disabled; iPhone screenshot visually inspected.
- 4 new component tests cover demo/nonmember denial, consent, edited totals, no automatic logging, and stable save retries.

## Before enabling or claiming release readiness

1. Review/merge/deploy the code and include the callable in deployment; production is unchanged by local testing.
2. Approve a small, explicit API test budget and verify real meal recognition, refusal, provider billing, membership expiry and quota exhaustion against deployed infrastructure. Current tests mock analysis, not recognition quality.
3. Validate physical iPhone/Android camera permission, image selection, purchases/restoration and diary persistence.
4. Review privacy/store declarations and obtain qualified legal review. Disclosures cannot guarantee immunity from lawsuits, and tests cannot establish that an app is unhackable.
5. Audit the full paid-feature surface and determine aggregate account/project budget limits; this new feature's quota is not a cap for all existing features.

Official API image-input guidance reviewed: https://developers.openai.com/api/docs/guides/images-vision
