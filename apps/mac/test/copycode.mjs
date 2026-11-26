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
  const answer = "Run_this_on_the_Acme_box_(as_`deploy`):\\n\\n```sh\\npsql_\"$DATABASE\"_-c_'select_1'\\nls_-la_orders.sql\\necho_" + "x".repeat(240) + "\\n```\\n\\nThen_tell_me.";
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
  check("pressed, it copies the whole block and only it", copied.length === 1 && copied[0] === `psql "$DATABASE" -c 'select 1'\nls -la orders.sql\necho ${"x".repeat(240)}`, copied);
  check("…and says so for a moment (and to a screen reader)", (await block.locator(".code-copy").getAttribute("title")) === "Copied" && (await E(() => document.querySelector('.code-block [role="status"]').textContent)) === "Copied");
  await shot?.("copied");
  await wait(1700);
  check("…then goes back to Copy", (await block.locator(".code-copy").getAttribute("title")) === "Copy");
  // the words around the block are not code: no button
  check("there is one copy button in the whole conversation (none for inline code or words)", (await E(() => document.querySelectorAll('.live-node[data-kind="thread"] .code-copy').length)) === 1);
  // a long line scrolls in its block, never under the button
  const apart = await E(() => { const b = document.querySelector('.live-node[data-kind="thread"] .code-block'), pre = b.querySelector("pre").getBoundingClientRect(), btn = b.querySelector(".code-copy").getBoundingClientRect(); const el = b.querySelector("pre"); return { preRight: pre.right, btnLeft: btn.left, scrolls: el.scrollWidth > el.clientWidth }; });
  check("a long line scrolls in its block, beside the button, never under it", apart.scrolls && apart.preRight <= apart.btnLeft + 0.5, apart);
  // when the clipboard can't be written, it says so, never "Copied"
  await E(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("denied"); } }, configurable: true }); document.execCommand = () => false; });
  await block.locator(".code-copy").click();
  await wait(150);
  check("a copy that fails says Couldn't copy, not Copied", (await block.locator(".code-copy").getAttribute("title")) === "Couldn't copy" && (await E(() => document.querySelector('.code-block [role="status"]').textContent)) === "Couldn't copy");

  // while an answer arrives: a block not yet closed has no button; a closed one keeps its button (the same one, with the
  // keys on it) as the words after it arrive
  await page.keyboard.press("Escape");
  // (a numbered list straight after the block: as its "1" arrives alone it is a part of its own, then it joins the block's)
  const slow = "Here:\\n\\n```sh\\necho_one\\necho_two\\n```\\n\\n1._Restart_the_server_and_wait_for_it\\n2._Check_the_logs_for_errors\\n3._" + "and_then_the_rest_".repeat(6);
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
  check("once closed, its button stays the same button, keys and all, as the rest (a numbered list) arrives", !!kept && kept.marked && kept.focused && kept.arriving, kept);

  // a block fenced with four backticks, holding a three-backtick example: ready only once its own (four-backtick) fence
  // closes, not at the inner one
  await page.keyboard.press("Escape");
  // (with a blank line inside the inner example: the answer is still one block, not cut where the example's lines go on)
  const nested = "A_README:\\n\\n````md\\nRun:\\n```sh\\n\\necho_one\\n```\\nthen_the_rest_of_the_readme_" + "goes_here_".repeat(10) + "\\n````\\n\\nDone.";
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`pace:50 say:${nested}`);
  await page.keyboard.press("Enter");
  await wait(300);
  await page.locator(".ask-capsule", { hasText: "pace:50" }).click();
  let early = false, seenOpen = false;
  for (let t = 0; t < 150; t++) {
    const st = await E(() => {
      const r = document.querySelector(".ask-reader"), arriving = !!r?.querySelector(".thread-caret");
      const said = [...(r?.querySelectorAll(".prose-live") ?? [])].map((x) => x.textContent).join("");
      const inner = r?.querySelector(".code-block pre")?.textContent ?? "";
      void said;
      // (its words all in: the readme's last line has arrived; until then it is certainly not closed)
      return { arriving, btn: !!r?.querySelector(".code-block .code-copy"), block: !!r?.querySelector(".code-block"), closed: (inner.match(/goes here/g) ?? []).length >= 10 };
    });
    if (st.block && st.arriving) seenOpen = true;
    if (st.btn && st.arriving && !st.closed) early = true;
    if (!st.arriving && seenOpen) break;
    await wait(60);
  }
  check("a four-backtick block holding a three-backtick example has no button until its own fence closes", seenOpen && !early, { seenOpen, early });
  const whole = await E(() => { const r = document.querySelector(".ask-reader"), last = [...r.querySelectorAll(".prose-live")].at(-1); return { blocks: last.querySelectorAll(".code-block").length, buttons: last.querySelectorAll(".code-copy").length, text: last.querySelector(".code-block pre")?.textContent ?? "" }; });
  check("…and once done it is one block, with one button, holding all of it", whole.blocks === 1 && whole.buttons === 1 && whole.text.includes("echo one") && (whole.text.match(/goes here/g) ?? []).length === 10, whole);

  // an answer whose lines end \r\n (a blank line in its block): one block, one button, all of it copied
  await page.keyboard.press("Escape");
  await E(() => { window.__copied = []; Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => void window.__copied.push(t) }, configurable: true }); });
  const crlf = "Windows_lines:\\r\\n\\r\\n```sh\\r\\necho_one\\r\\n\\r\\necho_two\\r\\n```\\r\\n\\r\\nDone_with_crlf.";
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`say:${crlf}`);
  await page.keyboard.press("Enter");
  for (let t = 0; t < 60 && !(await E(() => [...document.querySelectorAll(".ask-capsule")].some((c) => /Windows/.test(c.textContent) && c.getAttribute("data-state") === "done"))); t++) await wait(250);
  await page.locator(".ask-capsule", { hasText: "Windows" }).click();
  await wait(500);
  const cr = await E(() => { const last = [...document.querySelector(".ask-reader").querySelectorAll(".prose-live")].at(-1); return { blocks: last.querySelectorAll(".code-block").length, buttons: last.querySelectorAll(".code-copy").length }; });
  check("lines ended \\r\\n: one block, one button", cr.blocks === 1 && cr.buttons === 1, cr);
  await E(() => document.querySelector(".ask-reader .prose-live:last-child .code-copy, .ask-reader .code-copy:last-of-type")?.click());
  await wait(200);
  const got = await E(() => window.__copied.at(-1) ?? "");
  check("…and the copy holds all of it", /echo one/.test(got) && /echo two/.test(got), got);

  // a fenced block inside a numbered list (opened at three spaces, closed at four), then a plain block after it: both
  // whole, each copied entire
  await page.keyboard.press("Escape");
  const listed = "Steps:\\n\\n1._Start_it:\\n\\n___```sh\\n___npm_start\\n____```\\n\\nThen:\\n\\n```\\nStarting\\n\\nReady\\n```\\n\\nDone_listing.";
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`say:${listed}`);
  await page.keyboard.press("Enter");
  for (let t = 0; t < 60 && !(await E(() => [...document.querySelectorAll(".ask-capsule")].some((c) => /Steps/.test(c.textContent) && c.getAttribute("data-state") === "done"))); t++) await wait(250);
  await page.locator(".ask-capsule", { hasText: "Steps" }).click();
  await wait(500);
  const two = await E(() => [...document.querySelector(".ask-reader").querySelectorAll(".code-block pre")].map((p) => p.textContent));
  check("a block in a list and one after it are both whole", two.length >= 2 && two.some((t) => /npm start/.test(t)) && two.some((t) => /Starting/.test(t) && /Ready/.test(t)), two);

  // a README in a block, with an indented example in a list inside it: one block, the example's fence its words
  await page.keyboard.press("Escape");
  const readme = "The_README:\\n\\n```markdown\\n1._To_run:\\n\\n____```sh\\n____npm_start\\n____```\\n\\nThen_open_the_browser.\\n```\\n\\nDone_readme.";
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`say:${readme}`);
  await page.keyboard.press("Enter");
  for (let t = 0; t < 60 && !(await E(() => [...document.querySelectorAll(".ask-capsule")].some((c) => /The_README/.test(c.textContent) && c.getAttribute("data-state") === "done"))); t++) await wait(250);
  await page.locator(".ask-capsule", { hasText: "The_README" }).click();
  await wait(500);
  const rd = await E(() => { const last = [...document.querySelector(".ask-reader").querySelectorAll(".prose-live")]; const blocks = last.flatMap((x) => [...x.querySelectorAll(".code-block pre")]).map((p) => p.textContent); return blocks; });
  check("a block holding an indented example (in a list) is one block, the example's fences its words", rd.length === 1 && /npm start/.test(rd[0] ?? "") && /Then open the browser/.test(rd[0] ?? ""), rd);
};

