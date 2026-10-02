import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ORIGIN, SiriusApi } from "../src/api.ts";
import { assignmentLink, assignmentNavigationLinks, courseLink, decodeAssignmentLink, remainingTime } from "../src/model.ts";
import { Loader } from "../src/loader.ts";

const pages = (siteId = "course", placementId = "assignment-tool") => [{ siteId, tools: [{ siteId, placementId, id: placementId, toolId: "sakai.assignment.grades", url: "javascript:alert(1)" }] }];
const assignments = { assignment_collection: [{ id: "task", context: "course", title: "Task", dueTime: null }] };
const siteList = { site_collection: [{ id: "course", title: "Course", published: true, type: "project" }] };

test("assignment destinations use the validated course and placement, never response URLs", () => {
  const expected = `${ORIGIN}/portal/site/course/tool/assignment-tool?panel=Main`;
  assert.equal(decodeAssignmentLink(pages(), "course"), expected);
  assert.equal(decodeAssignmentLink({ site_collection: pages() }, "course"), expected);
  assert.equal(decodeAssignmentLink(pages("other"), "course"), undefined);
  assert.equal(decodeAssignmentLink(pages("course", "../evil"), "course"), undefined);
  assert.equal(decodeAssignmentLink([...pages(), ...pages("course", "second-tool")], "course"), undefined);
  assert.equal(decodeAssignmentLink([{ siteId: "course", tools: [{ ...pages()[0]!.tools[0], id: "wrong" }] }], "course"), undefined);
  assert.equal(decodeAssignmentLink([{ siteId: "course", tools: [{ ...pages()[0]!.tools[0], toolId: "sakai.samigo" }] }], "course"), undefined);
  assert.throws(() => decodeAssignmentLink({}, "course"), ApiError);
  assert.throws(() => assignmentLink("course", "x/y"), ApiError);
});

test("official assignment navigation can avoid another request; unsafe and ambiguous links are ignored", () => {
  const link = { textContent: "課題", href: `${ORIGIN}/portal/site/course/tool-reset/tool-a?other=ignored` };
  assert.deepEqual([...assignmentNavigationLinks([link])], [["course", assignmentLink("course", "tool-a")]]);
  for (const href of ["https://evil.invalid/portal/site/course/tool/tool-a", "javascript:alert(1)", `${ORIGIN}/portal/site/course/tool/%2Fbad`, `${ORIGIN}/portal/site/course/page/page-a`, `https://user:pass@lms.sirius.tuat.ac.jp/portal/site/course/tool/tool-a`]) {
    assert.equal(assignmentNavigationLinks([{ ...link, href }]).size, 0);
  }
  assert.equal(assignmentNavigationLinks([{ ...link, textContent: "課題ではないリンク" }]).size, 0);
  assert.equal(assignmentNavigationLinks([link, { ...link, href: `${ORIGIN}/portal/site/course/tool/tool-b` }]).size, 0);
});

test("loader resolves only nonempty assignment sites and preserves items if link discovery fails", async () => {
  for (const result of ["ok", "forbidden", "malformed", "ambiguous", "auth", "rate"] as const) {
    const requests: string[] = [];
    const loader = new Loader(new SiriusApi(async input => {
      const url = String(input); requests.push(url);
      if (url.includes("/direct/site.json")) return Response.json(url.includes("_start=0") ? siteList : { site_collection: [] });
      if (url.includes("/assignment/")) return Response.json(assignments);
      if (url.endsWith("/pages.json")) {
        if (result === "forbidden") return new Response("", { status: 403 });
        if (result === "auth") return new Response("", { status: 401 });
        if (result === "rate") return new Response("", { status: 429 });
        return Response.json(result === "malformed" ? {} : result === "ambiguous" ? [...pages(), ...pages("course", "second-tool")] : pages());
      }
      return Response.json({ sam_pub_collection: [] });
    }), () => {});
    await loader.refresh();
    assert.equal(requests.filter(url => url.endsWith("/pages.json")).length, 1);
    if (result === "auth" || result === "rate") {
      assert.equal(loader.state.error, result === "auth" ? "auth" : "rate-limit");
      assert.equal(loader.state.items.length, 0);
    } else {
      assert.equal(loader.state.scopes[0]!.state, "ok");
      assert.equal(loader.state.items[0]!.href, result === "ok" ? assignmentLink("course", "assignment-tool") : courseLink("course"));
    }
    const count = requests.length; await loader.refresh();
    assert.equal(requests.length, result === "auth" ? count * 2 : count);
  }
});

test("verified navigation uses no pages request and deadline labels stay conservative", async () => {
  const loader = new Loader(new SiriusApi(async input => {
    const url = String(input); assert.ok(!url.endsWith("/pages.json"));
    return Response.json(url.includes("/direct/site.json") ? url.includes("_start=0") ? siteList : { site_collection: [] } : url.includes("/assignment/") ? assignments : { sam_pub_collection: [] });
  }), () => {}, Date.now, new Map([["course", assignmentLink("course", "nav-tool")]]));
  await loader.refresh(); assert.equal(loader.state.items[0]!.href, assignmentLink("course", "nav-tool"));
  for (const [offset, label] of [[-1, "期限超過"], [0, "まもなく締切"], [59_999, "まもなく締切"], [60_000, "残り1分"], [3_600_000, "残り1時間"], [86_400_000, "残り1日"]] as const) {
    assert.equal(remainingTime({ state: "known", at: 1000 + offset }, 1000), label);
  }
  assert.equal(remainingTime({ state: "unknown" }, 0), "期限不明");
});
