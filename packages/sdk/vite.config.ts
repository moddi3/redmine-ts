import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

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
          testTimeout: 20_000,
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
