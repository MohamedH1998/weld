// A new person's first board, on a Mac that has Claude Code and Codex: nothing is switched on by itself. The first board
// offers each agent found with Enable; one press switches it on, and the board is ready to ask. Settings is a button
// in the corner, where each agent can be switched on or off, and ⌘K finds T3 Code.
//   node scripts/shot.mjs out/firstrun test/firstrun.mjs
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ page, shot }) => {
  // (as someone who has never switched an agent on)
  await page.evaluate(() => window.weld.saveSettings({ enabled: [] }));
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(2500);
  const rows = await page.locator(".setup-row").allInnerTexts();
  check("the first board offers the agents found, to switch on", rows.length >= 2 && rows.some((r) => /Claude/.test(r) && /Enable/.test(r)), rows);
  check("…and nothing is switched on by itself", (await page.locator(".welcome-tasks").count()) === 0);
  await shot?.("first-board");
  const go = page.locator(".setup-row").filter({ hasText: "Claude" }).locator(".setup-toggle");
  check("its buttons show the hand", (await go.evaluate((b) => getComputedStyle(b).cursor)) === "pointer");
  await go.click();
  await wait(140);
  await shot?.("enabling");
  await wait(600);
  check("one press switches Claude on, and the card says so and stays", (await page.locator('.setup-toggle[data-on]').count()) === 1 && (await page.locator(".setup").count()) === 1);
  await shot?.("enabled-one");
  await page.locator(".setup-row").filter({ hasText: "Codex" }).locator(".setup-toggle").click();
  await wait(600);
  check("…then Codex the same way", (await page.locator('.setup-toggle[data-on]').count()) === 2);
  await shot?.("enabled-both");
  // (the pointer off the card: it goes by itself a few seconds after the last press)
  await page.mouse.move(200, 200);
  await wait(3600);
  check("it goes by itself, and the board is ready to ask", (await page.locator(".setup").count()) === 0 && (await page.locator(".welcome-tasks").count()) === 1);

  await page.getByRole("button", { name: "Settings" }).click();
  await wait(600);
  const list = await page.locator(".settings-row").allInnerTexts();
  check("Settings opens from its button in the corner", list.length > 0, list);
  const on = (name) => page.locator(".settings-row").filter({ hasText: name }).getByRole("switch").getAttribute("aria-checked");
  check("…with Claude and Codex switched on", (await on("Claude")) === "true" && (await on("Codex")) === "true", [await on("Claude"), await on("Codex")]);
  check("…and T3 Code at the top", (await page.locator(".settings").innerText()).includes("T3 Code"));
  await shot?.("settings");
  await page.keyboard.press("Escape");
  await wait(400);

  await page.getByRole("button", { name: "Jump to" }).click();
  await wait(400);
  await page.keyboard.type("t3");
  await wait(400);
  const found = await page.locator("[role=option], .palette-row, .jump-row").allInnerTexts().catch(() => []);
  check("⌘K finds T3 Code", found.some((r) => /T3 Code/.test(r)) || /Connect T3 Code/.test(await page.locator("body").innerText()), found);
  await shot?.("palette");
};
