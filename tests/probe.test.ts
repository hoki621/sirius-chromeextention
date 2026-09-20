import assert from "node:assert/strict";
import { test } from "node:test";
import { describeShape, courseIdFromLink, runProbe } from "../tools/probe/report.ts";

test("diagnostics retain types, not personal values or unknown/map keys", () => {
  const shape = describeShape({ entityPrefix: "site", site_collection: [{
    id: "private-id", title: "private-title", dueTime: { time: 1790000000000 }, published: true,
    props: { "private-prop-name": "private-value" }, "private-root-name": "private-root-value",
  }] });
  const text = JSON.stringify(shape);
  assert.doesNotMatch(text, /private-|1790000000000/);
  assert.match(text, /"title":"string"/);
  assert.match(text, /"time":"number"/);
  assert.match(text, /"published":"boolean"/);
  assert.match(text, /"props":"object"/);
  assert.equal(describeShape(null), "null");
});

test("probe selects only exact Sirius course links", () => {
  assert.equal(courseIdFromLink("https://lms.sirius.tuat.ac.jp:443/portal/site/course-1"), "course-1");
  for (const path of ["/portal/site/%7Euser-1", "/portal/site/!gateway", "/portal/site/a/tool/b", "/portal/site/%2F..", "https://other.example/portal/site/course-1", "javascript:alert(1)"]) {
    assert.equal(courseIdFromLink(path), null, path);
  }
});

test("probe runs at most five sequential same-origin GETs and redacts identifiers", async () => {
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    return new Response(JSON.stringify({ assignment_collection: [{ title: "private-title", id: "private-id" }] }), { headers: { "content-type": "application/json;charset=UTF-8" } });
  };
  const results = await runProbe(["private-course-1", "private-course-1", "../evil", "private-course-2", "private-course-3"], request);
  assert.equal(calls.length, 5);
  assert.equal(calls[0], "https://lms.sirius.tuat.ac.jp/direct/site.json?_limit=200");
  assert.ok(calls.every(url => new URL(url).origin === "https://lms.sirius.tuat.ac.jp"));
  assert.doesNotMatch(JSON.stringify(results), /private-/);
});

test("probe stops at 401/429 and does not disclose response or exception text", async () => {
  for (const status of [401, 429]) {
    const results = await runProbe(["course-1"], async () => new Response("private-body", { status }));
    assert.equal(results.length, 1);
    assert.equal(results[0]?.status, status);
    assert.doesNotMatch(JSON.stringify(results), /private-body/);
  }
  const results = await runProbe([], async () => { throw new Error("private-error"); });
  assert.deepEqual(results, [{ endpoint: "sites", error: "network-or-redirect" }]);
  const invalid = await runProbe([], async () => new Response("private-invalid-json", { headers: { "content-type": "application/json" } }));
  assert.deepEqual(invalid, [{ endpoint: "sites", status: 200, format: "json", error: "invalid-json" }]);
  const html = await runProbe([], async () => new Response("<h1>private-login-page</h1>", { headers: { "content-type": "text/html" } }));
  assert.deepEqual(html, [{ endpoint: "sites", status: 200, format: "html" }]);
});

test("probe attaches comparison counts only to the matching assignment response", async () => {
  const rows = [{ siteId: "private-site", itemId: "private-item", open: "2030/01/01 00:00", due: "2030/01/02 00:00" }];
  const results = await runProbe(["private-site"], async () => new Response(JSON.stringify({ assignment_collection: [{
    id: "private-item", context: "private-site", dueTime: { epochSecond: Date.parse("2030-01-01T15:00:00Z") / 1000, nano: 0 },
  }] }), { headers: { "content-type": "application/json" } }), rows);
  assert.equal(results[0]?.deadlineComparison, undefined);
  assert.equal(results[1]?.deadlineComparison?.comparisons.dueTime?.matched, 1);
  assert.equal(results[2]?.deadlineComparison, undefined);
  assert.doesNotMatch(JSON.stringify(results), /private-|2030/);
});
