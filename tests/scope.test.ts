import assert from "node:assert/strict";
import { test } from "node:test";
import { isSiriusPortal } from "../src/scope.ts";

test("Sirius portal paths allow queries and hashes, but not adjacent paths/origins/frames", () => {
  for (const path of ["/portal", "/portal/", "/portal?lang=ja", "/portal#main", "/portal/site/course-1", "/portal/site/course-1?tool=assignments#main"]) {
    const url = `https://lms.sirius.tuat.ac.jp${path}`;
    assert.equal(isSiriusPortal(url, true), true, url);
    assert.equal(isSiriusPortal(url, false), false, `iframe: ${url}`);
  }
  for (const url of [
    "https://lms.sirius.tuat.ac.jp/portals",
    "https://lms.sirius.tuat.ac.jp/portal-other",
    "https://lms.sirius.tuat.ac.jp/portal/../direct/site.json",
    "https://lms.sirius.tuat.ac.jp/direct/site.json",
    "https://lms.sirius.tuat.ac.jp/portal%2Fsite",
    "http://lms.sirius.tuat.ac.jp/portal",
    "https://lms.sirius.tuat.ac.jp:444/portal",
    "https://lms.sirius.tuat.ac.jp.example.com/portal",
    "https://other.example/portal",
    "https://user:password@lms.sirius.tuat.ac.jp/portal",
    "not a URL",
  ]) assert.equal(isSiriusPortal(url, true), false, url);
});
