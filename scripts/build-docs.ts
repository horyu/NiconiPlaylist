import { copyFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const outputDir = join(import.meta.dir, "..", "docs");
const sourceDir = join(import.meta.dir, "..", "src", "docs");

await rm(outputDir, {
  force: true,
  recursive: true,
});

await mkdir(outputDir, {
  recursive: true,
});

const result = await Bun.build({
  entrypoints: [join(sourceDir, "main.ts")],
  format: "esm",
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

await copyFile(join(sourceDir, "index.html"), join(outputDir, "index.html"));
