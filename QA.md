# MyBodyScan — QA Checklist (Web)

Date: <fill when running>

## Boot

- Console shows: [boot] origin: https://mybodyscanapp.com apiKey: true
- Console shows: [boot] IdentityToolkit: 200
- No network calls to google.com/recaptcha/\* on load

## Auth (Web)

- Email sign-in works (happy path)
- Google sign-in works; popup blocked triggers redirect automatically
- Apple sign-in works or button hidden if not configured

## Demo

- “Explore Demo” signs in instantly (anonymous)
- Any write attempt in demo shows “Demo is read-only.” and does not crash

## Credits

- developer@adlrlabs.com displays ∞ in header
- Non-dev user displays a non-negative integer
- “Refresh” updates claims immediately

## Nutrition

- Free-text “chicken” returns multiple items
- A known barcode returns a product
- Status text shows USDA then OFF fallback when applicable

## Scan + Stripe (Sandbox)

- Full scan pathway consumes exactly one credit on success
- Failure displays friendly retry and does not double-consume

## Regression

- No uncaught errors in console on happy path
- Basic page load is responsive; Lighthouse ok
