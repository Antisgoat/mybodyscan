# Fixes

- Resolved Vite config merge conflict and ensured stable build pipeline.
- Corrected Cloud Function memory setting ("1GB") and hardened scan provider switching.
- Reworked Firebase initialization with runtime/hosting fallbacks to avoid auth/api-key errors.
- Fixed Coach onboarding radio group type guarding and added stubs/guards where needed.
- Added build tag, error boundary, and safety wrappers to prevent blank preview.

## Root causes
- Vite config drift and missing defensive Firebase init led to broken builds and invalid API key popups.
- Cloud Function used "1GiB" memory setting and lacked provider fallbacks.
- RadioGroup goal field accepted any string causing type errors.

## Next steps
- Tighten ESLint rules and add tests.
- Replace Leanlense placeholder with real provider when ready.
- Expand CI to cover functions and security rules.
