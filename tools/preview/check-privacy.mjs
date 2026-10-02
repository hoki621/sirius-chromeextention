// Run against the local synthetic preview only; accepts a Playwright Page.
export default async function checkPrivacy(page) {
  await page.goto("http://127.0.0.1:4173/?storage=mock&open=1");
  const panel = page.locator("#sirius-study-helper");
  await page.waitForFunction(() => {
    const root = document.querySelector("#sirius-study-helper")?.shadowRoot;
    return root?.querySelectorAll("a.title").length === 10 && [...root.querySelectorAll(".route")].every(node => node.hidden);
  }, {}, { timeout: 5000 });
  await panel.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "次回401を模擬" }).click();
  await page.getByRole("button", { name: "ツールバー起動を模擬" }).click();
  await page.evaluate(() => {
    const buttons = [...document.querySelector("#sirius-study-helper").shadowRoot.querySelectorAll("button")];
    buttons.find(button => button.textContent === "更新").click();
    buttons.find(button => button.textContent === "閉じる").click();
  });
  await page.waitForFunction(() => {
    const root = document.querySelector("#sirius-study-helper").shadowRoot;
    return !root.querySelector("dialog").open && !root.querySelector("a.title, .scope-row") && root.querySelector("select").options.length === 0;
  }, {}, { timeout: 3000 });
  return "Closed-panel authentication failure cleared private DOM";
}
