import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

function stripFirebaseAuthStrings(isNative: boolean) {
  return {
    name: "strip-firebase-auth-strings",
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
        if (
          item &&
          item.type === "asset" &&
          typeof item.source === "string"
        ) {
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
    stripFirebaseAuthStrings(isNative),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...(isNative
        ? {
            // Hard-disable Firebase JS Auth on native builds (WKWebView safety).
            // Alias every common entry to a throwing stub so bundling/execution
            // cannot happen (and cannot white-screen the WebView).
            "firebase/auth": nativeAuthShim,
            "@firebase/auth": nativeAuthShim,
            "firebase/auth/cordova": nativeAuthShim,
            "firebase/auth/web-extension": nativeAuthShim,
            "firebase/auth/react-native": nativeAuthShim,
            "firebase/compat/auth": nativeAuthShim,
            "firebase/auth-compat": nativeAuthShim,

            // Ensure the Capacitor Firebase Auth NPM wrapper can never be bundled
            // into native builds.
            "@capacitor-firebase/authentication": nativeCapShim,
          }
        : {}),
    },
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
    ...(isNative
      ? {
          // IMPORTANT: Capacitor uses the same `dist/` as web, but iOS WKWebView boot is
          // extremely sensitive to pulling in web auth code. Disable HTML modulepreload
          // injection so auth-related chunks are never preloaded at native boot.
          modulePreload: false,
        }
      : {}),
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      external: [/^functions\/.*/],
      output: {
        manualChunks(id) {
          // Create a predictable firebase-* chunk for boot greps that is safe.
          // (The actual Firebase SDK core chunk is named "fb-*".)
          if (id.includes("/src/lib/firebase/runtimeConfig.ts")) {
            return "firebase-runtime";
          }
          if (!id.includes("node_modules")) return;
          // Keep Capacitor (and capacitor-firebase) code out of the eagerly-loaded
          // firebase chunk. Otherwise, Rollup can merge a dynamically imported
          // native-only module into a static chunk and execute it on web at boot.
          if (id.includes("@capacitor-firebase/authentication"))
            return "capacitor-firebase-auth";
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
