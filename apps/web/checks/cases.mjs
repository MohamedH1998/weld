import { open } from "./lib.mjs";
const { page, errs, close, drag } = await open();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const S = () => page.evaluate(() => { const e = window.__editor, s = e.store, d = s.doc; return { n: d.order.length, order: d.order, shapes: d.order.map((id) => d.shapes[id]), sel: [...s.sel], tool: s.tool, editing: s.editing, cam: s.cam, undo: s.canUndo, g: e.g.type }; });
const reset = async () => { await page.keyboard.press("Escape"); await page.evaluate(() => { const e = window.__editor, s = e.store; s.doc = { shapes: {}, order: [] }; s.sel = new Set(); s.editing = null; s.tool = "select"; s.undoStack = []; s.redoStack = []; s.cam = { x: 0, y: 0, z: 1 }; s.emit(); e.invalidate(); }); };
const box = async (x, y, key = "r") => { await page.keyboard.press(key); await page.mouse.click(x, y); };
const arrow = async (x1, y1, x2, y2) => { await page.keyboard.press("a"); await drag(x1, y1, x2, y2); };
const fin = (st) => JSON.stringify(st.shapes).indexOf("null") === -1;
const arrows = (st) => st.shapes.filter((s) => s.kind === "arrow"), boxes = (st) => st.shapes.filter((s) => s.kind !== "arrow" && s.kind !== "text");
let st;

// ── arrows ──
await reset(); await box(300, 300); await box(700, 300); await arrow(300, 300, 700, 300); st = await S();
ok("A1 arrow box→box binds both at centre", arrows(st)[0]?.a.bind?.ax === 0.5 && arrows(st)[0]?.b.bind?.ax === 0.5);
ok("A1b arrow tool hands back to select after one arrow", st.tool === "select");
await page.keyboard.press("a"); await page.mouse.click(1000, 600); st = await S();
ok("A8 arrow-tool click without drag makes nothing and keeps the tool", st.n === 3 && st.tool === "arrow");
await page.keyboard.press("Escape");
// drag the arrow's end from B back onto A (its own source)
await page.mouse.click(500, 300); await drag(616, 300, 300, 300); st = await S();
ok("A4 an arrow cannot be joined to the box it starts from", !(arrows(st)[0].a.bind && arrows(st)[0].b.bind && arrows(st)[0].a.bind.id === arrows(st)[0].b.bind.id), JSON.stringify(arrows(st)[0]));
await page.keyboard.press("Escape");
// drag by the body: comes away
await page.keyboard.press("Escape"); await drag(500, 300, 500, 450); st = await S();
ok("A11 dragging an arrow by its body detaches and moves it", !arrows(st)[0].a.bind && !arrows(st)[0].b.bind && Math.abs(arrows(st)[0].a.y - arrows(st)[0].b.y) < 1 && arrows(st)[0].a.y > 400, JSON.stringify(arrows(st)[0]));
await page.keyboard.press("Meta+z"); st = await S();
ok("A11b one undo re-attaches it", !!arrows(st)[0].a.bind && !!arrows(st)[0].b.bind);
// box + arrow selected together: stays attached
await page.keyboard.press("Escape"); await page.mouse.click(300, 300); await page.keyboard.down("Shift"); await page.mouse.click(500, 300); await page.keyboard.up("Shift"); await drag(300, 300, 300, 500); st = await S();
ok("A11c arrow dragged together with its box stays attached", !!arrows(st)[0].a.bind && !!arrows(st)[0].b.bind);
await page.keyboard.press("Meta+z");
// overlapping boxes
await page.keyboard.press("Escape"); await drag(700, 300, 320, 310); st = await S();
const pathOk = await page.evaluate(async () => { const { arrowPath } = await __engine("geometry"); const d = window.__editor.store.doc; return d.order.map((id) => d.shapes[id]).filter((s) => s.kind === "arrow").every((a) => arrowPath(d, a).every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))); });
ok("A10 boxes dragged on top of each other: arrow path stays finite", pathOk);
await page.keyboard.press("Meta+z");
// delete a bound box
await page.keyboard.press("Escape"); await page.mouse.click(700, 300); await page.keyboard.press("Delete"); st = await S();
ok("A5 deleting a box deletes the arrow joined to it: no arrow is left pointing at nothing", st.n === 1 && arrows(st).length === 0, `${st.n}`);
await page.keyboard.press("Meta+z"); st = await S(); ok("A6 undo restores the box and the join", st.n === 3 && !!arrows(st)[0].b.bind);
// arrow onto text: never binds
await page.mouse.dblclick(500, 600); await page.keyboard.type("note"); await page.keyboard.press("Escape"); await arrow(300, 300, 510, 610); st = await S();
ok("A12 an arrow dropped on text stays free", !arrows(st)[1].b.bind);
// elbow + straight both survive a label and an emptied label
await page.keyboard.press("Escape"); await page.mouse.dblclick(500, 300); await page.keyboard.type("yes"); await page.keyboard.press("Enter"); st = await S(); ok("A9 arrow takes a label", arrows(st)[0].text === "yes");
await page.mouse.dblclick(500, 300); await page.keyboard.press("Meta+a"); await page.keyboard.press("Backspace"); await page.keyboard.press("Enter"); st = await S(); ok("A9b emptying the label removes it, arrow stays", arrows(st)[0].text === "" && arrows(st).length === 2);

