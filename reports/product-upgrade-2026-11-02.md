# Measured kitchen recipes and release hardening — November 2, 2026

## Product decision

Close the fridge-idea-to-food-diary gap before adding unrelated features. Keep
quick AI meal ideas, but give members an optional measured recipe workflow:

1. Open **Calculate portions & macros** on a fridge meal idea.
2. Match every required ingredient to a food record, explicitly choose the
   appropriate raw/cooked state, and enter amounts for the entire recipe.
3. Include optional oils/sauces or explicitly mark them not used. Add other
   ingredients when needed. Unreviewed ingredients keep totals labeled subtotal.
4. Divide by a whole-number serving count. Optionally compare per-serving
   calories/protein with a member-entered meal budget. Changing portions uses
   local arithmetic, not another AI generation.
5. Check labels, amounts, and allergens, then save privately to the existing
   recipe library. Nothing is automatically added to the diary.

The feature does **not** infer gram weights from a photo, certify nutrition or
allergens, or prescribe a dietary target. Food database values are estimates;
users must match the actual ingredients and preparation. No new AI model,
subscription tier, dependency service, photo retention, or security permission
is introduced. Ordinary food-database/Firebase usage still applies.

## Correctness and recovery

- Shared recipe arithmetic rejects missing/non-finite nutrients, unsupported
  serving conversions, invalid quantities, and fractional/invalid serving counts.
- Existing Food Builder ingredient summaries now scale to entered quantities.
- Search is on demand, limited to eight visible matches, has a 20-second UI
  deadline, and ignores stale responses. Existing raw/cooked filters are reused.
- Recipe saves require ingredient coverage and explicit review. A stable recipe
  ID and an immediate in-flight lock prevent duplicate records on retry/clicks.
- Save errors preserve portions for retry. UI supports older iOS WebViews without
  randomUUID and uses a scrollable, keyboard-accessible dialog.
- Existing owner/Pro Firestore rules protect saved recipes. No rules were weakened.

## New dependency advisories

Fresh audits found new advisories after the October release checks. Patched
versions are pinned: follow-redirects 1.16.2, Joi 17.13.9, glob 14.0.3, and
minimatch 11.0.4. Root and Functions lockfiles were regenerated. The matching
engine is upstream code; a small, version-checked postinstall adapter preserves
legacy CommonJS callability for older ESLint/Firebase consumers. ESM is unchanged.
The adapter is reproducible after npm ci and explicitly regression-tested.
Audit findings are not suppressed. Remove the adapter when parent tools support
the modern export directly; review it when changing the pinned minimatch version.

Primary advisory references:
- https://github.com/advisories/GHSA-mrwp-f3q8-3g9p
- https://github.com/advisories/GHSA-4528-x5fx-h6hg
- https://github.com/advisories/GHSA-3g3m-2fjr-6pw4
- https://github.com/advisories/GHSA-g3hv-75wg-m249

## Local verification

- Clean root npm ci completed, including the compatibility adapter.
- 507 app/tooling tests passed, including 22 new recipe cases and 3 matching cases.
- 185 backend tests passed after the transitive library updates.
- TypeScript and production web build passed. Lint has zero errors; pre-existing
  warning debt remains (1,425 warnings repository-wide).
- Root, Functions, and security-rule dependency audits reported zero known findings.
- Release CI, deployed browser checks, and physical-device acceptance remain
  separate gates. Do not equate these checks with no possible bugs or attacks.

## Remaining launch decisions

The parametric body visualization is still illustrative, not a unique
photo-derived mesh. No DEXA-equivalence or exact future-body claim is justified.
Keep the adult-only scope. Device camera, social sign-in, and purchase/restore
acceptance are still needed before final App Store submission. No store review
submission or purchases are authorized by this implementation record.
