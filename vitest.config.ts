import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "tests/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules/**",
      "functions/**",
      "tests/e2e/**",
      "tests/rules/**",
      "tests-e2e/**",
      "e2e/**",
      "dist/**",
      "build/**",
      ".{git,github,husky,vscode}/**",
    ],
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
