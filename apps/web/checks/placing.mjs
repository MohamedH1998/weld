// Placing a stamp and changing it afterwards: one click places, a double-click steps in, Escape steps out.
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1200, h: 1000 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const reset = () => page.evaluate(() => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; e.scope = null; e.overlay.scope = null; s.emit(); e.invalidate(); });
const state = () => page.evaluate(() => { const e = window.__editor, s = e.store, sh = s.doc.order.map((id) => s.doc.shapes[id]); return { n: sh.length, sel: [...s.sel], tool: s.tool, undo: s.undoStack.length, scope: e.scope, groups: [...new Set(sh.map((x) => x.group ?? null))], editing: s.editing ?? null, shapes: sh }; });
const arm = async (tab, name) => { await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: tab }).click(); await page.getByRole("group", { name: tab }).getByRole("button", { name, exact: true }).click(); };

// an armed stamp places even when pressed on the corner handle of a selected shape
await reset();
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "a", kind: "rect", x: 500, y: 400, w: 160, h: 72, text: "", tone: "ink", fill: "none" })); s.select(["a"]); s.emit(); });
const first = (await page.evaluate(async () => (await __engine("patterns")).PATTERNS[0].name));
await arm("Patterns", first);
await page.mouse.move(660, 472); await page.mouse.down(); await page.mouse.move(700, 520, { steps: 4 }); await page.mouse.up();
let st = await state(); const a = st.shapes.find((x) => x.id === "a");
ok("an armed stamp is placed even when pressed on a selected shape's corner", st.n > 1 && a.w === 160 && a.h === 72 && st.tool === "select", JSON.stringify({ n: st.n, w: a.w, h: a.h, tool: st.tool }));

// stepping in and out
await reset(); await arm("Patterns", first); await page.mouse.click(600, 450);
st = await state(); const all = st.n, box = st.shapes.find((x) => x.kind !== "arrow" && x.kind !== "text" && x.w > 40);
const at = { x: box.x + box.w / 2, y: box.y + 6 };
ok("a stamp lands as one group, all selected, in one undo step", st.sel.length === all && st.groups.length === 1 && st.undo === 1, JSON.stringify({ sel: st.sel.length, all, undo: st.undo }));
await page.mouse.click(at.x, at.y); st = await state();
ok("with the whole group selected, a click on a part takes just that part", st.sel.length === 1 && st.sel[0] === box.id && !st.editing && st.scope === box.group, JSON.stringify({ sel: st.sel, editing: st.editing, scope: st.scope }));
await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.mouse.click(60, 60); await page.mouse.click(at.x, at.y); st = await state();
ok("with nothing selected, a click on a part takes just that part too", st.sel.length === 1 && st.sel[0] === box.id && st.scope === box.group, JSON.stringify({ sel: st.sel, scope: st.scope }));
const other = st.shapes.find((x) => x.id !== box.id && x.kind !== "arrow" && x.kind !== "text" && x.w > 40);
if (other) { const pt = { x: other.x + other.w / 2, y: other.y + 6 }; const under = await page.evaluate((pt) => window.__editor.pick(pt)?.id, pt); await page.mouse.click(pt.x, pt.y); st = await state(); ok("inside, a click takes one part at a time", st.sel.length === 1 && st.sel[0] === under && under !== box.id, JSON.stringify({ sel: st.sel, under })); await page.mouse.click(at.x, at.y); }
await page.mouse.dblclick(at.x, at.y); st = await state();
ok("a double-click types into the part", st.editing === box.id, `${st.editing}`);
await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); st = await state();
ok("Escape steps back out with the whole group selected", !st.scope && st.sel.length === all, JSON.stringify({ scope: st.scope, sel: st.sel.length }));
await page.mouse.click(60, 60); st = await state();
ok("clicking away lets go of it", !st.scope && st.sel.length === 0, JSON.stringify({ scope: st.scope, sel: st.sel.length }));
const gap = await page.evaluate(() => { const e = window.__editor, s = e.store, sh = s.doc.order.map((id) => s.doc.shapes[id]).filter((x) => x.kind !== "arrow"); const x0 = Math.min(...sh.map((x) => x.x)), x1 = Math.max(...sh.map((x) => x.x + x.w)), y0 = Math.min(...sh.map((x) => x.y)), y1 = Math.max(...sh.map((x) => x.y + x.h)); for (let y = y0 + 6; y < y1; y += 6) for (let x = x0 + 6; x < x1; x += 6) if (!e.shapeAt({ x, y })) return { x: (x - s.cam.x) * s.cam.z, y: (y - s.cam.y) * s.cam.z }; return null; });
if (gap) { await page.mouse.click(gap.x, gap.y); st = await state(); ok("a click in the space between the parts takes the whole group", !st.scope && st.sel.length === all, JSON.stringify({ scope: st.scope, sel: st.sel.length })); await page.mouse.move(gap.x, gap.y); await page.mouse.down(); await page.mouse.move(gap.x + 40, gap.y, { steps: 5 }); await page.mouse.up(); const moved = await state(); ok("and dragging there moves all of it", Math.abs(moved.shapes.find((x) => x.id === box.id).x - box.x - 40) < 0.5 && moved.sel.length === all, ""); await page.keyboard.press("Meta+z"); await page.mouse.click(60, 60); }

// ungroup from one part dissolves the whole group, and undoes whole
await page.mouse.click(at.x, at.y); const before = (await state()).undo;
await page.keyboard.press("Meta+Shift+g"); st = await state();
ok("Ungroup from one part dissolves the whole group in one step", st.shapes.every((x) => !x.group) && st.undo === before + 1 && st.sel.length === all, JSON.stringify({ grouped: st.shapes.filter((x) => x.group).length, undo: st.undo - before, sel: st.sel.length }));
await page.keyboard.press("Meta+z"); st = await state();
ok("and one undo brings the group back", st.shapes.every((x) => x.group), `${st.shapes.filter((x) => x.group).length}/${all}`);

