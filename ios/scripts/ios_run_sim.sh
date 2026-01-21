#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
APP_DIR="${REPO_ROOT}/ios/App"
DERIVED_DATA_DIR="${TMPDIR:-/tmp}/mybodyscan-derived-data"

cd "${APP_DIR}"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found. Install Xcode and command line tools." >&2
  exit 1
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "error: CocoaPods is not installed. Install CocoaPods and re-run this script." >&2
  exit 1
fi

if [ ! -f "Pods/Manifest.lock" ] || [ "Podfile.lock" -nt "Pods/Manifest.lock" ]; then
  echo "Running pod install..."
  pod install
fi

DEVICE_INFO="$(xcrun simctl list -j devices | /usr/bin/python3 - <<'PY'\nimport json\nimport sys\n\ndata = json.load(sys.stdin)\npreferred_name = \"iPhone 17 Pro Max\"\n\ndef is_available(device):\n    if device.get(\"isAvailable\") is True:\n        return True\n    availability = device.get(\"availability\", \"\")\n    return availability == \"(available)\"\n\nbooted = None\npreferred = None\nfirst_iphone = None\nfirst_any = None\n\nfor runtime_devices in data.get(\"devices\", {}).values():\n    for device in runtime_devices:\n        if not is_available(device):\n            continue\n        if first_any is None:\n            first_any = device\n        if device.get(\"name\", \"\").startswith(\"iPhone\") and first_iphone is None:\n            first_iphone = device\n        if device.get(\"name\") == preferred_name:\n            preferred = device\n        if device.get(\"state\") == \"Booted\" and booted is None:\n            booted = device\n\nchosen = preferred or booted or first_iphone or first_any\nif not chosen:\n    sys.stderr.write(\"No available iOS Simulator devices found.\\n\")\n    sys.exit(1)\n\nsys.stdout.write(f\"{chosen['udid']}|{chosen['name']}|{chosen.get('state','')}\\n\")\nPY\n)"
IFS="|" read -r DEVICE_UDID DEVICE_NAME DEVICE_STATE <<< "${DEVICE_INFO}"
echo "Using simulator: ${DEVICE_NAME} (${DEVICE_UDID}) state=${DEVICE_STATE:-unknown}"

open -a Simulator >/dev/null 2>&1 || true

if [ "${DEVICE_STATE}" != "Booted" ]; then
  echo "Booting simulator..."
  xcrun simctl boot "${DEVICE_UDID}" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "${DEVICE_UDID}" -b
fi

rm -rf "${DERIVED_DATA_DIR}"
echo "Building for simulator..."
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=${DEVICE_UDID}" \
  -derivedDataPath "${DERIVED_DATA_DIR}" \
  clean build

APP_PATH="$(find "${DERIVED_DATA_DIR}" -type d -path "*Build/Products/Debug-iphonesimulator/App.app" -print -quit)"
if [ -z "${APP_PATH}" ]; then
  echo "error: Unable to locate built App.app under ${DERIVED_DATA_DIR}." >&2
  exit 1
fi

echo "Installing App.app..."
xcrun simctl install "${DEVICE_UDID}" "${APP_PATH}"

echo "Launching app..."
xcrun simctl launch "${DEVICE_UDID}" "com.mybodyscan.app"

echo "Done."
