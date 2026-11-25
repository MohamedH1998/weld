import { open } from "./lib.mjs";
const N = Number(process.argv[2] ?? 5000);
const { page, errs, close } = await open();
const out = await page.evaluate(async (N) => {
  const e = window.__editor, s = e.store; s.persist = false; const shapes = {}, order = []; const cols = Math.ceil(Math.sqrt(N));
  for (let i = 0; i < N; i++) { const id = "b" + i; shapes[id] = { id, kind: i % 3 === 0 ? "ellipse" : "rect", x: (i % cols) * 240, y: Math.floor(i / cols) * 140, w: 160, h: 72, text: "Box " + i, tone: "ink", fill: "none" }; order.push(id); }
  for (let i = 0; i < N - 1; i++) { if ((i + 1) % cols === 0) continue; const id = "a" + i; shapes[id] = { id, kind: "arrow", text: "", route: i % 2 ? "elbow" : "straight", heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: "b" + i, ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "b" + (i + 1), ax: 0.5, ay: 0.5 } } }; order.push(id); }
  s.doc = { shapes, order }; s.emit();
  const R = await __engine("render");
  const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
  const paint = () => R.render(ctx, { ...e.view, dpr: 2 }, s.doc, s.cam, s.sel, s.editing, e.overlay, R.themeFor(false), s.grid);
  const time = (fn, n = 30) => { fn(); const t = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t) / n; };
  const inp = (x, y) => ({ x, y, button: 0, shift: false, alt: false, meta: false, id: 1, touch: false });
  const lines = [];
  for (const z of [1, 0.2, 0.05]) {
    s.cam = { x: 2000, y: 1500, z }; s.sel = new Set(); s.emit();
    lines.push(`zoom ${z * 100}%`);
    lines.push(`  paint a frame                 ${time(paint).toFixed(2)} ms`);
    let k = 0; lines.push(`  pointer move (hover)          ${time(() => e.move(inp(200 + (k++ % 800), 300 + (k % 300))), 200).toFixed(3)} ms`);
    // drag one box
    const b = Object.values(s.doc.shapes).find((x) => x.kind !== "arrow" && x.x > s.cam.x + 300 / z && x.y > s.cam.y + 300 / z); const c = e.screen({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
    e.down(inp(c.x, c.y)); k = 0; e.move(inp(c.x + 10, c.y + 10));
    lines.push(`  pointer move (dragging a box) ${time(() => e.move(inp(c.x + 10 + (k++ % 300), c.y + 10 + (k % 200))), 100).toFixed(3)} ms`);
    lines.push(`  paint while dragging          ${time(paint).toFixed(2)} ms`);
    e.up(inp(c.x + 50, c.y + 50)); e.history("undo");
    // marquee over the whole view
    s.sel = new Set(); e.down(inp(3, 3)); k = 0;
    lines.push(`  pointer move (marquee)        ${time(() => e.move(inp(600 + (k++ % 600), 400 + (k % 300))), 60).toFixed(3)} ms   selected ${s.sel.size}`);
    e.up(inp(1200, 700));
    const n = s.sel.size; const any = [...s.sel].map((id) => s.doc.shapes[id]).find((x) => x.kind !== "arrow");
    if (any) { const c2 = e.screen({ x: any.x + any.w / 2, y: any.y + any.h / 2 }); e.down(inp(c2.x, c2.y)); e.move(inp(c2.x + 10, c2.y + 10)); k = 0;
      lines.push(`  pointer move (dragging ${String(n).padStart(5)}) ${time(() => e.move(inp(c2.x + 10 + (k++ % 200), c2.y + 10 + (k % 100))), 30).toFixed(3)} ms`);
      lines.push(`  paint while dragging them     ${time(paint, 10).toFixed(2)} ms`);
      e.up(inp(c2.x + 20, c2.y + 20)); e.history("undo"); }
  }
  s.sel = new Set(Object.keys(s.doc.shapes)); let t = performance.now(); e.restyle({ tone: "red" }); lines.push(`recolour all ${order.length}              ${(performance.now() - t).toFixed(1)} ms`);
  t = performance.now(); e.history("undo"); lines.push(`undo that                       ${(performance.now() - t).toFixed(1)} ms`);
  t = performance.now(); JSON.stringify(s.doc); lines.push(`serialise for saving            ${(performance.now() - t).toFixed(1)} ms`);
  return lines.join("\n");
}, N);
console.log(`${N} boxes + ~${N} arrows\n` + out, errs.filter((e) => !e.includes("404")));
await close();
