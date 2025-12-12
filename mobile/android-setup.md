# Android wrap appendix

These steps assume `npx cap add android` has been executed from the repository root.

1. **Sync & open the project**
   - Run `npx cap sync android`
   - Open `android/` in Android Studio (use _Open an existing project_)
2. **Package & versions**
   - Confirm the applicationId in `android/app/build.gradle` is `com.adlrlabs.mybodyscan`
   - Increment `versionCode`/`versionName` before each release build
3. **Keystore configuration**
   - Create or import the release keystore
   - Add a `release` signingConfig in `android/app/build.gradle` and wire it to the `release` buildType
4. **Intent filters (future)**
   - When ready for deep links, add an `<intent-filter>` with `autoVerify="true"` pointing to `https://mybodyscanapp.com/oauth/return`
   - Until then, the web fallback route handles returns in the in-app WebView
5. **WebView configuration**
   - Capacitor uses `androidx.webkit` behind the scenes; no extra setup is required
   - Ensure `android:usesCleartextTraffic="false"` in `AndroidManifest.xml` (Stripe/Google need HTTPS only)
6. **Camera & storage permissions**
   - Capacitor Camera plugin is not in use; the web app triggers the native picker via `<input type="file" capture>`
   - No extra runtime permissions are needed beyond the system dialog Android shows for camera/gallery access
7. **Build artifacts**
   - Use _Build > Build Bundle(s)/APK(s) > Build Bundle(s)_ to create an `.aab`
   - Upload the bundle to Play Console, supply release notes about redirect-based Google sign-in and browser hand-off for Stripe
8. **Testing checklist**
   - Verify Google sign-in triggers a redirect (no popups)
   - Confirm Stripe checkout/portal exit the WebView to Chrome (our `openExternal` helper handles this)
   - Check Android hardware back during scan upload/processing shows the confirmation dialog

Troubleshooting:

- If Stripe opens inside the WebView, confirm the app was built after the `openExternal` helper landed
- If the back confirmation does not appear, ensure the WebView is not overriding the history stack (Capacitor default is fine)
