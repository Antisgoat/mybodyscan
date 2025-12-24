## Scan pipeline basics

The scan flow uploads four prepared JPEG photos to Firebase Storage and then asks the scan engine (OpenAI) to generate an estimate, workout program, and macro plan.

### Required environment

Set these **required** values in Functions/Hosting (`.env.*` or runtime config):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (e.g., `gpt-4o-mini`)
- `OPENAI_PROVIDER` (e.g., `openai`)
- `OPENAI_BASE_URL` (e.g., `https://api.openai.com`)
- `STORAGE_BUCKET` (canonical bucket, `*.appspot.com`)
- `PROJECT_ID`

The backend fails fast with `scan_engine_not_configured` if any are missing so the UI can surface an actionable error.

### Canonical storage paths

Scan photos are written to:

```
user_uploads/{uid}/scans/{scanId}/{pose}.jpg
```

Storage rules in `storage.rules` allow owner-only access to this path (plus `user_uploads/{uid}/debug/*` for diagnostics).

### Running a quick system check

1. Load `/scan?debug=1` (or any scan page in development).
2. Expand **Debug details** → **Run debug checks**.
3. The tool will validate:
   - Auth (uid present)
   - Storage write via Firebase SDK (1KB to `user_uploads/{uid}/debug/`)
   - Firestore write/read under `users/{uid}/diagnostics/systemCheck`
   - Scan engine config (provider/model/base URL) via `/system/health`

Use this to confirm tokens/rules/config are healthy without re-uploading photos.
