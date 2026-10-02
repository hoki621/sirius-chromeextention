import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ApiError, ORIGIN, retryAfter, SiriusApi } from "../src/api.ts";
import { assignmentToolLink, decodeDeadline, decodeItems, decodeSites, formatDate, group, visibleItems } from "../src/model.ts";
const signal = () => new AbortController().signal;
const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`fixtures/${name}.observed.json`, import.meta.url), "utf8"));
const fails = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test("default browser fetch preserves the global receiver rather than the API instance", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function(this: unknown) {
    assert.equal(this, globalThis, "native browser fetch requires its Window receiver");
    return Response.json({});
  };
  try { await new SiriusApi().sites(0, signal()); }
  finally { globalThis.fetch = original; }
});

test("fixed GET endpoints, credentials, conservative response errors and safe identifiers", async () => {
  const calls: string[] = [];
  const api = new SiriusApi(async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.method, "GET"); assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.redirect, "error");
    return Response.json({});
  });
  await api.sites(0, signal()); await api.assignments("sample-1", signal()); await api.quizzes("sample-1", signal()); await api.assignmentDeepLink("sample-1", "task-1", signal());
  assert.deepEqual(calls, [`${ORIGIN}/direct/site.json?_limit=200&_start=0`, `${ORIGIN}/direct/assignment/site/sample-1.json`, `${ORIGIN}/direct/sam_pub/context/sample-1.json`, `${ORIGIN}/direct/assignment/deepLink/sample-1/task-1.json`]);
  for (const bad of ["../x", "a/b", "a?x", "", "https://evil", "%2f"]) {
    assert.throws(() => api.assignments(bad, signal()), fails("schema"));
    assert.throws(() => api.assignmentDeepLink(bad, "task", signal()), fails("schema"));
    assert.throws(() => api.assignmentDeepLink("site", bad, signal()), fails("schema"));
  }
  for (const [status, code] of [[401, "auth"], [403, "forbidden"], [429, "rate-limit"], [500, "http"]] as const) {
    await assert.rejects(new SiriusApi(async () => new Response("private", { status })).sites(0, signal()), fails(code));
  }
  await assert.rejects(new SiriusApi(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })).sites(0, signal()), fails("html"));
  await assert.rejects(new SiriusApi(async () => new Response("broken", { headers: { "content-type": "application/json" } })).sites(0, signal()), fails("json"));
  await assert.rejects(new SiriusApi(async () => { throw Error("private-url"); }).sites(0, signal()), fails("network"));
  assert.equal(retryAfter("10", 1000), 11000); assert.equal(retryAfter(null, 1000), 61000);
  assert.equal(retryAfter("Thu, 01 Jan 1970 00:02:00 GMT", 1000), 120000);
  const distantRetry = retryAfter("999999999999999", 1000);
  assert.ok(distantRetry > 8.64e15, "preserve server retry delay even outside the Date range");
  assert.equal(formatDate(distantRetry), "日時不明");
  assert.equal(formatDate(NaN), "日時不明");
});
test("cancellation and timeout cover body consumption, and late fetch cannot return success", async () => {
  const controller = new AbortController();
  const api = new SiriusApi(async () => { controller.abort(); return Response.json({}); });
  await assert.rejects(api.sites(0, controller.signal), fails("aborted"));
  const slow = new SiriusApi(async (_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener("abort", () => reject(Error("abort")), { once: true });
  }), 5);
  await assert.rejects(slow.sites(0, signal()), fails("timeout"));
  const bodyAbort = new AbortController();
  const body = new SiriusApi(async () => ({ ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }),
    json: async () => { bodyAbort.abort(); return {}; } }) as Response);
  await assert.rejects(body.sites(0, bodyAbort.signal), fails("aborted"));
});
test("observed projections decode project sites and dueTime, never closeTime or API URLs", () => {
  const sites = decodeSites(fixture("sites")).sites;
  assert.equal(sites.length, 2);
  const result = decodeItems(fixture("assignments-site-2"), sites[1]!, "assignment", 42);
  assert.equal(result.items.length, 2); assert.equal(result.skipped, 0);
  assert.deepEqual(result.items[0]!.deadline, { state: "known", at: 1893715200000 });
  assert.equal(result.items[0]!.href, assignmentToolLink("sample-2"));
  assert.deepEqual(decodeItems(fixture("quizzes-empty"), sites[0]!, "quiz", 42), { items: [], skipped: 0, unsupported: false });
  assert.equal(decodeItems({ sam_pub_collection: [{}] }, sites[0]!, "quiz", 42).unsupported, true);
  assert.throws(() => decodeSites({}), fails("schema"));
  assert.throws(() => decodeItems({}, sites[0]!, "assignment", 42), fails("schema"));
});
test("synthetic invalid entries stay distinct from empty; unknown dates never become no deadline", () => {
  for (const value of [null, undefined, {}, { epochSecond: 1, nano: -1 }, { epochSecond: 1, nano: 1e9 }, { epochSecond: 1e20, nano: 0 }]) assert.deepEqual(decodeDeadline(value), { state: "unknown" });
  assert.deepEqual(decodeDeadline({ epochSecond: 0, nano: 999999999 }), { state: "known", at: 999 });
  const site = { id: "s", title: "Site" };
  const rows = [{ id: "x", context: "s", title: "Task", dueTime: null, entityURL: "javascript:alert(1)" }, { id: "x", context: "s", title: "Duplicate" }, { id: "y", context: "other", title: "Wrong account" }];
  const result = decodeItems({ assignment_collection: rows }, site, "assignment", 0);
  assert.equal(result.items.length, 1); assert.equal(result.skipped, 2);
  assert.equal(result.items[0]!.href, assignmentToolLink("s"));
  assert.equal(visibleItems(result.items, { search: " task ", site: "s", kind: "assignment", showCompleted: false }, new Set()).length, 1);
  assert.equal(visibleItems(result.items, { search: "", site: "", kind: "", showCompleted: false }, new Set([result.items[0]!.key])).length, 0);
});
test("JST boundaries are independent of machine timezone", () => {
  const now = Date.parse("2030-01-01T14:59:00Z");
  const known = (text: string) => ({ state: "known" as const, at: Date.parse(text) });
  assert.equal(group(known("2030-01-01T14:58:59Z"), now), "overdue");
  assert.equal(group(known("2030-01-01T14:59:00Z"), now), "today");
  assert.equal(group(known("2030-01-01T15:00:00Z"), now), "week");
  assert.equal(group(known("2030-01-08T14:59:59Z"), now), "week");
  assert.equal(group(known("2030-01-08T15:00:00Z"), now), "later");
  assert.equal(group({ state: "unknown" }, now), "unknown");
});
