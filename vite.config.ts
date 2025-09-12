import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
      // Force rollup to use WASM version to avoid native binary issues
      "rollup": "@rollup/wasm-node",
    },
    dedupe: ["react", "react-dom"],
  },
  // Explicitly configure esbuild for better compatibility
  esbuild: {
    target: 'esnext',
  },
}));