// ── resize ──
await reset(); await box(400, 300); st = await S(); const b0 = boxes(st)[0];
await drag(480, 336, 250, 150); st = await S(); let b = boxes(st)[0];
ok("R1 corner dragged past the opposite corner flips cleanly", b.w > 6 && b.h > 6 && Math.abs(b.x + b.w - 320) < 8 && Math.abs(b.y + b.h - 264) < 8, JSON.stringify(b));
await page.keyboard.press("Meta+z"); st = await S(); ok("R1b one undo restores size", boxes(st)[0].w === b0.w && boxes(st)[0].x === b0.x);
await page.keyboard.down("Alt"); await drag(480, 336, 520, 366); await page.keyboard.up("Alt"); st = await S(); b = boxes(st)[0];
ok("R3 alt-resize grows about the centre", Math.abs(b.x + b.w / 2 - 400) < 1 && Math.abs(b.y + b.h / 2 - 300) < 1 && b.w > b0.w, JSON.stringify(b));
await page.keyboard.press("Meta+z");
await page.keyboard.down("Shift"); await drag(480, 336, 560, 340); await page.keyboard.up("Shift"); st = await S(); b = boxes(st)[0];
ok("R2 shift-resize keeps proportions", Math.abs(b.w / b.h - b0.w / b0.h) < 0.02, `${b.w}x${b.h}`);
await page.keyboard.press("Meta+z");
await page.keyboard.press("Enter"); await page.keyboard.type("A label with several words in it"); await page.keyboard.press("Enter");
await drag(480, 300, 345, 300); await drag(400, 336, 400, 270); st = await S(); b = boxes(st)[0];
const need = await page.evaluate(() => { const e = window.__editor; const b = e.store.doc.shapes[e.store.doc.order[0]]; return e.labelNeed(b); });
ok("R4 a labelled box never gets smaller than its words", b.h >= need - 0.5, `h ${b.h} need ${need}`);
for (const z of [0.1, 3]) { await reset(); await box(400, 300); await page.evaluate((z) => window.__editor.zoomTo(z), z); await page.waitForTimeout(350); const c = await page.evaluate(() => { const e = window.__editor, b = e.store.doc.shapes[e.store.doc.order[0]]; return e.screen({ x: b.x + b.w, y: b.y + b.h }); }); const w0 = (await S()).shapes[0].w; if (c.x > 0 && c.x < 1270 && c.y > 0 && c.y < 790) { await drag(c.x, c.y, c.x + 30, c.y + 20); st = await S(); ok(`R6 corner handle still works at ${z * 100}% zoom`, st.shapes[0].w > w0, `${w0} → ${st.shapes[0].w}`); } else ok(`R6 corner on screen at ${z * 100}%`, false, JSON.stringify(c)); }

