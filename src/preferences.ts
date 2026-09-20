import { record } from "./model.ts";
import type { Filters } from "./model.ts";

export type Preferences = { kind: "" | "assignment" | "quiz"; showCompleted: boolean };
export const PREF_KEY = "sirius:preferences:v1";
export const DEFAULT_PREFS: Preferences = { kind: "", showCompleted: false };
export type StorageArea = { get(key: string | null): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void>; remove(keys: string[]): Promise<void> };
export function decodePreferences(value: unknown): Preferences {
  if (!record(value) || typeof value.kind !== "string" || !["", "assignment", "quiz"].includes(value.kind) || typeof value.showCompleted !== "boolean") return { ...DEFAULT_PREFS };
  return { kind: value.kind as Preferences["kind"], showCompleted: value.showCompleted };
}
export async function readPreferences(storage: StorageArea): Promise<Preferences> {
  return decodePreferences((await storage.get(PREF_KEY))[PREF_KEY]);
}
export async function savePreferences(storage: StorageArea, value: Preferences): Promise<void> {
  await storage.set({ [PREF_KEY]: decodePreferences(value) });
}
export async function deleteOwnedData(storage: StorageArea): Promise<void> {
  const keys = Object.keys(await storage.get(null)).filter(key => key.startsWith("sirius:"));
  // Ensure every live tab receives a removal event, even with no saved preferences.
  // This contains no personal data and is removed by the following operation.
  await savePreferences(storage, DEFAULT_PREFS);
  await storage.remove([...new Set([...keys, PREF_KEY])]);
}
export function applyPreferenceChange(filters: Filters, completed: Set<string>, value: unknown): void {
  Object.assign(filters, decodePreferences(value));
  if (value === undefined) {
    completed.clear(); filters.search = ""; filters.site = "";
  }
}
