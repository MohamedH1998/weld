// A block of code in what an agent says has a copy button in its corner: pressed, it copies the whole block (and only
// it), and says so for a moment. (The page's clipboard is stood in for: a check never touches the person's own.)
//   WELD_SEED=0 node scripts/shot.mjs out/copycode test/copycode.mjs
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
  await E(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void window.__copied.push(t) }, configurable: true }); });
  // (the mock reads underscores as spaces and a written \n as a line break)
  const answer = "Run_this_on_the_Acme_box:\\n\\n```sh\\npsql_\"$DATABASE\"_-c_'select_1'\\nls_-la_orders.sql\\n```\\n\\nThen_tell_me.";
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`say:${answer}`);
  await page.keyboard.press("Enter");
  for (let t = 0; t < 80 && (await E(() => document.querySelector(".ask-capsule")?.getAttribute("data-state"))) !== "done"; t++) await wait(250);
  // (read on its card on the board, in hand)
  await page.click(".ask-capsule");
  await wait(500);
  await page.click("text=Put on the board");
  await wait(900);
  const block = page.locator('.live-node[data-kind="thread"] .code-block');
  check("a block of code in the answer has a copy button", (await block.count()) === 1 && (await block.locator(".code-copy").count()) === 1, await block.count());
  await block.hover();
  await wait(200);
  await shot?.("hover");
  await block.locator(".code-copy").click();
  await wait(150);
  const copied = await E(() => window.__copied);
  check("pressed, it copies the whole block and only it", copied.length === 1 && copied[0] === `psql "$DATABASE" -c 'select 1'\nls -la orders.sql`, copied);
  check("…and says so for a moment", (await block.locator(".code-copy").getAttribute("aria-label")) === "Copied");
  await shot?.("copied");
  await wait(1700);
  check("…then goes back to Copy", (await block.locator(".code-copy").getAttribute("aria-label")) === "Copy code");
  // the words around the block are not code: no button
  check("words outside the block have no copy button", (await E(() => document.querySelectorAll('.live-node[data-kind="thread"] .prose-live p .code-copy').length)) === 0);
};
