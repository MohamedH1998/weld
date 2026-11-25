// Groups, lining up, spacing evenly, line styles.
import { open } from "./lib.mjs";
const { page, errs, close, drag, shot } = await open({ w: 1280, h: 760 });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => page.evaluate(() => { const s = window.__editor.store; return { shapes: s.doc.order.map((id) => s.doc.shapes[id]), sel: [...s.sel] }; });
const setDoc = (shapes) => page.evaluate((shapes) => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: Object.fromEntries(shapes.map((x) => [x.id, x])), order: shapes.map((x) => x.id) }; s.sel = new Set(); s.editing = null; s.tool = "select"; s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); e.invalidate(); }, shapes);
const R = (id, x, y, w = 160, h = 72, extra = {}) => ({ id, kind: "rect", x, y, w, h, text: "", tone: "ink", fill: "none", ...extra });
const by = (st, id) => st.shapes.find((x) => x.id === id);
const btn = (name) => page.getByRole("button", { name, exact: true }).first().click();
let st;
// groups
await setDoc([R("A", 200, 200), R("B", 420, 230), R("C", 700, 420)]);
await page.mouse.click(280, 236); await page.keyboard.down("Shift"); await page.mouse.click(500, 266); await page.keyboard.up("Shift"); await page.keyboard.press("Meta+g"); st = await S();
ok("⌘G groups the selection", by(st, "A").group && by(st, "A").group === by(st, "B").group && !by(st, "C").group);
await page.keyboard.press("Escape"); await page.mouse.click(500, 266); st = await S();
ok("clicking one member takes that member (the group is taken by its frame)", st.sel.length === 1, `${st.sel.length}`);
await page.keyboard.press("Escape"); await drag(280, 236, 280, 336); st = await S();
ok("dragging one member moves the group", by(st, "A").y === 300 && by(st, "B").y === 330, JSON.stringify([by(st, "A").y, by(st, "B").y]));
await page.keyboard.press("Meta+z"); await page.keyboard.press("Escape"); await drag(150, 150, 300, 260); st = await S();
ok("a marquee that touches one member takes the group", st.sel.length === 2, `${st.sel.length}`);
await page.keyboard.press("Meta+d"); st = await S(); const copies = st.shapes.slice(3);
ok("a duplicated group is a new group of its own", copies.length === 2 && copies[0].group === copies[1].group && copies[0].group !== by(st, "A").group);
await page.keyboard.press("Meta+z"); await page.keyboard.press("Escape"); await page.mouse.dblclick(500, 266); st = await S();
ok("double-click reaches a single member", st.sel.length === 1 && st.sel[0] === "B", st.sel.join());
await page.keyboard.press("Escape"); await page.mouse.click(60, 700);
await page.keyboard.press("Escape"); await page.mouse.click(280, 236); await page.keyboard.press("Meta+Shift+g"); await page.keyboard.press("Escape"); await page.mouse.click(280, 236); st = await S();
ok("⇧⌘G ungroups", st.sel.length === 1 && !by(st, "A").group);
// lining up
await setDoc([R("A", 200, 200), R("B", 420, 260, 120, 50), R("C", 700, 180, 200, 100, { rot: 0.4 })]);
await page.keyboard.press("Meta+a"); await page.waitForTimeout(150); await shot("arrange-bar");
const offered = async () => (await page.locator('button[aria-label^="Align"], button[aria-label^="Space evenly"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).join(", ");
ok("a row is offered top, middle, bottom and even spacing across, never the ones that would pile it up", (await offered()) === "Align top, Align middles, Align bottom, Space evenly across", await offered());
await btn("Align top"); st = await S();
const top = (b) => { const c = Math.abs(Math.cos(b.rot ?? 0)), s = Math.abs(Math.sin(b.rot ?? 0)); return b.y + b.h / 2 - (b.w * s + b.h * c) / 2; };
ok("Align top lines up the tops, turned shapes by the frame that holds them", Math.abs(top(by(st, "A")) - top(by(st, "B"))) < 1e-6 && Math.abs(top(by(st, "A")) - top(by(st, "C"))) < 1e-6, JSON.stringify(st.shapes.map(top)));
await page.keyboard.press("Meta+z"); st = await S(); ok("and it is one undo step", by(st, "B").y === 260);
await setDoc([R("A", 100, 200, 100), R("B", 260, 200, 100), R("C", 700, 200, 100)]); await page.keyboard.press("Meta+a"); await btn("Space evenly across"); st = await S();
ok("Space evenly across makes the gaps equal and leaves the outer two alone", by(st, "A").x === 100 && by(st, "C").x === 700 && Math.abs(by(st, "B").x - 400) < 1e-6, JSON.stringify(st.shapes.map((x) => x.x)));
await setDoc([R("A", 200, 100), R("B", 240, 260), R("C", 180, 420)]); await page.keyboard.press("Meta+a"); await page.waitForTimeout(100);
ok("a column is offered left, centres, right and even spacing down", (await offered()) === "Align left, Align centres, Align right, Space evenly down", await offered());
await setDoc([R("A", 200, 100), R("B", 420, 100), R("C", 200, 260), R("D", 420, 260)]); await page.keyboard.press("Meta+a"); await page.waitForTimeout(100);
ok("a grid, where any lining up would pile shapes up, is offered none", (await offered()) === "", await offered());
// line styles
const bindTo = (id) => ({ x: 0, y: 0, bind: { id, ax: 0.5, ay: 0.5 } });
await setDoc([R("A", 200, 300, 160, 72, { text: "Dashed" }), R("B", 560, 300, 160, 72, { text: "Dotted", kind: "ellipse" }), { id: "r", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: bindTo("A"), b: bindTo("B") }]);
await page.mouse.click(280, 336); await btn("Dashed line"); await page.keyboard.press("Escape"); await page.mouse.click(640, 336); await btn("Dotted line"); await page.keyboard.press("Escape"); await page.mouse.click(460, 336); await btn("Dashed line"); await page.keyboard.press("Escape"); st = await S();
ok("boxes and arrows take dashed and dotted lines", by(st, "A").line === "dashed" && by(st, "B").line === "dotted" && by(st, "r").line === "dashed");
await shot("arrange-lines");
await page.mouse.click(280, 336); await btn("Solid line"); st = await S(); ok("and go back to solid", by(st, "A").line === undefined);
// locking
await setDoc([R("A", 200, 200, 160, 72, { fill: "solid" }), R("B", 500, 200)]);
await page.mouse.click(280, 236); await page.keyboard.press("Meta+Shift+l"); st = await S();
ok("⇧⌘L locks the selection and lets go of it", by(st, "A").locked === true && st.sel.length === 0);
await drag(280, 236, 280, 400); st = await S(); ok("a locked shape cannot be dragged", by(st, "A").y === 200, `${by(st, "A").y}`);
await page.keyboard.press("Escape"); await page.keyboard.press("Meta+a"); await page.keyboard.press("Delete"); st = await S();
ok("select all and delete leave it alone", !!by(st, "A") && !by(st, "B"));
await page.mouse.click(280, 236, { button: "right" }); const rows = await page.locator('[role="menuitem"]').allInnerTexts();
await page.getByRole("menuitem", { name: "Unlock" }).click(); st = await S();
ok("right-click on it offers only Unlock, which frees and selects it", rows.join() === "Unlock" && !by(st, "A").locked && st.sel.join() === "A", rows.join());
await page.keyboard.press("Meta+z"); st = await S(); ok("and locking undoes like anything else", by(st, "A").locked === true);

console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404")));
await close();
