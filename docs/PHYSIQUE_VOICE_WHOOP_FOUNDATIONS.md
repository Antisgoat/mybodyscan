# Physique, Voice Logging, and WHOOP Foundations

This branch intentionally isolates the next fitness-product improvements from the current Android/Google Play release path.

## Product principles

- Keep the UI simple and consistent with the existing MyBodyScan design.
- Extend existing scan, workout, and health systems rather than creating parallel data models.
- Do not copy competitor terminology, score presentation, proprietary copy, or branded methodology.
- Treat all photo-derived development scores as wellness/progress estimates, never medical or strength measurements.
- Never display a provider as connected until authorization succeeds.

## Physique development scores

First-party regions: chest, back, shoulders, arms, core, legs.

The shared client/server helpers accept explicit numeric 0–100 development scores only. They do not convert qualitative observations into numbers. Sparse scores may be shown by region, but an overall score requires at least four valid regions.

The production scan contract now requests these optional scores using a stable conservative rubric, sanitizes them server-side, persists them with the scan, and renders them in the full Results report. A balanced scan with at least four supported regions may add modest training volume to the two lowest-scoring areas; sparse scores never adapt the plan.

## Voice workout logging

The parser is deterministic and local. It handles common gym phrases without an additional model call, including:

- `bench press 225 for 8`
- `bench press 225 pounds for 8 reps`
- `squat 3 sets of 5 at 315 pounds`
- `deadlift 180 kg x 5`

It matches the spoken exercise to today's existing workout exercises instead of creating duplicate movements. The reusable logger requires a confirmation tap before saving. Unsupported or ambiguous speech fails closed and remains editable as text.

The logger is mounted in the existing workout session and saves through the same `saveExerciseLog` / `logWorkoutExercise` path as manual entries. Multi-set phrases are stored in the existing completed-reps field as `sets×reps`, preserving one workout log model.

## WHOOP (deferred from the initial production release)

The WHOOP foundation is retained for a later provider-approved release, but its routes, UI, Firebase secret bindings, and callback exception are not deployed in the initial production release. The implementation uses the standard authorization-code flow with one-time expiring CSRF state, server-only access and refresh tokens, refresh handling, recovery sync, provider revocation, and account-deletion cleanup.

Required operator configuration before enabling in a future release:

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- a registered WHOOP developer app with the exact redirect URI `https://mybodyscanapp.com/api/health/whoop/callback`
- privacy review and production approval as required by WHOOP

Tokens remain in a server-owned Firestore path denied by client rules. MyBodyScan requests read-only recovery, sleep, cycle, and workout scopes plus `offline` refresh access. Disconnect calls WHOOP's v2 revocation endpoint before deleting the local token record.

## Explicitly out of scope for this branch

- Garmin
- creator marketplace
- social feed
- leaderboards
- Android release/build-number changes
- Google Play submission changes
- turning on Apple Health / Health Connect before native connector and privacy acceptance
