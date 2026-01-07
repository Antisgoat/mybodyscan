#!/usr/bin/env bash
set -euo pipefail

# Generates iOS splash/icon assets via @capacitor/assets.
# Output: ios/App/App/Assets.xcassets/
#
# This is intentionally cross-platform (no macOS-only tools).
npx --yes @capacitor/assets generate --ios

