import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // E2E tests need longer timeouts (VM startup ~5s, operations can take time)
    testTimeout: 60000,
    hookTimeout: 30000,

    // Run tests sequentially to avoid resource conflicts
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Only run e2e tests (not unit tests if we add them later)
    include: ["src/__tests__/**/*.test.ts"],

    // Show verbose output for debugging
    reporters: ["verbose"],
  },
});
