import assert from "node:assert/strict";
import { test } from "node:test";
import { createFixtureProjector } from "../tools/probe/fixtures.ts";
import { pagingObservations, siteIds } from "../tools/probe/paging.ts";
import { runProbe } from "../tools/probe/report.ts";

test("response projection removes personal values while preserving IDs, date ordering, null and absent fields", () => {
  const project = createFixtureProjector(["private-site"]);
  const sites = project({ entityPrefix: "site", site_collection: [
    { id: "~private-person", title: "private-name", type: "myworkspace", published: true },
    { id: "private-site", title: "private-course", type: "course", published: true, props: { "private-key": "private-value" } },
  ] }, "site");
  const assignments = project({ entityPrefix: "assignment", assignment_collection: [{
    id: "private-task", context: "private-site", title: "private-title", body: "private-body",
    openTime: { epochSecond: 1700000000, nano: 0 }, dueTime: { epochSecond: 1700000001, nano: 5 },
    closeTime: { epochSecond: 1700000001, nano: 5 }, dropDeadTime: null,
  }, { id: "private-task-2", context: "private-site", title: "private-title-2" }] }, "assignment");
  const siteSample = sites.fixture?.site_collection as Record<string, unknown>[];
  const sample = assignments.fixture?.assignment_collection as Record<string, unknown>[];
  assert.equal(sample[0]?.context, siteSample[1]?.id);
  assert.match(String(siteSample[0]?.id), /^~/);
  assert.notEqual(sample[0]?.id, sample[1]?.id);
  assert.deepEqual(sample[0]?.dueTime, sample[0]?.closeTime);
  assert.ok((sample[0]?.openTime as { epochSecond: number }).epochSecond < (sample[0]?.dueTime as { epochSecond: number }).epochSecond);
  assert.equal(sample[0]?.dropDeadTime, null);
  assert.equal(Object.hasOwn(sample[1]!, "dueTime"), false);
  assert.doesNotMatch(JSON.stringify([sites, assignments]), /private-|170000000|body|props/);
  assert.equal(project({ assignment_collection: [{ dueTime: { epochSecond: "private-invalid", nano: 0 } }] }, "assignment").unavailable, "unsupported-date-value");
  assert.equal(project({ sam_pub_collection: [{ id: "private-quiz" }] }, "sam_pub").unavailable, "nonempty-quiz-fields-unverified");
  assert.deepEqual(project({ entityPrefix: "sam_pub", sam_pub_collection: [] }, "sam_pub").fixture, { entityPrefix: "sam_pub", sam_pub_collection: [] });
  assert.equal(project({ site_collection: { "private-key": "private-value" } }, "site").unavailable, "collection-not-array");
});

const sites = (ids: string[]) => ({ site_collection: ids.map(id => ({ id })) });

test("paging observations separate zero-based, clamped, ignored, malformed, missing and partial ranges", () => {
  const pages = new Map<string, unknown>([
    ["sites", sites(["~private-home", "private-course"])],
    ["site-start-0", sites(["~private-home"])], ["site-start-1", sites(["private-course"])],
    ["site-start-2", sites([])], ["site-after-initial", sites([])],
  ]);
  const emptyTail = pagingObservations(pages);
  assert.equal(emptyTail.indexEvidence, "zero-based-sample");
  assert.equal(emptyTail.boundaryEvidence, "empty-at-initial-count");
  assert.equal(emptyTail.personalSiteCount, 1);
  assert.doesNotMatch(JSON.stringify(emptyTail), /private-/);
  pages.set("site-after-initial", sites(["private-more"]));
  assert.equal(pagingObservations(pages).boundaryEvidence, "more-items-exist");
  pages.delete("site-after-initial");
  assert.equal(pagingObservations(pages).boundaryEvidence, "inconclusive");
  pages.set("site-start-1", sites(["~private-home"]));
  pages.set("site-start-2", sites(["private-course"]));
  assert.equal(pagingObservations(pages).indexEvidence, "one-based-or-zero-clamped-sample");
  pages.set("site-start-2", sites(["~private-home"]));
  assert.equal(pagingObservations(pages).indexEvidence, "inconclusive");
  assert.equal(siteIds(sites(["a", "a"])), null);
  assert.equal(siteIds({ site_collection: [{}] }), null);
  assert.equal(siteIds({ site_collection: {} }), null);
  assert.equal(pagingObservations(new Map()).initialCount, null);
});

test("extended probe is at most nine sequential GETs, bounded paging, with private values omitted", async () => {
  const calls: string[] = [];
  let active = 0;
  const result = await runProbe(["private-a", "private-b", "private-c"], async (input, init) => {
    assert.equal(++active, 1);
    assert.equal(init?.method, "GET");
    assert.equal(init?.credentials, "same-origin");
    assert.equal(init?.redirect, "error");
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const offset = url.searchParams.get("_start");
    await Promise.resolve();
    active--;
    return new Response(JSON.stringify(url.pathname === "/direct/site.json"
      ? sites(offset === null ? ["private-a", "private-b", "private-c"] : offset === "0" ? ["private-a"] : offset === "1" ? ["private-b"] : offset === "2" ? ["private-c"] : [])
      : url.pathname.includes("assignment") ? { assignment_collection: [] } : { sam_pub_collection: [] }),
    { headers: { "content-type": "application/json" } });
  });
  assert.equal(calls.length, 9);
  assert.deepEqual(calls.slice(5), [0, 1, 2, 3].map(start => `/direct/site.json?_limit=1&_start=${start}`));
  assert.equal(result[0]?.paging?.indexEvidence, "zero-based-sample");
  assert.doesNotMatch(JSON.stringify(result), /private-/);
  let counter = 0;
  const stopped = await runProbe(["private-a"], async () => ++counter === 1
    ? new Response(JSON.stringify(sites(["private-a"])), { headers: { "content-type": "application/json" } })
    : new Response("private-error", { status: 401 }));
  assert.equal(counter, 2);
  assert.equal(stopped[0]?.paging?.boundaryEvidence, "inconclusive");
});
