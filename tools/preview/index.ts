// Development-only synthetic UI harness. Never bundled into dist/content.js.
import { mountPanel } from "../../src/panel.ts";
import { installMockStorage } from "./storage.ts";
const parameters = new URL(location.href).searchParams;
if (parameters.has("storage")) installMockStorage(parameters.get("storage")!, parameters.get("confirm") !== "cancel");
let scenario = new URL(location.href).searchParams.get("case") ?? "normal";
let requests = 0, active = 0, peak = 0;
const counter = document.getElementById("requests")!;
const paint = () => { counter.textContent = `Mock GET: ${requests}, in flight: ${active}, peak: ${peak}`; };
const day = 86_400_000;
const date = (offset: number) => ({ epochSecond: Math.floor((Date.now() + offset) / 1000), nano: 0 });
window.fetch = async function(this: unknown, input, options) {
  if (this !== window) throw new TypeError("Invalid fetch receiver");
  const url = new URL(String(input));
  if (url.origin !== "https://lms.sirius.tuat.ac.jp" || options?.method !== "GET") throw Error("Unexpected request");
  requests++; active++; peak = Math.max(peak, active); paint();
  try {
    await new Promise<void>((resolve, reject) => {
      const stop = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
      const timer = setTimeout(() => { options.signal?.removeEventListener("abort", stop); resolve(); }, 80);
      options.signal?.addEventListener("abort", stop, { once: true });
      if (options.signal?.aborted) stop();
    });
    if (scenario === "auth") return new Response("", { status: 401 });
    if (scenario === "html") return new Response("<html>unverified login</html>", { headers: { "content-type": "text/html" } });
    if (scenario === "rate") return new Response("", { status: 429, headers: { "retry-after": "60" } });
    if (url.pathname === "/direct/site.json") return Response.json({ site_collection: url.searchParams.get("_start") === "0" ? [
      { id: "demo-a", title: "情報工学（架空）", type: "project", published: true },
      { id: "demo-b", title: "物理学（架空）", type: "project", published: true },
    ] : [] });
    if (url.pathname.includes("/sam_pub/")) return Response.json({ sam_pub_collection: scenario === "partial" ? [{}] : [] });
    if (scenario === "partial" && url.pathname.includes("demo-b")) return new Response("", { status: 403 });
    if (scenario === "malformed") return Response.json({ unexpected: [] });
    const siteId = url.pathname.includes("demo-a") ? "demo-a" : "demo-b";
    return Response.json({ assignment_collection: scenario === "empty" ? [] : [
      { id: "one", context: siteId, title: "今日のレポート（架空）", dueTime: date(60_000) },
      { id: "two", context: siteId, title: "来週の演習（架空）", dueTime: date(3 * day) },
      { id: "three", context: siteId, title: "過去の課題（架空）", dueTime: date(-day) },
      { id: "four", context: siteId, title: '<img src=x onerror="alert(1)"> — 文字列表示テスト', dueTime: null },
    ] });
  } finally { active--; paint(); }
};
paint();
mountPanel(); mountPanel(); // Duplicate insertion must be harmless.
if (new URL(location.href).searchParams.has("open")) document.getElementById("sirius-study-helper")?.shadowRoot?.querySelector<HTMLButtonElement>(".launch")?.click();
document.getElementById("official-form")!.addEventListener("submit", event => { event.preventDefault(); document.getElementById("official-result")!.textContent = "ローカルフォームの操作を確認"; });
document.getElementById("switch-account")!.addEventListener("click", () => { (document.querySelector("nav a") as HTMLAnchorElement).href = "https://lms.sirius.tuat.ac.jp/portal/site/%7Edemo-other"; });
document.getElementById("expire-session")!.addEventListener("click", () => { scenario = "auth"; document.getElementById("official-result")!.textContent = "次の模擬GETは401"; });
