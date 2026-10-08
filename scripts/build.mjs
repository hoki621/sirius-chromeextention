import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (manifest.version !== pkg.version) throw new Error("Manifest/package version mismatch");

await mkdir(new URL("dist/", root), { recursive: true });
await build({
  entryPoints: ["content", "popup"].map(name => fileURLToPath(new URL(`src/${name}.ts`, root))),
  outdir: fileURLToPath(new URL("dist/", root)),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  logLevel: "info",
});
await copyFile(new URL("manifest.json", root), new URL("dist/manifest.json", root));
await copyFile(new URL("popup.html", root), new URL("dist/popup.html", root));
await copyFile(new URL("CREDITS.md", root), new URL("dist/CREDITS.md", root));
// Original 32px S glyph, not an upstream logo. Inline PNG avoids an image-build dependency.
await writeFile(new URL("dist/icon.png", root), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAVklEQVR4nO3WywkAIAxEwdys0YKsWzuQbJT44S3sSYhzMWiltn6yBgDA7HBXAEiAyBAFDyANEH6GADwYNQDCgJV6MQD+3YTvAjxD1MzuAHD3rxgAgIwOcU/F2DBKQAIAAAAASUVORK5CYII=", "base64"));
// Same S glyph at 3x resolution, with transparent 16px padding for the store icon.
await writeFile(new URL("dist/icon128.png", root), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAABXUlEQVR4nO3SwQ3DQAwDQf9cYwpK3c4/PyM4UznOAmxAmuOQJEmSJEmSJEmSJEn66ny9L8st/X8AAMgfoXnp/wMAQP4IzUv/HwAA8kdoXvr/AACQP0Lz0v8HAID8EZqX/j8AAOSP0Lz0/wEAIH+E5qX/vwTArgEAAAAAAAAAAAAAAAAAAAAAAAAAVAGYfMwJaAFYdCgAAAAAAAAAAAAAAAAAAAAAAAAAgH9f+v8AAAAAAAAAAAAAAAAAAAAAAAAAAD9t1wAAAAAAAAAAAAAAAAAAAAAAAAAAANhgKSTp/wMAQP74EwZA+QAoHwDlA6B8AJQPgPIBMPxQAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAzgyWNOa8Wt0v8H4EYAAAAAAAAAAAAAAAAAAAAAAACAAWAAGAAGgAFgABgABoABYAAYAAaAAWAAGAAGgAFgcwBIkiRJkiRJkiRJkqRxfQDdI/TqMj+MLQAAAABJRU5ErkJggg==", "base64"));
