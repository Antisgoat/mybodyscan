# Private-photo lifecycle audit — November 2, 2026

## Confirmed architecture

Body-scan JPEGs are stored at scans/{uid}/{scanId}/{pose}.jpg. Preview images
are server-generated under transformation-previews/{uid}/{scanId}/. Storage
rules require matching ownership for reads and an owner-bound, expiring upload
session for scan writes. Clients cannot write preview images. Account deletion
covers scans, legacy user uploads and generated previews. Meal, kitchen and gym
analysis photos are not persisted to the account; provider retention can apply.

## Corrections

- Scan image rendering uses authenticated bounded SDK blob downloads, not reusable
  download links. Session-local object URLs are revoked on sign-out, invalidation
  and expiry. In-flight old-session responses cannot re-populate the cache.
- Private scan upload helpers no longer request or return download URLs, including
  explicit legacy requests. Diagnostic UI/log output no longer includes those URLs.
- Scan deletion now deletes both scan photos and generated previews, including
  their database records. Storage failures propagate instead of reporting success;
  the scan record is retained for a safe retry until media removal succeeds.
- Exact validated user/scan prefixes prevent traversal and sibling-prefix deletion.
- Active scan/preview processing blocks scan deletion; an atomic deletion marker
  prevents a concurrent new preview from recreating media after deletion starts.
- Added the installed Capacitor Android HTTPS localhost origin to the canonical
  Storage CORS allowlist and its infrastructure mirror. This enables authenticated
  blob reads on Android; it grants no anonymous Storage access or new IAM role.
- Added a read-only bucket IAM/retention posture summary to manual maintenance;
  it prints no account identities, image paths, image contents or tokens.

Production cache dry run inspected 31 objects, found one old cache setting and
changed none. The separate metadata-only apply inspected 31 objects and corrected
that one setting, with zero conflicts or truncation. It changed no token or image.
Build 51 contains client changes. A local emulator integration verifies individual
scan deletion, active-preview rejection, and removal of both media/record prefixes.

## Important limits and rollout

No existing member photos were deleted during this audit. Existing Firebase
download tokens were not bulk revoked. Older clients and copied historic links
need an explicit migration after authenticated reads are verified on web and iPhone.
Do not describe this patch as retroactively revoking every shared link.

No automatic retention period was imposed or old scans purged. Current policy
retains body photos/history while the account is active until the member deletes
them, subject to provider recovery/required-record constraints. A shorter policy
is a product/legal choice that affects history and preview generation.

App Check remains soft pending device verification. The founder previously
declined browser-key restriction changes; that decision is preserved. Admin MFA,
live IAM, recovery-copy settings, log/alert coverage, independent penetration
testing, and counsel review are separate evidence gates, not completed by npm
audits. See docs/PRIVATE_MEDIA_INCIDENT_RUNBOOK.md. No unhackability, DEXA accuracy,
legal immunity or complete regulatory-compliance claim is supported.
