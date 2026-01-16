# iOS Testing

## Always open the workspace

Open the Xcode workspace (not the `.xcodeproj`) so CocoaPods integrations and Capacitor settings load correctly:

```bash
npm run ios:open
```

## One reliable rebuild + verify command

When anything breaks (simulator issues, install/run failures, missing `CFBundleExecutable`, etc.), run:

```bash
npm run ios:doctor
```

This command installs dependencies, rebuilds the web app, syncs Capacitor, reinstalls Pods, resets simulator state, performs a clean Xcode simulator build, and verifies that the resulting `App.app` bundle is valid.

## Expected success output

You should see a final section similar to:

```text
==> PASS
iOS build verified successfully.
App bundle: /path/to/DerivedData/.../Build/Products/Debug-iphonesimulator/App.app
Executable: /path/to/DerivedData/.../Build/Products/Debug-iphonesimulator/App.app/App
Bundle ID: com.mybodyscan.app
```

If any step fails, the script stops immediately and prints a clear `FAIL` message with the relevant path.
