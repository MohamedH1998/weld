// Animation: a group gains moments, each a copy to change; the board shows one, plays through all, and undoes cleanly.
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1200, h: 900 });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const reset = () => page.evaluate(() => { const e = window.__editor, s = e.store; e.stop(); s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; s.emit(); e.invalidate(); });
const S = () => page.evaluate(() => { const e = window.__editor, s = e.store, g = e.sceneGroup, sc = g ? s.doc.scenes[g] : null; return { n: s.doc.order.length, sel: [...s.sel], g, at: sc?.at ?? -1, moments: g ? e.moments(g).map((m) => ({ n: m.shapes.length, over: m.over, hold: m.hold, xs: m.shapes.map((x) => x.x ?? null) })) : [], undo: s.undoStack.length, playing: !!e.playing, scenes: Object.keys(s.doc.scenes ?? {}).length, shapes: s.doc.order.map((id) => s.doc.shapes[id]) }; });
await reset();
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "a", kind: "rect", x: 300, y: 300, w: 160, h: 72, text: "A", tone: "ink", fill: "none" }, { id: "b", kind: "rect", x: 600, y: 300, w: 160, h: 72, text: "B", tone: "ink", fill: "none" }, { id: "w", kind: "arrow", a: { x: 0, y: 0, bind: { id: "a", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "b", ax: 0.5, ay: 0.5 } }, text: "", route: "straight", heads: "end", tone: "ink" })); s.select(["a", "b", "w"]); s.emit(); });
await page.getByRole("button", { name: "Animate", exact: true }).click(); await page.getByRole("button", { name: "Add a moment" }).click();
let st = await S();
ok("Animate makes the selection one group with two moments, the second on show", !!st.g && st.moments.length === 2 && st.at === 1 && st.shapes.every((x) => x.group === st.g), JSON.stringify({ g: st.g, m: st.moments.length, at: st.at }));
ok("the moments are there to see", (await page.getByRole("tab", { name: /^Moment/ }).count()) === 2);
// change the second moment: move B down
await page.keyboard.press("Escape"); await page.mouse.dblclick(680, 310); await page.keyboard.press("Escape");
await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ ...s.doc.shapes.b, y: 500 })); e.invalidate(); s.emit(); });
await page.mouse.click(380, 310); st = await S();
await page.getByRole("tab", { name: "Moment 1" }).click(); st = await S();
ok("going back to the first moment shows it as it was", st.at === 0 && st.shapes.find((x) => x.id === "b").y === 300, JSON.stringify(st.shapes.find((x) => x.id === "b").y));
await page.getByRole("tab", { name: "Moment 2" }).click(); st = await S();
ok("and the second keeps its change", st.at === 1 && st.shapes.find((x) => x.id === "b").y === 500);
await page.getByRole("button", { name: "Add a moment" }).click(); st = await S();
ok("a new moment starts as a copy of the one on show, and is shown", st.moments.length === 3 && st.at === 2 && st.shapes.find((x) => x.id === "b").y === 500);
// playing: part-way between moment 1 and 2, B is part-way down
await page.getByRole("tab", { name: "Moment 1" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click();
const mid = await page.evaluate(async () => { const e = window.__editor, R = await __engine("render"); const p = e.playing; p.t0 = performance.now() - (p.moments[0].hold + p.moments[1].over / 2); const d = e.viewDoc(R.themeFor(false)); return { y: d.shapes.b.y, playing: !!e.playing, same: d === e.store.doc }; });
ok("while playing, a shape is part-way between its two places", mid.playing && mid.y > 320 && mid.y < 480 && !mid.same, JSON.stringify(mid));
st = await S();
ok("playing changes nothing on the board", st.shapes.find((x) => x.id === "b").y === 300 && st.at === 0);
await page.mouse.click(100, 100); st = await page.evaluate(() => ({ playing: !!window.__editor.playing, n: window.__editor.store.doc.order.length }));
ok("touching the board stops it and does nothing else", !st.playing && st.n === 3);
// timing
await page.mouse.click(380, 310); await page.getByRole("tab", { name: "Moment 2" }).click();
await page.getByRole("spinbutton", { name: "Arrive in" }).focus(); await page.keyboard.press("ArrowUp"); st = await S();
ok("a moment's arrival can be made slower", st.moments[1].over === 600, `${st.moments[1].over}`);
// a travelling mark on the wire
await page.evaluate(() => { const s = window.__editor.store; s.select(["w"]); s.emit(); }); st = await S();
const wireSel = st.sel.length === 1 && st.sel[0] === "w";
if (wireSel) { await page.getByRole("button", { name: "Request", exact: true }).click(); st = await S(); ok("a wire can carry a request in a moment", st.shapes.find((x) => x.id === "w").run === "pour"); } else ok("a wire can carry a request in a moment", false, "could not select the wire: " + JSON.stringify(st.sel));
// removing moments down to one makes the group still again; undo brings everything back
await page.keyboard.press("Escape"); await page.mouse.click(380, 310);
const before = (await S()).undo;
await page.evaluate(() => { const e = window.__editor; e.removeMoment(e.sceneGroup, 2); e.removeMoment(e.sceneGroup, 1); }); st = await page.evaluate(() => ({ scenes: Object.keys(window.__editor.store.doc.scenes ?? {}).length, n: window.__editor.store.doc.order.length, undo: window.__editor.store.undoStack.length }));
ok("with one moment left the group is still again", st.scenes === 0 && st.n === 3 && st.undo === before + 2, JSON.stringify(st));
await page.keyboard.press("Meta+z"); await page.keyboard.press("Meta+z"); st = await page.evaluate(() => { const s = window.__editor.store; return { m: Object.values(s.doc.scenes ?? {})[0]?.moments.length }; });
ok("and undo brings the moments back", st.m === 3, JSON.stringify(st));
// what is saved comes back
const round = await page.evaluate(async () => { const C = await __engine("clean"); const s = window.__editor.store; const d = C.cleanDoc(JSON.parse(JSON.stringify(s.doc))); return { m: Object.values(d.scenes ?? {})[0]?.moments.length, n: d.order.length }; });
ok("a saved board keeps its moments", round.m === 3 && round.n === 3, JSON.stringify(round));
// a diagram that moves, put down from the library, moved and copied
await reset();
await page.getByRole("button", { name: "More shapes", exact: true }).click(); await page.getByRole("tab", { name: "Diagrams" }).click();
await page.getByRole("group", { name: "Diagrams" }).getByRole("button", { name: "Container: isolation", exact: true }).click(); await page.mouse.click(600, 420);
st = await S();
ok("a diagram from the library comes with its moments", st.moments.length >= 3 && st.undo === 1 && st.sel.length === st.n, JSON.stringify({ m: st.moments.length, undo: st.undo }));
const x0 = st.moments.map((m) => m.xs.filter((v) => v !== null)[0]);
const anchor = await page.evaluate(() => { const s = window.__editor.store, b = s.doc.order.map((id) => s.doc.shapes[id]).find((x) => x.kind === "card" || x.kind === "panel"); return { x: b.x + b.w / 2, y: b.y + 8 }; });
await page.mouse.move(anchor.x, anchor.y); await page.mouse.down(); await page.mouse.move(anchor.x + 60, anchor.y + 10, { steps: 6 }); await page.mouse.up();
st = await S(); const x1 = st.moments.map((m) => m.xs.filter((v) => v !== null)[0]);
ok("moving it moves every moment, so playing does not jump back", x1.every((v, i) => Math.abs(v - x0[i] - 60) < 0.01), JSON.stringify([x0, x1]));
await page.keyboard.press("Meta+d"); st = await S();
ok("a copy keeps its moments", st.scenes === 2 && st.moments.length === x0.length, JSON.stringify({ scenes: st.scenes, m: st.moments.length }));
// the model's edges: what happens to moments when the group is edited like any other
const two = async () => { await reset(); await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ id: "a", kind: "rect", x: 300, y: 300, w: 160, h: 72, text: "Teh", tone: "ink", fill: "none" }, { id: "b", kind: "rect", x: 600, y: 300, w: 160, h: 72, text: "B", tone: "ink", fill: "none" })); s.select(["a", "b"]); e.animate(); s.emit(); }); };
const G = () => page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes ?? {})[0]; return g ? { g, scope: e.scope, sel: [...s.sel], at: s.doc.scenes[g].at, moments: e.moments(g).map((m) => m.shapes.map((x) => ({ id: x.id, text: x.text, y: x.y, group: x.group, away: x.away }))), scenes: Object.keys(s.doc.scenes).length } : { scenes: 0, moments: [] }; });
await two(); st = await G();
ok("after Animate the group is stepped into with nothing picked: the next click takes one part", st.scope === st.g && st.sel.length === 0, JSON.stringify({ scope: st.scope, sel: st.sel }));
await page.mouse.move(380, 320); await page.mouse.down(); await page.mouse.move(380, 420, { steps: 5 }); await page.mouse.up(); st = await G();
ok("dragging a part then changes this moment only", st.moments[1].find((x) => x.id === "a").y === 400 && st.moments[0].find((x) => x.id === "a").y === 300, JSON.stringify(st.moments.map((m) => m.find((x) => x.id === "a").y)));
// a typo fixed in one moment is fixed in all
await page.evaluate(() => { const e = window.__editor; e.store.select(["a"]); e.edit("a"); }); await page.waitForTimeout(100);
await page.keyboard.press("Meta+a"); await page.keyboard.type("The"); await page.keyboard.press("Enter"); st = await G();
ok("words changed in a moment say so from that moment on: the moment before keeps what it said", st.moments[1].find((x) => x.id === "a").text === "The" && st.moments[0].find((x) => x.id === "a").text !== "The", JSON.stringify(st.moments.map((m) => m.find((x) => x.id === "a").text)));
// a shape drawn while stepped in joins the group, and is there from this moment on
await page.keyboard.press("r"); await page.mouse.move(820, 600); await page.mouse.down(); await page.mouse.move(940, 660, { steps: 4 }); await page.mouse.up(); await page.keyboard.press("Escape"); st = await G();
ok("a shape drawn while stepped in joins the group, from this moment on", st.moments[1].length === 3 && st.moments[0].filter((x) => !x.away).length === 2 && st.moments[1][2].group === st.g, JSON.stringify(st.moments.map((m) => m.length)));
// cut and paste keeps the moments
await page.evaluate(() => { const e = window.__editor, s = e.store; e.leave?.(); s.select(s.doc.order.filter((id) => s.doc.shapes[id].group)); const text = e.serialize(); e.remove(); e.pasteText(text, { x: 500, y: 400 }); });
st = await G();
ok("cut and pasted, the group still has its moments", st.scenes === 1 && st.moments.length === 2 && st.moments[0].filter((x) => !x.away).length === 2 && st.moments[1].length === 3, JSON.stringify({ scenes: st.scenes, m: st.moments.map((m) => m.length) }));
// deleting what one moment holds leaves the others' shapes reachable
await two(); await page.evaluate(() => { const e = window.__editor, s = e.store; s.run(() => s.put({ id: "c", kind: "rect", x: 300, y: 500, w: 100, h: 60, text: "", tone: "ink", fill: "none" })); e.showMoment(e.scope, 0); s.select(["a", "b"]); e.remove(); });
st = await page.evaluate(() => { const s = window.__editor.store; return { n: s.doc.order.length, ids: s.doc.order, scenes: Object.keys(s.doc.scenes ?? {}).length }; });
ok("emptying one moment leaves what another still holds on the board", st.n === 1 && st.ids[0] === "c", JSON.stringify(st));
// moments can change places
await two(); await page.evaluate(() => { const e = window.__editor; e.store.run(() => e.store.put({ ...e.store.doc.shapes.a, y: 444 })); e.moveMoment(e.scope, 1, 0); });
st = await G();
ok("a moment moved keeps what it holds, and stays the one on show", st.at === 0 && st.moments[0].find((x) => x.id === "a").y === 444 && st.moments[1].find((x) => x.id === "a").y === 300, JSON.stringify({ at: st.at, ys: st.moments.map((m) => m.find((x) => x.id === "a").y) }));
// resizing the whole group resizes every moment
await two(); await page.evaluate(() => { const e = window.__editor, s = e.store; e.leave(true); s.select(["a", "b"]); s.emit(); });
const fr = await page.evaluate(async () => { const G = await __engine("geometry"); const s = window.__editor.store; return G.boundsOf(s.doc, ["a", "b"]); });
await page.mouse.move(fr.x + fr.w, fr.y + fr.h); await page.mouse.down(); await page.mouse.move(fr.x + fr.w + 120, fr.y + fr.h + 40, { steps: 6 }); await page.mouse.up(); st = await G();
const wide = await page.evaluate(() => { const e = window.__editor; return e.moments(Object.keys(e.store.doc.scenes)[0]).map((m) => Math.max(...m.shapes.map((x) => x.x + x.w)) - Math.min(...m.shapes.map((x) => x.x))); });
ok("resizing the whole group resizes every moment alike", wide.length === 2 && Math.abs(wide[0] - wide[1]) < 0.5 && wide[0] > fr.w + 60, JSON.stringify({ wide, was: fr.w }));
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404"))); await close();
