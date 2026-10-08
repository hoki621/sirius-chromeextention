import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("release gate rejects mismatched versions and commits outside main; publishing runs no build code", () => {
  const workflow = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
  const [build, release] = workflow.split("\n  release:\n");
  assert.ok(release, "separate publish job is required");
  assert.match(build!, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(build!, /contents: write|GH_TOKEN:/);
  assert.match(release, /needs: build/);
  assert.match(release, /contents: write/);
  assert.match(build!, /actions\/upload-artifact@[a-f0-9]{40}/);
  assert.match(release, /actions\/download-artifact@[a-f0-9]{40}/);
  assert.doesNotMatch(release, /actions\/checkout|\bnpm\b|\bnode\b|scripts\//);
  const match = build!.match(/      - name: Check release source\n        run: \|\n((?:          .+\n)+)/);
  assert.ok(match, "release source gate is required");
  const gate = match[1]!.replace(/^          /gm, "");
  const root = mkdtempSync(join(tmpdir(), "sirius-release-gate-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.2.6" }));
    git("add", ".");
    const commit = ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit"];
    git(...commit, "-qm", "main");
    const main = git("rev-parse", "HEAD");
    git("update-ref", "refs/remotes/origin/main", main);
    git(...commit, "--allow-empty", "-qm", "unmerged");
    const unmerged = git("rev-parse", "HEAD");
    for (const [sha, tag, allowed] of [[main, "v0.2.6", true], [main, "v9.9.9", false], [unmerged, "v0.2.6", false]] as const) {
      const result = spawnSync("bash", ["-e", "-c", gate], {
        cwd: root, env: { ...process.env, GITHUB_SHA: sha, GITHUB_REF_NAME: tag }, encoding: "utf8",
      });
      assert.ifError(result.error);
      assert.equal(result.status === 0, allowed, `${sha} / ${tag}: ${result.stderr}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
