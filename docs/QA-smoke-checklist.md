# QA Smoke Checklist

Use this lightweight checklist to validate a deploy quickly. Check items relevant to your feature; leave N/A as-is.

## Auth
- [ ] Google sign-in succeeds and returns to app
- [ ] Apple sign-in succeeds (if `VITE_APPLE_ENABLED=true`)

## Core flows
- [ ] Scan (mock provider) flow works end-to-end
- [ ] History page loads (items render or empty-state visible)
- [ ] Plans page renders; coach plan content visible
- [ ] Coach tracker renders; totals are correct (4/4/9)

## Deep links and routing
- [ ] Direct navigation works (no 404):
  - [ ] `/`
  - [ ] `/scan`
  - [ ] `/history`
  - [ ] `/coach/tracker`

## Theming & UI
- [ ] Soft-blue theme applies across app surfaces
- [ ] Footer build tag visible

## Security headers (production/preview URL)
Verify via `curl -sI <HOST_URL>` or `scripts/smoke.sh`:
- [ ] Strict-Transport-Security (HSTS)
- [ ] X-Frame-Options (XFO)
- [ ] X-Content-Type-Options (XCTO)
- [ ] Content-Security-Policy (CSP)
- [ ] Permissions-Policy
- [ ] Referrer-Policy

## Quick commands
```bash
# Show key headers
bash scripts/smoke.sh --dry-run --host-url https://mybodyscan-f3daf.web.app

# Assert CSP contains required sources
node scripts/check-csp.mjs
# Or against a specific host
HOST_URL=https://mybodyscan-f3daf.web.app node scripts/check-csp.mjs
```
