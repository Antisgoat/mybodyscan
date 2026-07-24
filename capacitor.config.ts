/**
 * Minimal Capacitor config to allow wrapping the Vite app without further code changes.
 * Native projects (ios/android) will be created later via CLI.
 * No imports here to avoid TS type resolution when Capacitor packages aren’t installed yet.
 */
const config = {
  appId: "com.mybodyscan.app",
  appName: "MyBodyScan",
  webDir: "dist",
  allowNavigation: [
    "*.googleapis.com",
    "*.gstatic.com",
    "*.firebaseapp.com",
    "*.google.com",
  ],
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    FirebaseAuthentication: {
      // OAuth provider UI is native, then its credential is synchronized into
      // Firebase JS Auth so Firestore/Storage share the same signed-in user.
      skipNativeAuth: true,
      providers: ["google.com", "apple.com"],
    },
    FirebaseMessaging: {
      presentationOptions: ["alert", "badge", "sound"],
    },
  },
} as const;

export default config;
