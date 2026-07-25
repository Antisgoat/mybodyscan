#!/usr/bin/env bash
set -euo pipefail

# Regenerate iOS AppIcon + Splash assets from /resources.
# Requires: Node + npx (no macOS-only tools).
#
# Usage:
#   bash scripts/generate-ios-assets.sh
#
# Note: This can be run on macOS or Linux (CI). The generated PNGs should be committed.

cd "$(dirname "$0")/.."

npx --yes @capacitor/assets generate --ios

