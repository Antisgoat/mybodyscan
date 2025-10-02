# Deploying MyBodyScan

## Secrets
Use Google Cloud Secret Manager for all sensitive values (do **not** rely on `functions.config()`).

Required secrets:

- `USDA_FDC_API_KEY`
- `STRIPE_SECRET`
- `STRIPE_WEBHOOK`
- `OPENAI_API_KEY`

## Build & deploy

```
npm ci
npm run build:prod
npx firebase-tools deploy --only functions,hosting --project mybodyscan-f3daf --force
```

## Post-deploy checklist

1. Verify caching headers:
   - `curl -I https://mybodyscanapp.com` → `Cache-Control: no-store` for `index.html`.
   - `curl -I https://mybodyscanapp.com/assets/<asset>.js` → `Cache-Control: public, max-age=31536000, immutable`.
2. Confirm build metadata is current:
   - Visit `https://mybodyscanapp.com/build.txt` and ensure `sha` matches the deployed commit.
3. Smoke-test demo mode:
   - Browse `https://mybodyscanapp.com/welcome?demo=1` and confirm no seeded data appears.
