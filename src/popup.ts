// This popup only asks the active tab to open its panel; no LMS data or credentials cross the bridge.
type Tabs = { query(options: { active: boolean; currentWindow: boolean }): Promise<{ id?: number }[]>; sendMessage(id: number, message: { type: string }): Promise<unknown> };
const tabs = (globalThis as typeof globalThis & { chrome?: { tabs?: Tabs } }).chrome?.tabs;
async function open(): Promise<void> {
  try {
    const [tab] = await tabs!.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return;
    const result = await tabs!.sendMessage(tab.id, { type: "sirius-open-study-list" });
    if (result !== null && typeof result === "object" && "opened" in result && result.opened === true) window.close();
  } catch { /* The guide stays visible on unsupported, pre-login or not-yet-reloaded pages. */ }
}
if (tabs) void open();
