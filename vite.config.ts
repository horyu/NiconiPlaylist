import { fileURLToPath, URL } from "node:url";

import solid from "eslint-plugin-solid";
import { defineConfig } from "vite-plus";

const solidTypeScriptErrorRules = Object.fromEntries(
  Object.entries(solid.configs.typescript.rules).map(([ruleName, ruleConfig]) => {
    if (Array.isArray(ruleConfig)) {
      return [ruleName, ["error", ...ruleConfig.slice(1)]];
    }

    return [ruleName, "error"];
  }),
);

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
    ignorePatterns: ["docs/index.html"],
    sortImports: {
      groups: [["builtin"], ["external"], ["internal"], ["parent", "sibling", "index"], ["style"]],
    },
  },
  lint: {
    jsPlugins: ["eslint-plugin-solid"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["promise"],
    rules: {
      ...solidTypeScriptErrorRules,
    },
    env: {
      builtin: true,
      browser: true,
      webextensions: true,
    },
  },
});