// ── selection, duplicate, clipboard ──
await reset(); await box(300, 300); await box(700, 300); await arrow(300, 300, 700, 300); await box(1000, 600); await arrow(700, 300, 1000, 600);
await page.keyboard.press("Escape"); await drag(150, 150, 850, 420); st = await S();
ok("S2 marquee takes the two boxes it touches and the arrow wholly inside", st.sel.length === 3, `sel ${st.sel.length}`);
await page.keyboard.press("Meta+d"); st = await S();
const dupArrow = st.shapes.filter((s) => s.kind === "arrow").at(-1), dupIds = new Set(st.sel);
ok("S7 duplicating boxes with their arrow joins the copies to each other", st.n === 8 && dupArrow.a.bind && dupArrow.b.bind && dupIds.has(dupArrow.a.bind.id) && dupIds.has(dupArrow.b.bind.id));
await page.keyboard.press("Meta+z"); st = await S(); ok("S7b duplicate is one undo step", st.n === 5);
await page.keyboard.press("Escape"); await page.mouse.click(850, 450); st = await S(); const lone = st.sel.length === 1;
await page.keyboard.press("Meta+d"); st = await S(); const la = st.shapes.at(-1);
ok("S8 duplicating an arrow alone gives a free copy of the same shape", lone && la.kind === "arrow" && !la.a.bind && !la.b.bind);
await page.keyboard.press("Meta+z"); await page.keyboard.press("Escape");
await page.keyboard.down("Alt"); await drag(300, 300, 300, 520); await page.keyboard.up("Alt"); st = await S();
ok("S5 alt-drag leaves the original and drops a copy", st.n === 6 && boxes(st).filter((b) => Math.abs(b.y + 36 - 300) < 2).length === 2 && boxes(st).some((b) => Math.abs(b.y + 36 - 520) < 8));
await page.keyboard.press("Meta+z");
await page.keyboard.press("Escape"); await page.keyboard.down("Shift"); await drag(300, 300, 420, 340); await page.keyboard.up("Shift"); st = await S();
ok("S6 shift-drag moves along one axis only", Math.abs(boxes(st)[0].y + 36 - 300) < 0.01 && boxes(st)[0].x + 80 > 400, JSON.stringify(boxes(st)[0]));
await page.keyboard.press("Meta+z");
await page.keyboard.press("Meta+a"); st = await S(); ok("S3 ⌘A selects everything", st.sel.length === st.n);
for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+ArrowDown"); st = await S();
ok("S10 arrow keys nudge 1, shift 10", Math.abs(boxes(st)[0].x + 80 - 305) < 0.01 && Math.abs(boxes(st)[0].y + 36 - 310) < 0.01, JSON.stringify(boxes(st)[0]));
await page.keyboard.press("v"); await page.keyboard.press("Meta+z"); st = await S(); ok("S10b the big nudge undoes on its own", Math.abs(boxes(st)[0].x + 80 - 305) < 0.01 && Math.abs(boxes(st)[0].y + 36 - 300) < 0.01, JSON.stringify(boxes(st)[0]));
await page.keyboard.press("Meta+z"); st = await S(); ok("S10c each separate press of an arrow key is its own undo step", Math.abs(boxes(st)[0].x + 80 - 304) < 0.01, JSON.stringify(boxes(st)[0]));

// ── quick-connect ──
await reset(); await box(300, 300); await page.keyboard.press("Tab"); await page.keyboard.type("b"); await page.keyboard.press("Escape"); st = await S();
ok("Q1 Tab adds a joined box", st.n === 3 && arrows(st).length === 1);
await page.keyboard.press("Meta+z"); st = await S(); const afterOne = st.n; await page.keyboard.press("Meta+z"); st = await S();
ok("Q2 a joined box, its arrow and its first label are one undo step", afterOne === 1 && st.n === 0, `after one undo n=${afterOne}, after two n=${st.n}`);
await reset(); await box(300, 300);
for (let i = 0; i < 4; i++) { await page.keyboard.press("Escape"); await page.mouse.click(300, 300); await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); }
st = await S(); const rects = boxes(st); let overlap = false; for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = rects[i], c = rects[j]; if (a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y) overlap = true; }
ok("Q3 four boxes added from the same side never land on each other", rects.length === 5 && !overlap);

// ── text ──
await reset(); await page.mouse.dblclick(500, 400); await page.keyboard.press("Escape"); st = await S(); ok("T1 empty text leaves nothing and no undo step", st.n === 0 && !st.undo, JSON.stringify([st.n, st.undo, st.shapes]));
await page.mouse.dblclick(500, 400); await page.keyboard.type("one"); await page.keyboard.press("Shift+Enter"); await page.keyboard.type("two"); await page.mouse.click(900, 600); st = await S();
ok("T2 shift+enter makes a second line; clicking away keeps the text", st.n === 1 && st.shapes[0].text === "one\ntwo", JSON.stringify(st.shapes[0]?.text));
await page.keyboard.press("t"); await page.mouse.click(300, 200); await page.keyboard.type("r o d a t v"); await page.keyboard.press("Enter"); st = await S();
ok("T3 letters typed into text are text, not shortcuts; Enter finishes", st.n === 2 && st.shapes[1].text === "r o d a t v" && st.tool === "select", JSON.stringify([st.shapes[1]?.text, st.tool]));
await box(700, 300); await page.keyboard.press("Enter"); await page.keyboard.type("A very long label that has to wrap over several lines to fit inside the box"); await page.keyboard.press("Enter"); st = await S(); b = boxes(st)[0];
ok("T7 a long label wraps and the box grows to hold it", b.h > 72 && b.w === 160, `${b.w}x${b.h}`);

