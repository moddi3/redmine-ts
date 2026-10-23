import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["spec/redmine-openapi/**", "research.md", ".audit/arena/**"],
  },
  lint: {
    ignorePatterns: [".audit/**"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
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
