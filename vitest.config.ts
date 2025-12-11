import path from "path";
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/**/*.{test,spec}.{ts,tsx}',
      'src/**/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: [
      'node_modules/**',
      'functions/**',
      'tests/**',
      'e2e/**',
      'dist/**',
      'build/**',
      '.{git,github,husky,vscode}/**',
    ],
    environment: 'node',
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
