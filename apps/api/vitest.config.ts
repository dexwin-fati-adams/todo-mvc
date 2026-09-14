import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    // Vitest's default include pattern (**/*.{test,spec}.?(c|m)[jt]s?(x))
    // would otherwise also pick up todos.api.spec.ts, which is a
    // Playwright spec (imports from "@playwright/test", not "vitest").
    exclude: ["**/node_modules/**", "**/dist/**", "**/*.api.spec.ts"],
  },
});
