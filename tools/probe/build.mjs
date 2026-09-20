import { mkdir, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../../", import.meta.url);
await mkdir(new URL("probe-dist/", root), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("tools/probe/content.ts", root))],
  outfile: fileURLToPath(new URL("probe-dist/probe.js", root)),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
});
await copyFile(new URL("tools/probe/manifest.json", root), new URL("probe-dist/manifest.json", root));
