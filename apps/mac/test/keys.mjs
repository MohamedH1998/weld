// The Edit menu's Select All, Undo and Redo answer whatever has the keys: words being written in a shape take them for
// themselves (with an undo of their own, so a draft elsewhere is never reached), and the board takes them only when
// nothing is being written.
//   WELD_SEED=0 node scripts/shot.mjs out/keys test/keys.mjs
import path from "node:path";

const MOCK = path.resolve("test/mock-acp-agent.mjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ app, page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  // (the menu item itself, pressed as the menu bar would press it)
  const menu = (label) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    const find = (items) => { for (const i of items) { if (i.label === label) return i; const s = i.submenu && find(i.submenu.items); if (s) return s; } return null; };
    const w = BrowserWindow.getAllWindows()[0];
    find(Menu.getApplicationMenu().items)?.click(undefined, w, w.webContents);
  }, label);
  // (the bar has an agent to ask, as on any Mac: the mock one, no credentials)
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1500);
  await E(() => {
    const st = window.__editor.store;
    st.run(() => {
      st.put({ id: "r1", kind: "rect", x: 0, y: 0, w: 320, h: 120, text: "", tone: "ink", fill: "tint" });
      st.put({ id: "r2", kind: "rect", x: 400, y: 0, w: 200, h: 120, text: "Billing", tone: "ink", fill: "tint" });
      st.put({ id: "p1", kind: "panel", x: 0, y: 200, w: 320, h: 120, text: "Acme API", tone: "ink", fill: "none" });
    });
    window.__editor.fit(["r1", "r2", "p1"]);
    st.select([]);
    st.emit();
  });
  await wait(500);
  const center = (id) => E((id) => { const e = window.__editor, x = e.store.doc.shapes[id], c = e.store.cam; return { x: (x.x + x.w / 2 - c.x) * c.z, y: (x.y + x.h / 2 - c.y) * c.z }; }, id);
  const state = () => E(() => ({ html: document.activeElement?.isContentEditable ? document.activeElement.innerHTML : null, text: document.activeElement?.isContentEditable ? document.activeElement.textContent : null, editing: window.__editor.store.editing, n: window.__editor.store.doc.order.length, draft: document.querySelector(".ask-bar textarea")?.value }));

  // a draft left in the bar with undo and redo of its own pending: "draft for" typed, " later" taken back
  const bar = page.locator(".ask-bar textarea");
  await bar.click();
  await page.keyboard.type("draft for");
  await wait(700);
  await page.keyboard.type(" later");
  await wait(200);
  await menu("Undo");
  await wait(200);
  // (how much one undo takes back in a field is the page's own business: whatever is left, it must stay)
  const D = await E(() => document.querySelector(".ask-bar textarea").value);
  check("the draft has typing to undo and to redo", D !== "draft for later" && D.startsWith("draft for"), D);

  // the rectangle opened as a person opens it: a double-click on it
  const at = await center("r1");
  await page.mouse.dblclick(at.x, at.y);
  await wait(400);
  check("a double-click opens the rectangle's words", (await state()).editing === "r1");
  for (const what of ["Undo", "Redo"]) {
    await menu(what);
    await wait(250);
    const s = await state();
    check(`${what} before anything is typed changes nothing: not the draft, not the board, not the edit`, s.draft === D && s.editing === "r1" && s.n === 3 && s.text === "", s);
  }
  await page.keyboard.type("Acme");
  await wait(800);
  await page.keyboard.type(" API gateway");
  await menu("Select All");
  await wait(150);
  const picked = await E(() => ({ sel: String(window.getSelection()), shapes: window.__editor.store.sel.size, editing: window.__editor.store.editing }));
  check("Select All takes the words being written", picked.sel === "Acme API gateway", picked);
  check("…and not the board's shapes", picked.shapes <= 1 && picked.editing === "r1", picked);
  // (typing over the selection at once, within a burst's moment: it is still its own step)
  await page.keyboard.type("Checkout");
  await wait(100);
  check("typing then replaces them", (await state()).text === "Checkout");
  await shot?.("typed-over");
  await menu("Undo");
  await wait(250);
  const s1 = await state();
  check("Undo takes back what was typed over the selection, and only the rectangle's", s1.text === "Acme API gateway" && s1.n === 3 && s1.editing === "r1" && s1.draft === D, s1);
  await menu("Undo");
  await wait(250);
  check("…then the burst before it", (await state()).text === "Acme");
  await menu("Redo");
  await wait(250);
  check("Redo brings back the first", (await state()).text === "Acme API gateway");
  await menu("Redo");
  await wait(250);
  const s2 = await state();
  check("…then the next", s2.text === "Checkout" && s2.draft === D, s2);
  // a second line, taken back and brought back, is still a second line
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("service");
  await wait(700);
  await menu("Undo");
  await wait(200);
  await menu("Redo");
  await wait(200);
  // Tab finishes this box and starts the next one, joined to it
  await page.keyboard.press("Tab");
  await wait(500);
  const next = await E(() => ({ r1: window.__editor.store.doc.shapes.r1.text, editing: window.__editor.store.editing, n: window.__editor.store.doc.order.length }));
  check("what was written, both lines, is kept when Tab moves on", next.r1 === "Checkout\nservice" && next.editing && next.editing !== "r1", next);
  for (const what of ["Undo", "Redo"]) {
    await menu(what);
    await wait(200);
    const fresh = await state();
    check(`the next box starts with nothing to ${what.toLowerCase()} (the last box's typing is not its)`, fresh.text === "" && fresh.editing === next.editing && fresh.draft === D, fresh);
  }
  await page.keyboard.press("Escape");
  await wait(300);

  // a name shown in capitals keeps the case it was typed in, through undo
  await E(() => window.__editor.edit("p1"));
  await wait(400);
  const opened = await state();
  check("a panel's name opens as typed, not as shown", opened.editing === "p1" && opened.text === "Acme API", opened);
  await E(() => { const r = document.createRange(); r.selectNodeContents(document.activeElement); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.keyboard.type(" v2");
  await wait(700);
  await page.keyboard.type(" beta");
  await wait(100);
  await menu("Undo");
  await wait(200);
  // (an edit ended by a click elsewhere on the board)
  await page.mouse.click(5, 300);
  await wait(400);
  const panel = await E(() => ({ text: window.__editor.store.doc.shapes.p1.text, editing: window.__editor.store.editing }));
  check("a panel's name keeps its case through undo, and a click away keeps what is there", panel.text === "Acme API v2" && !panel.editing, panel);
  await shot?.("after");

  // a paste is a step of its own, even straight after typing; so is a word chosen with an input method
  await E(() => window.__editor.edit("r2"));
  await wait(300);
  // (the caret at the end: the words open selected)
  await E(() => { const r = document.createRange(); r.selectNodeContents(document.activeElement); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.keyboard.type(" v2");
  const clip = await app.evaluate(({ clipboard }) => { const was = clipboard.readText(); clipboard.writeText(" (Acme)"); return was; });
  // (Paste, as the menu's own Paste does it)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.paste());
  await wait(150);
  check("a paste goes in", (await state()).text === "Billing v2 (Acme)", await state());
  await menu("Undo");
  await wait(200);
  check("…and Undo takes back the paste alone", (await state()).text === "Billing v2", await state());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "ka", selectionStart: 2, selectionEnd: 2 });
  await wait(900);
  await cdp.send("Input.imeSetComposition", { text: "カ", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.insertText", { text: "カ" });
  await wait(200);
  check("a word from an input method goes in", (await state()).text === "Billing v2カ", await state());
  await menu("Undo");
  await wait(200);
  check("…and Undo takes it back whole, never half-composed", (await state()).text === "Billing v2", await state());
  await app.evaluate(({ clipboard }, was) => clipboard.writeText(was), clip);

  // undo puts the caret back where it was: a correction typed after it lands in the same place
  const caret = (n) => E((n) => { const el = document.activeElement, t = el.firstChild, r = document.createRange(); r.setStart(t, n); r.collapse(true); getSelection().removeAllRanges(); getSelection().addRange(r); }, n);
  await caret(7);
  await page.keyboard.type("X");
  await wait(100);
  await menu("Undo");
  await wait(150);
  await page.keyboard.type("Y");
  await wait(100);
  check("after Undo, typing lands where the caret was", (await state()).text === "BillingY v2", await state());
  await menu("Undo");
  await wait(150);
  // a key that changes nothing (forward Delete at the very end) leaves Redo as it was
  await E(() => { const el = document.activeElement, r = document.createRange(); r.selectNodeContents(el); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.keyboard.press("Delete");
  await wait(100);
  await menu("Redo");
  await wait(150);
  check("…and a key that changes nothing keeps Redo", (await state()).text === "BillingY v2", await state());
  // words dragged to another place in the same name come back with one Undo (as the page sends a drag: out, then in)
  await E(() => {
    const el = document.activeElement, t = el.firstChild;
    const send = (type, change) => { el.dispatchEvent(new InputEvent("beforeinput", { inputType: type, bubbles: true, cancelable: true })); change(); el.dispatchEvent(new InputEvent("input", { inputType: type, bubbles: true })); };
    send("deleteByDrag", () => { t.data = "Billing"; });
    send("insertFromDrop", () => { t.data = "v2 BillingY"; });
  });
  await menu("Undo");
  await wait(150);
  check("a drag within the words undoes in one step", (await state()).text === "BillingY v2", await state());
  // the toolbar's Undo, pressed, is the words' too
  await page.keyboard.type("Z");
  await wait(100);
  await page.locator('button[aria-label="Undo"]').first().click();
  await wait(200);
  const tb = await state();
  check("the toolbar's Undo takes back the words' typing, the edit still open", tb.text === "BillingY v2" && tb.editing === "r2", tb);
  await page.keyboard.press("Escape");
  await wait(300);

  // with nothing being written, the board answers
  await E(() => { document.activeElement?.blur?.(); });
  await menu("Select All");
  await wait(300);
  const all = await E(() => ({ sel: window.__editor.store.sel.size, n: window.__editor.store.doc.order.length }));
  check("with nothing being written, Select All takes every shape", all.sel === all.n, all);
  const was = await E(() => JSON.stringify(window.__editor.store.doc.shapes));
  await menu("Undo");
  await wait(300);
  check("…and Undo is the board's again", (await E(() => JSON.stringify(window.__editor.store.doc.shapes))) !== was);
};
