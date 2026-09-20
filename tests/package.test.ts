import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

test("diagnostic build stays separate and requests no extension API permissions", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("tools/probe/build.mjs", root))]);
  assert.deepEqual(readdirSync(new URL("probe-dist/", root)).sort(), ["manifest.json", "probe.js"]);
  const manifest = JSON.parse(readFileSync(new URL("probe-dist/manifest.json", root), "utf8"));
  assert.deepEqual(Object.keys(manifest).sort(), ["content_scripts", "description", "manifest_version", "name", "version"]);
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.content_scripts, [{
    matches: ["https://lms.sirius.tuat.ac.jp/portal", "https://lms.sirius.tuat.ac.jp/portal?*", "https://lms.sirius.tuat.ac.jp/portal/*"],
    js: ["probe.js"], run_at: "document_idle", world: "ISOLATED", all_frames: false,
  }]);
});

test("built package has minimal MV3 permissions and no runtime dependencies", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", root))]);
  assert.deepEqual(readdirSync(new URL("dist/", root)).sort(), ["content.js", "manifest.json"]);
  const manifest = JSON.parse(readFileSync(new URL("dist/manifest.json", root), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(pkg.dependencies, undefined);
  assert.deepEqual(manifest.content_scripts, [{
    matches: [
      "https://lms.sirius.tuat.ac.jp/portal",
      "https://lms.sirius.tuat.ac.jp/portal?*",
      "https://lms.sirius.tuat.ac.jp/portal/*",
    ],
    js: ["content.js"], run_at: "document_idle", world: "ISOLATED", all_frames: false,
  }]);
});

test("the built entry runs only in scope and performs no network, storage or DOM access", () => {
  const code = readFileSync(new URL("dist/content.js", root), "utf8");
  for (const [href, topFrame, expected] of [
    ["https://lms.sirius.tuat.ac.jp/portal", true, 1],
    ["https://lms.sirius.tuat.ac.jp/portal?lang=ja", true, 1],
    ["https://lms.sirius.tuat.ac.jp/portal-other", true, 0],
    ["https://example.com/portal", true, 0],
    ["https://lms.sirius.tuat.ac.jp/portal", false, 0],
  ] as const) {
    const self = {};
    const messages: string[] = [];
    runInNewContext(code, {
      URL,
      window: { location: { href }, self, top: topFrame ? self : {} },
      console: { debug: (message: string) => messages.push(message) },
    });
    assert.equal(messages.length, expected, `${href}, top=${topFrame}`);
  }
});
