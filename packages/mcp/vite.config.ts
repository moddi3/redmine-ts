import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

// Tests run before the SDK is built (CI checks, then builds), so they read its source.
const sdk = (file: string): string => fileURLToPath(new URL(`../sdk/src/${file}`, import.meta.url));

export default defineConfig({
  pack: {
    // Without the paths to SDK source, so declarations import the built SDK instead of emitting its source.
    tsconfig: "tsconfig.build.json",
    entry: ["src/index.ts", "src/node.ts", "src/cli.ts"],
    dts: {
      generator: "tsgo",
    },
    // The command is redmine-mcp; without a name, tsdown names it after the package, mcp.
    exports: { exclude: ["cli"], bin: { "redmine-mcp": "./src/cli.ts" } },
    publint: { level: "error" },
    attw: { profile: "esm-only", level: "error" },
  },
  resolve: {
    alias: [
      { find: /^@redmine-ts\/sdk\/catalog$/, replacement: sdk("catalog.ts") },
      { find: /^@redmine-ts\/sdk$/, replacement: sdk("index.ts") },
    ],
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["tests/unit/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["tests/contract/**/*.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
