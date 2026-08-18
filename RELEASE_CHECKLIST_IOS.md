# MyBodyScan iOS release checklist

The authoritative production gates and release procedure are in
[`docs/PRODUCTION_RELEASE.md`](docs/PRODUCTION_RELEASE.md). The maintained iOS
operator checklist is
[`docs/AppStoreReleaseChecklist.md`](docs/AppStoreReleaseChecklist.md), with
native build details in [`ios/RELEASE_IOS.md`](ios/RELEASE_IOS.md).

Do not use older iOS commands or architecture notes from Git history. Internal
TestFlight acceptance—including authentication, a real four-photo scan,
credit-ledger behavior, RevenueCat sandbox purchases and restore, notifications,
and account deletion—must pass before App Store submission.
