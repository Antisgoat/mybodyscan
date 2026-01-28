# iOS wrap appendix

These steps assume you already ran `npx cap add ios` from the repository root.

1. **Open the workspace**
   - Run `npx cap sync ios`
   - Open `ios/App/App.xcworkspace` in Xcode
2. **Project settings**
   - Set the bundle identifier to `com.adlrlabs.mybodyscan`
   - Choose the correct development team
   - Update the app version/build before each TestFlight/App Store upload
3. **Capabilities**
   - Enable _Associated Domains_ and add `applinks:mybodyscanapp.com`
   - If push notifications or background modes are added later, enable them here
4. **Info.plist adjustments**
   - Ensure `NSCameraUsageDescription` exists (camera capture relies on the native permission dialog)
   - Verify `NSPhotoLibraryAddUsageDescription` / `NSPhotoLibraryUsageDescription` if gallery access is required
5. **Firebase configuration (web-only)**
   - Firebase runs via the Web SDK inside the WebView.
   - Native Firebase plists/pods are intentionally unused for iOS.
6. **Universal link testing** (optional today)
   - Install the app on a device
   - Run `xcrun simctl openurl booted https://mybodyscanapp.com/oauth/return` to confirm it opens inside the app when the universal link entitlement is active
7. **WebView tuning**
   - Capacitor automatically uses `WKWebView`
   - If overriding, ensure `allowsBackForwardNavigationGestures` stays enabled so our back guard receives popstate events
8. **Build pipeline**
   - Archive from Xcode (`Product > Archive`)
   - Upload via the Organizer, attach release notes describing native Google/Apple sign-in and **in‑app purchases** (RevenueCat)

Troubleshooting:

- If Google sign-in loops, confirm the redirect URI `https://mybodyscanapp.com/oauth/return` is listed in Firebase Auth
- If the camera does not appear, check the `NSCameraUsageDescription` string and ensure the device has granted permission

## RevenueCat (In‑App Purchases)

1. Run `npx cap sync ios` after pulling changes.
2. In Xcode:
   - Ensure **In‑App Purchase** capability is enabled.
3. In RevenueCat:
   - Add iOS products and attach them to the `pro` entitlement.
4. Confirm the app is built with:
   - `VITE_RC_API_KEY_IOS`
   - `VITE_RC_ENTITLEMENT_ID` (default `pro`)
