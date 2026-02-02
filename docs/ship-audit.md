# Ship Audit (iOS + Web)

## Inventory (entrypoints + build locations)
- **AppDelegate**: `ios/App/App/AppDelegate.swift` (Capacitor lifecycle + URL handling). 
- **SceneDelegate**: `ios/App/App/SceneDelegate.swift` (window + bridge setup).
- **Capacitor config**: `capacitor.config.ts` (`webDir: "dist"`, no `server.url`).
- **Native web bundle output**: Vite builds to `dist/`, which is synced to `ios/App/App/public` via `npx cap sync ios`.

## Firebase native scan
- `rg` scans under `ios/App` for `Firebase*` and `GoogleService-Info.plist` references returned no matches.
- `rg` scans in `ios/App/App.xcodeproj/project.pbxproj`, `ios/App/Podfile`, and `ios/App/Podfile.lock` returned no matches.
- Result: **No native Firebase** references in iOS project or Podfiles.

## Workspace-only flow
- Use `ios/App/App.xcworkspace` for builds and Simulator runs (never the `.xcodeproj`).
- `ios/scripts/ios_reset.sh` performs: `npm install` (if needed) → `npm run build` → `npx cap sync ios` → `pod install --repo-update` → open `App.xcworkspace`.

## Release Steps (copy/paste)
1. `npm run ios:reset`
2. `npm run smoke:native`
3. `npm run ios:build:debug`
4. `npm run ios:build:release`
5. Open `ios/App/App.xcworkspace` and run on latest iPhone Simulator (Debug).
