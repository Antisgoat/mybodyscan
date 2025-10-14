# Developer Tools (/admin/dev-tools)

The MyBodyScan web app includes a built-in admin utility page at `/admin/dev-tools`. Any authenticated user can open it directly; the route is intentionally hidden from the navigation.

## Features

- **Refresh claims** — Invokes the `refreshClaims` callable, forces a fresh ID token, and displays the latest custom claims.
- **Clear local demo flags** — Removes the `mbs.demo` / `mbs.readonly` storage flags and reloads the app so the demo banner disappears on the next load.
- **Show auth info** — Prints the current user's email, UID, anonymous status, and decoded claims for quick inspection.
- **Unlimited credits badge** — When `developer@adlrlabs.com` is signed in and the `unlimitedCredits` claim is present, the page highlights that the claim is active.

## Exit demo mode

1. Visit `/admin/dev-tools` while signed in with a real account.
2. Click **Clear local demo flags**.
3. The page will reload. When you sign in again you should no longer see demo banners or credit gating.

> Tip: If you ever get stuck in demo mode on a shared machine, clearing browser storage for `mybodyscanapp.com` and reloading the app has the same effect.
