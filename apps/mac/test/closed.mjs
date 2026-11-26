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
  const ask = async (words) => {
    await page.click(".ask-bar textarea");
    await page.keyboard.insertText(`say:${words}`);
    await page.keyboard.press("Enter");
    for (let t = 0; t < 80 && !(await E(() => [...document.querySelectorAll(".ask-capsule")].some((c) => c.getAttribute("data-state") === "done"))); t++) await wait(250);
  };
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
  await page.click(".ask-capsule >> nth=0");
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
  check("after a reload, they are still in the bar", kept.length === 2, kept);
};