// ── view ──
await reset(); await page.keyboard.press("Shift+1"); await page.waitForTimeout(300); st = await S(); ok("V2 fit on an empty board does nothing strange", [st.cam.x, st.cam.y, st.cam.z].every(Number.isFinite));
await box(400, 300); await page.keyboard.press("Escape");
const before = await page.evaluate(() => window.__editor.world({ x: 600, y: 400 })); await page.mouse.move(600, 400); await page.keyboard.down("Meta"); for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120); await page.keyboard.up("Meta"); await page.waitForTimeout(100);
const after = await page.evaluate(() => window.__editor.world({ x: 600, y: 400 })); st = await S();
ok("V4 zoom holds the point under the cursor still", Math.abs(before.x - after.x) < 0.5 && Math.abs(before.y - after.y) < 0.5 && st.cam.z > 1, JSON.stringify([before, after, st.cam.z]));
await page.keyboard.down("Meta"); for (let i = 0; i < 80; i++) await page.mouse.wheel(0, -400); st = await S(); const zmax = st.cam.z; for (let i = 0; i < 160; i++) await page.mouse.wheel(0, 400); await page.keyboard.up("Meta"); st = await S();
ok("V1 zoom stops at its limits", zmax <= 8.001 && st.cam.z >= 0.049, `${zmax} ${st.cam.z}`);

// ── gestures interrupted ──
await reset(); await box(400, 300); await page.keyboard.press("Escape");
await page.mouse.move(400, 300); await page.mouse.down(); await page.mouse.move(500, 380); await page.evaluate(() => window.dispatchEvent(new Event("blur"))); await page.mouse.up(); st = await S();
ok("W2 losing the window mid-drag puts the box back", Math.abs(boxes(st)[0].x + 80 - 400) < 0.01 && st.g === "idle" && !st.undo === false);
await page.mouse.move(400, 300); await page.mouse.down(); await page.mouse.move(500, 380); await page.keyboard.press("Delete"); await page.keyboard.press("r"); await page.mouse.up(); st = await S();
ok("W3 keys pressed mid-drag do nothing; the drag completes", st.n === 1 && st.tool === "select" && boxes(st)[0].x + 80 > 450, JSON.stringify([st.n, st.tool, boxes(st)[0]?.x]));

// ── storage ──
await page.evaluate(() => { window.__editor.store.persist = false; localStorage.setItem("canvas:doc:v1", "{not json"); localStorage.setItem("canvas:cam:v1", '{"x":null,"z":"big"}'); }); await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(400); st = await S();
ok("P2 damaged saved data loads as an empty, usable board", st.n === 0 && [st.cam.x, st.cam.y, st.cam.z].every(Number.isFinite) && st.cam.z > 0, JSON.stringify(st.cam));
await page.evaluate(() => { window.__editor.store.persist = false; localStorage.setItem("canvas:doc:v1", JSON.stringify({ shapes: { ok: { id: "ok", kind: "rect", x: 10, y: 10, w: 100, h: 50, text: "kept", tone: "ink", fill: "none" }, a: { id: "a", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: "gone", ax: 0.5, ay: 0.5 } }, b: { x: 100, y: 0 } }, b: { id: "b", kind: "rect", x: "NaN", y: 0, w: -5, h: 0, text: 5, tone: "ink", fill: "none" } }, order: ["ok", "a", "b", "ghost"] })); localStorage.setItem("canvas:cam:v1", '{"x":0,"y":0,"z":1}'); }); await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(400);
st = await S(); const sane = st.shapes.every((s) => s && (s.kind === "arrow" ? !s.a.bind && Number.isFinite(s.a.x) : [s.x, s.y, s.w, s.h].every(Number.isFinite) && s.w > 0 && s.h > 0 && typeof s.text === "string"));
ok("P3 saved data with broken shapes is cleaned on load: good shapes kept, broken ones dropped or freed", sane && st.n === 2 && st.shapes[0].text === "kept", JSON.stringify(st.shapes));
await page.mouse.click(600, 400); await page.keyboard.press("r"); await page.mouse.click(600, 400); st = await S(); ok("P3b and the board still works afterwards", st.g === "idle" && st.n >= 1);

