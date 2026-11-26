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
  await E(() => window.__editor.edit("r1"));
  await wait(400);
  const editable = await E(() => !!document.activeElement?.isContentEditable);
  check("a rectangle's words are being written", editable);
  await page.keyboard.type("East Africa logistics");
  await wait(200);
  await menu("Select All");
  await wait(300);
  const picked = await E(() => ({ sel: String(window.getSelection()), shapes: window.__editor.store.sel.size, editing: window.__editor.store.editing }));
  await shot?.("select-all-words");
  check("Select All takes the words being written", picked.sel === "East Africa logistics", picked);
  check("…and not the board's shapes", picked.shapes === 0 && picked.editing === "r1", picked);
  await page.keyboard.type("Haulage");
  await wait(200);
  const typed = await E(() => document.activeElement?.textContent);
  check("typing then replaces them", typed === "Haulage", typed);
  await menu("Undo");
  await wait(300);
  const undone = await E(() => ({ text: document.activeElement?.textContent, n: window.__editor.store.doc.order.length, editing: window.__editor.store.editing }));
  check("Undo takes back the typing, not the board", undone.text === "East Africa logistics" && undone.n === 2 && undone.editing === "r1", undone);
  await page.keyboard.press("Escape");
  await wait(300);
  await E(() => { document.activeElement?.blur?.(); });
  await menu("Select All");
  await wait(300);
  const all = await E(() => window.__editor.store.sel.size);
  check("with nothing being written, Select All takes every shape", all === 2, all);
};
