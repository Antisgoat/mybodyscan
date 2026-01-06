import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
    chunkSizeWarningLimit: 1800,
    rollupOptions: {
      external: [/^functions\/.*/],
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          // Keep Capacitor (and capacitor-firebase) code out of the eagerly-loaded
          // firebase chunk. Otherwise, Rollup can merge a dynamically imported
          // native-only module into a static chunk and execute it on web at boot.
          if (id.includes("@capacitor-firebase/authentication"))
            return "capacitor-firebase-auth";
          if (id.includes("@capacitor-firebase")) return "capacitor-firebase";
          if (id.includes("@capacitor/")) return "capacitor";
          if (id.includes("firebase")) return "firebase";
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
