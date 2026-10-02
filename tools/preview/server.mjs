import { createServer } from "node:http";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sirius UI preview — synthetic data only</title>
<style>body{font:16px system-ui;margin:16px;background:#e2e8f0}main{padding:16px;background:white}input,button{font:inherit;padding:8px}#requests{overflow-wrap:anywhere}</style>
<h1>ローカル検証用・架空データ</h1><p id="requests"></p><button id="preview-open" type="button">ツールバー起動を模擬</button><nav id="linkNav"><a href="https://lms.sirius.tuat.ac.jp/portal/site/%7Edemo-user">架空ホーム</a></nav>
<main id="content"><h2>公式画面を模した領域</h2><form id="official-form"><label>入力保持テスト <input name="answer"></label><button>ローカル操作</button></form><p id="official-result"></p><button id="switch-account" type="button">アカウント変更を模擬</button><button id="expire-session" type="button">次回401を模擬</button></main><script src="/preview.js"></script></html>`;
createServer(async (req, res) => {
  if (req.url === "/narrow") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end('<!doctype html><meta charset="utf-8"><title>360px layout preview</title><p>架空データ・幅360pxのレイアウト検証（ブラウザズーム検証ではありません）</p><iframe title="360px preview" style="width:360px;height:800px;border:0" src="/?open=1"></iframe>');
  } else if (req.url === "/preview.js") {
    try {
      const result = await build({ entryPoints: [fileURLToPath(new URL("index.ts", import.meta.url))], bundle: true, format: "iife", target: "es2022", write: false });
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" }); res.end(result.outputFiles[0].text);
    } catch { res.writeHead(500); res.end("Preview build failed"); }
  } else { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(html); }
}).listen(4173, "127.0.0.1", () => console.log("Synthetic preview: http://127.0.0.1:4173/"));
