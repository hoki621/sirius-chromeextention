import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPreferenceChange, DEFAULT_PREFS, deleteOwnedData, decodePreferences, PREF_KEY, readPreferences, savePreferences } from "../src/preferences.ts";
import type { StorageArea } from "../src/preferences.ts";
test("only validated non-personal preferences persist; owned-data deletion preserves unrelated keys", async () => {
  const data: Record<string, unknown> = { unrelated: "keep", "sirius:old": "remove" };
  const storage: StorageArea = { get: async () => ({ ...data }), set: async values => { Object.assign(data, values); }, remove: async keys => { keys.forEach(key => { delete data[key]; }); } };
  assert.deepEqual(await readPreferences(storage), DEFAULT_PREFS);
  assert.deepEqual(decodePreferences({ kind: "other", showCompleted: true }), DEFAULT_PREFS);
  await savePreferences(storage, { kind: "assignment", showCompleted: true, secret: "never store" } as never);
  assert.deepEqual(data[PREF_KEY], { kind: "assignment", showCompleted: true });
  await deleteOwnedData(storage); assert.deepEqual(data, { unrelated: "keep" });
  await assert.rejects(readPreferences({ ...storage, get: async () => { throw Error("I/O"); } }));
  await assert.rejects(savePreferences({ ...storage, set: async () => { throw Error("I/O"); } }, DEFAULT_PREFS));
});

test("deletion signals all tabs even with no saved settings, and resets page-only filters and completion", async () => {
  const tabs = [0, 1].map(() => ({ filters: { kind: "assignment", showCompleted: true, site: "demo", search: "private search" }, completed: new Set(["page-only-item"]) }));
  const data: Record<string, unknown> = { unrelated: "keep" };
  const events: unknown[] = [];
  const emit = (value: unknown) => { events.push(value); tabs.forEach(tab => applyPreferenceChange(tab.filters, tab.completed, value)); };
  const storage: StorageArea = {
    get: async () => ({ ...data }),
    set: async values => { Object.assign(data, values); emit(values[PREF_KEY]); },
    remove: async keys => {
      for (const key of keys) if (Object.hasOwn(data, key)) { delete data[key]; if (key === PREF_KEY) emit(undefined); }
    },
  };
  await deleteOwnedData(storage);
  assert.equal(events.length, 2); assert.equal(events[1], undefined);
  assert.deepEqual(data, { unrelated: "keep" });
  for (const tab of tabs) { assert.deepEqual(tab.filters, { ...DEFAULT_PREFS, site: "", search: "" }); assert.equal(tab.completed.size, 0); }
  // A normal preference edit must not erase page-local work.
  const completion = new Set(["keep"]), filters = { ...DEFAULT_PREFS, site: "site", search: "query" };
  applyPreferenceChange(filters, completion, { kind: "quiz", showCompleted: true });
  assert.equal(completion.size, 1); assert.equal(filters.site, "site"); assert.equal(filters.search, "query");
});

test("deletion failure is propagated, including when creating the removal signal fails", async () => {
  const base: StorageArea = { get: async () => ({}), set: async () => {}, remove: async () => {} };
  for (const operation of ["get", "set", "remove"] as const) {
    await assert.rejects(deleteOwnedData({ ...base, [operation]: async () => { throw Error(operation); } }), { message: operation });
  }
});
