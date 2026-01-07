#!/usr/bin/env bash
set -euo pipefail

# Generates the iOS asset PNGs expected by Xcode asset catalogs.
# Intended to be run on macOS (uses `sips`). Safe no-op on Linux CI.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON_SRC="${ROOT_DIR}/resources/icon.png"
SPLASH_SRC="${ROOT_DIR}/resources/splash.png"

APP_ASSETS_DIR="${ROOT_DIR}/ios/App/App/Assets.xcassets"
APPICON_DIR="${APP_ASSETS_DIR}/AppIcon.appiconset"
SPLASH_DIR="${APP_ASSETS_DIR}/Splash.imageset"

if ! command -v sips >/dev/null 2>&1; then
  echo "generate-ios-assets.sh: 'sips' not found (macOS-only). Skipping."
  exit 0
fi

if [[ ! -f "${ICON_SRC}" ]]; then
  echo "Missing icon source: ${ICON_SRC}" >&2
  exit 1
fi
if [[ ! -f "${SPLASH_SRC}" ]]; then
  echo "Missing splash source: ${SPLASH_SRC}" >&2
  exit 1
fi

mkdir -p "${APPICON_DIR}" "${SPLASH_DIR}"

echo "Generating AppIcon..."
# Xcode catalog expects: AppIcon-512@2x.png (1024x1024)
sips -z 1024 1024 "${ICON_SRC}" --out "${APPICON_DIR}/AppIcon-512@2x.png" >/dev/null

echo "Generating Splash (universal any-any)..."
# These names are referenced by ios/App/App/Assets.xcassets/Splash.imageset/Contents.json
sips -z 2732 2732 "${SPLASH_SRC}" --out "${SPLASH_DIR}/splash-2732x2732.png" >/dev/null
cp -f "${SPLASH_DIR}/splash-2732x2732.png" "${SPLASH_DIR}/splash-2732x2732-1.png"
cp -f "${SPLASH_DIR}/splash-2732x2732.png" "${SPLASH_DIR}/splash-2732x2732-2.png"

# Approximate "Default@Nx~universal~anyany.png" as scaled variants.
# (Xcode just needs the files to exist for catalog warnings to disappear.)
sips -z 1024 1024 "${SPLASH_SRC}" --out "${SPLASH_DIR}/Default@1x~universal~anyany.png" >/dev/null
sips -z 2048 2048 "${SPLASH_SRC}" --out "${SPLASH_DIR}/Default@2x~universal~anyany.png" >/dev/null
sips -z 2732 2732 "${SPLASH_SRC}" --out "${SPLASH_DIR}/Default@3x~universal~anyany.png" >/dev/null

# Dark variants: for now, copy the same raster (keeps catalog consistent).
cp -f "${SPLASH_DIR}/Default@1x~universal~anyany.png" "${SPLASH_DIR}/Default@1x~universal~anyany-dark.png"
cp -f "${SPLASH_DIR}/Default@2x~universal~anyany.png" "${SPLASH_DIR}/Default@2x~universal~anyany-dark.png"
cp -f "${SPLASH_DIR}/Default@3x~universal~anyany.png" "${SPLASH_DIR}/Default@3x~universal~anyany-dark.png"

echo "Done."

