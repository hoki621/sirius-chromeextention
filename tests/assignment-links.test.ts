import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, ORIGIN, SiriusApi } from "../src/api.ts";
import { assignmentLink, assignmentToolLink, assignmentNavigationLinks, decodeAssignmentDeepLink, remainingTime } from "../src/model.ts";
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

const deepLink = (site: string, id = "task", action = "doView_submission") => ({ assignmentId: id, assignmentUrl: `${ORIGIN}/portal/directtool/tool-${site}?${new URLSearchParams({ assignmentId: id, assignmentReference: `/assignment/a/${site}/${id}`, panel: "Main", sakai_action: action })}` });

test("all courses link to individual assignments without pages requests or current-course dependence", async () => {
  for (const currentCourse of [undefined, "course-a", "course-b"]) {
    const requests: string[] = [];
    const loader = new Loader(new SiriusApi(async input => {
      const url = String(input); requests.push(url);
      assert.ok(!url.endsWith("/pages.json"));
      if (url.includes("/direct/site.json")) return Response.json({ site_collection: url.includes("_start=0") ? ["course-a", "course-b"].map(id => ({ id, title: id, published: true })) : [] });
      if (url.includes("/deepLink/")) return Response.json(deepLink(url.includes("course-a") ? "course-a" : "course-b"));
      if (url.includes("/assignment/")) {
        const context = url.includes("course-a") ? "course-a" : "course-b";
        return Response.json({ assignment_collection: [{ id: "task", context, title: "Task", dueTime: null }] });
      }
      return Response.json({ sam_pub_collection: [] });
    }), () => {}, Date.now, currentCourse ? new Map([[currentCourse, assignmentLink(currentCourse, "nav-tool")]]) : new Map());
    await loader.refresh();
    assert.equal(requests.length, 8);
    assert.equal(loader.state.items.length, 2);
    for (const item of loader.state.items) {
      assert.equal(item.detailState, "direct");
      assert.equal(item.href, decodeAssignmentDeepLink(deepLink(item.site.id), item.site.id, item.id));
    }
    await loader.refresh(); assert.equal(requests.length, 8);
  }
});

test("deep links accept only matching official student view actions and parameters", () => {
  for (const action of ["doView_submission", "doView_assignment_honorPledge", "doView_assignment_as_student"]) assert.ok(decodeAssignmentDeepLink(deepLink("course", "task", action), "course", "task"));
  assert.equal(decodeAssignmentDeepLink({ assignmentId: "task", assignmentUrl: "" }, "course", "task"), undefined);
  const original = deepLink("course");
  const badUrls = [
    original.assignmentUrl.replace(ORIGIN, "https://evil.invalid"),
    original.assignmentUrl.replace("https://", "http://"),
    original.assignmentUrl.replace("https://", "https://user:pass@"),
    original.assignmentUrl.replace("/directtool/", "/tool-reset/"),
    original.assignmentUrl + "#fragment", original.assignmentUrl + "&assignmentId=task", original.assignmentUrl + "&submitterId=someone",
    deepLink("other").assignmentUrl, deepLink("course", "other").assignmentUrl,
    ...["doSubmit", "doGrade_assignment", "doAccept_assignment_honor_pledge", "doView_assignment"].map(action => deepLink("course", "task", action).assignmentUrl),
  ];
  for (const assignmentUrl of badUrls) assert.throws(() => decodeAssignmentDeepLink({ assignmentId: "task", assignmentUrl }, "course", "task"), ApiError);
  assert.throws(() => decodeAssignmentDeepLink({ ...original, assignmentId: "other" }, "course", "task"), ApiError);
  assert.throws(() => decodeAssignmentDeepLink({}, "course", "task"), ApiError);
  const readonly = new URL(original.assignmentUrl); readonly.searchParams.delete("assignmentReference"); readonly.searchParams.set("sakai_action", "doView_assignment_as_student");
  assert.ok(decodeAssignmentDeepLink({ assignmentId: "task", assignmentUrl: readonly.href }, "course", "task"));
  readonly.searchParams.set("sakai_action", "doView_submission");
  assert.throws(() => decodeAssignmentDeepLink({ assignmentId: "task", assignmentUrl: readonly.href }, "course", "task"), ApiError);
});

