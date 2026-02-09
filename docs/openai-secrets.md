# OpenAI secrets (server-only)

This repo **must never** ship `OPENAI_API_KEY` or other server secrets in client `.env*` files or bundled assets. The key must live in Firebase Functions Secret Manager so AI features run on the server only.

## Production setup

1) Set the secret in Firebase Functions:

```bash
firebase functions:secrets:set OPENAI_API_KEY --project <projectId>
```

2) (Optional) Configure model + provider (server-side only):

```bash
firebase functions:config:set openai.model="gpt-4o-mini" --project <projectId>
```

> `OPENAI_MODEL`, `OPENAI_PROVIDER`, and `OPENAI_BASE_URL` are **server-side only**. Do not place them in client `.env*` files.

## Local development (emulators)

Keep the OpenAI key out of client env files. Either:

```bash
# Option A: use functions secret locally
firebase functions:secrets:set OPENAI_API_KEY --project <projectId>
firebase emulators:start --only functions,firestore,auth
```

Or set it only in your **shell** for functions/emulators (not in `.env*` files used by Vite):

```bash
export OPENAI_API_KEY="sk-..."
firebase emulators:start --only functions,firestore,auth
```

## Client-safe env vars

Only allowlisted `VITE_*` variables are embedded into the client build (see `scripts/generate-app-config.mjs`).

✅ **Safe for client**
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`

🚫 **Server-only (never in client `.env*`)**
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_PROVIDER`
- Stripe secrets and Firebase service account keys
