import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ORIGIN, SiriusApi } from "../src/api.ts";
import { assignmentLink, assignmentToolLink, assignmentNavigationLinks, remainingTime } from "../src/model.ts";
import { Loader } from "../src/loader.ts";

test("official assignment navigation rejects unsafe and ambiguous links", () => {
  const link = { textContent: "課題", href: `${ORIGIN}/portal/site/course/tool-reset/tool-a?other=ignored` };
  assert.deepEqual([...assignmentNavigationLinks([link])], [["course", assignmentLink("course", "tool-a")]]);
  for (const href of ["https://evil.invalid/portal/site/course/tool/tool-a", "javascript:alert(1)", `${ORIGIN}/portal/site/course/tool/%2Fbad`, `${ORIGIN}/portal/site/course/page/page-a`, `https://user:pass@lms.sirius.tuat.ac.jp/portal/site/course/tool/tool-a`]) {
    assert.equal(assignmentNavigationLinks([{ ...link, href }]).size, 0);
  }
  assert.equal(assignmentNavigationLinks([{ ...link, textContent: "課題ではないリンク" }]).size, 0);
  assert.equal(assignmentNavigationLinks([link, { ...link, href: `${ORIGIN}/portal/site/course/tool/tool-b` }]).size, 0);
  assert.throws(() => assignmentToolLink("x/y"), ApiError);
  assert.throws(() => assignmentLink("course", "x/y"), ApiError);
});

test("all courses link to assignments without extra tool requests or current-course dependence", async () => {
  for (const currentCourse of [undefined, "course-a", "course-b"]) {
    const requests: string[] = [];
    const loader = new Loader(new SiriusApi(async input => {
      const url = String(input); requests.push(url);
      assert.ok(!url.endsWith("/pages.json"));
      if (url.includes("/direct/site.json")) return Response.json({ site_collection: url.includes("_start=0") ? ["course-a", "course-b"].map(id => ({ id, title: id, published: true })) : [] });
      if (url.includes("/assignment/")) {
        const context = url.includes("course-a") ? "course-a" : "course-b";
        return Response.json({ assignment_collection: [{ id: "task", context, title: "Task", dueTime: null }] });
      }
      return Response.json({ sam_pub_collection: [] });
    }), () => {}, Date.now, currentCourse ? new Map([[currentCourse, assignmentLink(currentCourse, "nav-tool")]]) : new Map());
    await loader.refresh();
    assert.equal(requests.length, 6);
    assert.equal(loader.state.items.length, 2);
    for (const item of loader.state.items) {
      assert.equal(item.href, item.site.id === currentCourse ? assignmentLink(item.site.id, "nav-tool") : `${ORIGIN}/portal/site/${item.site.id}/assignment.grades`);
    }
    await loader.refresh(); assert.equal(requests.length, 6);
  }
});

test("deadline labels stay conservative", () => {
  for (const [offset, label] of [[-1, "期限超過"], [0, "まもなく締切"], [59_999, "まもなく締切"], [60_000, "残り1分"], [3_600_000, "残り1時間"], [86_400_000, "残り1日"]] as const) {
    assert.equal(remainingTime({ state: "known", at: 1000 + offset }, 1000), label);
  }
  assert.equal(remainingTime({ state: "unknown" }, 0), "期限不明");
});
