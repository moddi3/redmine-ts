import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Several suites share a machine at load averages up to 60, where Vitest's 5-second default fails tests that pass alone.
const unitTimeoutMs = 20_000;
// Takes the machine-wide lock on the Docker Redmines that the contract suites share.
const contractLock = fileURLToPath(new URL("../../scripts/contract-lock.ts", import.meta.url));

export default defineConfig({
  pack: {
    entry: ["src/index.ts", "src/catalog.ts"],
    dts: {
      generator: "tsgo",
    },
    exports: true,
    publint: { level: "error" },
    attw: { profile: "esm-only", level: "error" },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts", "tests/generator/**/*.test.ts"],
          testTimeout: unitTimeoutMs,
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
          globalSetup: [contractLock],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
