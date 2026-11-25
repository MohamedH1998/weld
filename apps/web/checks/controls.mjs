// The controls for how a group moves: timing you drag or type, how a moment arrives, once or round, a part arriving later, and the timeline.
import { open } from "./lib.mjs";
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const seed = async (page) => {
  await page.evaluate(() => { const e = window.__editor, s = e.store; e.stop(); s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; s.emit(); e.invalidate(); s.run(() => s.put({ id: "a", kind: "rect", x: 300, y: 200, w: 160, h: 72, text: "A", tone: "ink", fill: "none" }, { id: "b", kind: "rect", x: 600, y: 200, w: 160, h: 72, text: "B", tone: "ink", fill: "none" })); s.select(["a", "b"]); s.emit(); });
  await page.getByRole("button", { name: "Animate", exact: true }).click(); await page.getByRole("button", { name: "Add a moment" }).click();
};
const M = (page) => page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0], sc = s.doc.scenes[g]; return { at: sc.at, once: !!sc.once, undo: s.undoStack.length, m: e.moments(g).map((m) => ({ over: m.over, hold: m.hold, ease: m.ease ?? "smooth", b: m.shapes.find((x) => x.id === "b") })) }; });
{
  const { page, errs, close } = await open({ w: 1300, h: 800 });
  await seed(page);
  let st = await M(page); const u0 = st.undo;
  const dial = page.getByRole("spinbutton", { name: "Arrive in" }), bb = await dial.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + 50, bb.y + bb.height / 2, { steps: 8 }); await page.mouse.up(); st = await M(page);
  ok("a time is dragged sideways, as one undo step", st.m[1].over === 1500 && st.undo === u0 + 1, JSON.stringify({ over: st.m[1].over, steps: st.undo - u0 }));
  await page.getByRole("spinbutton", { name: "Stay" }).click(); await page.keyboard.type("2.5"); await page.keyboard.press("Enter"); st = await M(page);
  ok("or clicked and typed", st.m[1].hold === 2500, String(st.m[1].hold));
  await page.getByRole("button", { name: "Settles past and back" }).click(); st = await M(page);
  ok("a moment can arrive with a settle", st.m[1].ease === "spring" && st.m[0].ease === "smooth", JSON.stringify(st.m.map((m) => m.ease)));
  await page.getByRole("button", { name: "Repeat" }).click(); st = await M(page);
  ok("a group can play once", st.once);
  const rest = await page.evaluate(async () => { const A = await __engine("anim"); const e = window.__editor, g = Object.keys(e.store.doc.scenes)[0], sc = e.store.doc.scenes[g]; return A.position({ ...sc, moments: e.moments(g) }, 1e7); });
  ok("played once, it rests on the last moment", rest.a === 1 && rest.b === 1 && rest.t === 1, JSON.stringify(rest));
  await page.mouse.click(680, 236);
  await page.getByRole("spinbutton", { name: "After" }).focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp");
  st = await M(page);
  ok("a part can arrive later, in this moment only", st.m[1].b.wait === 200 && !st.m[0].b.wait, JSON.stringify([st.m[0].b, st.m[1].b]));
  const saved = await page.evaluate(async () => { const C = await __engine("clean"); const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; const d = C.cleanDoc(JSON.parse(JSON.stringify({ ...s.doc, scenes: { [g]: { ...s.doc.scenes[g], moments: e.moments(g) } } }))); const sc = d.scenes[g]; return { once: sc.once, ease: sc.moments[1].ease, b: sc.moments[1].shapes.find((x) => x.id === "b") }; });
  ok("all of it is saved", saved.once === true && saved.ease === "spring" && saved.b.wait === 200, JSON.stringify(saved));
  const real = errs.filter((e) => !e.includes("404")); ok("no errors (bar)", real.length === 0, real.join(" | "));
  await close();
}
{
  // where a part was a moment ago shows faintly behind it, and is never part of the board itself
  const { page, close } = await open({ w: 1300, h: 800 });
  await seed(page);
  await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ ...s.doc.shapes.b, y: 420 })); s.select(["b"]); s.emit(); e.invalidate(); });
  await page.waitForTimeout(150);
  const r = await page.evaluate(async () => { const R = await __engine("render"); const e = window.__editor; const c = document.querySelector("canvas"), d = window.devicePixelRatio || 1; const px = (x, y) => { const p = c.getContext("2d").getImageData(x * d, y * d, 1, 1).data; return p[0] + p[1] + p[2]; }; return { trace: px(600 + 80, 200), bg: px(100, 100), n: e.store.doc.order.length, hit: e.shapeAt({ x: 680, y: 236 })?.id ?? null }; });
  ok("a moved part leaves a faint trace where it was", r.trace !== r.bg, JSON.stringify(r));
  ok("the trace is not a shape: nothing to pick, nothing added", r.n === 2 && r.hit === null, JSON.stringify(r));
  await close();
}
{
  // a change shows itself: it plays into this moment once, the controls stay, and the board is handed back
  const { page, close } = await open({ w: 1300, h: 800, path: "/" });
  await seed(page);
  await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ ...s.doc.shapes.b, y: 420 })); s.emit(); e.invalidate(); });
  await page.getByRole("button", { name: "Settles past and back" }).click();
  let p = await page.evaluate(() => ({ playing: !!window.__editor.playing, preview: window.__editor.playing?.until !== undefined }));
  ok("changing how a moment arrives plays it at once", p.playing && p.preview, JSON.stringify(p));
  ok("the controls stay while it shows", (await page.getByRole("spinbutton", { name: "Arrive in" }).count()) === 1 && (await page.getByRole("button", { name: "Play", exact: true }).count()) === 1);
  await page.mouse.click(380, 236);
  p = await page.evaluate(() => ({ playing: !!window.__editor.playing, sel: [...window.__editor.store.sel] }));
  ok("a click during it is not swallowed: it picks the part", !p.playing && p.sel.join() === "a", JSON.stringify(p));
  await page.getByRole("spinbutton", { name: "Arrive in" }).focus(); await page.keyboard.press("ArrowUp");
  p = await page.evaluate(() => !!window.__editor.playing);
  await page.waitForTimeout(2400);
  const after = await page.evaluate(() => ({ playing: !!window.__editor.playing, at: Object.values(window.__editor.store.doc.scenes)[0].at }));
  ok("a new time plays too, and ends by itself on the same moment", p && !after.playing && after.at === 1, JSON.stringify({ p, after }));
  await close();
}
{
  // a part hidden in one moment and shown in the next comes into view from where, and at the size, it was left while hidden
  const { page, close } = await open({ w: 1300, h: 800 });
  await seed(page);
  const mid = await page.evaluate(async () => { const A = await __engine("anim"), R = await __engine("render"); const e = window.__editor, g = Object.keys(e.store.doc.scenes)[0]; const [m0, m1] = e.moments(g); const from = { ...m0, shapes: m0.shapes.map((x) => (x.id === "b" ? { ...x, away: true, y: 420, w: 80, h: 36 } : x)) }; const out = A.frame(R.themeFor(false), from, m1, 0.5); const b = out.find((x) => x.id === "b"); return { y: b.y, w: b.w, o: b.fine?.o, start: A.frame(R.themeFor(false), from, m1, 0).some((x) => x.id === "b") }; });
  ok("it glides and grows into view from how it was left while hidden", mid.y > 250 && mid.y < 380 && mid.w > 90 && mid.w < 150 && mid.o > 0.2 && mid.o < 0.8 && !mid.start, JSON.stringify(mid));
  await close();
}
{
  // the film button is a switch for a view: it shows and hides how things move, and changes nothing
  const { page, close } = await open({ w: 1300, h: 800 });
  await page.evaluate(() => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: {}, order: [] }; s.undoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); s.run(() => s.put({ id: "a", kind: "rect", x: 300, y: 200, w: 160, h: 72, text: "A", tone: "ink", fill: "none" })); s.select(["a"]); s.emit(); });
  const st = () => page.evaluate(() => ({ scenes: Object.keys(window.__editor.store.doc.scenes ?? {}).length, undo: window.__editor.store.undoStack.length }));
  const before = await st();
  ok("with the switch off nothing about movement shows", (await page.getByRole("button", { name: "Add a moment" }).count()) === 0);
  await page.getByRole("button", { name: "Animate", exact: true }).click();
  let now = await st();
  ok("switching it on changes nothing in the drawing", now.scenes === 0 && now.undo === before.undo, JSON.stringify(now));
  ok("and the selection shows as a first moment, with a plus", (await page.getByRole("button", { name: "Add a moment" }).count()) === 1);
  await page.getByRole("button", { name: "Add a moment" }).click(); now = await st();
  ok("the plus is what makes it move", now.scenes === 1 && (await page.getByRole("tab", { name: "Moment 2" }).count()) === 1, JSON.stringify(now));
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.mouse.click(380, 236);
  await page.getByRole("button", { name: "Animate", exact: true }).click(); await page.waitForTimeout(400); now = await st();
  ok("switched off, a drawing that moves shows no moments when clicked, and keeps them", (await page.getByRole("tab", { name: "Moment 2" }).count()) === 0 && now.scenes === 1, JSON.stringify(now));
  await close();
}
{
  // parts hidden in this moment are never on the board: they are reached by name
  const { page, close } = await open({ w: 1300, h: 800, path: "/" });
  await seed(page);
  await page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; s.run(() => s.put({ id: "c", kind: "rect", x: 340, y: 220, w: 160, h: 72, text: "Over", tone: "ink", fill: "none", group: g, away: true }, { id: "d", kind: "rect", x: 300, y: 500, w: 160, h: 72, text: "Clear", tone: "ink", fill: "none", group: g, away: true })); e.pickPart(g, "b"); });
  await page.waitForTimeout(200);
  const r = await page.evaluate(() => ({ over: window.__editor.shapeAt({ x: 480, y: 285 })?.id ?? null, clear: window.__editor.shapeAt({ x: 380, y: 536 })?.id ?? null }));
  ok("a hidden part is not on the board, wherever it lies", r.over === null && r.clear === null, JSON.stringify(r));
  await page.getByRole("button", { name: "Hidden in this moment" }).click();
  await page.getByRole("menuitem", { name: "Over" }).click();
  const st = await page.evaluate(() => ({ away: !!window.__editor.store.doc.shapes.c.away, sel: [...window.__editor.store.sel] }));
  ok("picking its name shows it and selects it", !st.away && st.sel.join() === "c", JSON.stringify(st));
  await close();
}
{
  // with the controls for movement put away, a drawing that moves is a drawing like any other
  const { page, close } = await open({ w: 1300, h: 800, path: "/" });
  await seed(page);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.evaluate(() => { const e = window.__editor; e.setMotion(false); e.store.select(["a", "b"]); e.store.emit(); });
  await page.waitForTimeout(400);
  ok("nothing about movement shows", (await page.getByRole("button", { name: "Play", exact: true }).count()) === 0 && (await page.getByRole("tab", { name: "Moment 2" }).count()) === 0);
  await close();
}
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
