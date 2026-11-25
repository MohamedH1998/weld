import { open } from "./lib.mjs";
const { page, close } = await open();
const out = await page.evaluate(async () => {
  const { arrowPath } = await __engine("geometry");
  const kinds = ["rect", "ellipse", "diamond"]; const lines = [];
  for (const route of ["straight", "elbow"]) for (const ka of kinds) for (const kb of kinds) for (const anchor of ["centre", "pinned"]) {
    const A = { id: "a", kind: ka, x: 0, y: 0, w: 160, h: 72, text: "", tone: "ink", fill: "none" };
    let worst = 0, at = "", jumps = 0, prev = null;
    for (const R of [140, 220, 400]) { prev = null;
      for (let t = 0; t < 3000; t++) {
        const ang = (t / 3000) * Math.PI * 2;
        const B = { id: "b", kind: kb, x: Math.cos(ang) * R * 1.6, y: Math.sin(ang) * R, w: 160, h: 72, text: "", tone: "ink", fill: "none" };
        const arrow = { id: "r", kind: "arrow", text: "", route, heads: "end", tone: "ink", a: { x: 0, y: 0, bind: { id: "a", ax: 0.5, ay: 0.5 } }, b: { x: 0, y: 0, bind: { id: "b", ax: anchor === "centre" ? 0.5 : 0.4, ay: anchor === "centre" ? 0.5 : 0.8 } } };
        const pts = arrowPath({ shapes: { a: A, b: B, r: arrow }, order: ["a", "b", "r"] }, arrow);
        const cur = { a: pts[0], b: pts[pts.length - 1], n: pts.length, bx: B.x, by: B.y };
        if (prev) {
          const stepB = Math.hypot(cur.bx - prev.bx, cur.by - prev.by);
          const j = Math.max(Math.hypot(cur.a.x - prev.a.x, cur.a.y - prev.a.y), Math.hypot(cur.b.x - prev.b.x, cur.b.y - prev.b.y) - stepB);
          if (j > 6) jumps++;
          if (j > worst) { worst = j; at = `R${R} B(${B.x.toFixed(0)},${B.y.toFixed(0)}) pts ${prev.n}->${cur.n}`; }
        }
        prev = cur;
      } }
    lines.push(`${route.padEnd(8)} ${ka.padEnd(8)} ${kb.padEnd(8)} ${anchor.padEnd(7)} worst ${worst.toFixed(1).padStart(6)} jumps>6px ${String(jumps).padStart(3)} ${worst > 6 ? at : ""}`);
  }
  return lines.join("\n");
});
console.log(out); await close();
