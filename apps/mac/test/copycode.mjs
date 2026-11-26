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
  const answer = "Run_this_on_the_Acme_box_(as_`deploy`):\\n\\n```sh\\npsql_\"$DATABASE\"_-c_'select_1'\\nls_-la_orders.sql\\n```\\n\\nThen_tell_me.";
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
  check("…and says so for a moment (and to a screen reader)", (await block.locator(".code-copy").getAttribute("title")) === "Copied" && (await E(() => document.querySelector('.code-block [role="status"]').textContent)) === "Copied");
  await shot?.("copied");
  await wait(1700);
  check("…then goes back to Copy", (await block.locator(".code-copy").getAttribute("title")) === "Copy");
  // the words around the block are not code: no button
  check("there is one copy button in the whole conversation (none for inline code or words)", (await E(() => document.querySelectorAll('.live-node[data-kind="thread"] .code-copy').length)) === 1);
  // a long line scrolls in its block, never under the button
  const apart = await E(() => { const b = document.querySelector('.live-node[data-kind="thread"] .code-block'), pre = b.querySelector("pre").getBoundingClientRect(), btn = b.querySelector(".code-copy").getBoundingClientRect(); return { preRight: pre.right, btnLeft: btn.left }; });
  check("the code and the button are side by side: the code never runs under it", apart.preRight <= apart.btnLeft + 0.5, apart);
  // when the clipboard can't be written, it says so, never "Copied"
  await E(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true }); document.execCommand = () => false; });
  await block.locator(".code-copy").click();
  await wait(150);
  check("a copy that fails says Couldn't copy, not Copied", (await block.locator(".code-copy").getAttribute("title")) === "Couldn't copy" && (await E(() => document.querySelector('.code-block [role="status"]').textContent)) === "Couldn't copy");

  // while an answer arrives: a block not yet closed has no button; a closed one keeps its button (the same one, with the
  // keys on it) as the words after it arrive
  await page.keyboard.press("Escape");
  const slow = "Here:\\n\\n```sh\\necho_one\\necho_two\\n```\\n\\n" + "and_then_the_rest_of_the_answer_".repeat(8);
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`pace:60 say:${slow}`);
  await page.keyboard.press("Enter");
  await wait(300);
  await page.locator(".ask-capsule", { hasText: "pace:60" }).click();
  let unfinished = false, kept = null;
  for (let t = 0; t < 120; t++) {
    const st = await E(() => { const r = document.querySelector(".ask-reader"); const b = r?.querySelector(".code-block"); const btn = b?.querySelector(".code-copy"); return { block: !!b, btn: !!btn, marked: !!btn?.dataset.mark, focused: !!btn && document.activeElement === btn, arriving: !!r?.querySelector(".thread-caret") }; });
    if (st.block && !st.btn && st.arriving) unfinished = true;
    if (st.btn && st.arriving && !kept) { await E(() => { const btn = document.querySelector(".ask-reader .code-copy"); btn.dataset.mark = "1"; btn.focus(); }); kept = "set"; await wait(400); const again = await E(() => { const btn = document.querySelector(".ask-reader .code-copy"); return { marked: !!btn?.dataset.mark, focused: !!btn && document.activeElement === btn, arriving: !!document.querySelector(".ask-reader .thread-caret") }; }); kept = again; }
    if (!st.arriving && kept) break;
    await wait(60);
  }
  check("while a block is still arriving, it has no copy button", unfinished);
  check("once closed, its button stays the same button, keys and all, as the rest arrives", !!kept && kept.marked && kept.focused && kept.arriving, kept);
};

