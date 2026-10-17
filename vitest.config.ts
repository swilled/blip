import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each workspace is its own project; the voice workstream's apps/* folder is picked up by glob.
    projects: ["packages/*", "apps/*", "tools/*", "dev/*"],
    passWithNoTests: true,
    testTimeout: 15000,
  },
});
