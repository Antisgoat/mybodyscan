# MyBodyScan — Full Repo Audit (Generated: 2025-11-26T00-56-53Z)
> This report is read‑only. No app code was changed. Use it to drive a cleanup/fix PR.

## Executive Summary
- Import graph files: **354**, edges: **1084**.
- Alias rules detected: @/*.
- Entry files present: /workspace/mybodyscan/src/main.tsx, /workspace/mybodyscan/src/App.tsx.

## Findings Matrix (Top Priorities)
| Area | Status | Evidence |
|------|:-----:|----------|
| Hosting rewrites | ✅ | firebase.json rewrites for /api/* |
| Fresh index (no-store) | ✅ | firebase.json headers for /index.html |
| App Check (client init) | ✅ | src/lib/appCheck.ts |
| App Check SOFT (server) | ✅ | functions/src/http/appCheckSoft.ts usage |
| Demo signed-out only | ✅ | src/lib/demo.ts checks auth.currentUser |
| Admin credits “Unlimited” | ✅ | useUserClaims + CreditsBadge |
| Unified API + fallback | ✅ | api/urls + apiFetchWithFallback |
| Nutrition sanitizer | ✅ | src/lib/nutrition/sanitize.ts |

## Dead Code Candidates (first 25)
- `/workspace/mybodyscan/src/auth/components/SocialButtons.tsx`
- `/workspace/mybodyscan/src/components/AuthGate.tsx`
- `/workspace/mybodyscan/src/components/AuthedLayout.tsx`
- `/workspace/mybodyscan/src/components/ConsentGate.tsx`
- `/workspace/mybodyscan/src/components/CreditsBadge.tsx`
- `/workspace/mybodyscan/src/components/DemoBadge.tsx`
- `/workspace/mybodyscan/src/components/DemoBanner.test.tsx`
- `/workspace/mybodyscan/src/components/LoginPanel.tsx`
- `/workspace/mybodyscan/src/components/NavbarMBS.tsx`
- `/workspace/mybodyscan/src/components/PaywallOverlay.tsx`
- `/workspace/mybodyscan/src/components/ProtectedRouteMBS.tsx`
- `/workspace/mybodyscan/src/components/ScanResultCard.tsx`
- `/workspace/mybodyscan/src/components/ServingChooser.tsx`
- `/workspace/mybodyscan/src/components/charts/BodyTrendChart.tsx`
- `/workspace/mybodyscan/src/components/ui/alert-dialog.tsx`
- `/workspace/mybodyscan/src/components/ui/breadcrumb.tsx`
- `/workspace/mybodyscan/src/components/ui/carousel.tsx`
- `/workspace/mybodyscan/src/components/ui/chart.tsx`
- `/workspace/mybodyscan/src/components/ui/collapsible.tsx`
- `/workspace/mybodyscan/src/components/ui/command.tsx`
- `/workspace/mybodyscan/src/components/ui/context-menu.tsx`
- `/workspace/mybodyscan/src/components/ui/drawer.tsx`
- `/workspace/mybodyscan/src/components/ui/form.tsx`
- `/workspace/mybodyscan/src/components/ui/hover-card.tsx`
- `/workspace/mybodyscan/src/components/ui/input-otp.tsx`

…and 43 more

## Case Conflicts (same directory, case-insensitive basename)
_No conflicts detected._

## Stray fetch() to /api/* or Cloud Functions (first 25)
- `/workspace/mybodyscan/src/pages/SettingsAccountPrivacy.tsx:59` — const res = await fetch("/api/account/delete", {


## TypeScript Typecheck (best-effort)
```

```

## Recommended Next PR (Preview)
- Enforce **/api** rewrites and **no-store** index if missing.
- Ensure **App Check SOFT** wrappers at the top of HTTP handlers; keep client App Check init.
- Remove dead files above after verifying they aren’t loaded via router or dynamic glob.
  - Replace stray `fetch()` calls with `apiFetchWithFallback`.
- Confirm demo gating: signed‑in users are never blocked; admin shows **Unlimited** claims.
- Keep secrets in **Secret Manager** only.

---

_Artifacts:_  
- JSON graph: `reports/import-graph.json`  
- This report: **(you are reading it)**
