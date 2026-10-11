// Bundles src/ into dist/ (the folder you load in chrome://extensions). `--watch` rebuilds on change.
import * as esbuild from "esbuild";
import { cp, rm } from "node:fs/promises";

const watch = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await cp("public", "dist", { recursive: true });

const context = await esbuild.context({
  entryPoints: {
    page: "src/page/index.js",
    content: "src/content/index.js",
    background: "src/background/index.js",
    sidepanel: "src/sidepanel/index.js",
  },
  bundle: true,
  format: "iife",
  target: "chrome116",
  outdir: "dist",
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) await context.watch();
else {
  await context.rebuild();
  await context.dispose();
}
