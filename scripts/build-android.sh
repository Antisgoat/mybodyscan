#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d android ]; then
  echo "ERROR: android/ missing. Run: npx cap add android and commit the result." >&2
  exit 2
fi

pushd android >/dev/null
./gradlew clean
./gradlew assembleDebug
./gradlew assembleRelease
popd >/dev/null
