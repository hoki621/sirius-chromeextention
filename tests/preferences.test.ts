import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_PREFS, deleteOwnedData, decodePreferences, PREF_KEY, readPreferences, savePreferences } from "../src/preferences.ts";
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
