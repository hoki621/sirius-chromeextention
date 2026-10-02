import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, encoding: "utf8" }).trim();
assert.equal(run("git", ["status", "--porcelain", "--untracked-files=normal"]), "", "Commit all source changes before packaging");
const commit = run("git", ["rev-parse", "HEAD"]);
run(process.execPath, ["scripts/build.mjs"]);
const { version } = JSON.parse(readFileSync(join(root, "dist/manifest.json"), "utf8"));
assert.match(version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
const files = ["CREDITS.md", "content.js", "icon.png", "manifest.json", "popup.html", "popup.js"];
const staging = mkdtempSync(join(tmpdir(), "sirius-package-"));
try {
  for (const file of files) copyFileSync(join(root, "dist", file), join(staging, file));
  const archive = join(staging, "trial.zip");
  run("zip", ["-X", "-q", archive, ...files], staging);
  assert.deepEqual(run("unzip", ["-Z1", archive]).split("\n").sort(), files);
  for (const file of files) {
    assert.deepEqual(execFileSync("unzip", ["-p", archive, file]), readFileSync(join(root, "dist", file)));
  }
  assert.equal(run("git", ["rev-parse", "HEAD"]), commit, "Commit changed during packaging");
  assert.equal(run("git", ["status", "--porcelain", "--untracked-files=normal"]), "", "Source changed during packaging");
  const directory = join(root, "releases");
  mkdirSync(directory, { recursive: true });
  const output = mkdtempSync(join(directory, `sirius-${version}-${commit.slice(0, 12)}-`));
  const filename = `sirius-${version}-trial.zip`;
  copyFileSync(archive, join(output, filename));
  writeFileSync(join(output, "build.json"), JSON.stringify({
    status: "trial-not-approved-for-publication", version, commit, filename, files,
    sha256: createHash("sha256").update(readFileSync(archive)).digest("hex"),
    node: process.version, createdAt: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log(output);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
