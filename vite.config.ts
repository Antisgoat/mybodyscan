import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Force a single top-level copy of Firebase internals at bundle time.
// This prevents WKWebView crashes like:
// "@firebase/auth INTERNAL ASSERTION FAILED: Expected a class definition"
function safeResolve(specifier: string): string | null {
  // Some @firebase/* packages intentionally do not expose a default export entry
  // for Node resolution (via "exports"). Only alias what we can resolve.
  try {
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

const firebaseInternalAliases: Record<string, string> = Object.fromEntries(
  [
    // Core
    "@firebase/app",
    "@firebase/component",
    "@firebase/logger",
    "@firebase/util",
    "@firebase/installations",
    // Products
    "@firebase/auth",
    "@firebase/analytics",
    "@firebase/firestore",
    "@firebase/functions",
    "@firebase/storage",
    // Note: @firebase/webchannel-wrapper cannot be require.resolve'd under ESM
    // in some Node versions due to its "exports" shape. We rely on dedupe for it.
  ]
    .map((pkg) => [pkg, safeResolve(pkg)] as const)
    .filter(([, resolved]) => Boolean(resolved))
    .map(([pkg, resolved]) => [pkg, resolved!] as const)
);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: "/",
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...firebaseInternalAliases,
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
    // IMPORTANT: Capacitor uses the same `dist/` as web, but iOS WKWebView boot is
    // extremely sensitive to pulling in web auth code. Disable HTML modulepreload
    // injection so `firebase-auth-*` is never preloaded at native boot.
    modulePreload: false,
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
}));
