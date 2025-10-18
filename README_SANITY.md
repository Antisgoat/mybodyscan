## Sanity check CI

This repository includes a lightweight "sanity" pipeline that builds the web app and Cloud Functions, optionally deploys a Firebase Hosting preview channel, then probes a few endpoints (including `/system/health`). Results are posted as a comment on the PR.

### What it does
- Builds the web (Vite) and functions (tsc) on Node 20.
- Optionally deploys a preview channel if both `FIREBASE_TOKEN` and `FIREBASE_PROJECT` secrets are present.
- Runs `tools/sanity-check.mjs` to probe:
  - `/system/health` (expects JSON with `{ ok: true }`)
  - `/` (landing page)
  - `/demo` (optional; non-200 is tolerated in overall summary but health must pass)
- Comments a summary on the PR using `actions/github-script`.

### Setup
- In GitHub repository settings → Secrets and variables → Actions, add as needed:
  - `SANITY_BASE_URL` (optional; default `https://mybodyscanapp.com`)
  - `FIREBASE_PROJECT` (optional; enables preview deploy when set with token)
  - `FIREBASE_TOKEN` (optional; CI token for Firebase CLI)
- Ensure your functions export a `/system/health` endpoint. In this repo it returns `{ ok: true, projectId, hostingUrl }`.

### Local usage
- Run the checker against a base URL:

```bash
npm run sanity -- https://mybodyscanapp.com
# or
SANITY_BASE_URL=https://mybodyscanapp.com npm run sanity
```

- Run against a local preview server:
```bash
npm run build && npm run preview -- --host=0.0.0.0 --port=4173 &
PREVIEW_PID=$!
BASE_URL=http://127.0.0.1:4173 npm run sanity
kill $PREVIEW_PID
```

### GitHub Action
- Workflow file: `.github/workflows/sanity-check.yml`.
- Triggers:
  - pull_request (default branch targets)
  - workflow_dispatch (with optional `base_url` input)
- Output: posts a summary comment on the PR.

### Notes
- Exit code fails only if `/system/health` fails, so optional pages do not block merges unless critical.
- You can pass `base_url` on manual runs to probe arbitrary environments.
