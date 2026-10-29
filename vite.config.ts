import { defineConfig } from "vite-plus";
import fenceFile from "./lint-fence.json" with { type: "json" };

// Files that run only on Node. Everything else in a package's src must also run on Bun and Workers.
const nodeOnly = [
  "packages/mcp/src/cli.ts",
  "packages/mcp/src/config.ts",
  "packages/mcp/src/node.ts",
  "packages/mcp/src/node-http.ts",
  "packages/mcp/src/public-fetch.ts",
  "packages/mcp/src/workflow/files-dir.ts",
];

// Files with old hits of a rule keep them; every other file gets the rule. scripts/slop/fence.ts records the
// hits per file and, from the pre-commit hook, fails when a fenced file gains one. LINT_FENCE=off lints
// without the fence.
const fence: Readonly<Record<string, Readonly<Record<string, number>>>> = fenceFile;
const fenced =
  process.env.LINT_FENCE === "off"
    ? []
    : Object.entries(fence).map(([rule, files]) => ({
        files: Object.keys(files),
        rules: { [rule]: "off" as const },
      }));

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: [
      "spec/redmine-openapi/**",
      ".audit/arena/**",
      "scripts/slop/fixtures/**",
      "lint-fence.json",
    ],
  },
  lint: {
    ignorePatterns: [".audit/**", "scripts/slop/fixtures/**"],
    plugins: ["eslint", "typescript", "unicorn", "oxc", "import", "vitest"],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "slop", specifier: "./scripts/slop/plugin.ts" },
    ],
    categories: { correctness: "error" },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      // Vitest takes a message as expect's second argument; the rule follows Jest, where it does not.
      "vitest/valid-expect": "off",
      "typescript/no-unnecessary-type-assertion": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-misused-promises": "error",
      "slop/no-non-null-assertion": "error",
      "slop/no-structured-content-cast": "error",
      "slop/no-type-assertion": "error",
      "slop/bounded-test-loop": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/sdk/src/**", "**/mcp/src/**"],
              message:
                "Import another package through its entry, @redmine-ts/sdk or @redmine-ts/sdk/catalog, not its source.",
            },
          ],
        },
      ],
    },
    overrides: [
      {
        files: ["packages/sdk/src/**", "packages/mcp/src/**"],
        rules: { "import/no-nodejs-modules": "error" },
      },
      { files: nodeOnly, rules: { "import/no-nodejs-modules": "off" } },
      ...fenced,
    ],
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: true,
    // Tasks rather than package.json scripts: `cache: true` would replay a script's output on a
    // second run and skip its side effects, such as the version bump or the publish.
    tasks: {
      changeset: { command: "changeset", cache: false },
      // changeset version leaves trailing spaces in multi-paragraph entries, which vp check rejects.
      "version-packages": { command: "changeset version && vp fmt", cache: false },
      release: { command: "vp run -r build && changeset publish", cache: false },
    },
  },
});
