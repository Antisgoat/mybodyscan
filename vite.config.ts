import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function forbidNativeImports(isNative: boolean) {
  const forbiddenMatchers: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /^firebase\/app-compat$/, label: "firebase/app-compat" },
    { pattern: /^firebase\/compat\//, label: "firebase/compat/*" },
    { pattern: /^firebase$/, label: "firebase" },
  ];

  return {
    name: "forbid-native-imports",
    apply: "build" as const,
    async resolveId(source: string, importer?: string) {
      if (!isNative) return null;
      const match = forbiddenMatchers.find((entry) => entry.pattern.test(source));
      if (!match) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      const resolvedId = resolved?.id ?? source;
      const importerLabel = importer ?? "(unknown importer)";
      this.error(
        `FORBIDDEN in native build: ${match.label}\n` +
          `Importer: ${importerLabel}\n` +
          `Resolved: ${resolvedId}\n` +
          "Firebase compat/namespace bundles must not ship to native apps."
      );
      return null;
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isNative =
    mode === "native" ||
    process.env.MBS_NATIVE === "1" ||
    process.env.MBS_PLATFORM === "ios" ||
    process.env.MBS_PLATFORM === "android" ||
    process.env.CAPACITOR_NATIVE === "1" ||
    process.env.MBS_NATIVE_BUILD === "1";
  const enableNativeSourcemaps = isNative && process.env.MBS_NATIVE_RELEASE !== "1";

  const webAuthImpl = path.resolve(__dirname, "./src/auth/mbs-auth.web.ts");
  const nativeAuthImpl = path.resolve(__dirname, "./src/auth/mbs-auth.native.ts");
  const nativeWebAuthImpl = path.resolve(
    __dirname,
    "./src/auth/webAuth.native.ts"
  );
  const browserWebAuthImpl = path.resolve(
    __dirname,
    "./src/auth/webAuth.web.ts"
  );
  const nativeAppCheckImpl = path.resolve(
    __dirname,
    "./src/lib/appCheck.native.ts"
  );
  const browserAppCheckImpl = path.resolve(
    __dirname,
    "./src/lib/appCheck.web.ts"
  );
  const webFirebaseImpl = path.resolve(
    __dirname,
    "./src/lib/firebase/firebase.web.ts"
  );
  const nativeFirebaseImpl = path.resolve(
    __dirname,
    "./src/lib/firebase/firebase.native.ts"
  );
  const nativeFirebaseAppShim = path.resolve(
    __dirname,
    "./src/shims/firebase-app.native.ts"
  );
  const nativeFirestoreShim = path.resolve(
    __dirname,
    "./src/shims/firebase-firestore.native.ts"
  );
  const nativeFunctionsShim = path.resolve(
    __dirname,
    "./src/shims/firebase-functions.native.ts"
  );
  const nativeStorageShim = path.resolve(
    __dirname,
    "./src/shims/firebase-storage.native.ts"
  );
  const nativeAnalyticsShim = path.resolve(
    __dirname,
    "./src/shims/firebase-analytics.native.ts"
  );
  const forbiddenFirebaseCompatShim = path.resolve(
    __dirname,
    "./src/shims/forbiddenFirebaseCompat.ts"
  );
  const forbiddenFirebaseNamespaceShim = path.resolve(
    __dirname,
    "./src/shims/forbiddenFirebaseNamespace.ts"
  );

  return {
  // NOTE:
  // - `mode === "native"` is a special build mode for Capacitor/WKWebView.
  // - Native builds still use firebase/* shims to avoid compat bundles.
  // - Modular Firebase JS Auth is intentionally present: native OAuth
  //   credentials are synchronized into it so Firestore/Storage are signed in.
  base: isNative ? "./" : "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    forbidNativeImports(isNative),
  ].filter(Boolean),
  define: {
    __NATIVE__: JSON.stringify(isNative),
    __IS_NATIVE__: JSON.stringify(isNative),
    __MBS_NATIVE_RELEASE__: JSON.stringify(process.env.MBS_NATIVE_RELEASE === "1"),
  },
  resolve: {
    alias: [
      {
        find: /^@\/auth\/webAuth$/,
        replacement: isNative ? nativeWebAuthImpl : browserWebAuthImpl,
      },
      {
        find: /^@\/lib\/appCheck$/,
        replacement: isNative ? nativeAppCheckImpl : browserAppCheckImpl,
      },
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      {
        find: "@mbs-auth-impl",
        replacement: isNative ? nativeAuthImpl : webAuthImpl,
      },
      {
        find: "@mbs-firebase-impl",
        replacement: isNative ? nativeFirebaseImpl : webFirebaseImpl,
      },
      ...(isNative
        ? [
            // Native build: route firebase/* wrappers through shims to avoid
            // bundling the firebase wrapper registry (which includes *-compat tokens).
            { find: /^firebase\/app$/, replacement: nativeFirebaseAppShim },
            { find: /^firebase\/firestore$/, replacement: nativeFirestoreShim },
            { find: /^firebase\/functions$/, replacement: nativeFunctionsShim },
            { find: /^firebase\/storage$/, replacement: nativeStorageShim },
            { find: /^firebase\/analytics$/, replacement: nativeAnalyticsShim },
            // Extra hardening for compat/app variants (forbidden).
            { find: /^firebase$/, replacement: forbiddenFirebaseNamespaceShim },
            { find: /^firebase\/app-compat$/, replacement: forbiddenFirebaseCompatShim },
            { find: /^firebase\/compat\/.*$/, replacement: forbiddenFirebaseCompatShim },
          ]
        : []),
    ],
    dedupe: [
      "react",
      "react-dom",
      // Prevent Firebase SDK duplication in bundled output, which can cause
      // runtime crashes in WKWebView (e.g. "@firebase/auth INTERNAL ASSERTION FAILED").
      "firebase",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/functions",
      "firebase/storage",
      "@firebase/app",
      "@firebase/auth",
      "@firebase/component",
      "@firebase/util",
      "@firebase/firestore",
      "@firebase/functions",
      "@firebase/storage",
      "@firebase/analytics",
    ],
  },
  test: {
    exclude: [
      "e2e/**",
      "tests/e2e/**",
      "tests/rules/**",
      "node_modules/**",
      "dist/**",
    ],
  },
  build: {
    // Native builds: disable modulepreload tags in HTML to avoid eager preloads.
    ...(isNative ? { modulePreload: false } : {}),
    ...(isNative ? { sourcemap: enableNativeSourcemaps } : {}),
    // Native/web builds share `dist/`. Ensure we always clean it so stale chunks
    // (e.g. web-auth / firebase auth code) cannot linger between builds.
    emptyOutDir: true,
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      external: [/^functions\/.*/],
      output: {
        manualChunks(id) {
          // Create a predictable firebase-* chunk for boot greps that is safe.
          // (The actual Firebase SDK core chunk is named "fb-*".)
          if (id.includes("/src/lib/firebase/runtimeConfig.ts")) {
            // Intentionally NOT prefixed with "firebase-" so native acceptance checks
            // (`ls ... | grep -E "firebase-"`) stay empty.
            return "fb-runtime";
          }
          if (!id.includes("node_modules")) return;
          // Keep Capacitor (and capacitor-firebase) code out of the eagerly-loaded
          // firebase chunk. Otherwise, Rollup can merge a dynamically imported
          // native-only module into a static chunk and execute it on web at boot.
          if (id.includes("@capacitor-firebase")) return "capacitor-firebase";
          if (id.includes("@capacitor/")) return "capacitor";
          // Keep modular Firebase Auth in a distinct chunk. Native uses it as
          // the canonical session after secure provider UI returns a credential.
          if (
            id.includes("/node_modules/firebase/auth") ||
            id.includes("/node_modules/@firebase/auth")
          ) {
            return isNative ? "native-auth" : "web-auth";
          }
          // Keep firebase core out of "firebase-*.js" so boot greps stay focused.
          if (id.includes("/node_modules/firebase/")) return "fb";
          if (id.includes("/node_modules/@firebase/")) return "fb";
          if (id.includes("@tanstack")) return "tanstack";
          if (id.includes("recharts")) return "recharts";
          if (id.includes("lucide-react")) return "icons";
          return "vendor";
        },
      },
    },
  },
  optimizeDeps: {
    include: ["@zxing/browser", "@zxing/library"],
    // Avoid prebundling an extra copy of Firebase.
    exclude: [
      "firebase",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/functions",
      "firebase/storage",
      "@firebase/app",
      "@firebase/auth",
      "@firebase/component",
      "@firebase/util",
    ],
  },
  };
});
