import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  fmt: {
    sortImports: {
      groups: [["builtin"], ["external"], ["internal"], ["parent", "sibling", "index"], ["style"]],
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["promise"],
    env: {
      builtin: true,
      browser: true,
      webextensions: true,
    },
  },
});
