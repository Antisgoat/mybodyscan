#!/usr/bin/env bash
set -euo pipefail

# Regenerate iOS AppIcon + Splash assets from /resources.
# Requires: Node + npx.
#
# Usage:
#   bash scripts/generate-ios-assets.sh
#
# Note: This can be run on macOS or Linux (CI). The generated PNGs should be committed.

cd "$(dirname "$0")/.."

npx --yes @capacitor/assets generate --ios

#!/usr/bin/env bash
set -euo pipefail

# Generates iOS splash/icon assets via @capacitor/assets.
# Output: ios/App/App/Assets.xcassets/
#
# This is intentionally cross-platform (no macOS-only tools).
npx --yes @capacitor/assets generate --ios

