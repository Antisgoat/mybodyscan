# Launch quality review — November 2, 2026

## Product judgment

The highest-value next change is reducing incorrect meal-photo logs, not adding
another AI feature or making the illustrative body model sound diagnostic.
Keep the current scan, diary, gym inventory, fridge recipes, workouts, and coach
architecture. Keep physical-device acceptance as a release gate.

## Meal review improvement

- Show the selected downsampled meal image for visual comparison. Keep the
  preview only in screen memory, not browser storage or the food diary.
- Validate the response on the client as well as the server. Malformed values,
  identity fields, impossible macro/mass totals, or incomplete responses cannot
  open a broken review or create a diary entry.
- Require explicit confirmation that food identity, portions, oils, and sauces
  were reviewed. Editing food details or the eaten portion resets confirmation.
- Explain that renaming a wrong identification does not correct its nutrition;
  route members to source-backed food search or a clearer photo.
- Replace the model's apparently precise confidence percentage with conservative
  review language. Call out ambiguous estimates without claiming calibration.
- Support quarter, half, three-quarter, whole, one-and-a-half, and double portions.
  Scale edited full-photo macros locally, show all four portion totals together,
  and log only that portion. No additional AI call is made when the portion changes.
- Preserve existing paid access, consent, daily analysis quota, save locks,
  stable diary ID, midnight-safe retry date, and search fallback.

## Launch boundaries

The 3D viewer is optional and remains a metric-based illustration, not a unique
photo-derived mesh. Unsupported health connectors remain disabled; they are not
advertised as working imports. No DEXA-equivalence or perfect-accuracy claim is
supported. Security findings are time-bound and testing is not a guarantee that
all attacks or device-specific bugs are impossible. No Firebase permissions,
API-key restrictions, subscriptions, AI models, or paid services are changed.

Build 49 is reserved for these improvements. Full tests, browser checks, CI,
production deployment, and TestFlight assignment are required before handoff.
Public App Store submission still requires the owner's physical-iPhone acceptance.
