import { ORIGIN, SiriusApi } from "./api.ts";
import type { Failure } from "./api.ts";
import { CACHE_MS, Loader } from "./loader.ts";
import { assignmentNavigationLinks, courseLink, formatDate, GROUPS, group, remainingTime, visibleItems } from "./model.ts";
import type { Filters, Group } from "./model.ts";
import { applyPreferenceChange, DEFAULT_PREFS, deleteOwnedData, decodePreferences, PREF_KEY, readPreferences, savePreferences } from "./preferences.ts";
import type { StorageArea } from "./preferences.ts";

type Changes = Record<string, { newValue?: unknown }>;
type ChromeStorage = { local: StorageArea; onChanged: { addListener(callback: (changes: Changes, area: string) => void): void; removeListener(callback: (changes: Changes, area: string) => void): void } };
type MessageListener = (message: unknown, sender: { id?: string }, reply: (response: { opened: boolean }) => void) => void;
type Runtime = { id: string; onMessage: { addListener(listener: MessageListener): void; removeListener(listener: MessageListener): void } };
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
export function mountPanel(): (() => boolean) | undefined {
  const main = document.querySelector("main#content"), marker = accountMarker();
  if (!main || main.closest("form") || !marker || document.getElementById("sirius-study-helper")) return;
  const host = element("section"); host.id = "sirius-study-helper";
  const shadow = host.attachShadow({ mode: "open" });
  const style = element("style", `
    :host{all:initial;font:16px/1.6 system-ui,sans-serif;color:#172b3a;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit;color:inherit}button,input,select{border:1px solid #94a3b8;border-radius:8px;padding:8px 12px;background:white}
    button{cursor:pointer;min-height:42px}button:hover{background:#eef2f6}button:disabled{cursor:default;opacity:.6}
    button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #2563eb;outline-offset:3px}
    dialog{font:16px/1.6 system-ui,sans-serif;color:#172b3a;border:1px solid #cbd5e1;border-radius:16px;padding:0;width:min(780px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:hidden;background:#f8fafc;box-shadow:0 24px 70px #0f172a44}
    dialog[open]{display:flex;flex-direction:column}dialog::backdrop{background:#0f172a88}
    h2{font-size:1.3em;margin:0}h3{font-size:1em;margin:0}p{margin:8px 0}header,.actions,.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}header{justify-content:space-between}
    .top{padding:20px 24px 12px;background:white;border-bottom:1px solid #e2e8f0;flex:0 0 auto;max-height:50dvh;overflow:auto}
    .body{padding:12px 24px 20px;overflow:auto;flex:1 1 auto;min-height:0;scrollbar-gutter:stable;overflow-anchor:none}
    .search{display:block;margin-top:12px}.search input{width:100%}.search-name{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
    .filters{margin:12px 0}label{display:flex;gap:8px;align-items:center}label.field{display:grid;flex:1 1 180px}select{width:100%;min-width:0}input[type=checkbox]{width:18px;height:18px;flex-shrink:0}
    a{color:#075985;text-decoration:underline;text-underline-offset:3px}.note,.meta{font-size:.875em;color:#475569}.status{font-size:.875em;color:#475569;margin:6px 0 0}
    .warning{padding:12px;border-left:4px solid #b45309;border-radius:6px;background:#fff7ed;overflow-wrap:anywhere}
    ul{list-style:none;padding:0;margin:0}li{overflow-wrap:anywhere}.group{margin:12px 0 20px;--accent:#64748b;--tint:#eef2f6}
    .group[data-group=today]{--accent:#b45309;--tint:#fff7ed}.group[data-group=week]{--accent:#0369a1;--tint:#e0f2fe}
    .group[data-group=overdue]{--accent:#b91c1c;--tint:#fef2f2}.group[data-group=unknown]{--accent:#92400e;--tint:#fef3c7}
    .group-heading{padding:8px 12px;border-left:4px solid var(--accent);background:var(--tint);border-radius:6px;font-weight:650}
    .task{margin:12px 0;padding:16px 18px;background:white;border:1px solid #dbe3ec;border-left:3px solid var(--accent);border-radius:10px}
    .title{display:block;font-size:1.0625em;font-weight:650;line-height:1.55}.title:hover{color:#0369a1}
    .course{display:inline-block;font-size:.875em;margin:8px 0 0;padding:2px 8px;background:#eef2f6;border-radius:6px;color:#334155;max-width:100%}
    .deadline{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:baseline;margin:10px 0 6px}.remaining{color:var(--accent);font-weight:650}
    .task .check{font-size:.875em;color:#475569;margin-top:12px}.route{font-size:.875em;color:#475569;margin:4px 0 0}
    details{margin:8px 0}summary{cursor:pointer;min-height:32px}footer{border-top:1px solid #dbe3ec;padding-top:12px}.scope-row{margin:10px 0}.empty{padding:24px;background:white;border:1px dashed #94a3b8;border-radius:10px}
    @media(max-width:480px){dialog{width:calc(100vw - 12px);max-height:calc(100dvh - 12px);border-radius:10px}.top{padding:14px 16px 10px}.body{padding:8px 16px 16px}.task{padding:12px}.actions{gap:6px}.actions button{padding:6px 10px}header{align-items:start}h2{font-size:1.125em}}
  `);
  const dialog = element("dialog"); dialog.setAttribute("aria-labelledby", "sirius-heading");
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); dialog.close(); }
    event.stopPropagation();
  });
  const heading = element("h2", "Sirius 課題一覧"); heading.id = "sirius-heading";
  const header = element("header"), actions = element("div"); actions.className = "actions";
  const top = element("div"), body = element("div"), footer = element("footer"); top.className = "top"; body.className = "body";
  const status = element("p"); status.className = "status"; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const warning = element("div"); warning.className = "warning";
  const list = element("div"), scopes = element("details"), scopeRows = element("ul");
  const storageNote = element("p"); storageNote.className = "note"; storageNote.setAttribute("role", "status");
  const filters: Filters = { search: "", site: "", ...DEFAULT_PREFS };
  const completed = new Set<string>();
  const chrome = (globalThis as typeof globalThis & { chrome?: { storage?: ChromeStorage; runtime?: Runtime } }).chrome;
  const storage = chrome?.storage, runtime = chrome?.runtime;
  let destroyed = false, timer: ReturnType<typeof setInterval> | undefined, preferenceRevision = 0;
  let returnFocus: HTMLElement | null = null, overdueExpanded = false;
  let writes = Promise.resolve();
  const loader = new Loader(new SiriusApi(), () => { if (!destroyed) render(); }, Date.now,
    assignmentNavigationLinks(document.querySelectorAll<HTMLAnchorElement>("nav#toolMenu a[href]")));
  function open(): boolean {
    if (!checkIdentity()) return false;
    if (!dialog.open) { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; dialog.showModal(); }
    search.focus(); render(); void loader.refresh();
    timer ??= setInterval(() => { if (checkIdentity() && dialog.open) render(); }, 30_000);
    return true;
  }
  const refresh = button("更新", () => { if (checkIdentity()) void loader.refresh(true); });
  const close = button("閉じる", () => dialog.close());
  actions.append(refresh, close); header.append(heading, actions);
  const notice = element("p", "非公式・読み取り専用。提出・受験は公式画面で。"); notice.className = "note";
  const limits = element("p", "試用版です。小テストの非空データと全科目の網羅性は未検証です。表示なしでも、課題なしとは判断できません。");
  const localNote = element("p", "完了チェックは「自分のリストで完了」の印で、提出済みを意味しません。アカウント識別が未検証のため、このページ内だけで保持し、再読み込み・移動で消えます。"); localNote.className = "note";
  const filterRow = element("div"); filterRow.className = "filters";
  const search = element("input"); search.type = "search"; search.placeholder = "課題名で検索";
  const searchLabel = element("label"); searchLabel.className = "search";
  const searchName = element("span", "課題名で検索"); searchName.className = "search-name"; searchLabel.append(searchName, search);
  const filterDetails = element("details"), filterSummary = element("summary", "絞り込み");
  const site = element("select"), kind = element("select");
  for (const [value, text] of [["", "すべて"], ["assignment", "課題"], ["quiz", "小テスト"]]) { const option = element("option", text); option.value = value!; kind.append(option); }
  for (const [text, input] of [["科目・サイト", site], ["種類", kind]] as const) { const label = element("label", text); label.className = "field"; label.append(input); filterRow.append(label); }
  const showCompleted = element("input"); showCompleted.type = "checkbox";
  const completedLabel = element("label", "自分のリストで完了した項目も表示"); completedLabel.prepend(showCompleted);
  filterDetails.append(filterSummary, filterRow, completedLabel);
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
  const help = element("details"); help.append(element("summary", "使い方・制限"), limits, localNote, erase, storageNote);
  const credits = element("details"), creditLink = element("a", "Comfortable PandA");
  creditLink.href = "https://github.com/das08/ComfortablePandA"; creditLink.target = "_blank"; creditLink.rel = "noopener noreferrer";
  const creditText = element("p", "締切別の整理、科目ラベル、日時と残り時間の表示は ");
  creditText.append(creditLink, document.createTextNode(" のUIを参考にしました。開発者・貢献者の皆さまに感謝します。本拡張は独立した非公式プロジェクトです。"));
  credits.append(element("summary", "参考プロジェクト"), creditText);
  top.append(header, status, searchLabel, filterDetails); footer.append(notice, help, scopes, credits);
  body.append(warning, list, footer); dialog.append(top, body);
  shadow.append(style, dialog); main.before(host);
  const onMessage: MessageListener = (message, sender, reply) => {
    if (sender.id === runtime?.id && message !== null && typeof message === "object" && "type" in message && message.type === "sirius-open-study-list") reply({ opened: open() });
  };
  runtime?.onMessage.addListener(onMessage);
  dialog.addEventListener("close", () => {
    if (dialog.open) return; // A queued close event must not disturb an already reopened panel.
    if (timer) clearInterval(timer); timer = undefined;
    if (!destroyed && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
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
    const scrollTop = body.scrollTop;
    const previousOverdue = list.querySelector<HTMLDetailsElement>("details[data-group=overdue]");
    if (previousOverdue) overdueExpanded = previousOverdue.open;
    const items = visibleItems(loader.state.items, filters, completed), now = Date.now();
    filterSummary.textContent = `絞り込み${filters.site || filters.kind || filters.showCompleted ? "（適用中）" : ""}`;
    list.replaceChildren();
    if (!items.length) {
      const incomplete = loader.state.error || loader.state.skippedSites > 0 || !loader.state.pagingComplete || loader.state.scopes.some(scope => scope.state !== "ok" || scope.skipped > 0);
      const text = loader.state.loading ? "取得中です。" : incomplete ? "表示できる項目はありません。未取得・未対応の範囲があるため、課題なしとは判断できません。" : "現在の絞り込みに一致する取得済み項目はありません。公式画面も確認してください。";
      const empty = element("p", text); empty.className = "empty"; list.append(empty);
    }
    for (const category of ["today", "week", "later", "overdue", "none", "unknown"] as Group[]) {
      const matching = items.filter(item => group(item.deadline, now) === category);
      if (!matching.length) continue;
      const section = category === "overdue" ? element("details") : element("section"), ul = element("ul");
      section.className = "group"; section.dataset.group = category;
      const groupHeading = element(category === "overdue" ? "summary" : "h3", `${GROUPS[category]} · ${matching.length}件`);
      groupHeading.className = "group-heading";
      if (section instanceof HTMLDetailsElement) section.open = overdueExpanded || Boolean(filters.search.trim());
      section.append(groupHeading, ul);
      for (const item of matching) {
        const li = element("li"); li.className = "task";
        const link = element("a", item.title); link.className = "title"; link.href = item.href; link.dataset.item = item.key;
        const destination = item.href === courseLink(item.site.id) ? "科目トップを開く（課題一覧のリンク未取得）" : "課題一覧を開く";
        link.setAttribute("aria-label", `${item.title} — ${destination}`);
        const course = element("span", item.site.title); course.className = "course";
        const route = element("p", destination); route.className = "route";
        const deadline = element("p"), remaining = element("strong", remainingTime(item.deadline, now));
        deadline.className = "deadline"; remaining.className = "remaining";
        const date = element("time", item.deadline.state === "known" ? `${formatDate(item.deadline.at)} JST` : "公式画面で確認"); date.className = "meta";
        if (item.deadline.state === "known") date.dateTime = new Date(item.deadline.at).toISOString();
        deadline.append(remaining, date);
        const input = element("input"); input.type = "checkbox"; input.checked = completed.has(item.key); input.dataset.item = item.key;
        input.setAttribute("aria-label", `${item.site.title} / ${item.title}: 自分のリストで完了`);
        const label = element("label", "自分のリストで完了（提出状態とは別）"); label.className = "check"; label.prepend(input);
        input.addEventListener("change", () => {
          if (input.checked) completed.add(item.key); else completed.delete(item.key);
          renderList();
          if (!shadow.querySelector("input[data-item]:focus")) search.focus({ preventScroll: true });
        });
        li.append(link, course, deadline, route, label); ul.append(li);
      }
      list.append(section);
    }
    restoreFocus(list, focused);
    body.scrollTop = scrollTop;
  }
  function render(): void {
    const state = loader.state, now = Date.now();
    refresh.disabled = state.loading || now < state.retryAt;
    const finished = state.scopes.filter(scope => scope.state !== "pending").length;
    const text = "非公式・試用版 · " + (state.loading ? `取得中 ${finished}/${state.scopes.length}範囲 · ${state.items.length}件` : `${state.items.length}件取得 · ${state.fetchedAt === null ? "取得未完了" : `最終取得 ${formatDate(state.fetchedAt)}（日本時間）`}`);
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
      const row = element("li"); row.className = "scope-row"; const link = element("a", scope.site.title); link.href = courseLink(scope.site.id);
      link.dataset.scope = JSON.stringify([scope.site.id, scope.kind]);
      row.append(link, document.createTextNode(` / ${scope.kind === "assignment" ? "課題" : "小テスト"}: ${description}${scope.fetchedAt !== undefined ? ` (${formatDate(scope.fetchedAt)} JST)` : ""}${scope.linkError ? `／課題リンク未取得: ${ERRORS[scope.linkError]}` : ""}`)); scopeRows.append(row);
    }
    restoreFocus(scopeRows, focusedScope);
    if (state.error === "auth" || state.error === "html") { completed.clear(); filters.search = ""; filters.site = ""; search.value = ""; }
    renderList();
  }
  function destroy(): void {
    if (destroyed) return;
    destroyed = true; observer.disconnect(); if (timer) clearInterval(timer);
    storage?.onChanged.removeListener(changed); loader.clear(); completed.clear();
    runtime?.onMessage.removeListener(onMessage);
    dialog.close(); host.remove(); window.removeEventListener("pagehide", destroy);
  }
  window.addEventListener("pagehide", destroy, { once: true });
  return open;
}
