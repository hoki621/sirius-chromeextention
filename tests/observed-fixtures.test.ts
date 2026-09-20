import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("observed projections retain cross-site relationships and contain only reviewed fake values", () => {
  const read = (name: string) => JSON.parse(readFileSync(new URL(`fixtures/${name}.observed.json`, import.meta.url), "utf8"));
  const sites = read("sites");
  const assignments = [read("assignments-site-1"), read("assignments-site-2")];
  const quizzes = read("quizzes-empty");
  const ids = new Set<string>();
  const siteIds = new Set(sites.site_collection.map((site: { id: string }) => site.id));
  assert.equal(siteIds.size, 2);
  assert.equal(sites.entityPrefix, "site");
  for (const site of sites.site_collection) {
    assert.deepEqual(Object.keys(site).sort(), ["id", "published", "title", "type"]);
    assert.equal(site.type, "project");
    assert.equal(site.published, true);
  }
  for (const response of assignments) {
    assert.equal(response.entityPrefix, "assignment");
    assert.equal(response.assignment_collection.length, 2);
    for (const item of response.assignment_collection) {
      assert.ok(siteIds.has(item.context));
      assert.ok(!ids.has(item.id));
      ids.add(item.id);
      assert.deepEqual(Object.keys(item).sort(), ["closeTime", "context", "dropDeadTime", "dueTime", "id", "openTime", "title"]);
      assert.ok(item.openTime.epochSecond < item.dueTime.epochSecond);
      for (const field of ["openTime", "dueTime", "closeTime", "dropDeadTime"]) {
        assert.deepEqual(Object.keys(item[field]).sort(), ["epochSecond", "nano"]);
        assert.equal(item[field].nano, 0);
        assert.ok(item[field].epochSecond >= 1893456000 && item[field].epochSecond <= 1893801600);
      }
    }
  }
  assert.notDeepEqual(assignments[1].assignment_collection[0].closeTime, assignments[1].assignment_collection[0].dueTime);
  assert.deepEqual(quizzes, { sam_pub_collection: [], entityPrefix: "sam_pub" });
  const checkStrings = (value: unknown): void => {
    if (typeof value === "string") assert.match(value, /^(sample-\d+|Sample title|project|site|assignment|sam_pub)$/);
    else if (value !== null && typeof value === "object") Object.values(value).forEach(checkStrings);
  };
  checkStrings([sites, ...assignments, quizzes]);
});