// what sits inside a panel goes where the panel goes
await reset();
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "pn", kind: "panel", x: 400, y: 300, w: 200, h: 140, text: "WORKER", tone: "ink", fill: "none" }, { id: "gl", kind: "glyph", x: 430, y: 370, w: 120, h: 40, text: "", tone: "ink", fill: "none" }, { id: "out", kind: "rect", x: 700, y: 300, w: 100, h: 60, text: "", tone: "ink", fill: "none" })); s.select([]); s.emit(); });
await page.mouse.move(500, 312); await page.mouse.down(); await page.mouse.move(540, 342, { steps: 5 }); await page.mouse.up();
st = await state(); { const f = (id) => st.shapes.find((x) => x.id === id);
ok("dragging a panel carries the mark inside it, and nothing else", f("pn").x === 440 && f("gl").x === 470 && f("gl").y === 400 && f("out").x === 700 && st.sel.length === 1, JSON.stringify([f("pn").x, f("gl").x, f("gl").y, f("out").x, st.sel.length])); }
await page.mouse.move(530, 420); await page.mouse.down(); await page.mouse.move(540, 425, { steps: 4 }); await page.mouse.up();
st = await state(); ok("the mark inside can still be moved by itself", st.shapes.find((x) => x.id === "gl").x === 480 && st.shapes.find((x) => x.id === "pn").x === 440, "");

// a port is fixed to the rim it sits on, and a routed wire keeps its corners square when one end's shape moves
await reset();
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put(
  { id: "top", kind: "card", x: 300, y: 200, w: 200, h: 80, text: "User", tone: "ink", fill: "none" },
  { id: "bot", kind: "panel", x: 600, y: 480, w: 240, h: 100, text: "OBJECT", tone: "ink", fill: "none" },
  { id: "wr", kind: "arrow", a: { x: 0, y: 0, bind: { id: "top", ax: 0.5, ay: 1 } }, b: { x: 0, y: 0, bind: { id: "bot", ax: 0.25, ay: 0 } }, text: "", route: "straight", heads: "none", tone: "ink", via: [{ x: 400, y: 380 }, { x: 660, y: 380 }] },
  { id: "p1", kind: "pad", x: 392, y: 272, w: 16, h: 16, text: "", tone: "accent", fill: "solid" },
  { id: "p2", kind: "pad", x: 652, y: 472, w: 16, h: 16, text: "", tone: "accent", fill: "solid" })); s.select(["bot"]); s.emit(); });
await page.evaluate(() => window.__editor.nudge(30, 20)); st = await state();
{ const f = (id) => st.shapes.find((x) => x.id === id), w = f("wr");
ok("moving a shape takes the port on its rim, and leaves the other shape's port", f("p2").x === 682 && f("p2").y === 492 && f("p1").x === 392, JSON.stringify([f("p2").x, f("p2").y, f("p1").x]));
ok("the wire's corner next to it follows, the far corner stays, every leg still square", w.via[1].x === 690 && w.via[1].y === 380 && w.via[0].x === 400 && w.via[0].y === 380 && st.sel.length === 1, JSON.stringify(w.via)); }
await page.evaluate(() => { const s = window.__editor.store; s.select(["top"]); s.emit(); window.__editor.nudge(-40, 10); }); st = await state();
{ const f = (id) => st.shapes.find((x) => x.id === id), w = f("wr");
ok("the same from the other end", f("p1").x === 352 && f("p1").y === 282 && w.via[0].x === 360 && w.via[0].y === 380 && w.via[1].x === 690, JSON.stringify([f("p1").x, w.via])); }

// a wire joined to the middle of a shape carries its port on the shape's edge, where the wire crosses it
await reset();
{ const at = await page.evaluate(async () => { const G = await __engine("geometry"); const s = window.__editor.store; s.run(() => s.put(
  { id: "l", kind: "rect", x: 300, y: 300, w: 160, h: 80, text: "", tone: "ink", fill: "none" }, { id: "r", kind: "rect", x: 700, y: 300, w: 160, h: 80, text: "", tone: "ink", fill: "none" },
  { id: "w", kind: "arrow", a: { x: 0, y: 0, bind: { id: "l", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "r", ax: 0.5, ay: 0.5 } }, text: "", route: "straight", heads: "none", tone: "ink", ports: "both" })); s.emit();
  return { ports: G.portsOf(s.doc, s.doc.shapes.w), path: G.arrowPath(s.doc, s.doc.shapes.w) }; });
ok("its ports sit on the two facing edges, not in the middles", Math.abs(at.ports[0].x - 460) < 1.5 && Math.abs(at.ports[1].x - 700) < 1.5 && at.ports[0].y === 340, JSON.stringify(at.ports));
ok("and the wire shows from each port's outer edge", Math.abs(at.path[0].x - (at.ports[0].x + 8)) < 0.01 && Math.abs(at.path[at.path.length - 1].x - (at.ports[1].x - 8)) < 0.01, JSON.stringify(at.path)); }

// choosing the style a shape already has leaves no step
await reset();
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "a", kind: "rect", x: 500, y: 400, w: 160, h: 72, text: "", tone: "ink", fill: "none" })); s.select(["a"]); s.emit(); });
const u0 = (await state()).undo; await page.evaluate(() => window.__editor.restyle({ tone: "ink" })); st = await state();
ok("choosing the style a shape already has leaves nothing to undo", st.undo === u0, `${st.undo - u0}`);
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
