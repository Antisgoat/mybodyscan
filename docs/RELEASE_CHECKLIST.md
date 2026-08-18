# MyBodyScan release checklist

Use [`PRODUCTION_RELEASE.md`](PRODUCTION_RELEASE.md) as the single source of
truth for web, Firebase, iOS, and Android release gates, deployment order,
post-deploy verification, and rollback.

Platform-specific operator details are limited to:

- [`AppStoreReleaseChecklist.md`](AppStoreReleaseChecklist.md) for iOS;
- [`../ios/RELEASE_IOS.md`](../ios/RELEASE_IOS.md) for the iOS build appendix;
- the Android sections of [`PRODUCTION_RELEASE.md`](PRODUCTION_RELEASE.md).

If any checklist disagrees with the canonical runbook, stop and correct the
documentation before building or deploying.
