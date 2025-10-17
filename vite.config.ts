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
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@sentry/react": path.resolve(__dirname, "./src/lib/sentry-fallback.ts"),
    },
    dedupe: ["react", "react-dom"],
  },
  test: {
    exclude: [
      'e2e/**',
      'tests/e2e/**',
      'tests/rules/**',
      'node_modules/**',
      'dist/**'
    ],
  },
  build: {
    rollupOptions: {
      external: [/^functions\/.*/],
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase/auth")) {
              return "auth";
            }
            if (/firebase[\\/](firestore|functions|storage|app-check)/.test(id)) {
              return "firebase";
            }
            if (id.includes("@tanstack/react-query")) {
              return "react-query";
            }
            if (id.includes("react-router-dom") || id.includes("react-dom") || id.includes("react/jsx-runtime")) {
              return "react";
            }
            if (id.includes("lucide-react")) {
              return "icons";
            }
            if (id.includes("@radix-ui")) {
              return "radix";
            }

            const normalized = id.replace(/\\/g, "/");
            const nodeModulesIndex = normalized.indexOf("node_modules/");
            if (nodeModulesIndex !== -1) {
              const pathAfterNodeModules = normalized.slice(nodeModulesIndex + "node_modules/".length);
              const [maybeScope, maybeName] = pathAfterNodeModules.split("/");
              let chunkName = maybeScope;
              if (chunkName?.startsWith("@") && typeof maybeName === "string") {
                chunkName = `${chunkName}-${maybeName}`;
              }
              if (!chunkName || chunkName === ".") {
                return "vendor";
              }
              const safeName = chunkName.replace(/[^a-zA-Z0-9_-]/g, "_");
              return `pkg-${safeName}`;
            }

            return "vendor";
          }

          if (id.includes("src/pages/Coach")) {
            return "coach";
          }
          if (id.includes("src/pages/Meals")) {
            return "meals";
          }
          if (id.includes("src/pages/Workouts")) {
            return "workouts";
          }
          if (id.includes("src/pages/Scan")) {
            return "scan";
          }

          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
}));
