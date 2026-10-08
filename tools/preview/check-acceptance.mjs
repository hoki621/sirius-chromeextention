// Local synthetic data only. Pass this function to playwright-cli run-code.
export default async function checkAcceptance(page) {
  const ensure = (value, message) => { if (!value) throw Error(message); };
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://127.0.0.1:4173/?storage=mock");
  await page.getByRole("textbox", { name: "入力保持テスト" }).fill("保持する入力");
  await page.getByRole("button", { name: "ツールバー起動を模擬" }).click();
  const panel = page.locator("#sirius-study-helper");
  await page.waitForFunction(() => {
    const root = document.querySelector("#sirius-study-helper")?.shadowRoot;
    return root?.querySelectorAll("a.title").length === 10 && [...root.querySelectorAll(".route")].every(node => node.hidden);
  });
  ensure(await panel.locator("img").count() === 0, "API text became HTML");
  const search = panel.getByRole("searchbox", { name: "課題名で検索" });
  await search.fill("今日のレポート");
  ensure(await panel.locator("a.title").count() === 2, "Search failed");
  // Completion removes the clicked row; check() would retry against the next row.
  await panel.getByRole("checkbox", { name: /自分のリストで完了$/ }).first().click();
  ensure(await panel.locator("a.title").count() === 1, "Completion filter failed");
  await panel.locator("summary").filter({ hasText: "絞り込み" }).click();
  await panel.getByRole("checkbox", { name: "自分のリストで完了した項目も表示" }).check();
  ensure(await panel.locator("a.title").count() === 2, "Show completed failed");
  await panel.getByRole("combobox", { name: "科目・サイト" }).selectOption("demo-a");
  ensure(await panel.locator("a.title").count() === 1, "Course filter failed");
  const href = await panel.locator("a.title").getAttribute("href");
  ensure(href?.includes("/portal/directtool/") && href.includes("assignmentId="), "Individual link missing");
  await search.press("Escape");
  ensure(await page.getByRole("textbox", { name: "入力保持テスト" }).inputValue() === "保持する入力", "Official form input lost");
  await page.getByRole("button", { name: "ローカル操作", exact: true }).click();
  ensure(await page.locator("#official-result").textContent() === "ローカルフォームの操作を確認", "Official form blocked");
  await page.goto("http://127.0.0.1:4173/?open=1");
  await page.waitForFunction(() => {
    const root = document.querySelector("#sirius-study-helper")?.shadowRoot;
    return root?.querySelectorAll("a.title").length === 10 && [...root.querySelectorAll(".route")].every(node => node.hidden);
  });
  await panel.getByRole("searchbox", { name: "課題名で検索" }).fill("架空");
  await page.screenshot({ path: "assets/store/screenshot-1280x800.png" });
  await page.setViewportSize({ width: 640, height: 400 });
  for (const name of ["更新", "閉じる"]) {
    const box = await panel.getByRole("button", { name, exact: true }).boundingBox();
    ensure(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 640 && box.y + box.height <= 400, `${name} outside small viewport`);
  }
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "アカウント変更を模擬" }).click();
  await page.waitForFunction(() => !document.getElementById("sirius-study-helper"));
  return "Synthetic search, completion, course filter, individual URL, Escape, form, small viewport and identity invalidation passed; not real Chrome zoom or Sirius acceptance";
}
