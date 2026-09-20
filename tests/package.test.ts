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
  const bundled = readFileSync(new URL("dist/content.js", root), "utf8");
  assert.doesNotMatch(bundled, /sirius-preview-settings|installMockStorage|読み取り診断を実行/);
  assert.deepEqual(manifest.content_scripts, [{
    matches: [
      "https://lms.sirius.tuat.ac.jp/portal",
      "https://lms.sirius.tuat.ac.jp/portal?*",
      "https://lms.sirius.tuat.ac.jp/portal/*",
    ],
    js: ["content.js"], run_at: "document_idle", world: "ISOLATED", all_frames: false,
  }]);
});

test("entry checks DOM only in scope and does not request data on unrecognized/login pages", () => {
  const code = readFileSync(new URL("dist/content.js", root), "utf8");
  for (const [href, topFrame, expected] of [
    ["https://lms.sirius.tuat.ac.jp/portal", true, 1],
    ["https://lms.sirius.tuat.ac.jp/portal?lang=ja", true, 1],
    ["https://lms.sirius.tuat.ac.jp/portal-other", true, 0],
    ["https://example.com/portal", true, 0],
    ["https://lms.sirius.tuat.ac.jp/portal", false, 0],
  ] as const) {
    const self = {};
    let queries = 0;
    runInNewContext(code, {
      URL,
      window: { location: { href }, self, top: topFrame ? self : {}, addEventListener: () => {} },
      document: { querySelector: () => { queries++; return null; }, querySelectorAll: () => [] },
    });
    assert.equal(queries, expected, `${href}, top=${topFrame}`);
  }
});

test("unsafe insertion locations, missing identity and duplicate roots leave official DOM untouched", () => {
  const code = readFileSync(new URL("dist/content.js", root), "utf8");
  const self = {};
  for (const scenario of ["form", "anonymous", "duplicate"] as const) {
    runInNewContext(code, {
      URL,
      window: { location: { href: "https://lms.sirius.tuat.ac.jp/portal" }, self, top: self, addEventListener: () => {} },
      document: {
        querySelector: () => ({ closest: () => scenario === "form" ? {} : null }),
        querySelectorAll: () => scenario === "anonymous" ? [] : [{ href: "https://lms.sirius.tuat.ac.jp/portal/site/%7Esample-user" }],
        getElementById: () => scenario === "duplicate" ? {} : null,
        createElement: () => { throw Error("Must not mutate unknown/unsafe DOM"); },
      },
    });
  }
});

test("back/forward restoration rechecks the page without background fetching", () => {
  const code = readFileSync(new URL("dist/content.js", root), "utf8");
  const self = {};
  let pageshow: ((event: { persisted: boolean }) => void) | undefined, queries = 0;
  runInNewContext(code, {
    URL,
    window: { location: { href: "https://lms.sirius.tuat.ac.jp/portal" }, self, top: self,
      addEventListener: (name: string, callback: typeof pageshow) => { if (name === "pageshow") pageshow = callback; } },
    document: { querySelector: () => { queries++; return null; }, querySelectorAll: () => [] },
  });
  assert.equal(queries, 1); pageshow?.({ persisted: false }); assert.equal(queries, 1);
  pageshow?.({ persisted: true }); assert.equal(queries, 2);
});
