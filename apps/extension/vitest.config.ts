import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts", "src/**/*.test.ts", "src/**/*.spec.ts"],
    passWithNoTests: true,
  },
});
