import { rm } from "node:fs/promises";
import { join } from "node:path";

const outputDir = join(import.meta.dir, "..", "docs");
const sourceHtmlPath = join(import.meta.dir, "..", "src", "docs", "index.html");

await rm(outputDir, {
  force: true,
  recursive: true,
});

const result = await Bun.build({
  entrypoints: [sourceHtmlPath],
  compile: true,
  minify: true,
  outdir: outputDir,
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }

  throw new Error("docs build failed.");
}
