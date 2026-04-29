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
    jsPlugins: ["eslint-plugin-solid"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ["promise"],
    rules: {
      // https://github.com/solidjs-community/eslint-plugin-solid#rules
      "solid/components-return-once": "error",
      "solid/event-handlers": "error",
      "solid/imports": "error",
      "solid/jsx-no-duplicate-props": "error",
      "solid/jsx-no-script-url": "error",
      "solid/jsx-no-undef": "error",
      "solid/jsx-uses-vars": "error",
      "solid/no-destructure": "error",
      "solid/no-innerhtml": "error",
      "solid/no-react-deps": "error",
      "solid/no-react-specific-props": "error",
      "solid/no-unknown-namespaces": "error",
      "solid/prefer-for": "error",
      "solid/prefer-show": "error",
      "solid/reactivity": "error",
      "solid/self-closing-comp": "error",
      "solid/style-prop": "error",
    },
    env: {
      builtin: true,
      browser: true,
      webextensions: true,
    },
  },
});
