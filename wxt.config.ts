import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type WxtViteConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-solid"],
  srcDir: "src",
  outDirTemplate: "{{browser}}-mv{{manifestVersion}}{{modeSuffix}}",
  vite: () =>
    ({
      plugins: [tailwindcss()],
    }) as WxtViteConfig,
  manifestVersion: 3,
  targetBrowsers: ["chrome", "firefox"],
  manifest: {
    permissions: ["storage", "tabs", "scripting"],
    host_permissions: ["https://www.nicovideo.jp/watch/*", "https://nvapi.nicovideo.jp/*"],
  },
});
