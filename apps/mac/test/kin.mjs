// A thread in hand shows what it sees, quietly: a faint line in its colour just outside each one, so each keeps its own
// edge. Pointing at one in the thread's list (hover or keyboard focus) outlines that one clearly, and only that one.
//   WELD_SEED=0 node scripts/shot.mjs out/kin test/kin.mjs
import path from "node:path";

const MOCK = path.resolve("test/mock-acp-agent.mjs");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (name, ok, extra) => console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && extra !== undefined ? ` -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);

export default async ({ page, shot }) => {
  const E = (fn, ...a) => page.evaluate(fn, ...a);
  const saved = await E(([n, m]) => window.weld.saveAgent({ name: "Mock agent", command: n, args: [m], env: {} }), [process.execPath, MOCK]);
  await E((id) => window.weld.saveSettings({ agent: `cmd:${id}`, mode: "full" }), saved.id);
  await page.reload();
  await page.waitForFunction(() => !!window.__editor);
  await wait(1200);
  // two threads, working in the same folder (so each is the other's peer)
  const ask = async (words) => {
    await page.click(".ask-bar textarea");
    await page.keyboard.insertText(`say:${words}`);
    await page.keyboard.press("Enter");
    for (let t = 0; t < 80 && (await E(() => document.querySelector(".ask-capsule")?.getAttribute("data-state"))) !== "done"; t++) await wait(250);
    await page.click(".ask-capsule");
    await wait(500);
    await page.click("text=Put on the board");
    await wait(800);
  };
  await ask("Here's_the_plan");
  await ask("A_review_of_the_plan");
  // (both working in one folder)
  const dir = await E(async () => { const d = window.__editor.store.doc, ids = d.order.filter((x) => d.shapes[x]?.kind === "thread"); const m = await window.weld.thread.set(ids[0], {}); for (const id of ids) await window.weld.thread.set(id, { cwd: m.cwd }); return m.cwd; });
  check("(the two threads work in one folder)", !!dir, dir);
  // what the first thread sees: two boxes, a panel, a turned box, and the other thread
  const [t1, t2] = await E(() => {
    const e = window.__editor, st = e.store, d = st.doc, [a, b] = d.order.filter((x) => d.shapes[x]?.kind === "thread"), A = d.shapes[a];
    st.run(() => {
      st.patch(b, { x: A.x, y: A.y + A.h + 100 });
      const X = A.x + A.w + 80;
      st.put({ id: "r1", kind: "rect", x: X, y: A.y, w: 220, h: 90, text: "Acme API", tone: "ink", fill: "tint" });
      st.put({ id: "r2", kind: "rect", x: X, y: A.y + 140, w: 220, h: 90, text: "Payments service", tone: "ink", fill: "tint" });
      st.put({ id: "p1", kind: "panel", x: X, y: A.y + 280, w: 160, h: 84, text: "Queue", tone: "ink", fill: "none" });
      st.put({ id: "q1", kind: "rect", x: X + 300, y: A.y + 40, w: 160, h: 70, text: "Turned", tone: "ink", fill: "tint", rot: 0.3 });
      st.patch(a, { live: { ...A.live, sees: ["drawing:r1", "drawing:r2", "drawing:p1", "drawing:q1", `live:${b}`] } });
    });
    e.fit([a, b, "r1", "r2", "p1", "q1"]);
    st.select([a]);
    st.emit();
    return [a, b];
  });
  await wait(900);
  const kin = () => E(() => { const k = window.__editor.overlay.kin; return k ? { ids: [...k.ids].sort().join(), hot: [...(k.hot ?? [])].sort().join() } : null; });
  const q = await kin();
  check("a thread in hand outlines the drawings it sees", q?.ids === "p1,q1,r1,r2", q);
  check("…all of them faintly, none clearly", q?.hot === "", q);

  // the faint line is drawn just outside each shape (its own edge left as it is), turned with a turned one
  // (every layer of the board at a point: the faint line is drawn on the layer above the shapes)
  const px = (pts) => E((pts) => pts.map((p) => [...document.querySelectorAll("canvas")].map((c) => { const r = c.getBoundingClientRect(), k = c.width / r.width, d = c.getContext("2d").getImageData(Math.round((p.x - r.left) * k), Math.round((p.y - r.top) * k), 1, 1).data; return [...d]; }).filter((d) => d[3] > 0)), pts);
  const edges = await E(() => {
    const e = window.__editor, c = e.store.cam, d = e.store.doc, sx = (x) => (x - c.x) * c.z, sy = (y) => (y - c.y) * c.z;
    const pt = (id, outBy) => { const s = d.shapes[id], rot = s.rot ?? 0, cx = s.x + s.w / 2, cy = s.y + s.h / 2, dy = -(s.h / 2) - outBy / c.z; return { x: sx(cx - Math.sin(rot) * dy), y: sy(cy + Math.cos(rot) * dy) }; };
    return Object.fromEntries(["r1", "p1", "q1"].map((id) => [id, { line: pt(id, 4.75), edge: pt(id, 0) }]));
  });
  // (the line itself, at its own strength: not the soft edge a line leaves on the pixels beside it)
  const blue = (layers) => layers.some((c) => c[2] > c[0] + 40 && c[3] >= 90);
  for (const id of ["r1", "p1", "q1"]) {
    const [line, edge] = await px([edges[id].line, edges[id].edge]);
    check(`${id === "p1" ? "a panel's" : id === "q1" ? "a turned box's" : "a box's"} faint line lies outside it, its own edge left in its own colour`, blue(line) && !blue(edge), { line, edge });
  }

  // a short panel, close up: the faint line runs straight down its side, outside it (no notches of a larger panel's)
  await E(() => { const e = window.__editor, st = e.store, A = st.doc.shapes.p1; st.run(() => { st.put({ id: "p2", kind: "panel", x: A.x + 220, y: A.y, w: 160, h: 48, text: "Cache", tone: "ink", fill: "none" }); }); const t = st.doc.order.find((x) => st.doc.shapes[x]?.kind === "thread"), T = st.doc.shapes[t]; st.run(() => st.patch(t, { live: { ...T.live, sees: [...T.live.sees, "drawing:p2"] } })); const P = st.doc.shapes.p2; st.cam = { x: P.x + P.w / 2 - innerWidth / 4, y: P.y + P.h / 2 - innerHeight / 4, z: 2 }; st.select([t]); st.emit(); });
  await wait(600);
  const side = await E(() => { const e = window.__editor, c = e.store.cam, P = e.store.doc.shapes.p2, x = (P.x - c.x) * c.z, y = (P.y + P.h / 2 - c.y) * c.z; return [{ x: x - 4.75, y }, { x: x + 4, y }]; });
  const [sOut, sIn] = await px(side);
  check("a short panel's faint line runs down its side outside it, close up", blue(sOut) && !blue(sIn), { sOut, sIn });
  // a button close up (250%): the faint line keeps clear of it at its corners too, never crossing into it
  await E(() => { const e = window.__editor, st = e.store, A = st.doc.shapes.p2; st.run(() => st.put({ id: "b1", kind: "button", x: A.x, y: A.y + 120, w: 140, h: 32, text: "Pay", tone: "ink", fill: "solid" })); const t = st.doc.order.find((x) => st.doc.shapes[x]?.kind === "thread"), T = st.doc.shapes[t]; st.run(() => st.patch(t, { live: { ...T.live, sees: [...T.live.sees, "drawing:b1"] } })); const B = st.doc.shapes.b1; st.cam = { x: B.x + B.w / 2 - innerWidth / 5, y: B.y + B.h / 2 - innerHeight / 5, z: 2.5 }; st.select([t]); st.emit(); });
  await wait(600);
  // (out from each corner on the diagonal, from inside the button to past the line: where its own edge is, where the line is)
  const rays = await E(() => {
    const e = window.__editor, c = e.store.cam, B = e.store.doc.shapes.b1, X = [(B.x - c.x) * c.z, (B.x + B.w - c.x) * c.z], Y = [(B.y - c.y) * c.z, (B.y + B.h - c.y) * c.z];
    return [[0, 0, -1, -1], [1, 0, 1, -1], [0, 1, -1, 1], [1, 1, 1, 1]].map(([i, j, dx, dy]) => Array.from({ length: 61 }, (_, n) => { const d = -12 + n * 0.5; return { d, x: X[i] + (dx * d) / Math.SQRT2, y: Y[j] + (dy * d) / Math.SQRT2 }; }));
  });
  let clear = true;
  const seen = [];
  for (const ray of rays) {
    const at = await px(ray);
    const dark = ray.filter((_, n) => at[n].some((c) => c[3] === 255 && c[0] < 110 && c[2] < 110)).map((p) => p.d);
    const line = ray.filter((_, n) => blue(at[n])).map((p) => p.d);
    seen.push({ edge: Math.max(...dark), line: [Math.min(...line), Math.max(...line)] });
    if (!dark.length || !line.length || Math.min(...line) - Math.max(...dark) < 1.5) clear = false;
  }
  check("a button's faint line stands clear of its own edge at every corner, close up", clear, seen);
  await E(() => { const e = window.__editor, d = e.store.doc; e.fit(d.order.filter((x) => ["thread", "rect", "panel"].includes(d.shapes[x]?.kind))); });
  await wait(600);

  // a thread both seen and working in the same folder: the faint line and the dashed edge, both
  const both = async () => E((t2) => { const n = document.querySelector(`[data-live="${t2}"]`), sh = n?.querySelector(":scope > .live-sheet"); return n && { kin: n.classList.contains("is-kin"), peer: n.classList.contains("is-peer"), line: !!n.querySelector(":scope > .live-kin"), dashed: getComputedStyle(sh).outlineStyle, ring: getComputedStyle(sh).boxShadow }; }, t2);
  const b1 = await both();
  check("a thread seen and in the same folder shows the faint line and the dashed edge together", b1?.kin && b1.peer && b1.line && b1.dashed === "dashed", b1);
  const apart = await E((t2) => { const n = document.querySelector(`[data-live="${t2}"]`), a = n.querySelector(":scope > .live-kin").getBoundingClientRect(), b = n.querySelector(":scope > .live-sheet").getBoundingClientRect(), z = window.__editor.store.cam.z, sh = getComputedStyle(n.querySelector(":scope > .live-sheet")); return { line: (b.left - a.left) / z, width: parseFloat(getComputedStyle(n.querySelector(":scope > .live-kin")).borderLeftWidth), dashesTo: parseFloat(sh.outlineOffset) + parseFloat(sh.outlineWidth) }; }, t2);
  check("…the faint line standing clear of the dashes", apart.line - apart.width > apart.dashesTo + 1, apart);
  await shot?.("quiet");

  const chips = page.locator(`[data-live="${t1}"] .thread-see`);
  check("the thread lists them", (await chips.count()) === 7, await chips.allInnerTexts());
  await chips.first().hover();
  await wait(300);
  check("pointing at one in its list outlines that one clearly", (await kin())?.hot === "r1", await kin());
  await shot?.("pointed");
  await page.mouse.move(5, 5);
  await wait(300);
  check("…and moving off lets it go back to faint", (await kin())?.hot === "");
  // pointing at the other thread: its clear ring, and the dashed edge still there
  await chips.nth(4).hover();
  await wait(300);
  const b2 = await both();
  check("pointed at, the seen thread is ringed clearly, its dashed edge kept", b2?.dashed === "dashed" && /6px/.test(b2.ring) && !b2.line, b2);
  await page.mouse.move(5, 5);
  await wait(200);
  // by keyboard, and the pointer and the keys apart: keys on one, the pointer passing over another and off
  await chips.nth(1).locator("button").first().focus();
  await wait(200);
  check("focusing one by keyboard outlines it clearly too", (await kin())?.hot === "r2");
  await chips.first().hover();
  await wait(150);
  await page.mouse.move(5, 5);
  await wait(200);
  check("…and the pointer passing over another and off leaves the focused one clear", (await kin())?.hot === "r2", await kin());
  await E(() => document.activeElement?.blur());
  await wait(150);
  // another thing taken in hand: nothing stays pointed at, before the pointer moves at all
  await chips.first().hover();
  await wait(200);
  check("(pointed at before the switch)", (await kin())?.hot === "r1");
  await E(() => { const st = window.__editor.store; st.select(["r1"]); st.emit(); });
  await wait(300);
  const other = await kin();
  check("taking another thing in hand, nothing is pointed at (the list pointed from is not the one in hand's)", !other || other.hot === "", other);
  await page.mouse.move(5, 5);
  await wait(150);
  await E((t) => { const st = window.__editor.store; st.select([t]); st.emit(); }, t1);
  await wait(300);
  const back = await kin();
  check("…and taking the thread again, nothing is left pointed at", back?.hot === "", back);
};
