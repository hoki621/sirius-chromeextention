import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";

test("trial packaging refuses dirty sources and includes only allowlisted built files with provenance", () => {
  const root = mkdtempSync(join(tmpdir(), "sirius-package-test-"));
  const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    mkdirSync(join(root, "scripts"));
    copyFileSync(new URL("../scripts/package.mjs", import.meta.url), join(root, "scripts/package.mjs"));
    writeFileSync(join(root, ".gitignore"), "dist/\nreleases/\n");
    writeFileSync(join(root, "scripts/build.mjs"), `import {mkdirSync,writeFileSync} from 'node:fs';
mkdirSync('dist',{recursive:true});
writeFileSync('dist/manifest.json',JSON.stringify({version:'0.1.0'}));
writeFileSync('dist/content.js','// synthetic bundle');
writeFileSync('dist/private.log','must never be packaged');`);
    run("git", ["init", "-q"]);
    run("git", ["add", "."]);
    run("git", ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
    const output = run(process.execPath, ["scripts/package.mjs"]);
    const metadata = JSON.parse(readFileSync(join(output, "build.json"), "utf8"));
    assert.equal(metadata.commit, run("git", ["rev-parse", "HEAD"]));
    assert.equal(metadata.status, "trial-not-approved-for-publication");
    const archive = join(output, metadata.filename);
    assert.equal(metadata.sha256, createHash("sha256").update(readFileSync(archive)).digest("hex"));
    assert.deepEqual(run("unzip", ["-Z1", archive]).split("\n"), ["content.js", "manifest.json"]);
    assert.notEqual(run(process.execPath, ["scripts/package.mjs"]), output, "never overwrite a previous artifact");
    writeFileSync(join(root, "untracked.txt"), "pending work");
    assert.throws(() => run(process.execPath, ["scripts/package.mjs"]), /Commit all source changes/);
    run("git", ["add", "untracked.txt"]);
    assert.throws(() => run(process.execPath, ["scripts/package.mjs"]), /Commit all source changes/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
