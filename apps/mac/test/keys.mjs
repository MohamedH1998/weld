// The Edit menu's Select All and Undo answer whatever has the keys: words being written in a shape take ⌘A and ⌘Z for
// themselves, and the board takes them only when nothing is being written.
//   WELD_SEED=0 node scripts/shot.mjs out/keys test/keys.mjs
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  // (the menu item itself, pressed as the menu bar would press it)
  const menu = (label) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    const find = (items) => { for (const i of items) { if (i.label === label) return i; const s = i.submenu && find(i.submenu.items); if (s) return s; } return null; };
    const w = BrowserWindow.getAllWindows()[0];
    w.focus();
    find(Menu.getApplicationMenu().items)?.click(undefined, w, w.webContents);
  }, label);
  await wait(1500);
  await E(() => {
    const st = window.__editor.store;
    st.run(() => {
      st.put({ id: "r1", kind: "rect", x: 0, y: 0, w: 320, h: 120, text: "", tone: "ink", fill: "tint" });
      st.put({ id: "r2", kind: "rect", x: 400, y: 0, w: 200, h: 120, text: "other", tone: "ink", fill: "tint" });
    });
    window.__editor.fit(["r1", "r2"]);
    st.select([]);
    st.emit();
  });
  await wait(500);
  // (a draft left in the bar, with typing of its own to take back)
  const bar = page.getByRole("textbox", { name: "Ask an agent" });
  await bar.click();
  await page.keyboard.type("draft for later");
  await wait(200);
  // the rectangle opened as a person opens it: a double-click on it
  const at = await E(() => { const e = window.__editor, x = e.store.doc.shapes.r1, c = e.store.cam; return { x: (x.x + x.w / 2 - c.x) * c.z, y: (x.y + x.h / 2 - c.y) * c.z }; });
  await page.mouse.dblclick(at.x, at.y);
  await wait(400);
  const editable = await E(() => !!document.activeElement?.isContentEditable && window.__editor.store.editing === "r1");
  check("a double-click opens the rectangle's words", editable);
  const state = () => E(() => ({ text: document.activeElement?.isContentEditable ? document.activeElement.textContent : null, editing: window.__editor.store.editing, n: window.__editor.store.doc.order.length, draft: document.querySelector('textarea[aria-label="Ask an agent"]')?.value }));
  await menu("Undo");
  await wait(300);
  const s0 = await state();
  check("Undo before anything is typed changes nothing: not the draft, not the board, not the edit", s0.draft === "draft for later" && s0.editing === "r1" && s0.n === 2 && s0.text === "", s0);
  await page.keyboard.type("Acme");
  await wait(800);
  await page.keyboard.type(" API gateway");
  await wait(200);
  await menu("Select All");
  await wait(300);
  const picked = await E(() => ({ sel: String(window.getSelection()), shapes: window.__editor.store.sel.size, editing: window.__editor.store.editing }));
  await shot?.("select-all-words");
  check("Select All takes the words being written", picked.sel === "Acme API gateway", picked);
  check("…and not the board's shapes", picked.shapes <= 1 && picked.editing === "r1", picked);
  await page.keyboard.type("Checkout service");
  await wait(200);
  check("typing then replaces them", (await state()).text === "Checkout service");
  await menu("Undo");
  await wait(300);
  const s1 = await state();
  check("Undo takes back the last burst of typing, and only the rectangle's", s1.text === "Acme API gateway" && s1.n === 2 && s1.editing === "r1" && s1.draft === "draft for later", s1);
  await menu("Undo");
  await wait(300);
  check("…and the burst before it", (await state()).text === "Acme", await state());
  await menu("Redo");
  await wait(300);
  await menu("Redo");
  await wait(300);
  const s2 = await state();
  check("Redo brings them back, in order", s2.text === "Checkout service" && s2.draft === "draft for later", s2);
  await page.keyboard.press("Escape");
  await wait(300);
  const kept = await E(() => window.__editor.store.doc.shapes.r1.text);
  check("what was written is kept when the edit ends", kept === "Checkout service", kept);
  await wait(300);
  await E(() => { document.activeElement?.blur?.(); });
  await menu("Select All");
  await wait(300);
  const all = await E(() => window.__editor.store.sel.size);
  check("with nothing being written, Select All takes every shape", all === 2, all);
};
