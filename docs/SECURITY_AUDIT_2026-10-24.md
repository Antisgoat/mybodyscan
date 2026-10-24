# Security audit — October 24, 2026

## Scope and limits

Repository baseline: `a3cd17f`. Reviewed the web/native configuration, HTTP and
callable authentication, privileged access, billing webhook validation, scan
ownership/credit boundaries, AI feature entitlement/quota guards, telemetry,
Firestore/Storage rules, tracked credential patterns, reachable Git history
credential patterns, CI, and all three npm lockfiles. This is source review plus
automated checks, not an independent penetration test, proof of absence of
vulnerabilities, live IAM review, or review of every native third-party source
line. npm does not audit CocoaPods or Android Maven artifacts.

No paid AI calls, production account deletion, purchase, or live exploit/flood
test was performed. Existing user work was preserved.

## Verified findings and changes

| Finding | Remediation |
| --- | --- |
| Backend request parsers had a high-severity compressed-body DoS advisory | Updated both installed `body-parser` branches through compatible lockfile patches. Functions audit now reports zero findings. |
| Anonymous HTTP telemetry could create persistent database writes; limiter failure allowed persistence | Anonymous/invalid-auth events are silently dropped; persistence fails closed when limiting fails. Added negative-path tests. |
| Legacy callable telemetry accepted unbounded anonymous logging | Requires authentication for logging, limits authenticated calls, bounds fields, and drops on limiter failure. |
| Diagnostic payloads could retain credentials or image data | Redacts bearer/JWT/API-key patterns, URL userinfo/query/fragment, sensitive extra-field keys, and image data URLs; bounds depth, array length, object fields, and text size. This is defense in depth, not a guarantee that arbitrary free text contains no PII. |
| Scan uploads advertised a public one-year cache lifetime | Both future server and client uploads now use `private, no-store, max-age=0`; upload metadata regression test added. This does not make historical objects private retroactively or invalidate existing download tokens. |
| Privileged HTTP tools did not explicitly request token-revocation checks | Admin and UAT tools request revoked/disabled-session verification, without adding an Auth lookup to every normal customer request. |
| Development/test dependency vulnerabilities | Upgraded Vite, React SWC plugin, Vitest, esbuild, Firebase CLI, Zod, isolated rules SDK/test runner, and maintenance tools; retained Node 22 and the existing app architecture. |
| Development server exposed all local interfaces by default | Defaults to loopback; LAN exposure now requires a deliberate override. |
| Missing browser baseline restrictions | Added `base-uri 'self'`, `object-src 'none'`, and `frame-ancestors 'none'` CSP directives; authenticated shared HTTP middleware explicitly disables response caching. This is not a complete script-source CSP. |
| Storage boundaries lacked direct emulator regression coverage | Added tests for owner access, cross-user/anonymous denial, MIME/filename/size limits, server-authored previews, and default-deny paths. Both CI pipelines now run Firestore and Storage emulators. |
| No tracked-credential CI guard/update configuration | Added a value-redacting credential-pattern check and bounded weekly Dependabot configuration for npm and GitHub Actions. |

Relevant advisories:

- [body-parser compressed-body DoS](https://github.com/advisories/GHSA-27r3-jxmh-p828)
- [Zod oversized collection memory exhaustion](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
- [Tinypool worker-options prototype pollution](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)

## Dependency evidence

Initial advisory totals: root 73 (3 critical), Functions 1 high, isolated rules
tests 25 (4 critical). These are npm package findings, not counts of proven
exploitable application vulnerabilities.

After changes:

- Shipped web dependency tree (`npm audit --omit=dev`): **0**.
- Functions dependency tree: **0**.
- Isolated rules-testing dependency tree: **0**.
- Full root development tree: **25** findings, **0 critical**, **13 high**,
  10 moderate, 2 low. Most high findings are inherited by the current Lighthouse
  / Lighthouse CI toolchain (`extract-zip`, `basic-ftp`, old nested Zod, `tmp`
  and affected parent packages). Other findings involve selector-parser and
  tracing dependencies of development tools. These tools are not shipped in
  the static customer bundle or deployed Functions.

The latest supported maintenance versions were installed. Do not use
`npm audit fix --force`: the suggested resolution includes downgrading
Lighthouse CI to an obsolete release and migrating Tailwind across a major
version. Clearing these findings still requires compatible upstream patches or
a separately tested replacement/migration. Do not expose developer/test servers
publicly or run these tools on untrusted archives, sites, styles, or inputs.

## Verification

- TypeScript app checks passed; production Vite build and bundle guards passed.
  The native release web bundle also builds and passes the native Auth/App Check
  isolation guard; a signed device binary was not created as part of this audit.
- App suite: 429 passed. Backend suite: 178 passed.
- Browser suite: 15 passed (desktop Chromium, Android-size Chromium, iPhone WebKit).
- Firebase emulator suite: 22 passed (15 Firestore, 7 Storage).
- Lint: zero errors; 1,428 pre-existing warnings remain.
- Credential-pattern scan: 1,213 tracked files checked without printing values;
  no matches. Reachable Git history search for selected private-key, live secret,
  and GitHub-token patterns returned no matches. These pattern checks cannot
  prove that no credential has ever been committed; rotate a credential if any
  independent exposure is discovered.

## Remaining launch/security work

1. Review operational IAM, administrator MFA, key rotation, cloud budgets and
   alerting, Firebase Auth abuse controls, backups/restore drills, and GitHub
   branch protection/secret scanning in the service consoles. Repository files
   cannot establish that these live controls are configured correctly.
2. App Check remains **soft** in the existing production configuration. It is
   not bot attestation enforcement. Validate browser and physical iOS attestation
   first, then make a deliberate strict-enforcement rollout; do not silently
   lock existing members out of the app.
3. Existing private scan objects need a bounded metadata migration to remove
   historical public caching. Already cached copies cannot be recalled. Existing
   Firebase download URLs are bearer capabilities: do not log, share, or treat
   them as expiring with sign-out. A full authenticated-blob/short-lived delivery
   migration needs separate compatibility work.
4. Storage upload rules are owner-scoped and size/type limited, but do not
   enforce a cumulative per-member storage quota or credit availability. Account
   creation/upload abuse still needs operational monitoring and a deliberate
   quota/session-gating design compatible with existing native clients.
5. Upgrade/replacement work remains for development-tool advisories. A complete
   restrictive script-source CSP also needs Firebase/Auth/Stripe/App Check
   compatibility testing; the new baseline does not prevent all XSS.
6. Client photo-cache metadata changes require a new native build. TestFlight
   build 40 does not contain this client patch. No new binary or App Store review
   submission is implied by this audit. Recheck camera, sign-in, purchases and
   private-photo behavior on a physical device after the next native build.
7. Run an independent prelaunch penetration test for additional assurance.

Do not describe this report as “unhackable”, “100% secure”, or complete
remediation of all repository advisories. Dependency results are a dated
snapshot and must be rechecked before release.
