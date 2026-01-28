/**
 * Minimal Capacitor config to allow wrapping the Vite app without further code changes.
 * Native projects (ios/android) will be created later via CLI.
 * No imports here to avoid TS type resolution when Capacitor packages aren’t installed yet.
 */
const config = {
  appId: "com.mybodyscan.app",
  appName: "MyBodyScan",
  webDir: "dist",
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
} as const;

export default config;
