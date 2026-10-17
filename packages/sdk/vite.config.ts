import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      generator: "tsgo",
    },
    exports: true,
    publint: { level: "error" },
    attw: { profile: "esm-only", level: "error" },
  },
});
