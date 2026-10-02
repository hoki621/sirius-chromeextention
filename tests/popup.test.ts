import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

test("toolbar popup sends only an open request and leaves its guide on unsupported tabs", async () => {
  const code = transformSync(readFileSync(new URL("../src/popup.ts", import.meta.url), "utf8"), { loader: "ts", format: "iife" }).code;
  for (const scenario of ["opened", "unsupported", "missing", "rejected"] as const) {
    let closed = 0, messages = 0;
    runInNewContext(code, {
      window: { close: () => { closed++; } },
      chrome: { tabs: {
        query: async (options: unknown) => { assert.equal(JSON.stringify(options), '{"active":true,"currentWindow":true}'); return scenario === "missing" ? [] : [{ id: 7 }]; },
        sendMessage: async (id: number, message: unknown) => {
          messages++; assert.equal(id, 7); assert.equal(JSON.stringify(message), '{"type":"sirius-open-study-list"}');
          if (scenario === "rejected") throw Error("no receiver");
          return { opened: scenario === "opened" };
        },
      } },
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(closed, scenario === "opened" ? 1 : 0);
    assert.equal(messages, scenario === "missing" ? 0 : 1);
  }
});