test("EntityBroker collection and EntityData wrappers preserve all deep-link validation", () => {
  const link = deepLink("course"), expected = decodeAssignmentDeepLink(link, "course", "task");
  const wrappers = [(data: unknown) => ({ data }), (data: unknown) => ({ entityPrefix: "assignment", assignment_collection: [{ data }] }), (data: unknown) => ({ assignment_collection: [data] })];
  for (const wrap of wrappers) {
    assert.equal(decodeAssignmentDeepLink(wrap(link), "course", "task"), expected);
    assert.equal(decodeAssignmentDeepLink(wrap({ assignmentId: "task", assignmentUrl: "" }), "course", "task"), undefined);
    for (const bad of [{ ...link, assignmentId: "other" }, deepLink("other"), deepLink("course", "task", "doSubmit"), { ...link, assignmentUrl: "https://evil.invalid/" }]) assert.throws(() => decodeAssignmentDeepLink(wrap(bad), "course", "task"), ApiError);
  }
  for (const bad of [{ assignment_collection: [] }, { assignment_collection: [link, link] }, { entityPrefix: "other", assignment_collection: [link] }, { data: { data: link } }, { ...link, data: link }, { ...link, assignment_collection: [link] }]) assert.throws(() => decodeAssignmentDeepLink(bad, "course", "task"), ApiError);
});

test("link failures retain assignments, authentication clears them, rate limits stop links, and concurrency stays bounded", async () => {
  for (const result of ["ok", "forbidden", "http", "empty", "schema", "auth", "html", "rate"] as const) {
    let active = 0, peak = 0, links = 0;
    const loader = new Loader(new SiriusApi(async input => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve)); active--;
      const url = String(input);
      if (url.includes("/direct/site.json")) return Response.json({ site_collection: url.includes("_start=0") ? ["a", "b", "c", "d", "e"].map(id => ({ id, title: id, published: true })) : [] });
      const site = url.split("/").at(-2)!;
      if (url.includes("/deepLink/")) {
        links++;
        if (["forbidden", "http", "auth", "rate"].includes(result)) return new Response("", { status: result === "forbidden" ? 403 : result === "http" ? 404 : result === "auth" ? 401 : 429 });
        if (result === "html") return new Response("<html></html>", { headers: { "content-type": "text/html" } });
        return Response.json(result === "schema" ? {} : { entityPrefix: "assignment", assignment_collection: [{ data: result === "empty" ? { assignmentId: "task", assignmentUrl: "" } : deepLink(site) }] });
      }
      if (url.includes("/assignment/site/")) return Response.json({ assignment_collection: [{ id: "task", context: url.split("/").at(-1)!.replace(".json", ""), title: "Task", dueTime: null }] });
      return Response.json({ sam_pub_collection: [] });
    }), () => {});
    await loader.refresh(); assert.ok(peak <= 4);
    if (result === "auth" || result === "html") { assert.equal(loader.state.error, result); assert.equal(loader.state.items.length, 0); }
    else if (result === "rate") { assert.equal(loader.state.error, "rate-limit"); assert.ok(links <= 4); }
    else {
      assert.equal(loader.state.items.length, 5);
      for (const item of loader.state.items) {
        assert.equal(item.detailState, result === "ok" ? "direct" : "fallback");
        if (result !== "ok") assert.equal(item.href, assignmentToolLink(item.site.id));
      }
    }
  }
});

test("deadline labels stay conservative", () => {
  for (const [offset, label] of [[-1, "期限超過"], [0, "まもなく締切"], [59_999, "まもなく締切"], [60_000, "残り1分"], [3_600_000, "残り1時間"], [86_400_000, "残り1日"]] as const) {
    assert.equal(remainingTime({ state: "known", at: 1000 + offset }, 1000), label);
  }
  assert.equal(remainingTime({ state: "unknown" }, 0), "期限不明");
});
