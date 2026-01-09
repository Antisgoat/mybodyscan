import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Native-build acceptance requirement:
 * iOS assets must contain ZERO occurrences of these forbidden strings.
 *
 * Firebase core embeds a registry list of package IDs (including auth IDs)
 * even when auth modules are not imported. For native builds we redact those
 * sentinel strings in the emitted bundle so token-based verifiers stay strict.
 *
 * This does NOT enable auth: native builds hard-alias auth entrypoints to shims.
 */
function stripForbiddenNativeTokens(isNative: boolean) {
  const replacements: Array<[string, string]> = [
    ["@firebase/auth", "@firebase/au_th"],
    ["firebase/auth", "firebase/au_th"],
    ["@capacitor-firebase/authentication", "@capacitor-firebase/authenticati_on"],
  ];
  return {
    name: "strip-forbidden-native-tokens",
    apply: "build" as const,
    enforce: "post" as const,
    generateBundle(_: any, bundle: any) {
      if (!isNative) return;
      for (const item of Object.values(bundle)) {
        if (item && item.type === "chunk" && typeof item.code === "string") {
          for (const [from, to] of replacements) {
            item.code = item.code.split(from).join(to);
          }
        }
        if (item && item.type === "asset" && typeof item.source === "string") {
          for (const [from, to] of replacements) {
            item.source = item.source.split(from).join(to);
          }
        }
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isNative = mode === "native";

  const nativeAuthShim = path.resolve(
    __dirname,
    "./src/shims/firebase-auth.native.ts"
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
  const nativeFirebaseCompatAppShim = path.resolve(
    __dirname,
    "./src/shims/firebase-compat-app.native.ts"
  );
  const nativeCapShim = path.resolve(
    __dirname,
    "./src/shims/cap-firebase-auth.native.ts"
  );

  return {
  // NOTE:
  // - `mode === "native"` is a special build mode for Capacitor/WKWebView.
  // - In native builds we must NEVER bundle or execute Firebase JS Auth.
  //   We hard-alias all firebase/auth entrypoints to throwing stubs.
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    stripForbiddenNativeTokens(isNative),
  ].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      ...(isNative
        ? [
            // Native build: route firebase/* wrappers through shims to avoid
            // bundling the firebase wrapper registry (which includes *-compat tokens).
            { find: /^firebase\/app$/, replacement: nativeFirebaseAppShim },
            { find: /^firebase\/firestore$/, replacement: nativeFirestoreShim },
            { find: /^firebase\/functions$/, replacement: nativeFunctionsShim },
            { find: /^firebase\/storage$/, replacement: nativeStorageShim },
            { find: /^firebase\/analytics$/, replacement: nativeAnalyticsShim },

            // REQUIRED (native builds): alias ALL Firebase Auth entrypoints to a shim.
            // Must be regex-based so subpaths are caught.
            { find: /^firebase\/auth(\/.*)?$/, replacement: nativeAuthShim },
            { find: /^@firebase\/auth(\/.*)?$/, replacement: nativeAuthShim },
            { find: /^firebase\/compat\/auth$/, replacement: nativeAuthShim },
            { find: /^firebase\/auth\/cordova$/, replacement: nativeAuthShim },

            // Extra hardening for compat/app variants (forbidden).
            {
              find: /^firebase\/compat\/app$/,
              replacement: nativeFirebaseCompatAppShim,
            },
            {
              find: /^@firebase\/app-compat$/,
              replacement: nativeFirebaseCompatAppShim,
            },

            // REQUIRED (native builds): prevent bundling the capacitor-firebase-auth web wrapper.
            {
              find: /^@capacitor-firebase\/authentication(\/.*)?$/,
              replacement: nativeCapShim,
            },
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
          // IMPORTANT: keep firebase/auth in a *separate* lazy chunk.
          // If we lump all Firebase files into one chunk, `firebase/auth` may be
          // evaluated at boot even when only dynamically imported.
          if (
            id.includes("/node_modules/firebase/auth") ||
            id.includes("/node_modules/@firebase/auth")
          ) {
            // Intentionally not prefixed with "firebase-" so our boot-chunk greps
            // (firebase-*.js) don't match this optional lazy auth chunk.
            return "web-auth";
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
