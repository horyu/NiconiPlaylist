import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
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
