# MyBodyScan deployment checklist

The single authoritative deployment and rollback runbook is
[`docs/PRODUCTION_RELEASE.md`](docs/PRODUCTION_RELEASE.md).

Do not deploy from commands copied from older checklists or Git history. The
production workflow must deploy the reviewed `main` commit to Firebase project
`mybodyscan-f3daf`, and every mandatory post-deploy smoke test in the canonical
runbook must pass before a store release is promoted.
