#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

for candidate in \
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home" \
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"; do
  if [ -d "$candidate" ]; then
    export JAVA_HOME="$candidate"
    export PATH="$JAVA_HOME/bin:$PATH"
    break
  fi
done

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi
if [ -n "${ANDROID_HOME:-}" ]; then
  export ANDROID_SDK_ROOT="$ANDROID_HOME"
fi

if [ ! -f android/keystore.properties ]; then
  echo "ERROR: android/keystore.properties is required for a signed Play bundle." >&2
  echo "Copy android/keystore.properties.example and fill it locally." >&2
  exit 2
fi

MBS_PLATFORM=android node scripts/ensure-native-firebase-config.mjs
MBS_NATIVE=1 MODE=production MBS_NATIVE_RELEASE=1 MBS_PLATFORM=android \
  node scripts/generate-app-config.mjs
MBS_PLATFORM=android npx vite build
MBS_PLATFORM=android npx cap sync android
npm run check:android-release-config

cd android
./gradlew --no-daemon clean lintRelease bundleRelease
