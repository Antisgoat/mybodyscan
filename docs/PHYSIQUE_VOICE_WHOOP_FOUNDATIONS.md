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

The reusable UI presents relative development, strengths, and training priorities with a disclosure. The next integration step is to extend the existing four-photo scan analysis contract so it may return these optional scores using a stable conservative rubric, sanitize them server-side, persist them with the scan, render the component in the full Results report, and pass the weakest supported regions into workout-plan prioritization.

## Voice workout logging

The parser is deterministic and local. It handles common gym phrases without an additional model call, including:

- `bench press 225 for 8`
- `bench press 225 pounds for 8 reps`
- `squat 3 sets of 5 at 315 pounds`
- `deadlift 180 kg x 5`

It matches the spoken exercise to today's existing workout exercises instead of creating duplicate movements. The reusable logger requires a confirmation tap before saving. Unsupported or ambiguous speech fails closed and remains editable as text.

The next integration step is to mount the component in the existing workout-session card and call the existing `saveExerciseLog` / `logWorkoutExercise` path so voice and manual logs remain identical data.

## WHOOP

WHOOP stays gated until all server-side OAuth configuration exists. The foundation defines the standard OAuth authorization/token endpoints, minimum read-only recovery scopes, readiness checks, token-storage contract, and normalization for recovery score, resting heart rate, and HRV.

Required operator configuration before enabling:

- `WHOOP_CLIENT_ID`
- `WHOOP_CLIENT_SECRET`
- `WHOOP_REDIRECT_URI`
- a registered WHOOP developer app and matching redirect URI
- privacy review and production approval as required by WHOOP

Tokens must remain server-side. The app should request the least data necessary and should revoke access/delete provider tokens when a user disconnects the integration or deletes their MyBodyScan account.

## Explicitly out of scope for this branch

- Garmin
- creator marketplace
- social feed
- leaderboards
- Android release/build-number changes
- Google Play submission changes
- turning on Apple Health / Health Connect before native connector and privacy acceptance
