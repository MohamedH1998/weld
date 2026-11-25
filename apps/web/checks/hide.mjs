// Hiding a part in one moment: it leaves that moment only, shows faint while the group is worked on, and comes back.
import { open } from "./lib.mjs";
const { page, errs, close } = await open({ w: 1200, h: 900, path: "/" });
let pass = 0, fail = 0; const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
await page.evaluate(() => { const e = window.__editor, s = e.store; e.stop(); s.persist = false; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.tool = "select"; s.emit(); e.invalidate(); });
await page.evaluate(() => { const s = window.__editor.store; s.run(() => s.put({ id: "a", kind: "rect", x: 300, y: 300, w: 160, h: 72, text: "A", tone: "ink", fill: "none" }, { id: "b", kind: "rect", x: 600, y: 300, w: 160, h: 72, text: "B", tone: "ink", fill: "none" })); s.select(["a", "b"]); s.emit(); });
await page.getByRole("button", { name: "Animate", exact: true }).click(); await page.getByRole("button", { name: "Add a moment" }).click();
const M = () => page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; return { at: s.doc.scenes[g].at, sel: [...s.sel], m: e.moments(g).map((m) => m.shapes.map((x) => x.id + (x.away ? "-" : "+")).join("")) }; });
// stepped into moment 2: one click takes B
await page.mouse.click(680, 336);
let st = await M();
ok("after Animate one click takes a single part", st.sel.join() === "b", JSON.stringify(st.sel));
await page.getByRole("button", { name: "Hide in this moment" }).click(); st = await M();
ok("hiding takes it out of this moment only", st.m[0] === "a+b+" && st.m[1] === "a+b-", JSON.stringify(st.m));
const px = (x, y) => page.evaluate(([x, y]) => { const c = document.querySelector("canvas"), d = window.devicePixelRatio || 1, p = c.getContext("2d").getImageData(x * d, y * d, 1, 1).data; return p[0] + p[1] + p[2]; }, [x, y]);
await page.waitForTimeout(120);
const bg = await px(100, 100), faint = await px(600 + 80, 300);
ok("still picked, it shows faint where it is", faint !== bg, `${faint} vs ${bg}`);
await page.mouse.click(380, 336); await page.mouse.click(680, 336); st = await M();
ok("once let go of, it is off the board: its place picks nothing", !st.sel.includes("b"), JSON.stringify(st.sel));
await page.mouse.click(380, 336);
ok("and the bar lists it by name, to bring it back", (await page.getByRole("button", { name: "Hidden in this moment" }).count()) === 1);
// away from the group, it is not there at all
await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.mouse.click(100, 100); await page.waitForTimeout(120);
const gone = await px(680, 300);
ok("with the group left alone it is not drawn", gone === bg, `${gone} vs ${bg}`);
const hit = await page.evaluate(() => window.__editor.shapeAt({ x: 680, y: 336 })?.id ?? null);
ok("nor is it there to touch", hit === null, String(hit));
// playing: B fades between there and not there
const mid = await page.evaluate(async () => { const e = window.__editor, R = await __engine("render"), g = Object.keys(e.store.doc.scenes)[0]; e.play(g); const p = e.playing; delete p.open; /* (these set the clock by hand: the opening still is not theirs) */ p.t0 = performance.now() - (p.moments[0].hold + p.moments[1].over / 2); const d = e.viewDoc(R.themeFor(false)); const o = d.shapes.b?.fine?.o; p.t0 = performance.now() - (p.moments[0].hold + p.moments[1].over + 10); const d2 = e.viewDoc(R.themeFor(false)); e.stop(); return { o, after: !!d2.shapes.b }; });
ok("played, it fades out on the way and is gone on arrival", mid.o > 0.05 && mid.o < 0.95 && !mid.after, JSON.stringify(mid));
// bring it back
await page.mouse.click(380, 336); await page.getByRole("tab", { name: "Moment 2" }).click(); await page.mouse.click(100, 100).catch(() => {});
await page.evaluate(() => { const e = window.__editor, g = Object.keys(e.store.doc.scenes)[0]; e.enter(g); e.store.select(["b"]); e.store.emit(); });
await page.getByRole("button", { name: "Show in this moment" }).click(); st = await M();
ok("showing it puts it back", st.m[1] === "a+b+", JSON.stringify(st.m));
// something drawn in a later moment is there, faint, in the earlier ones: so it can be made to appear sooner
await page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; s.run(() => s.put({ id: "c", kind: "rect", x: 450, y: 450, w: 100, h: 60, text: "C", tone: "ink", fill: "none", group: g })); s.emit(); }); st = await M();
ok("a part made in a later moment is away in the earlier ones", st.m[0] === "a+b+c-" && st.m[1] === "a+b+c+", JSON.stringify(st.m));
const round = await page.evaluate(async () => { const C = await __engine("clean"); const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; const d = C.cleanDoc(JSON.parse(JSON.stringify({ ...s.doc, scenes: { [g]: { ...s.doc.scenes[g], moments: e.moments(g) } } }))); return d.scenes[g].moments[0].shapes.find((x) => x.id === "c")?.away === true; });
ok("a saved board remembers what is away", round);
// what runs along a wire, and a compute mark at work: chosen per moment, shown at once
await page.evaluate(() => { const e = window.__editor, s = e.store, g = Object.keys(s.doc.scenes)[0]; s.run(() => s.put({ id: "w", kind: "arrow", a: { x: 460, y: 336 }, b: { x: 600, y: 336 }, text: "", route: "straight", heads: "end", tone: "ink", group: g }, { id: "k", kind: "glyph", x: 300, y: 500, w: 88, h: 32, text: "", tone: "ink", fill: "none", group: g })); e.showMoment(g, 0); e.showMoment(g, 1); e.enter(g); s.select(["w"]); s.emit(); });
for (const [name, run] of [["Request", "pour"], ["Request runs out", "fizzle"], ["Request refused", "squash"]]) {
  await page.getByRole("button", { name, exact: true }).click();
  const r = await page.evaluate(async () => { const e = window.__editor, R = await __engine("render"), g = Object.keys(e.store.doc.scenes)[0]; const playing = !!e.playing; const p = e.playing; if (p) { delete p.open; const lead = p.moments[0].hold + 150; p.t0 = performance.now() - lead; } const d = playing ? e.viewDoc(R.themeFor(false)) : null; const out = { playing, run: d?.shapes.w?.run, since: R.clock.since, at: e.store.doc.scenes[g].at, m: e.moments(g).map((m) => m.shapes.find((x) => x.id === "w")?.run ?? null) }; return out; });
  ok(`"${name}" is set in this moment only, and plays at once`, r.playing && r.run === run && r.m[1] === run && r.m[0] === null, JSON.stringify(r));
  const lit = await page.evaluate(async (red) => { const p0 = window.__editor.playing; delete p0.open; const raf = () => new Promise((r) => requestAnimationFrame(r)); p0.t0 = performance.now() - (p0.moments[0].hold + 200); await raf(); p0.t0 = performance.now() - (p0.moments[0].hold + 200); await raf(); const c = document.querySelector("canvas"), d = window.devicePixelRatio || 1, im = c.getContext("2d").getImageData(455 * d, 320 * d, 160 * d, 32 * d).data; let n = 0; for (let i = 0; i < im.length; i += 4) if (red ? im[i] > 150 && im[i] - im[i + 2] > 60 : im[i + 2] > 150 && im[i + 2] - im[i] > 60) n++; return n; }, run === "squash");
  ok(`"${name}" is drawn on the wire in its colour (${run === "squash" ? "red: refused" : "the accent"})`, lit > 20, String(lit));
  await page.evaluate(() => { const e = window.__editor; e.stop(); e.store.select(["w"]); e.store.emit(); });
}
await page.getByRole("button", { name: "Request refused", exact: true }).click(); await page.evaluate(() => window.__editor.stop());
let w = await page.evaluate(() => window.__editor.store.doc.shapes.w.run ?? null);
ok("pressing the same choice again takes it off", w === null, String(w));
await page.evaluate(() => { const s = window.__editor.store; s.select(["k"]); s.emit(); });
await page.getByRole("button", { name: "At work", exact: true }).click();
const busy = await page.evaluate(() => { const e = window.__editor, g = Object.keys(e.store.doc.scenes)[0]; const r = { playing: !!e.playing, m: e.moments(g).map((m) => !!m.shapes.find((x) => x.id === "k")?.busy) }; e.stop(); return r; });
ok("a compute mark can be at work in one moment", busy.playing && busy.m[1] === true && busy.m[0] === false, JSON.stringify(busy));
const real = errs.filter((e) => !e.includes("404")); ok("no errors", real.length === 0, real.join(" | "));
console.log(`\n${pass} passed, ${fail} failed`);
await close(); process.exit(fail ? 1 : 0);
