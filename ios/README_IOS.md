# MyBodyScan iOS (Capacitor) Quickstart

## Open the correct project

Always open the workspace, not the project:

```sh
./ios/scripts/open-ios.sh
```

If you don’t see `App.xcworkspace`, run:

```sh
./ios/scripts/ios_reset.sh
```

## One-command helpers

From the repo root:

```sh
./ios/scripts/ios_reset.sh
./ios/scripts/open-ios.sh
./ios/scripts/ios_run_sim.sh
./ios/scripts/ios_archive.sh
```

## Firebase config (optional in Debug, required for Release)

If you need Firebase features, download the iOS `GoogleService-Info.plist` from
Firebase Console and place it at:

```
./secrets/GoogleService-Info.plist
```

The build will copy it into the app bundle if present. Debug builds will run
without Firebase if the file is missing or invalid. Release archives will fail
if the plist is invalid (to prevent shipping a broken config).

To verify manually:

```sh
CONFIGURATION=Release ./ios/scripts/validate_firebase_plist.sh
```

## Xcode notes

- Bundle ID: `com.mybodyscan.app`
- Always select an iOS Simulator device (not “My Mac” or Catalyst).
