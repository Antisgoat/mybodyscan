# Release Guide

## Build
```
npm install
npm run build
npm run build:dev
```

## Functions
```
npm --prefix functions install
npm --prefix functions run build
```

## Deploy
```
firebase deploy --only functions:runBodyScan,functions:grantTestCredits --project mybodyscan-f3daf
VITE_BUILD_TAG=$(date -u +%Y-%m-%dT%H:%M:%SZ) npx -y firebase-tools@latest deploy --only hosting --project mybodyscan-f3daf
```
