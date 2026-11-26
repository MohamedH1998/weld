// The conversation risen from the bar can be read like any page: scrolled through, and its words selected and copied,
// with the board left where it was.
//   WELD_SEED=0 node scripts/shot.mjs out/reader test/reader.mjs
import path from "node:path";

const MOCK = path.resolve("test/mock-acp-agent.mjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1200);
  // a shape on the board, selected: copying words must not copy it instead
  await E(() => { const st = window.__editor.store; st.run(() => st.put({ id: "r1", kind: "rect", x: 0, y: 0, w: 200, h: 100, text: "Acme API", tone: "ink", fill: "tint" })); st.select(["r1"]); st.emit(); });
  // a long answer, longer than the reader is tall
  const words = Array.from({ length: 60 }, (_, i) => `Step ${i + 1}: the checkout service calls the payments API and waits for its answer.`).join(" ");
  await page.click(".ask-bar textarea");
  await page.keyboard.insertText(`say:${words}`);
  await page.keyboard.press("Enter");
  for (let t = 0; t < 60 && (await E(() => document.querySelector(".ask-capsule")?.getAttribute("data-state"))) !== "done"; t++) await wait(250);
  await page.click(".ask-capsule");
  await wait(700);
  const box = await E(() => { const s = document.querySelector(".ask-reader .thread-scroll"); if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: s.scrollTop, max: s.scrollHeight - s.clientHeight, pe: getComputedStyle(s.closest(".live-body") ?? s).pointerEvents }; });
  check("the open conversation is longer than it is tall", box && box.max > 50, box);
  check("…and takes the pointer", box?.pe === "auto", box);
  await shot?.("reader-top");
  const cam0 = await E(() => JSON.stringify(window.__editor.store.cam));
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel(0, -400);
  await wait(300);
  await page.mouse.wheel(0, 300);
  await wait(400);
  const after = await E(() => document.querySelector(".ask-reader .thread-scroll").scrollTop);
  check("the wheel scrolls it", after !== box.top, { before: box.top, after });
  check("…and leaves the board where it was", (await E(() => JSON.stringify(window.__editor.store.cam))) === cam0);
  await shot?.("reader-scrolled");
  // words selected with a drag across them
  const line = await E(() => {
    const sc = document.querySelector(".ask-reader .thread-scroll"), view = sc.getBoundingClientRect(), w = document.createTreeWalker(sc, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!/Step \d+/.test(n.data)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const box = [...r.getClientRects()].find((q) => q.top > view.top + 20 && q.bottom < view.bottom - 20 && q.width > 120);
      if (box) return { x0: box.left + 2, x1: box.left + Math.min(box.width - 2, 260), y: box.top + box.height / 2 };
    }
    return null;
  });
  check("there is a line of the answer to select", !!line, line);
  if (line) {
    await page.mouse.move(line.x0, line.y);
    await page.mouse.down();
    await page.mouse.move(line.x1, line.y, { steps: 8 });
    await page.mouse.up();
    await wait(200);
  }
  const picked = await E(() => String(window.getSelection()));
  check("dragging across the words selects them", picked.length > 10, picked);
  await shot?.("reader-selected");
  // copying them: the board's own copy stands aside (the event goes to the page's default)
  const taken = await E(() => { const at = window.getSelection().anchorNode?.parentElement ?? document.body; const ev = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }); at.dispatchEvent(ev); return { prevented: ev.defaultPrevented, data: ev.clipboardData.getData("text/plain") }; });
  check("copying them copies the words, not the selected shape", !taken.prevented && taken.data === "", taken);
  check("…and the shape is still selected on the board", (await E(() => [...window.__editor.store.sel].join())) === "r1");
  // and the board's copy still works when no words are selected
  await E(() => window.getSelection().removeAllRanges());
  const board = await E(() => { const ev = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() }); document.body.dispatchEvent(ev); return { prevented: ev.defaultPrevented, data: ev.clipboardData.getData("text/plain").slice(0, 40) }; });
  check("with no words selected, copy takes the board's shape", board.prevented && /Acme API|"canvas"/.test(board.data), board);
};
