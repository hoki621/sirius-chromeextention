import { ORIGIN, SiriusApi } from "./api.ts";
import type { Failure } from "./api.ts";
import { CACHE_MS, Loader } from "./loader.ts";
import { courseLink, formatDate, GROUPS, group, visibleItems } from "./model.ts";
import type { Filters } from "./model.ts";
import { applyPreferenceChange, DEFAULT_PREFS, deleteOwnedData, decodePreferences, PREF_KEY, readPreferences, savePreferences } from "./preferences.ts";
import type { StorageArea } from "./preferences.ts";

type Changes = Record<string, { newValue?: unknown }>;
type ChromeStorage = { local: StorageArea; onChanged: { addListener(callback: (changes: Changes, area: string) => void): void; removeListener(callback: (changes: Changes, area: string) => void): void } };
const ERRORS: Record<Failure, string> = {
  auth: "ログインが必要です。表示データを消去しました。公式画面でログインしてから更新してください。",
  forbidden: "閲覧権限がないため取得できませんでした。ログアウトとは判定していません。",
  "rate-limit": "アクセスが制限されました。再試行可能時刻までお待ちください。",
  http: "サーバーがエラーを返しました。", network: "通信に失敗しました（転送が拒否された場合も含みます）。",
  timeout: "15秒以内に取得できませんでした。", aborted: "取得を中止しました。",
  html: "JSON以外の応答です。表示データを消去しました。公式画面のログイン状態を確認してください。",
  json: "JSONを読み取れませんでした。", redirect: "転送された応答は読み取りません。", schema: "未対応の応答形式です。",
};
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; return node;
}
function button(text: string, action: () => void): HTMLButtonElement {
  const node = element("button", text); node.type = "button"; node.addEventListener("click", action); return node;
}
export function restoreFocus(container: ParentNode, previous: HTMLElement | null): void {
  if (!previous) return;
  const field = previous.dataset.item ? "item" : "scope", key = previous.dataset[field];
  if (!key) return;
  for (const target of container.querySelectorAll<HTMLElement>("[data-item],[data-scope]")) {
    if (target.dataset[field] === key && target.tagName === previous.tagName) { target.focus({ preventScroll: true }); return; }
  }
}
export function accountMarker(): string | null {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("nav#linkNav a[href]")) {
    try {
      const url = new URL(link.href);
      if (url.origin === ORIGIN && /^\/portal\/site\/~[A-Za-z0-9_-]+\/?$/.test(decodeURIComponent(url.pathname))) return decodeURIComponent(url.pathname);
    } catch { /* Malformed links cannot identify a session. */ }
  }
  return null;
}
export function mountPanel(): void {
  const main = document.querySelector("main#content"), marker = accountMarker();
  if (!main || main.closest("form") || !marker || document.getElementById("sirius-study-helper")) return;
  const host = element("section"); host.id = "sirius-study-helper";
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style", `
    :host{all:initial;display:block;font:16px/1.5 system-ui,sans-serif;color:#172b3a;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit}button,input,select{border:1px solid #64748b;border-radius:6px;padding:8px;background:white;color:#172b3a}
    button{cursor:pointer}button:disabled{cursor:default;opacity:.6}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #2563eb;outline-offset:2px}
    .launch{margin:8px 16px;background:#075985;color:white;font-weight:600}
    dialog{font:16px/1.5 system-ui,sans-serif;color:#172b3a;border:1px solid #94a3b8;border-radius:12px;padding:20px;width:min(900px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:#f8fafc}
    dialog::backdrop{background:#0f172a88}h2{font-size:1.35em;margin:0}h3{font-size:1.1em;margin:20px 0 8px}p{margin:8px 0}header,.actions,.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}
    label{display:flex;gap:6px;align-items:center}label.field{display:grid;flex:1 1 160px}input[type=search],select{width:100%;min-width:0}input[type=checkbox]{width:20px;height:20px;flex-shrink:0}
    a{color:#075985;text-decoration:underline}.note{font-size:.875em;color:#334155}.warning{padding:10px;border-left:4px solid #b45309;background:#fff7ed}ul{list-style:none;padding:0}li{margin:8px 0;padding:12px;background:white;border:1px solid #cbd5e1;border-radius:8px;overflow-wrap:anywhere}.title{font-weight:650}.meta{font-size:.9em;color:#334155}details{margin:12px 0}summary{cursor:pointer}.empty{padding:20px;background:white;border:1px dashed #94a3b8}
    @media(max-width:480px){dialog{padding:12px}.actions{width:100%}.actions button{flex:1}header{align-items:start}}
  `);
  const dialog = element("dialog"); dialog.setAttribute("aria-labelledby", "sirius-heading");
  dialog.addEventListener("keydown", event => event.stopPropagation());
  const heading = element("h2", "Sirius 学習リスト（試用版）"); heading.id = "sirius-heading";
  const header = element("header"), actions = element("div"); actions.className = "actions";
  const status = element("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const warning = element("div"); warning.className = "warning";
  const list = element("div"), scopes = element("details"), scopeRows = element("ul");
  const storageNote = element("p"); storageNote.className = "note"; storageNote.setAttribute("role", "status");
  const filters: Filters = { search: "", site: "", ...DEFAULT_PREFS };
  const completed = new Set<string>();
  const storage = (globalThis as typeof globalThis & { chrome?: { storage?: ChromeStorage } }).chrome?.storage;
  let destroyed = false, timer: ReturnType<typeof setInterval> | undefined, preferenceRevision = 0;
  let writes = Promise.resolve();
  const loader = new Loader(new SiriusApi(), () => { if (!destroyed) render(); });
  const launch = button("学習リストを開く", () => {
    if (!checkIdentity()) return;
    dialog.showModal(); search.focus(); render(); void loader.refresh();
    timer ??= setInterval(() => { if (checkIdentity() && dialog.open) render(); }, 30_000);
  });
  launch.className = "launch";
  const refresh = button("更新", () => { if (checkIdentity()) void loader.refresh(true); });
  const close = button("閉じる", () => dialog.close());
  actions.append(refresh, close); header.append(heading, actions);
  const notice = element("p", "非公式の読み取り専用一覧です。提出・受験は必ず公式画面で行ってください。小テストの非空データと全科目の網羅性は未検証です。"); notice.className = "warning";
  const localNote = element("p", "完了チェックは「自分のリストで完了」の印で、提出済みを意味しません。アカウント識別が未検証のため、このページ内だけで保持し、再読み込み・移動で消えます。"); localNote.className = "note";
  const filterRow = element("div"); filterRow.className = "filters";
  const search = element("input"); search.type = "search"; search.placeholder = "課題タイトル";
  const site = element("select"), kind = element("select");
  for (const [value, text] of [["", "すべて"], ["assignment", "課題"], ["quiz", "小テスト"]]) { const option = element("option", text); option.value = value!; kind.append(option); }
  for (const [text, input] of [["検索", search], ["科目・サイト", site], ["種類", kind]] as const) { const label = element("label", text); label.className = "field"; label.append(input); filterRow.append(label); }
  const showCompleted = element("input"); showCompleted.type = "checkbox";
  const completedLabel = element("label", "自分のリストで完了した項目も表示"); completedLabel.prepend(showCompleted);
  search.addEventListener("input", () => { filters.search = search.value; renderList(); });
  site.addEventListener("change", () => { filters.site = site.value; renderList(); });
  kind.addEventListener("change", () => { filters.kind = kind.value; persist(); renderList(); });
  showCompleted.addEventListener("change", () => { filters.showCompleted = showCompleted.checked; persist(); renderList(); });
  const erase = button("拡張の保存データを削除", () => {
    if (!window.confirm("この拡張の保存データと、開いている対応版の各タブの完了チェック・絞り込みを削除します。LMSのデータは変更しません。")) return;
    preferenceRevision++;
    applyPreferenceChange(filters, completed, undefined); search.value = ""; syncControls(); render();
    writes = writes.then(async () => {
      try { if (storage) await deleteOwnedData(storage.local); storageNote.textContent = "拡張の保存データを削除しました。"; }
      catch { storageNote.textContent = "保存データを削除できませんでした。Chromeの拡張管理画面から削除してください。"; }
    });
  });
  scopes.append(element("summary", "取得範囲・科目別の結果"), scopeRows);
  dialog.append(header, notice, localNote, filterRow, completedLabel, status, warning, list, scopes, erase, storageNote);
  shadow.append(style, launch, dialog); main.before(host);
  dialog.addEventListener("close", () => { if (timer) clearInterval(timer); timer = undefined; launch.focus(); });
  const observer = new MutationObserver(() => { checkIdentity(); });
  const nav = document.querySelector("nav#linkNav");
  if (nav) observer.observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
  function checkIdentity(): boolean {
    if (destroyed) return false;
    if (accountMarker() === marker) return true;
    destroy(); return false;
  }
  function syncControls(): void { kind.value = filters.kind; showCompleted.checked = filters.showCompleted; }
  function persist(): void {
    preferenceRevision++;
    const value = decodePreferences(filters);
    writes = writes.then(async () => {
      try { if (storage) await savePreferences(storage.local, value); else throw Error(); storageNote.textContent = "表示設定をこのブラウザに保存しました。"; }
      catch { storageNote.textContent = "表示設定を保存できません。このページ内だけで使用します。"; }
    });
  }
  function changed(changes: Changes, area: string): void {
    if (destroyed || area !== "local" || !Object.hasOwn(changes, PREF_KEY)) return;
    preferenceRevision++;
    applyPreferenceChange(filters, completed, changes[PREF_KEY]?.newValue);
    search.value = filters.search; site.value = filters.site; syncControls(); renderList();
  }
  storage?.onChanged.addListener(changed);
  const readRevision = preferenceRevision;
  if (storage) void readPreferences(storage.local).then(value => {
    if (!destroyed && preferenceRevision === readRevision) { Object.assign(filters, value); syncControls(); renderList(); }
  }).catch(() => { storageNote.textContent = "表示設定を読み込めません。このページ内だけで使用します。"; });
  function renderList(): void {
    if (!dialog.open) return;
    const focused = shadow.activeElement as HTMLElement | null;
    const items = visibleItems(loader.state.items, filters, completed), now = Date.now();
    list.replaceChildren();
    if (!items.length) {
      const incomplete = loader.state.error || loader.state.skippedSites > 0 || !loader.state.pagingComplete || loader.state.scopes.some(scope => scope.state !== "ok" || scope.skipped > 0);
      const text = loader.state.loading ? "取得中です。" : incomplete ? "表示できる項目はありません。未取得・未対応の範囲があるため、課題なしとは判断できません。" : "現在の絞り込みに一致する取得済み項目はありません。公式画面も確認してください。";
      const empty = element("p", text); empty.className = "empty"; list.append(empty);
    }
    for (const [category, label] of Object.entries(GROUPS)) {
      const matching = items.filter(item => group(item.deadline, now) === category);
      if (!matching.length) continue;
      const section = element("section"), ul = element("ul");
      section.append(element("h3", `${label} · ${matching.length}件`), ul);
      for (const item of matching) {
        const li = element("li"), title = element("p", item.title); title.className = "title";
        const link = element("a", `${item.site.title} — 公式の科目トップ`); link.href = item.href; link.dataset.item = item.key;
        const date = element("p", item.deadline.state === "known" ? `${formatDate(item.deadline.at)}（日本時間）` : "期限不明 — 公式画面で確認"); date.className = "meta";
        const input = element("input"); input.type = "checkbox"; input.checked = completed.has(item.key); input.dataset.item = item.key;
        input.setAttribute("aria-label", `${item.site.title} / ${item.title}: 自分のリストで完了`);
        const label = element("label", "自分のリストで完了"); label.prepend(input);
        input.addEventListener("change", () => {
          if (input.checked) completed.add(item.key); else completed.delete(item.key);
          renderList();
          if (!shadow.querySelector("input[data-item]:focus")) showCompleted.focus();
        });
        li.append(title, link, date, label); ul.append(li);
      }
      list.append(section);
    }
    restoreFocus(list, focused);
  }
  function render(): void {
    const state = loader.state, now = Date.now();
    refresh.disabled = state.loading || now < state.retryAt;
    const finished = state.scopes.filter(scope => scope.state !== "pending").length;
    const text = state.loading ? `取得中 ${finished}/${state.scopes.length}範囲 · ${state.items.length}件` : `${state.items.length}件取得 · ${state.fetchedAt === null ? "取得未完了" : `最終取得 ${formatDate(state.fetchedAt)}（日本時間）`}`;
    if (status.textContent !== text) status.textContent = text;
    warning.textContent = state.error ? ERRORS[state.error] : "";
    if (state.retryAt > now) warning.append(element("p", `再試行可能: ${formatDate(state.retryAt)}（日本時間）。自動再試行はしません。`));
    if (state.fetchedAt !== null && now - state.fetchedAt >= CACHE_MS) warning.append(element("p", "取得から5分以上経過しています。必要なら更新してください。"));
    const incomplete = state.scopes.filter(scope => scope.state !== "ok" || scope.skipped > 0).length;
    if (incomplete && !state.loading) warning.append(element("p", `${incomplete}範囲が未取得・未対応・一部除外です。`));
    warning.hidden = !warning.textContent;
    const selected = filters.site;
    const options = [element("option", "すべて")]; options[0]!.value = "";
    for (const entry of state.sites) { const option = element("option", entry.title); option.value = entry.id; options.push(option); }
    site.replaceChildren(...options); site.value = selected;
    if (site.selectedIndex < 0) { site.value = ""; filters.site = ""; }
    const focusedScope = shadow.activeElement as HTMLElement | null;
    scopeRows.replaceChildren(element("li", `サイト一覧: ${state.pagingComplete ? "空ページまで取得" : "全ページ取得は未確認"}／形式不明で除外: ${state.skippedSites}件。APIが返す範囲のみであり、履修科目の網羅性は未保証です。`));
    for (const scope of state.scopes) {
      const description = scope.state === "ok" ? `取得成功${scope.skipped ? `・形式不明 ${scope.skipped}件除外` : ""}` : scope.state === "pending" ? state.loading ? "待機中" : "未取得" : scope.state === "unsupported" ? "非空の小テストは未対応" : ERRORS[scope.error ?? "network"];
      const row = element("li"); const link = element("a", scope.site.title); link.href = courseLink(scope.site.id);
      link.dataset.scope = JSON.stringify([scope.site.id, scope.kind]);
      row.append(link, document.createTextNode(` / ${scope.kind === "assignment" ? "課題" : "小テスト"}: ${description}${scope.fetchedAt !== undefined ? ` (${formatDate(scope.fetchedAt)} JST)` : ""}`)); scopeRows.append(row);
    }
    restoreFocus(scopeRows, focusedScope);
    if (state.error === "auth" || state.error === "html") { completed.clear(); filters.search = ""; filters.site = ""; search.value = ""; }
    renderList();
  }
  function destroy(): void {
    if (destroyed) return;
    destroyed = true; observer.disconnect(); if (timer) clearInterval(timer);
    storage?.onChanged.removeListener(changed); loader.clear(); completed.clear();
    dialog.close(); host.remove(); window.removeEventListener("pagehide", destroy);
  }
  window.addEventListener("pagehide", destroy, { once: true });
}
