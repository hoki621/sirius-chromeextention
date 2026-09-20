// Synthetic storage only. No browser/extension data is read or persisted.
export function installMockStorage(mode: string, confirmDeletion: boolean): void {
  type Changes = Record<string, { newValue?: unknown }>;
  const data: Record<string, unknown> = { unrelated: "keep" };
  const listeners = new Set<(changes: Changes, area: string) => void>();
  const channel = new BroadcastChannel("sirius-preview-settings");
  const report = document.createElement("p"); report.id = "mock-storage"; document.body.prepend(report);
  const paint = () => { report.textContent = `模擬storageのみ / 確認ダイアログ=${confirmDeletion ? "承認" : "取消"} / 保存キー: ${Object.keys(data).join(", ")}`; };
  const receive = (changes: Changes) => {
    for (const [key, change] of Object.entries(changes)) {
      if (change.newValue === undefined) delete data[key]; else data[key] = change.newValue;
    }
    listeners.forEach(listener => listener(changes, "local")); paint();
  };
  const emit = (changes: Changes) => { receive(changes); channel.postMessage(changes); };
  channel.onmessage = event => receive(event.data as Changes);
  const storage = {
    local: {
      get: async () => { if (mode === "fail-read") throw Error("mock read"); return { ...data }; },
      set: async (values: Record<string, unknown>) => {
        if (mode === "fail-write") throw Error("mock write");
        emit(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { newValue: value }])));
      },
      remove: async (keys: string[]) => {
        if (mode === "fail-delete") throw Error("mock delete");
        emit(Object.fromEntries(keys.filter(key => Object.hasOwn(data, key)).map(key => [key, {}])));
      },
    },
    onChanged: { addListener: (callback: (changes: Changes, area: string) => void) => { listeners.add(callback); }, removeListener: (callback: (changes: Changes, area: string) => void) => { listeners.delete(callback); } },
  };
  Object.defineProperty(window, "chrome", { value: { storage }, configurable: true });
  window.confirm = () => confirmDeletion;
  window.addEventListener("pagehide", () => channel.close(), { once: true }); paint();
}
