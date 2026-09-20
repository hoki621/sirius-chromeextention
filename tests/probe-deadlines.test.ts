import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentIdentity, compareAssignmentDeadlines } from "../tools/probe/deadlines.ts";

test("diagnostic identity extraction accepts observed views, not actions or unrelated origins", () => {
  const base = "https://lms.sirius.tuat.ac.jp/portal/site/site-a/tool/tool-a";
  const view = `${base}?assignmentReference=/assignment/a/site-a/item-a&sakai_action=doView_submission`;
  assert.deepEqual(assignmentIdentity(view), { siteId: "site-a", itemId: "item-a" });
  assert.deepEqual(assignmentIdentity(`${base}?submissionId=/assignment/s/site-a/item-a/submission-a&sakai_action=doView_grade`), { siteId: "site-a", itemId: "item-a" });
  for (const url of [view.replace("doView_submission", "doPost_submission"), view.replace("/a/site-a/", "/a/other/"), view.replace("https:", "http:"), view.replace("lms.sirius.tuat.ac.jp", "evil.example"), `${view}&assignmentReference=/assignment/a/site-a/item-b`, `${view}#extra`, "javascript:alert(1)"]) {
    assert.equal(assignmentIdentity(url), null);
  }
});

test("deadline hypothesis compares by site and item at JST minute precision without emitting values", () => {
  // Artificial data; this does not establish Sirius date semantics.
  const instant = { epochSecond: Date.parse("2030-01-01T15:00:00Z") / 1000, nano: 999_999_999 };
  const row = { siteId: "private-site", itemId: "private-item", open: "2030/01/01 23:59", due: "2030/01/02 00:00" };
  const item = { id: row.itemId, context: row.siteId, title: "private-title", dueTime: instant,
    openTime: { ...instant, epochSecond: instant.epochSecond - 60 }, closeTime: { ...instant, epochSecond: instant.epochSecond + 60 }, dropDeadTime: null };
  const result = compareAssignmentDeadlines({ assignment_collection: [item] }, [row], row.siteId);
  assert.equal(result.visibleRows, 1);
  assert.equal(result.missingOrAmbiguous, 0);
  assert.deepEqual(result.comparisons, {
    openTime: { matched: 1, mismatched: 0, unknown: 0 }, dueTime: { matched: 1, mismatched: 0, unknown: 0 },
    closeTime: { matched: 0, mismatched: 1, unknown: 0 }, dropDeadTime: { matched: 0, mismatched: 0, unknown: 1 },
  });
  assert.doesNotMatch(JSON.stringify(result), /private-|2030|189351/);
  for (const payload of [{}, { assignment_collection: [] }, { assignment_collection: [item, item] }, { assignment_collection: [{ ...item, context: "other-site" }] }]) {
    const missing = compareAssignmentDeadlines(payload, [row], row.siteId);
    assert.equal(missing.missingOrAmbiguous, 1);
    assert.equal(missing.comparisons.dueTime?.matched, 0);
  }
  assert.equal(compareAssignmentDeadlines({ assignment_collection: [item] }, [row, row], row.siteId).missingOrAmbiguous, 2);
  for (const bad of [undefined, "private-date", 123, { epochSecond: NaN, nano: 0 }, { epochSecond: 1, nano: -1 }, { epochSecond: 1, nano: 1e9 }, { epochSecond: Number.MAX_SAFE_INTEGER, nano: 0 }]) {
    assert.equal(compareAssignmentDeadlines({ assignment_collection: [{ ...item, dueTime: bad }] }, [row], row.siteId).comparisons.dueTime?.unknown, 1);
  }
});
