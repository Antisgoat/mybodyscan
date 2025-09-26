# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/cf8140ba-edcc-4236-9166-fb030db04005

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/cf8140ba-edcc-4236-9166-fb030db04005) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/cf8140ba-edcc-4236-9166-fb030db04005) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)

## App Check

To harden client requests, this project can enable Firebase App Check with reCAPTCHA Enterprise. Set `VITE_APPCHECK_SITE_KEY` in your environment (see `.env.development`) to initialize App Check. After verifying legitimate clients, enforce App Check in the Firebase console.

## Environment variables

Create a `.env.local` for development based on `.env.example` and a `.env.production` for production builds. Required variables:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FUNCTIONS_BASE_URL`
- `VITE_APPCHECK_SITE_KEY` *(optional but recommended)*

Cloud Functions read Stripe credentials from secrets named `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Configure them with `firebase functions:secrets:set` (see Deployment).

## Testing rules

Run Firestore security rules tests using the emulator suite:

```sh
npm run test:rules
```

## Scan Processing

### Option A: HTTP fallback (no Eventarc)

Deploy `processQueuedScanHttp` and the client will call this HTTPS endpoint after each upload. No additional Google Cloud services are required.

### Option B: Firestore trigger via Eventarc

When ready to switch back to a Firestore trigger, grant the necessary Eventarc roles and redeploy:

```sh
scripts/setup-eventarc.sh
firebase deploy --only functions:processQueuedScan
```

## Deployment

Deploy Functions and Hosting after setting Stripe keys and webhook secret via `firebase functions:secrets:set`:

```sh
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
firebase deploy --only functions,hosting
```

Stripe secret key and webhook secret should be stored in Cloud Functions secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`). If you previously configured automation or tooling with the legacy secret names (`STRIPE_SECRET`, `STRIPE_WEBHOOK`), update those references to the new keys when migrating.

## Auth env setup (fix for `auth/api-key-not-valid`)
1) Fill **.env.development** and **.env.production** with your real Firebase Web App values (see `.env.example`).
2) In **Lovable → Project Settings → Environment**, add the same `VITE_FIREBASE_*` variables.
3) Firebase Console → **Authentication → Settings → Authorized domains**: add
   - localhost
   - 127.0.0.1
   - mybodyscan-f3daf.web.app
   - mybodyscan-f3daf.firebaseapp.com
   - your custom domain(s) (e.g., mybodyscan.app, www.mybodyscan.app)
   - your Lovable preview domain
4) Rebuild locally: `npm ci && npm run build && npm run preview`
5) Deploy: `npx firebase-tools deploy --only hosting --project mybodyscan-f3daf --force`
