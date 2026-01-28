# MyBodyScan iOS (Capacitor) Quickstart

## Open the correct project

Always open the workspace, not the project:

```sh
./ios/scripts/open-ios.sh
```

If you don’t see `App.xcworkspace`, run:

```sh
npm run ios:reset
```

## One-command helpers

From the repo root:

```sh
npm run ios:reset
npm run ios:open
./ios/scripts/ios_run_sim.sh
./ios/scripts/ios_archive.sh
```

## Firebase config

MyBodyScan uses Firebase via the Web SDK inside the WebView. Native Firebase
plists are intentionally unused.

## Xcode notes

- Bundle ID: `com.mybodyscan.app`
- Always select an iOS Simulator device (not “My Mac” or Catalyst).
