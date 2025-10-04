# Recovery Plan (One-Page Playbook)

Use this playbook to recover a broken local workspace or unblock a CI deploy.

## 1) Reset node toolchain and dependencies
```bash
# Clear npm cache and reinstall cleanly
npm cache clean --force
rm -rf node_modules package-lock.json
npm ci || npm i
```

## 2) Clear build artifacts and rebuild
```bash
# Rebuild the web app
npx vite build
```

## 3) Remove tracked Firebase caches and ignore going forward
```bash
# If .firebase or functions/.firebase have been committed accidentally
git rm -r --cached .firebase || true
git rm -r --cached functions/.firebase || true

# Add to .gitignore (do this once in your local clone)
echo -e "\n.firebase\nfunctions/.firebase" >> .gitignore
```

## 4) Redeploy in the right order
```bash
# Functions first (ensures backend is compatible with new frontend)
firebase deploy --only functions
# Then hosting to pick up the new build
firebase deploy --only hosting
```

## 5) App Check enforcement
- In Firebase Console → Build → App Check → Your Web App → toggle Enforcement to Strict to block unverified clients.
- To temporarily unblock, set Enforcement to Relaxed, then revert to Strict after investigation.

## 6) Toggle scan provider via secret
Use Firebase Functions secrets to control provider selection without code changes.
```bash
# Set or update secret (e.g., mock|live)
firebase functions:secrets:set SCAN_PROVIDER
# Optional: scope to region if your project uses it, then redeploy
firebase deploy --only functions
```
At runtime, read with your functions runtime (for v2) via `process.env.SCAN_PROVIDER`.

## 7) Validate headers and routes
```bash
# Verify key security headers and route availability
bash scripts/smoke.sh --host-url https://mybodyscan-f3daf.web.app
# Assert CSP includes required sources
node scripts/check-csp.mjs
```
