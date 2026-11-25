// Turning shapes: the handle, steps, resize while turned, arrows, undo. Also takes pictures to look at.
import { open } from "./lib.mjs";
const { page, errs, close, drag, shot } = await open({ w: 1280, h: 760 });
let pass = 0, fail = 0;
const ok = (n, c, x = "") => { c ? pass++ : fail++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const S = () => page.evaluate(() => { const s = window.__editor.store; return { shapes: s.doc.order.map((id) => s.doc.shapes[id]), sel: [...s.sel], undo: s.canUndo }; });
const deg = (r) => ((r ?? 0) * 180) / Math.PI;
const setDoc = (shapes) => page.evaluate((shapes) => { const e = window.__editor, s = e.store; s.persist = false; s.doc = { shapes: Object.fromEntries(shapes.map((x) => [x.id, x])), order: shapes.map((x) => x.id) }; s.sel = new Set(); s.editing = null; s.tool = "select"; s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); e.invalidate(); }, shapes);
const R = (id, x, y, w = 160, h = 72, extra = {}) => ({ id, kind: "rect", x, y, w, h, text: "", tone: "ink", fill: "none", ...extra });
const bind = (id) => ({ x: 0, y: 0, bind: { id, ax: 0.5, ay: 0.5 } });
// the handle sits 14px off the top-right corner; drag it round the centre
await setDoc([R("A", 300, 300, 160, 72, { text: "Turned" })]);
await page.mouse.click(380, 336);
const turnTo = async (cx, cy, hx, hy, degs, opts = {}) => { const a0 = Math.atan2(hy - cy, hx - cx), r = Math.hypot(hx - cx, hy - cy); await page.mouse.move(hx, hy); await page.mouse.down(); for (let i = 1; i <= 12; i++) { const a = a0 + ((degs * Math.PI) / 180) * (i / 12); await page.mouse.move(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } if (opts.hold) await opts.hold(); await page.mouse.up(); };
await turnTo(380, 336, 474, 286, 30); let st = await S();
ok("the handle turns a box about its centre", Math.abs(deg(st.shapes[0].rot) - 30) < 1 && st.shapes[0].x === 300 && st.shapes[0].y === 300, JSON.stringify(st.shapes[0]));
await shot("rot-1-turned");
await page.keyboard.press("Meta+z"); st = await S(); ok("one undo puts it upright", !st.shapes[0].rot);
await page.keyboard.down("Shift"); await turnTo(380, 336, 474, 286, 40); await page.keyboard.up("Shift"); st = await S();
ok("shift turns in 15° steps", Math.abs(deg(st.shapes[0].rot) - 45) < 0.01, `${deg(st.shapes[0].rot)}`);
await page.keyboard.press("Meta+z"); await turnTo(380, 336, 474, 286, 89); st = await S();
ok("near a quarter turn it settles exactly on it", Math.abs(deg(st.shapes[0].rot) - 90) < 0.001, `${deg(st.shapes[0].rot)}`);
await page.keyboard.press("Meta+z");
// picking a turned box: inside its real outline only
await setDoc([R("A", 300, 300, 200, 40, { rot: Math.PI / 4, fill: "solid" })]);
await page.mouse.click(400 + 60, 320 + 60); st = await S(); const inside = st.sel.length;
await page.keyboard.press("Escape"); await page.mouse.click(400 + 85, 320 - 5); st = await S();
ok("a turned box is picked by its real outline, not its upright frame", inside === 1 && st.sel.length === 0, `inside ${inside}, corner of frame ${st.sel.length}`);
// resize a turned box by its (turned) corner: the opposite corner stays put
await setDoc([R("A", 300, 300, 200, 80, { rot: Math.PI / 6 })]); await page.mouse.click(400, 340);
const corner = (b, fx, fy) => { const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = (fx - 0.5) * b.w, dy = (fy - 0.5) * b.h, c = Math.cos(b.rot ?? 0), s = Math.sin(b.rot ?? 0); return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }; };
st = await S(); const before = st.shapes[0], br = corner(before, 1, 1), tl0 = corner(before, 0, 0);
await page.keyboard.down("Meta"); await drag(br.x, br.y, br.x + 60, br.y + 70); await page.keyboard.up("Meta"); st = await S(); const after = st.shapes[0], tl1 = corner(after, 0, 0);
ok("resizing a turned box keeps the opposite corner where it was and the angle unchanged", Math.hypot(tl1.x - tl0.x, tl1.y - tl0.y) < 0.5 && Math.abs(after.rot - before.rot) < 1e-9 && after.w > before.w, JSON.stringify({ tl0, tl1, after }));
await shot("rot-2-resized");
// arrows follow a turned box, both styles; text typed in a turned box
await setDoc([R("A", 200, 300, 160, 72, { text: "From" }), R("B", 560, 250, 160, 72, { text: "Turned", rot: Math.PI / 5, kind: "diamond", h: 110 }), R("C", 900, 420, 160, 72, { text: "Ellipse", kind: "ellipse", rot: -Math.PI / 6 }),
  { id: "r1", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: bind("A"), b: bind("B") }, { id: "r2", kind: "arrow", text: "", route: "elbow", heads: "end", tone: "ink", a: bind("B"), b: bind("C") },
  { id: "T", kind: "text", x: 300, y: 520, w: 150, h: 26, text: "free text, turned", size: 18, tone: "ink", rot: -0.3 }]);
const gaps = await page.evaluate(async () => { const G = await __engine("geometry"); const d = window.__editor.store.doc; const out = []; for (const id of ["r1", "r2"]) { const a = d.shapes[id], pts = G.arrowPath(d, a); const tip = pts[pts.length - 1], b = d.shapes[a.b.bind.id]; out.push({ id, tipOutside: !G.insideBox(b, tip), near: G.insideBox(b, tip, 8), finite: pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) }); } return out; });
ok("arrows stop just outside a turned box's real outline", gaps.every((g) => g.tipOutside && g.near && g.finite), JSON.stringify(gaps));
await shot("rot-3-arrows");
await page.mouse.dblclick(640, 305); await page.waitForTimeout(100); await shot("rot-4-typing");
await page.keyboard.type("Typed"); await page.keyboard.press("Escape"); st = await S();
ok("typing in a turned box works", st.shapes[1].text === "Typed", st.shapes[1].text);
// turn a group: boxes go round the middle, the joined arrow stays joined
await page.keyboard.press("Meta+a"); await page.waitForTimeout(50);
const fr = await page.evaluate(async () => { const R = await __engine("render"); const s = window.__editor.store; return R.selectionFrame(s.doc, s.sel); });
await turnTo(fr.x + fr.w / 2, fr.y + fr.h / 2, fr.x + fr.w + 14, fr.y - 14, 90); st = await S();
ok("turning a group turns every box and keeps arrows joined", Math.abs(deg(st.shapes[0].rot) - 90) < 0.5 && !!st.shapes[3].a.bind && !!st.shapes[3].b.bind, `${deg(st.shapes[0].rot)}`);
await shot("rot-5-group");
await page.keyboard.press("Meta+z"); st = await S(); ok("and one undo puts the whole group back", !st.shapes[0].rot && Math.abs(st.shapes[1].rot - Math.PI / 5) < 1e-9);
// Tab from a turned box: the new one is upright and clear of it
await page.keyboard.press("Escape"); await page.mouse.click(985, 456); await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); st = await S(); const nb = st.shapes.find((x) => x.kind === "ellipse" && x.id !== "C");
ok("a box added from a turned one stands upright", nb && !nb.rot, JSON.stringify(nb));
console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404")));
await close();
