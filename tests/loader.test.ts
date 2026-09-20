import assert from "node:assert/strict";
import { test } from "node:test";
import { SiriusApi } from "../src/api.ts";
import { CACHE_MS, Loader } from "../src/loader.ts";

const sites = (n = 4) => Array.from({ length: n }, (_, i) => ({ id: `site-${i}`, title: `Site ${i}`, type: "project", published: true }));
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const json = (url: string, n = 4): Response => Response.json(url.includes("/direct/site.json") ? { site_collection: url.includes("_start=0") ? sites(n) : [] } : url.includes("/assignment/") ? { assignment_collection: [] } : { sam_pub_collection: [] });

test("loader paginates to empty, caps concurrency at 4, coalesces refresh and honors memory cache", async () => {
  let active = 0, max = 0, requests = 0, now = 1000, changes = 0;
  const api = new SiriusApi(async url => {
    requests++; active++; max = Math.max(max, active);
    await tick(); active--;
    return json(String(url));
  });
  const loader = new Loader(api, () => { changes++; }, () => now);
  const first = loader.refresh(); assert.equal(loader.refresh(true), first);
  await first;
  assert.equal(max, 4); assert.equal(requests, 10); assert.equal(loader.state.scopes.length, 8);
  assert.equal(loader.state.scopes.every(scope => scope.state === "ok"), true);
  assert.equal(loader.state.pagingComplete, true); assert.ok(changes > 8);
  await loader.refresh(); assert.equal(requests, 10);
  now += CACHE_MS;
  await loader.refresh(); assert.equal(requests, 20);
  await loader.refresh(true); assert.equal(requests, 30);
});
test("403 stays per-scope; nonempty quiz is unsupported, not a valid empty list", async () => {
  const loader = new Loader(new SiriusApi(async url => String(url).includes("/assignment/") ? new Response("", { status: 403 }) : String(url).includes("/sam_pub/") ? Response.json({ sam_pub_collection: [{}] }) : json(String(url), 1)), () => {});
  await loader.refresh();
  assert.equal(loader.state.error, null);
  assert.deepEqual(loader.state.scopes.map(scope => scope.state), ["error", "unsupported"]);
  assert.equal(loader.state.scopes[0]!.error, "forbidden");
});
test("401 clears data and late successful responses cannot restore it", async () => {
  let late: (() => void) | undefined;
  const loader = new Loader(new SiriusApi(async url => {
    if (String(url).includes("/direct/site.json")) return json(String(url));
    if (String(url).includes("/assignment/site/site-0")) { await tick(); return new Response("", { status: 401 }); }
    await new Promise<void>(resolve => { late = resolve; setImmediate(resolve); });
    return json(String(url));
  }), () => {});
  await loader.refresh(); late?.();
  assert.equal(loader.state.error, "auth"); assert.equal(loader.state.loading, false);
  assert.deepEqual(loader.state.items, []); assert.deepEqual(loader.state.sites, []);
});
test("429 stops queue and blocks manual refresh until retry time without automatic retries", async () => {
  let requests = 0, now = Date.now();
  const loader = new Loader(new SiriusApi(async url => {
    requests++;
    return String(url).includes("/direct/site.json") ? json(String(url), 20) : new Response("", { status: 429, headers: { "retry-after": "60" } });
  }), () => {}, () => now);
  await loader.refresh();
  assert.ok(requests <= 6); assert.equal(loader.state.error, "rate-limit");
  const before = requests;
  await loader.refresh(true); assert.equal(requests, before);
  now = loader.state.retryAt + 1;
  await loader.refresh(true); assert.ok(requests > before);
});
test("clear invalidates in-flight generation and a repeated paging page fails closed", async () => {
  let release: (() => void) | undefined;
  const loader = new Loader(new SiriusApi(async url => { await new Promise<void>(resolve => { release = resolve; }); return json(String(url)); }), () => {});
  const task = loader.refresh(); await tick(); loader.clear(); release?.(); await task;
  assert.deepEqual(loader.state.items, []); assert.deepEqual(loader.state.sites, []); assert.equal(loader.state.loading, false);
  const repeating = new Loader(new SiriusApi(async () => Response.json({ site_collection: sites() })), () => {});
  await repeating.refresh(); assert.equal(repeating.state.error, "schema"); assert.equal(repeating.state.pagingComplete, false);
});
