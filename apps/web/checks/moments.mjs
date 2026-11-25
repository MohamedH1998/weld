// A long row of moments is shown in part, and a diagram is put down at its first moment.
import { open } from "./lib.mjs";
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const row = (page) => page.evaluate(() => [...document.querySelectorAll('[role="tablist"][aria-label="Moments"] > *')].map((e) => (e.getAttribute("aria-label") ?? "").replace("Moment ", "").replace(/Show all.*/, "…").replace("Show fewer moments", "<")).join(" "));
for (const [name, w, h, first, mid] of [["a wide screen", 1200, 700, "1 2 3 4 5 6 7 8 … 12", "1 … 4 5 6 7 8 9 10 … 12"], ["a narrow one", 420, 720, "1 2 3 4 … 12", "1 … 6 7 8 … 12"]]) {
  const { page, errs, close } = await open({ w, h, path: "/?demo=1&scene=workers" });
  await page.waitForFunction(() => window.__editor.store.doc.order.length > 3);
  ok(`${name}: a diagram is put down at its first moment`, (await page.evaluate(() => Object.values(window.__editor.store.doc.scenes)[0].at)) === 0);
  ok(`${name}: twelve moments show the first few, "…" and the last`, (await row(page)) === first, await row(page));
  await page.evaluate(() => { const e = window.__editor; e.showMoment(Object.keys(e.store.doc.scenes)[0], 6); }); await page.waitForTimeout(200);
  ok(`${name}: the one on show keeps its neighbours beside it`, (await row(page)) === mid, await row(page));
  await page.getByRole("button", { name: /Show all 12 moments/ }).first().click(); await page.waitForTimeout(200);
  ok(`${name}: "…" opens the whole row`, (await row(page)) === "1 2 3 4 5 6 7 8 9 10 11 12 <", await row(page));
  await page.getByRole("button", { name: "Show fewer moments" }).click(); await page.waitForTimeout(200);
  ok(`${name}: and it folds away again`, (await row(page)) === mid, await row(page));
  ok(`${name}: no errors`, errs.filter((e) => !e.includes("404")).length === 0, errs.join(" | "));
  await close();
}
// the wheel over a control scrolls that control, and the board stays put
{ const { page, errs, close } = await open({ w: 420, h: 720, path: "/?demo=1&scene=workers" });
  await page.waitForFunction(() => window.__editor.store.doc.order.length > 3);
  await page.getByRole("button", { name: /Show all 12 moments/ }).first().click(); await page.waitForTimeout(200);
  const at = await page.evaluate(() => { const el = document.querySelector('[role="tablist"][aria-label="Moments"]'), r = el.getBoundingClientRect(); el.scrollLeft = 0; return { x: r.x + r.width / 2, y: r.y + r.height / 2, cam: { ...window.__editor.store.cam } }; });
  await page.mouse.move(at.x, at.y); await page.mouse.wheel(0, 120); await page.waitForTimeout(150);
  let now = await page.evaluate(() => ({ left: document.querySelector('[role="tablist"][aria-label="Moments"]').scrollLeft, cam: { ...window.__editor.store.cam } }));
  ok("two fingers over the row of moments scroll the row, not the board", now.left > 50 && now.cam.x === at.cam.x && now.cam.y === at.cam.y, JSON.stringify(now));
  await page.mouse.wheel(-80, 0); await page.waitForTimeout(150);
  const back = await page.evaluate(() => ({ left: document.querySelector('[role="tablist"][aria-label="Moments"]').scrollLeft, cam: { ...window.__editor.store.cam } }));
  ok("sideways too", back.left < now.left && back.cam.x === at.cam.x, JSON.stringify(back));
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: "Diagrams" }).click(); await page.waitForTimeout(300);
  const lib = await page.evaluate(() => { const el = [...document.querySelectorAll("div")].find((d) => /auto/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight + 20 && d.querySelector('[role="group"][aria-label="Diagrams"]')); const r = el.getBoundingClientRect(); el.dataset.lib = "1"; return { x: r.x + r.width / 2, y: r.y + r.height / 2, cam: { ...window.__editor.store.cam } }; });
  await page.mouse.move(lib.x, lib.y); await page.mouse.wheel(0, 150); await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ top: document.querySelector("[data-lib]").scrollTop, cam: { ...window.__editor.store.cam } }));
  ok("and over the list of shapes, the list scrolls", after.top > 50 && after.cam.x === lib.cam.x && after.cam.y === lib.cam.y, JSON.stringify(after));
  await page.keyboard.press("Escape"); await page.mouse.move(200, 150); await page.mouse.wheel(0, 100); await page.waitForTimeout(150);
  ok("over the board itself the wheel still moves the board", (await page.evaluate(() => window.__editor.store.cam.y)) !== lib.cam.y);
  ok("no errors", errs.filter((e) => !e.includes("404")).length === 0, errs.join(" | "));
  await close(); }
console.log(`\n${pass} passed, ${fail} failed`);
