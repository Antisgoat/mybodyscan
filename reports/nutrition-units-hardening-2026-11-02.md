# Nutrition portion audit — November 2, 2026

## Focused corrections

- Parse ASCII, Unicode, and mixed household fractions before decimal numbers.
  Invalid fractions do not unlock household units.
- Support grams/kilograms and ounces/pounds with exact mass conversion factors.
  Support milliliters/liters only against a labeled volume serving; never assume
  that a milliliter weighs a gram.
- Keep explicit source serving nutrition authoritative for that serving instead
  of recalculating it from rounded per-100g values.
- Persist validated source portion weights in food snapshots and restore them
  when reopening diary entries. Legacy entries without known serving weights
  retain serving nutrition but do not invent a 100g portion.
- Preserve missing nutrients as unknown. The food portion editor refuses
  incomplete records and explains how to select another record or enter a label.
  Manual calories-only quick add remains supported.
- Reject malformed diary names, IDs, notes, non-numeric, negative, non-finite,
  and unreasonably large nutrition values before database arithmetic.
  Ignore invalid historical values when summing; do not rewrite old entries.
- Limit retained source serving metadata to 30 bounded records. Authentication,
  Pro entitlement checks, owner access rules, and API-key restrictions are unchanged.

## Verification and boundaries

Focused regression coverage includes fractional cups, metric/imperial equivalence,
liquid volume without density, saved snapshot round trips, legacy serving-only
entries, labeled egg energy, missing nutrients, and malformed backend writes.
Full suite and release checks are required before publication; record final
results in the release PR. Build 48 is reserved for this change set.

Food database values and photo estimates are not guarantees of exact nutrition.
Raw/cooked state, lean percentage, skin, added oils, actual portions, and package
labels remain important. No AI model, paid service, or cloud permission is added.
Dependency and credential scans do not prove the absence of every vulnerability.
Final physical-device camera, social sign-in, purchase/restore, and scan acceptance
are still required before submitting the app for public App Store review.
