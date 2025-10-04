#!/usr/bin/env bash
set -euo pipefail

HOST_URL_DEFAULT="https://mybodyscan-f3daf.web.app"
HOST_URL="$HOST_URL_DEFAULT"
DRY_RUN=false

print_usage() {
  echo "Usage: $0 [--host-url URL] [--dry-run]"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host-url)
      HOST_URL="${2:-}"; shift 2 ;;
    --dry-run)
      DRY_RUN=true; shift ;;
    -h|--help)
      print_usage; exit 0 ;;
    *)
      echo "Unknown arg: $1"; print_usage; exit 1 ;;
  esac
done

echo "Host URL: $HOST_URL"

# Security headers (HEAD request)
echo "\n== Security headers =="
curl -sI "$HOST_URL" | grep -i -E '^(strict-transport-security|x-frame-options|x-content-type-options|content-security-policy|permissions-policy|referrer-policy):' || true

# Helper to fetch status code
status_of() {
  local path="$1"
  local url="$HOST_URL$path"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)
  echo "$code"
}

echo "\n== Route status =="
for path in "/" "/scan" "/history" "/coach/tracker"; do
  code=$(status_of "$path")
  printf "%-18s %s\n" "$path" "$code"
done

if [[ "$DRY_RUN" == true ]]; then
  echo "\nDry-run enabled; skipping build."
  exit 0
fi

echo "\n== Building app (npx vite build) =="
# Do not rely on package.json scripts; call vite directly
set +e
BUILD_OUTPUT=$(npx vite build 2>&1)
BUILD_EXIT=$?
set -e

if [[ $BUILD_EXIT -eq 0 ]]; then
  echo "build OK"
else
  echo "build warnings or errors encountered" >&2
fi

# Echo limited tail of output for context
echo "--- build output (tail) ---"
echo "$BUILD_OUTPUT" | tail -n 50