// ── from the independent review ──
await page.evaluate(() => { window.__editor.store.persist = true; }); await reset();
await box(300, 300); await box(700, 300); await page.keyboard.press("Meta+z"); await page.mouse.click(300, 300); await page.keyboard.press("a");
await page.getByRole("button", { name: "Straight", exact: true }).click(); await page.getByRole("button", { name: "Right-angled", exact: true }).click(); await page.keyboard.press("Escape"); await page.keyboard.press("Meta+Shift+z"); st = await S();
ok("C3 choosing the arrow style with a box selected keeps redo", st.n === 2, `n ${st.n}`);
await reset(); await box(280, 236); await box(580, 436); await page.keyboard.press("Escape");
await page.mouse.move(280, 236); await page.waitForTimeout(200); await page.mouse.down(); for (let i = 1; i <= 5; i++) await page.mouse.move(280, 236 + i * 39.4); await page.mouse.up(); st = await S();
ok("C4 a flick straight after a pause is not caught", Math.abs(boxes(st)[0].y - 397) < 0.6, `y ${boxes(st)[0].y}`);
await reset(); await page.keyboard.press("a"); await page.mouse.move(500, 500); await page.mouse.down(); await page.mouse.move(503, 504); await page.mouse.up(); st = await S();
ok("C6 an arrow too short to keep does not use up the tool", st.n === 0 && st.tool === "arrow", JSON.stringify([st.n, st.tool]));
await page.keyboard.press("t"); await page.mouse.click(500, 300); await page.keyboard.press("Enter"); st = await S();
ok("C6b text abandoned empty does not use up the tool", st.n === 0 && st.tool === "text", JSON.stringify([st.n, st.tool]));
await page.keyboard.press("Escape");
const jump = await page.evaluate(async () => { const { arrowPath } = await __engine("geometry"); let worst = 0, prev = null; for (const size of [6, 40, 160]) { prev = null; for (let t = 0; t < 6000; t++) { const ang = (t / 6000) * Math.PI * 2, R = size * 3 + 10; const A = { id: "a", kind: "rect", x: 0, y: 0, w: size, h: size, text: "", tone: "ink", fill: "none" }, B = { ...A, id: "b", x: Math.cos(ang) * R, y: Math.sin(ang) * R }; const ar = { id: "r", kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: "a", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "b", ax: 0.5, ay: 0.5 } } }; const p = arrowPath({ shapes: { a: A, b: B, r: ar }, order: ["a", "b", "r"] }, ar)[0]; if (prev) worst = Math.max(worst, Math.hypot(p.x - prev.x, p.y - prev.y)); prev = p; } } return worst; });
ok("C7 straight arrows are continuous for small boxes close together too", jump < 1.5, `worst tip step ${jump.toFixed(2)}px`);
const cleaned = await page.evaluate(async () => { const { cleanDoc, cleanShapes } = await __engine("clean"); const d = cleanDoc({ shapes: { "__proto__": { id: "__proto__", kind: "rect", x: 0, y: 0, w: 10, h: 10 }, ok: { id: "ok", kind: "rect", x: 0, y: 0, w: 10, h: 10 } }, order: ["__proto__", "ok", "constructor"] }); const big = cleanShapes([{ id: "a", kind: "rect", x: 1.7e308, y: 0, w: 1.7e308, h: 72 }, { id: "b", kind: "rect", x: 0, y: 0, w: 10, h: 10 }, { id: "c", kind: "arrow", a: { x: 0, y: 0, bind: { id: "a", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "b", ax: 0.5, ay: 0.5 } } }]); return { ids: d.order, big: big.map((s) => s.id + ":" + (s.kind === "arrow" ? (s.a.bind ? "bound" : "free") : "box")) }; });
ok("C1/C2 unsafe ids and out-of-range numbers are refused", cleaned.ids.join() === "ok" && cleaned.big.join() === "b:box,c:free", JSON.stringify(cleaned));

