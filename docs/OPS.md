# Ops quick checks

## 1) Verify required secrets and attachments
Run:
  chmod +x ops/attach-secrets.sh
  PROJECT_ID=mybodyscan-f3daf REGION=us-central1 ./ops/attach-secrets.sh

- Prints which secrets exist in Secret Manager.
- Lists which secrets are attached to each Gen2 function.
- Prints suggested "gcloud functions deploy --update-secrets=..." commands (not executed automatically).

Required secrets:
- OPENAI_API_KEY → used by coachChat
- STRIPE_SECRET or STRIPE_SECRET_KEY → used by createCheckout
- STRIPE_WEBHOOK_SECRET → used by stripeWebhook
- USDA_FDC_API_KEY → used by nutritionSearch

## 2) Verify Firebase Auth authorized domains
Run:
  chmod +x ops/check-oauth.sh
  PROJECT_ID=mybodyscan-f3daf ./ops/check-oauth.sh

Expected to include:
- mybodyscanapp.com
- ${PROJECT_ID}.firebaseapp.com
- ${PROJECT_ID}.web.app
- localhost
- 127.0.0.1

If any are missing, add them in:
Firebase Console → Authentication → Settings → Authorized domains.

## 3) Providers checklist (manual)
- Email/Password, Google, and Apple should all be Enabled in:
  Firebase Console → Authentication → Sign-in method.
- Apple Service ID must contain these return URLs:
  - https://mybodyscan-f3daf.firebaseapp.com/__/auth/handler
  - https://mybodyscan-f3daf.web.app/__/auth/handler
  - https://mybodyscanapp.com/__/auth/handler

## Notes
- These scripts do not mutate production by default; they only read and print safe guidance.
- Keep secrets out of git. Use Firebase Secret Manager for values and --update-secrets to attach.
