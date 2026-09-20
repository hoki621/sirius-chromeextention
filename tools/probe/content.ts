import { isSiriusPortal } from "../../src/scope.ts";
import { courseIdFromLink, runProbe } from "./report.ts";

if (isSiriusPortal(location.href, window.self === window.top) && !document.getElementById("sirius-api-probe")) {
  const host = document.createElement("aside");
  host.id = "sirius-api-probe";
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { position:fixed; right:12px; bottom:12px; z-index:2147483647; width:min(440px, calc(100vw - 24px)); }
    section { padding:16px; border:2px solid #365e87; border-radius:10px; color:#152334; background:white; font:14px/1.5 system-ui; box-shadow:0 4px 20px #0003; }
    h2 { margin:0 0 8px; font-size:17px; } p { margin:8px 0; }
    button { font:inherit; padding:6px 12px; margin-right:8px; cursor:pointer; }
    textarea { display:block; box-sizing:border-box; width:100%; height:240px; margin-top:10px; font:12px/1.4 monospace; }
  `;
  const panel = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = "Sirius API診断（開発用）";
  const description = document.createElement("p");
  description.textContent = "1回だけ、科目一覧と表示中の最大2科目の課題・小テストを読み取ります。値は表示せず、HTTP状態と項目の型だけを表示します。保存・外部送信・提出は行いません。";
  const start = document.createElement("button");
  start.type = "button";
  start.textContent = "読み取り診断を実行";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.addEventListener("click", () => host.remove());
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const output = document.createElement("textarea");
  output.readOnly = true;
  output.setAttribute("aria-label", "値を除去したAPI診断結果");
  output.placeholder = "診断後、ここに結果が表示されます。";
  start.addEventListener("click", async () => {
    start.disabled = true;
    close.disabled = true;
    status.textContent = "読み取り中…（最大5リクエスト、1件あたり15秒）";
    const ids = Array.from(document.querySelectorAll<HTMLAnchorElement>("#linkNav a[href]"))
      .map(a => courseIdFromLink(a.href)).filter((id): id is string => id !== null);
    try {
      output.value = JSON.stringify({ probeVersion: 1, evidence: "shape-only; not an anonymized response fixture", requests: await runProbe(ids) }, null, 2);
      status.textContent = "診断が終わりました。結果を選択してコピーできます。実データの値は含みません。";
    } catch {
      status.textContent = "診断を完了できませんでした。個人情報を含むエラー詳細は表示しません。";
    } finally {
      close.disabled = false;
    }
  }, { once: true });
  panel.append(heading, description, start, close, status, output);
  root.append(style, panel);
  document.body.append(host);
}
