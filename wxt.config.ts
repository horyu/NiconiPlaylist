import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-solid"],
  srcDir: "src",
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  manifestVersion: 3,
  targetBrowsers: ["chrome", "firefox"],
  manifest: {
    permissions: ["storage"],
    host_permissions: ["https://www.nicovideo.jp/watch/*", "https://nvapi.nicovideo.jp/*"],
  },
});
