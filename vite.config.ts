import { fileURLToPath, URL } from "node:url";

import e18e from "@e18e/eslint-plugin";
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

const tailwindCssRules = {
  "tailwindcss/no-unknown-classes": "error",
  "tailwindcss/no-duplicate-classes": "error",
  "tailwindcss/no-conflicting-classes": "error",
  "tailwindcss/no-deprecated-classes": "error",
  "tailwindcss/no-unnecessary-whitespace": "error",
  "tailwindcss/no-dark-without-light": "warn",
  "tailwindcss/no-contradicting-variants": "warn",
  "tailwindcss/enforce-canonical": "warn",
  "tailwindcss/enforce-sort-order": "warn",
  "tailwindcss/enforce-shorthand": "warn",
  "tailwindcss/enforce-logical": "off",
  "tailwindcss/enforce-physical": "off",
  "tailwindcss/enforce-consistent-important-position": "warn",
  "tailwindcss/enforce-negative-arbitrary-values": "warn",
  "tailwindcss/enforce-consistent-variable-syntax": "warn",
  "tailwindcss/consistent-variant-order": "warn",
  "tailwindcss/max-class-count": "off",
  "tailwindcss/enforce-consistent-line-wrapping": "off",
  "tailwindcss/no-restricted-classes": "off",
  "tailwindcss/no-arbitrary-value": "off",
  "tailwindcss/no-hardcoded-colors": "warn",
  "tailwindcss/no-unnecessary-arbitrary-value": "warn",
  "tailwindcss/prefer-theme-tokens": "off",
} as const;

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
    jsPlugins: ["@e18e/eslint-plugin", "eslint-plugin-solid", "oxlint-tailwindcss"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["promise"],
    rules: {
      ...e18e.configs.recommended.rules,
      ...solidTypeScriptErrorRules,
      ...tailwindCssRules,
    },
    settings: {
      tailwindcss: {
        entryPoint: "src/entrypoints/popup/style.css",
      },
    },
    env: {
      builtin: true,
      browser: true,
      webextensions: true,
    },
  },
});
