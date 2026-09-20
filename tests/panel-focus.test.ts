import assert from "node:assert/strict";
import { test } from "node:test";
import { restoreFocus } from "../src/panel.ts";

test("redraw restores the same item/control or scope without scrolling; absent items and other controls are untouched", () => {
  const focused: string[] = [];
  const node = (name: string, tagName: string, dataset: Record<string, string>) => ({ tagName, dataset, focus: (options: FocusOptions) => { assert.equal(options.preventScroll, true); focused.push(name); } }) as unknown as HTMLElement;
  const nodes = [node("link-a", "A", { item: "a" }), node("check-a", "INPUT", { item: "a" }), node("link-b", "A", { item: "b" }), node("scope", "A", { scope: "a" })];
  const container = { querySelectorAll: () => nodes } as unknown as ParentNode;
  restoreFocus(container, node("old-link", "A", { item: "a" }));
  restoreFocus(container, node("old-check", "INPUT", { item: "a" }));
  restoreFocus(container, node("old-scope", "A", { scope: "a" }));
  restoreFocus(container, node("removed", "A", { item: "missing" }));
  restoreFocus(container, node("search", "INPUT", {})); restoreFocus(container, null);
  assert.deepEqual(focused, ["link-a", "check-a", "scope"]);
});
