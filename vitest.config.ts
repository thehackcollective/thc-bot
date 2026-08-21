import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests only: these cover the pure parsing/normalization helpers that break
    // silently when Luma changes a meta tag or wacli renames a field. No network, no DB.
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
