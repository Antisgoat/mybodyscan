# App Store release pointer

The single authoritative release runbook for the web app, Firebase backend,
and Capacitor iOS app is [`docs/PRODUCTION_RELEASE.md`](PRODUCTION_RELEASE.md).
The iOS build appendix is [`ios/RELEASE_IOS.md`](../ios/RELEASE_IOS.md).

Do not use older commands or secret lists from Git history. In particular:

- deploy only Firebase project `mybodyscan-f3daf`;
- deploy the reviewed `main` commit in the order documented by the production
  runbook;
- use Stripe only on the web and RevenueCat/App Store purchases only in the
  native iOS build;
- release to internal TestFlight first and complete every real-device,
  sandbox-purchase, scan, credit-ledger, push, and account-deletion check before
  App Store submission.
