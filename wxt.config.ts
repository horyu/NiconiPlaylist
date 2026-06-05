import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-solid"],
  srcDir: "src",
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifestVersion: 3,
  targetBrowsers: ["chrome", "firefox"],
  manifest: ({ browser }) => ({
    permissions: [
      "storage",
      "tabs",
      "scripting",
      ...(browser === "firefox"
        ? ["webRequest", "webRequestBlocking"]
        : ["declarativeNetRequestWithHostAccess"]),
    ],
    host_permissions: ["https://www.nicovideo.jp/watch/*", "https://nvapi.nicovideo.jp/*"],
  }),
});
