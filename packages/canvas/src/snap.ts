// Snapping: while something moves or is resized, its edges and centre
// line up with the edges and centres of what is near it, and a guide
// shows which line it caught.
import { aabb } from "./geometry";
import { isArrow } from "./types";
import type { Doc, Id, Pt, Rect } from "./types";

export interface Guide {
  a: Pt;
  b: Pt;
}
const lines = (r: Rect) => ({ xs: [r.x, r.x + r.w / 2, r.x + r.w], ys: [r.y, r.y + r.h / 2, r.y + r.h] });

/** Rects worth snapping to: everything still and on screen. On a
 *  crowded board the nearest to `near` win, never the oldest. */
export function snapTargets(doc: Doc, moving: Set<Id>, view: Rect, near?: Rect): Rect[] {
  const out: Rect[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s || isArrow(s) || moving.has(id)) continue;
    const r = aabb(s); // a turned shape lines up by the frame that holds it
    if (r.x > view.x + view.w || r.x + r.w < view.x || r.y > view.y + view.h || r.y + r.h < view.y) continue;
    out.push(r);
  }
  if (out.length <= 300 || !near) return out.slice(0, 300);
  const cx = near.x + near.w / 2, cy = near.y + near.h / 2;
  const d = (r: Rect) => Math.abs(r.x + r.w / 2 - cx) + Math.abs(r.y + r.h / 2 - cy);
  return out.sort((a, b) => d(a) - d(b)).slice(0, 300);
}

/** Find the smallest shift that lines one of `mine` up with a target
 *  line, per axis. `xs`/`ys` choose which of the rect's three lines per
 *  axis may snap (all three when moving, only the dragged edge when
 *  resizing). */
export function snapRect(
  r: Rect,
  targets: Rect[],
  tol: number,
  xs: number[] = [0, 1, 2],
  ys: number[] = [0, 1, 2],
  /** false: edges catch edges and centres catch centres, nothing else.
   *  Half the catches, and every one of them is an alignment people mean. */
  mixed = false,
): { dx: number; dy: number; guides: Guide[] } {
  const me = lines(r);
  let dx = 0, dy = 0, bx = tol + 1, by = tol + 1;
  let tx: Rect | null = null, ty: Rect | null = null, lx = 0, ly = 0;
  // centre-to-centre wins a tie: it is the alignment people mean most often
  const better = (d: number, best: number, mine: number, theirs: number) => d < best - 0.01 || (Math.abs(d - best) <= 0.01 && mine === 1 && theirs === 1);
  for (const t of targets) {
    const them = lines(t);
    for (const i of xs) them.xs.forEach((v, j) => {
      if (!mixed && (i === 1) !== (j === 1)) return;
      const d = v - me.xs[i]!;
      if (better(Math.abs(d), bx, i, j)) { bx = Math.abs(d); dx = d; tx = t; lx = v; }
    });
    for (const i of ys) them.ys.forEach((v, j) => {
      if (!mixed && (i === 1) !== (j === 1)) return;
      const d = v - me.ys[i]!;
      if (better(Math.abs(d), by, i, j)) { by = Math.abs(d); dy = d; ty = t; ly = v; }
    });
  }
  if (bx > tol) { dx = 0; tx = null; }
  if (by > tol) { dy = 0; ty = null; }
  // one guide per axis: the line that was caught, drawn between the two shapes
  const guides: Guide[] = [];
  const moved: Rect = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
  const X = tx as Rect | null, Y = ty as Rect | null;
  if (X) guides.push({ a: { x: lx, y: Math.min(moved.y, X.y) - 6 }, b: { x: lx, y: Math.max(moved.y + moved.h, X.y + X.h) + 6 } });
  if (Y) guides.push({ a: { x: Math.min(moved.x, Y.x) - 6, y: ly }, b: { x: Math.max(moved.x + moved.w, Y.x + Y.w) + 6, y: ly } });
  return { dx, dy, guides };
}
