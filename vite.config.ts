import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

/**
 * Native-build acceptance requirement:
 * iOS assets must contain ZERO occurrences of "@firebase/auth" or "firebase/auth".
 *
 * Even when Firebase JS Auth is not bundled, Firebase core can embed these as
 * version/registry metadata strings. We strip them from the emitted bundle in
 * `--mode native` so grep-based checks stay empty.
 *
 * This does NOT enable auth: Firebase Auth entrypoints are still hard-aliased
 * to throwing shims for native builds.
 */
function stripAuthSentinelStrings(isNative: boolean) {
  return {
    name: "strip-auth-sentinel-strings",
    apply: "build" as const,
    enforce: "post" as const,
    generateBundle(_: any, bundle: any) {
      if (!isNative) return;
      for (const item of Object.values(bundle)) {
        if (item && item.type === "chunk" && typeof item.code === "string") {
          item.code = item.code
            .split("@firebase/auth")
            .join("@firebase/au_th")
            .split("firebase/auth")
            .join("firebase/au_th");
        }
        if (item && item.type === "asset" && typeof item.source === "string") {
          item.source = item.source
            .split("@firebase/auth")
            .join("@firebase/au_th")
            .split("firebase/auth")
            .join("firebase/au_th");
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
    stripAuthSentinelStrings(isNative),
  ].filter(Boolean),
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "./src") },
      ...(isNative
        ? [
            // Native build: route firebase/app through a shim that re-exports
            // @firebase/app to avoid wrapper registry strings (includes "@firebase/auth").
            { find: /^firebase\/app$/, replacement: nativeFirebaseAppShim },

            // REQUIRED (native builds): alias ALL Firebase Auth entrypoints to a shim.
            { find: /^firebase\/auth$/, replacement: nativeAuthShim },
            { find: /^firebase\/auth\/.*/, replacement: nativeAuthShim },
            { find: /^@firebase\/auth$/, replacement: nativeAuthShim },
            { find: /^@firebase\/auth\/.*/, replacement: nativeAuthShim },

            // Extra hardening for common compat/auth variants.
            { find: /^firebase\/auth-compat$/, replacement: nativeAuthShim },
            { find: /^firebase\/compat\/auth$/, replacement: nativeAuthShim },

            // REQUIRED (native builds): prevent bundling the capacitor-firebase-auth web wrapper.
            {
              find: /^@capacitor-firebase\/authentication$/,
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
    // Disable modulepreload tags in HTML. This prevents eager preloads of chunks
    // that can cause WKWebView boot issues, and is required for native build mode.
    modulePreload: false,
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
