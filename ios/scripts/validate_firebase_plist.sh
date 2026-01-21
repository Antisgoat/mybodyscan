#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_DIR="${REPO_ROOT}/App"
PLIST_PATH="${APP_DIR}/App/GoogleService-Info.plist"

CONFIGURATION="${CONFIGURATION:-}"
if [[ -z "${CONFIGURATION}" ]]; then
  CONFIGURATION="${1:-}"
fi

if [[ -z "${CONFIGURATION}" ]]; then
  CONFIGURATION="Debug"
fi

bundle_id_expected="${PRODUCT_BUNDLE_IDENTIFIER:-com.mybodyscan.app}"

warn() {
  echo "warn: $*" >&2
}

fail_or_warn() {
  local message="$1"
  if [[ "${CONFIGURATION}" == "Release" ]]; then
    echo "error: ${message}" >&2
    exit 1
  fi
  warn "${message}"
}

if [[ ! -f "${PLIST_PATH}" ]]; then
  fail_or_warn "Missing ${PLIST_PATH}. Download the iOS GoogleService-Info.plist from Firebase Console and save it there."
  exit 0
fi

if ! /usr/libexec/PlistBuddy -c "Print" "${PLIST_PATH}" >/dev/null 2>&1; then
  fail_or_warn "Unable to parse ${PLIST_PATH}. Ensure it is a valid plist from Firebase Console."
  exit 0
fi

google_app_id=$(/usr/libexec/PlistBuddy -c "Print GOOGLE_APP_ID" "${PLIST_PATH}" 2>/dev/null || true)
if [[ -z "${google_app_id}" || "${google_app_id}" == *"REPLACE_ME"* ]]; then
  fail_or_warn "GOOGLE_APP_ID is missing or placeholder in ${PLIST_PATH}. Download the correct plist from Firebase Console."
  exit 0
fi

bundle_id=$(/usr/libexec/PlistBuddy -c "Print BUNDLE_ID" "${PLIST_PATH}" 2>/dev/null || true)
if [[ -z "${bundle_id}" ]]; then
  fail_or_warn "BUNDLE_ID is missing in ${PLIST_PATH}."
  exit 0
fi

if [[ "${bundle_id}" != "${bundle_id_expected}" ]]; then
  fail_or_warn "BUNDLE_ID '${bundle_id}' does not match expected '${bundle_id_expected}'. Download the correct plist for this app."
  exit 0
fi

echo "Firebase plist validated for bundle id ${bundle_id_expected}."