// ── from the second review ──
const E = (fn, arg) => page.evaluate(fn, arg);
const setDoc = (shapes, cam = { x: 0, y: 0, z: 1 }) => E(({ shapes, cam }) => { const e = window.__editor, s = e.store; s.doc = { shapes: Object.fromEntries(shapes.map((x) => [x.id, x])), order: shapes.map((x) => x.id) }; s.sel = new Set(); s.editing = null; s.tool = "select"; s.undoStack = []; s.redoStack = []; s.cam = cam; s.emit(); e.invalidate(); }, { shapes, cam });
const R = (id, x, y, w = 160, h = 72, extra = {}) => ({ id, kind: "rect", x, y, w, h, text: "", tone: "ink", fill: "none", ...extra });
const AR = (id, a, b, extra = {}) => ({ id, kind: "arrow", text: "", route: "straight", heads: "end", tone: "ink", a, b, ...extra });
const bind = (id) => ({ x: 0, y: 0, bind: { id, ax: 0.5, ay: 0.5 } });
await page.keyboard.press("Escape");
// existing arrow end dropped onto its own source: goes back as it was
await setDoc([R("A", 100, 100), R("B", 500, 100), AR("r", bind("A"), bind("B"), { text: "lbl" })]);
await page.mouse.click(380, 136); await drag(496, 136, 180, 136); st = await S();
ok("D5 an arrow end dropped on its own source goes back as it was", !!arrows(st)[0].b.bind && arrows(st)[0].b.bind.id === "B", JSON.stringify(arrows(st)[0].b));
// shift-resize by an edge, and across the opposite corner
await setDoc([R("A", 100, 100)]); await page.mouse.click(180, 136); await page.keyboard.down("Shift"); await drag(260, 136, 420, 136); await page.keyboard.up("Shift"); st = await S(); b = st.shapes[0];
ok("D7 shift-resize by an edge keeps proportions", Math.abs(b.w / b.h - 160 / 72) < 0.02 && b.w > 300, `${b.w}x${b.h}`);
await setDoc([R("A", 100, 100)]); await page.mouse.click(180, 136); await page.keyboard.down("Shift"); await drag(260, 172, 50, 50); await page.keyboard.up("Shift"); st = await S(); b = st.shapes[0];
ok("D7b shift-resize across the fixed corner follows the pointer", b.x + b.w <= 101 && b.y + b.h <= 101 && Math.abs(b.w / b.h - 160 / 72) < 0.02, JSON.stringify(b));
// mixed selection resize keeps text inside the frame
await setDoc([R("A", 100, 100), { id: "T", kind: "text", x: 300, y: 100, w: 180, h: 26, text: "some words here", size: 18, tone: "ink" }]);
await page.keyboard.press("Meta+a"); const sb = await E(() => { const e = window.__editor; const s = e.store; let x1 = -1e9, y1 = -1e9; for (const id of s.doc.order) { const o = s.doc.shapes[id]; x1 = Math.max(x1, o.x + o.w); y1 = Math.max(y1, o.y + o.h); } return { x1, y1 }; });
await page.keyboard.down("Meta"); await drag(sb.x1, sb.y1, 290, 136); await page.keyboard.up("Meta"); st = await S(); const tx = st.shapes[1];
ok("D6 resizing a mixed selection keeps text inside the frame", tx.x + tx.w <= 292 && tx.size < 18, JSON.stringify(tx));
// hit testing at the zoom extremes
await setDoc([AR("lo", { x: 0, y: 50 }, { x: 100, y: 50 }), AR("hi", { x: 0, y: 53 }, { x: 100, y: 53 })], { x: 0, y: 0, z: 8 });
await page.mouse.click(400, 400); st = await S();
ok("D8 at 800% the arrow under the pointer is the one picked", st.sel.join() === "lo", st.sel.join());
await setDoc([R("A", 12000, 8000)], { x: 0, y: 0, z: 0.05 });
await page.mouse.click(604, 401.8); await drag(604, 401.8, 700, 500); st = await S();
ok("D9 at 5% a tiny selected box is moved by its middle, not resized", st.shapes[0].w === 160 && st.shapes[0].x > 13000, JSON.stringify(st.shapes[0]));
// a label under a filled box does not take the click
await setDoc([AR("r", { x: 100, y: 300 }, { x: 500, y: 300 }, { text: "hidden label" }), R("cover", 220, 240, 160, 72, { fill: "solid" })]);
await page.mouse.click(300, 285); st = await S();
ok("D10 a filled box over an arrow's label takes the click", st.sel.join() === "cover", st.sel.join());
// quick-create past a very tall obstacle
await setDoc([R("A", 100, 100), R("wall", 332, 100, 160, 5000)]); await page.mouse.click(180, 136); await page.keyboard.press("Tab"); await page.keyboard.press("Escape"); st = await S();
const nb = st.shapes.find((x) => x.kind === "rect" && x.id !== "A" && x.id !== "wall");
ok("D12 a joined box is never placed inside something in the way", nb && !(nb.x < 492 && nb.x + nb.w > 332 && nb.y < 5100 && nb.y + nb.h > 100), JSON.stringify(nb));
// click placement honours ⌘
await setDoc([R("A", 100, 300)]); await page.keyboard.press("r"); await page.keyboard.down("Meta"); await page.mouse.click(183, 136); await page.keyboard.up("Meta"); st = await S();
ok("D13 ⌘-click places a box without lining it up", Math.abs(st.shapes[1].x - 103) < 0.01, `x ${st.shapes[1].x}`);
// text tool on an empty box, nothing typed
await setDoc([R("A", 100, 100)]); await page.keyboard.press("t"); await page.mouse.click(180, 136); await page.keyboard.press("Enter"); st = await S();
ok("D14 nothing typed into an empty box does not use up the Text tool", st.tool === "text", st.tool);
await page.keyboard.press("Escape");
// saves hold only finished work
await E(() => { window.__editor.store.persist = true; }); await setDoc([R("A", 100, 100)]);
await page.mouse.click(180, 136); await page.keyboard.press("ArrowRight"); await page.keyboard.press("v");
await page.mouse.move(180, 136); await page.mouse.down(); await page.mouse.move(400, 300); await page.waitForTimeout(400);
const savedMid = await E(() => JSON.parse(localStorage.getItem("canvas:doc:v1")).shapes.A.x); await page.keyboard.press("Escape"); await page.mouse.up();
ok("D3 a save that fires mid-drag holds the board as it was before the drag", savedMid === 101, `saved x ${savedMid}`);
// two tabs
const ctx = page.context(); const tab2 = await ctx.newPage(); await tab2.goto("http://localhost:3100/", { waitUntil: "networkidle" }); await tab2.waitForTimeout(500);
await page.keyboard.press("r"); await page.mouse.click(700, 500); await page.waitForTimeout(450);
const seen = await tab2.evaluate(() => window.__editor.store.doc.order.length);
await tab2.mouse.move(600, 400); await tab2.mouse.wheel(40, 40); await tab2.waitForTimeout(450); await tab2.close(); await page.waitForTimeout(100);
const kept = await E(() => Object.keys(JSON.parse(localStorage.getItem("canvas:doc:v1")).shapes).length);
ok("D1 a second tab follows what the first saves, and looking around in it overwrites nothing", seen === 2 && kept === 2, `second tab saw ${seen}, storage holds ${kept}`);
// a camera far out of range
await E(() => { window.__editor.store.persist = false; localStorage.setItem("canvas:cam:v1", '{"x":1e20,"y":0,"z":1}'); }); await page.reload({ waitUntil: "networkidle" }); await page.waitForTimeout(500);
st = await S(); ok("D2 a saved camera far out of range is ignored and the board still paints", Math.abs(st.cam.x) < 1e8);

// lost and found
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" }); await page.waitForTimeout(400);
await E(() => { window.__editor.store.persist = false; }); await setDoc([R("A", 100, 100)]);
const back = page.getByRole("button", { name: "Back to the drawing" });
const shownAtHome = await back.count();
await E(() => { const e = window.__editor; e.store.setCamera({ x: 15000, y: -32000, z: 0.09 }); }); await page.waitForTimeout(200);
const shownLost = await back.count(); await back.click(); await page.waitForTimeout(500);
const found = await E(() => { const e = window.__editor, s = e.store, b = s.doc.shapes.A, p = e.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 }); return p.x > 0 && p.x < e.view.w && p.y > 0 && p.y < e.view.h; });
ok("with the drawing off screen the board offers the way back, and it works", shownAtHome === 0 && shownLost === 1 && found && (await back.count()) === 0, JSON.stringify([shownAtHome, shownLost, found]));

console.log(`\n${pass} passed, ${fail} failed`, errs.filter((e) => !e.includes("404")));
await close();
