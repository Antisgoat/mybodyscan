#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

cd "${REPO_ROOT}"
echo "info: ios/scripts/ios_reset.sh is deprecated. Use npm run ios:reset."
node scripts/ios-reset.mjs
