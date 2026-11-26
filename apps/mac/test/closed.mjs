// A thread's card closed with its X goes back to the bar, as it says ("Close (it stays in the bar)"): its capsule is
// there to open it again, whether it is working, done or already read, and still there after a reload.
//   WELD_SEED=0 node scripts/shot.mjs out/closed test/closed.mjs
import path from "node:path";

const MOCK = path.resolve("test/mock-acp-agent.mjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1200);
  const capsules = () => E(() => [...document.querySelectorAll(".ask-capsule .ask-title")].map((x) => x.textContent));
  // (asked, and waited for until that one is done: its own capsule, found by its title)
  const ask = async (words) => {
    await page.click(".ask-bar textarea");
    await page.keyboard.insertText(`say:${words}`);
    await page.keyboard.press("Enter");
    for (let t = 0; t < 80 && !(await E((w) => [...document.querySelectorAll(".ask-capsule")].some((c) => c.getAttribute("data-state") === "done" && c.textContent.includes(w)), `say:${words}`)); t++) await wait(250);
  };
  const capsuleOf = (words) => page.locator(".ask-capsule", { hasText: `say:${words}` });
  await ask("The_Acme_API_plan");
  // read (so nothing is unread), put on the board, then closed with its X
  await page.click(".ask-capsule");
  await wait(500);
  await page.click("text=Put on the board");
  await wait(800);
  check("(on the board, the bar has no capsule for it)", (await capsules()).length === 0, await capsules());
  await page.click('button[aria-label="Close this thread"]');
  await wait(600);
  const back = await capsules();
  check("closed with its X, a thread already read is back in the bar", back.length === 1, back);
  await shot?.("closed");
  // opened from the bar, folded, and still there
  await page.click(".ask-capsule");
  await wait(500);
  check("…its capsule opens it", await page.isVisible(".ask-reader"));
  await page.click("text=Fold");
  await wait(400);
  check("…and folded, it is still in the bar", (await capsules()).length === 1, await capsules());
  // a second thread, closed later, comes first
  await ask("The_Payments_review");
  await capsuleOf("The_Payments_review").click();
  await wait(500);
  await page.click("text=Put on the board");
  await wait(800);
  await page.click('button[aria-label="Close this thread"]');
  await wait(600);
  const two = await capsules();
  check("two closed threads are both in the bar, the latest first", two.length === 2 && /Payments/.test(two[0] ?? ""), two);
  // and after the app is opened again (once it has been written down)
  await wait(1500);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1500);
  const kept = await capsules();
  check("after a reload, they are still in the bar, in the same order", kept.length === 2 && /Payments/.test(kept[0] ?? "") && /Acme/.test(kept[1] ?? ""), kept);

  // with the bar's three places taken by threads that have something to say, a thread closed is behind "+N", which
  // opens the list of the rest to pick it from
  for (const w of ["Queue_check", "Billing_check", "Cache_check"]) await ask(w);
  const full = await capsules();
  check("(three threads with news take the bar's three places)", full.length === 3 && full.every((x) => /check/.test(x)), full);
  const more = page.locator(".ask-more");
  check("…and the closed ones are behind +N", (await more.innerText().catch(() => "")) === "+2");
  await more.click();
  await wait(300);
  const listed = await page.locator(".ask-more-list button").allInnerTexts();
  check("+N opens a list of them, the latest closed first", listed.length === 2 && /Payments/.test(listed[0] ?? ""), listed);
  await shot?.("more");
  // (Escape closes the list and leaves the board's selection be)
  await E(() => { const st = window.__editor.store; st.run(() => st.put({ id: "r1", kind: "rect", x: 0, y: 0, w: 120, h: 60, text: "Acme", tone: "ink", fill: "tint" })); st.select(["r1"]); st.emit(); });
  const sel0 = await E(() => [...window.__editor.store.sel].join());
  await page.keyboard.press("Escape");
  await wait(200);
  check("Escape closes the list, leaving what is selected on the board", !(await page.isVisible(".ask-more-list")) && sel0 === "r1" && (await E(() => [...window.__editor.store.sel].join())) === sel0, sel0);
  await more.click();
  await wait(300);
  await page.locator(".ask-more-list button", { hasText: "Acme" }).click();
  await wait(500);
  const reading = await E(() => document.querySelector(".ask-reader")?.textContent ?? "");
  check("…and picking one opens it", /Acme/.test(reading), reading.slice(0, 80));
};
