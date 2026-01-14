# iOS Release Guide (MyBodyScan)

This guide documents the terminal build steps and release checks for the Capacitor iOS app.

## Prerequisites

- Xcode installed (latest stable).
- CocoaPods installed (`sudo gem install cocoapods`).

## Terminal build commands

Run these commands from the repository root to validate the build and archive flow:

```sh
cd ios/App && pod install
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -destination 'generic/platform=iOS Simulator' build
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' build
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' archive -archivePath build/App.xcarchive
```

## Release readiness checks

- **Bundle ID**: `com.mybodyscan.app` (configured in build settings).
- **Info.plist**: Uses `App/Info.plist` (not generated) with `CFBundleExecutable = $(EXECUTABLE_NAME)`.
- **Versioning**: `MARKETING_VERSION = 1.0.0` and `CURRENT_PROJECT_VERSION` incremented as needed.
- **Signing**: Automatic signing is enabled (no personal Team ID committed).
- **Usage strings**: Camera and photo library usage descriptions are present with non-placeholder text.

## Release checklist (Xcode Organizer)

1. **Product → Clean Build Folder**
2. **Product → Archive**
3. Organizer: **Validate App**
4. Organizer: **Distribute App** (Upload)
