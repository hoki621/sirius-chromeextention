import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);

test("built package has minimal MV3 permissions and no runtime dependencies", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", root))]);
  assert.deepEqual(readdirSync(new URL("dist/", root)).sort(), ["CREDITS.md", "content.js", "icon.png", "icon128.png", "manifest.json", "popup.html", "popup.js"]);
  const manifest = JSON.parse(readFileSync(new URL("dist/manifest.json", root), "utf8"));
  const pkg = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, pkg.version);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.background, undefined);
  assert.deepEqual(manifest.action, { default_title: "Siriusの課題一覧を開く", default_popup: "popup.html", default_icon: "icon.png" });
  const icon = readFileSync(new URL("dist/icon.png", root));
  assert.equal(icon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(icon.readUInt32BE(16), 32); assert.equal(icon.readUInt32BE(20), 32);
  assert.deepEqual(manifest.icons, { "32": "icon.png", "128": "icon128.png" });
  const storeIcon = readFileSync(new URL("dist/icon128.png", root));
  assert.equal(storeIcon.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(storeIcon.readUInt32BE(16), 128); assert.equal(storeIcon.readUInt32BE(20), 128);
  assert.equal(manifest.web_accessible_resources, undefined);
  assert.equal(pkg.dependencies, undefined);
  const bundled = readFileSync(new URL("dist/content.js", root), "utf8");
  assert.doesNotMatch(bundled, /sirius-preview-settings|installMockStorage|読み取り診断を実行/);
  assert.doesNotMatch(bundled, /学習リストを開く/);
  const panelSource = readFileSync(new URL("src/panel.ts", root), "utf8");
  assert.doesNotMatch(panelSource, /使い方・制限|参考プロジェクト|Comfortable PandA/);
  assert.doesNotMatch(bundled, /pages\.json/);
  assert.match(panelSource, /拡張の保存データを削除/);
  const popup = readFileSync(new URL("dist/popup.js", root), "utf8");
  assert.doesNotMatch(popup, /fetch\(|cookies|storage/);
  assert.doesNotMatch(readFileSync(new URL("dist/popup.html", root), "utf8"), /(?:src|href)=["']https?:\/\/(?!lms\.sirius\.tuat\.ac\.jp)/);
  assert.match(readFileSync(new URL("dist/CREDITS.md", root), "utf8"), /Comfortable PandA/);
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
