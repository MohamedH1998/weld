// Geometry: where arrows really run, what a shape's bounds are, and
// what is under a point.
import { hasNotch, KINDS, NOTCH_D, NOTCH_W } from "./kinds";
import { isArrow, isBox } from "./types";
import type { Arrow, Box, Doc, End, Id, Pt, Rect, Shape } from "./types";

export const GAP = 0; // a wire meets a shape flush: its end lies exactly on the outline

export const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const inRect = (p: Pt, r: Rect, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
export const overlaps = (a: Rect, b: Rect) =>
  a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
export const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}
export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ── turned shapes ───────────────────────────────────────────────────
// A box or a text keeps its upright rect and an angle about its centre.
// Everything that asks "where" goes through these four.
export const rotOf = (s: { rot?: number }): number => s.rot ?? 0;
export function turn(p: Pt, c: Pt, a: number): Pt {
  if (!a) return p;
  const cos = Math.cos(a), sin = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}
/** `p` as the shape would see it if it stood upright. */
export const toLocal = (s: Rect & { rot?: number }, p: Pt): Pt => (s.rot ? turn(p, center(s), -s.rot) : p);
/** The upright rect that holds a (possibly turned) shape. */
export function aabb(s: Rect & { rot?: number }): Rect {
  if (!s.rot) return { x: s.x, y: s.y, w: s.w, h: s.h };
  const c = center(s), cos = Math.abs(Math.cos(s.rot)), sin = Math.abs(Math.sin(s.rot));
  const w = s.w * cos + s.h * sin, h = s.w * sin + s.h * cos;
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}
/** An angle folded into (-π, π], with tiny values treated as upright. */
export function normAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r > Math.PI) r -= Math.PI * 2;
  if (r <= -Math.PI) r += Math.PI * 2;
  return Math.abs(r) < 1e-6 ? 0 : r;
}

/** Is `p` inside the outline of a box (not just its bounding rect)? */
export function insideBox(b: Box, p0: Pt, pad = 0): boolean {
  const p = toLocal(b, p0);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const rx = b.w / 2 + pad, ry = b.h / 2 + pad;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (p.x - cx) / rx, dy = (p.y - cy) / ry;
  if (b.kind === "ellipse" || b.kind === "clock") return dx * dx + dy * dy <= 1;
  if (b.kind === "diamond") return Math.abs(dx) + Math.abs(dy) <= 1;
  return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
}

/** The world point an arrow end refers to. */
export function endPoint(doc: Doc, e: End): Pt {
  const s = e.bind ? doc.shapes[e.bind.id] : undefined;
  if (e.bind && isBox(s)) return turn({ x: s.x + e.bind.ax * s.w, y: s.y + e.bind.ay * s.h }, center(s), rotOf(s));
  // joined to words (a caption): the end keeps its place beside them, and goes where they go
  if (e.bind && s && !isArrow(s)) return { x: s.x + e.bind.ax * s.w, y: s.y + e.bind.ay * s.h };
  return { x: e.x, y: e.y };
}
export function boundBox(doc: Doc, e: End): Box | undefined {
  const s = e.bind ? doc.shapes[e.bind.id] : undefined;
  return isBox(s) ? s : undefined;
}

/** Walk from `from` (inside the box) toward `to` and return where the
 *  box's outline is crossed, pushed out by `gap`. */
function exitPoint(b: Box, from: Pt, to: Pt, gap: number): Pt {
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return from;
  // binary search along the ray for the outline
  let lo = 0, hi = 1;
  if (insideBox(b, to)) return from; // the other end is inside too: nothing to clip
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (insideBox(b, { x: from.x + dx * mid, y: from.y + dy * mid })) lo = mid;
    else hi = mid;
  }
  const t = Math.min(1, hi + gap / len);
  return { x: from.x + dx * t, y: from.y + dy * t };
}

const SOFT = 6, SOFT_END = 40;
/** A small offset counts as none; a large one is left alone; between the
 *  two it grows smoothly, so the result has no step in it anywhere. */
function soften(d: number): number {
  const m = Math.abs(d);
  if (m <= SOFT) return 0;
  if (m >= SOFT_END) return d;
  return Math.sign(d) * (m - SOFT) * (SOFT_END / (SOFT_END - SOFT));
}

type Side = "l" | "r" | "t" | "b";
function sideToward(b0: Box, anchor0: Pt, other: Pt, toBox?: Box): Side {
  // a turned box is judged by its upright frame
  const b = b0.rot ? { ...b0, ...aabb(b0), rot: 0 } : b0;
  const anchor = b0.rot ? center(b0) : anchor0;
  const c = center(b);
  // an anchor near an edge leaves by that edge; a central one leaves toward the other end
  // rounded, so an anchor sitting exactly on the threshold does not flicker
  // between two sides as rounding error changes with the box's position
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const ex = r6((anchor.x - c.x) / (b.w / 2 || 1)), ey = r6((anchor.y - c.y) / (b.h / 2 || 1));
  if (Math.max(Math.abs(ex), Math.abs(ey)) > 0.6) {
    return Math.abs(ex) > Math.abs(ey) ? (ex > 0 ? "r" : "l") : ey > 0 ? "b" : "t";
  }
  const dx = other.x - c.x, dy = other.y - c.y;
  if (toBox) {
    // Two boxes with clear room between them sideways are joined side to
    // side; stacked ones top to bottom. So a wire comes in one side of a
    // box and the next leaves by another, and they never share a notch.
    const o = aabb(toBox);
    const gapX = Math.max(o.x - (b.x + b.w), b.x - (o.x + o.w)), gapY = Math.max(o.y - (b.y + b.h), b.y - (o.y + o.h));
    if (gapX >= 40) return dx > 0 ? "r" : "l";
    if (gapY >= 0) return dy > 0 ? "b" : "t";
  }
  // compare against the box's own proportions so wide boxes still exit sideways
  return Math.abs(dx) * (b.h || 1) > Math.abs(dy) * (b.w || 1) ? (dx > 0 ? "r" : "l") : dy > 0 ? "b" : "t";
}
/** Where a right-angled arrow meets a box on `side`. A turned box is
 *  approached square to its upright frame, through its centre, and the
 *  tip stops at the real outline. */
function sidePoint(b: Box, side: Side, anchor: Pt, gap: number): Pt {
  if (b.rot) {
    const r = aabb(b), c = center(b);
    const from: Pt = side === "l" ? { x: r.x, y: c.y } : side === "r" ? { x: r.x + r.w, y: c.y } : side === "t" ? { x: c.x, y: r.y } : { x: c.x, y: r.y + r.h };
    let lo = 0, hi = 1; // from the frame's edge (outside) toward the centre (inside)
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (insideBox(b, { x: from.x + (c.x - from.x) * mid, y: from.y + (c.y - from.y) * mid })) hi = mid;
      else lo = mid;
    }
    const len = Math.hypot(c.x - from.x, c.y - from.y) || 1, t = lo - gap / len;
    return { x: from.x + (c.x - from.x) * t, y: from.y + (c.y - from.y) * t };
  }
  const ax = Math.min(b.x + b.w - 6, Math.max(b.x + 6, anchor.x));
  const ay = Math.min(b.y + b.h - 6, Math.max(b.y + 6, anchor.y));
  // ellipses and diamonds only reach their bounding edge at the middle
  const mid = b.kind === "ellipse" || b.kind === "diamond" || b.kind === "clock";
  if (side === "l") return { x: b.x - gap, y: mid ? b.y + b.h / 2 : ay };
  if (side === "r") return { x: b.x + b.w + gap, y: mid ? b.y + b.h / 2 : ay };
  if (side === "t") return { x: mid ? b.x + b.w / 2 : ax, y: b.y - gap };
  return { x: mid ? b.x + b.w / 2 : ax, y: b.y + b.h + gap };
}
const horizontal = (s: Side) => s === "l" || s === "r";
/** The point of a box's outline on `side`, at height (or, for top and
 *  bottom, at position) `along`. This is what lets an arrow's tip travel
 *  along the border as boxes move, where a fixed mid-side point would
 *  stay put and then jump. Kept clear of the corners. */
function sideAt(b: Box, side: Side, along: number, gap: number): Pt {
  const r = aabb(b), c = center(b), flat = b.kind !== "ellipse" && b.kind !== "diamond" && b.kind !== "clock" && !b.rot;
  const h = horizontal(side);
  const mid = h ? c.y : c.x, half = (h ? r.h : r.w) / 2;
  // a rectangle offers its whole side but for the corners; rounder shapes only their middle
  const reach = flat ? Math.max(0, half - Math.min(12, half * 0.5)) : half * 0.3;
  const at = Math.min(mid + reach, Math.max(mid - reach, along));
  if (flat) return side === "l" ? { x: r.x - gap, y: at } : side === "r" ? { x: r.x + r.w + gap, y: at } : side === "t" ? { x: at, y: r.y - gap } : { x: at, y: r.y + r.h + gap };
  // walk in from the frame, square to the side, until the real outline is met
  const from: Pt = side === "l" ? { x: r.x, y: at } : side === "r" ? { x: r.x + r.w, y: at } : side === "t" ? { x: at, y: r.y } : { x: at, y: r.y + r.h };
  const to: Pt = h ? { x: c.x, y: at } : { x: at, y: c.y };
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (insideBox(b, { x: from.x + (to.x - from.x) * m, y: from.y + (to.y - from.y) * m })) hi = m;
    else lo = m;
  }
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1, t = lo - gap / len;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** A wire joined to a shape's middle docks in the notch of the side it leaves by, where the shape has one. */
function docks(b: Box | undefined, e: End, s: Side): b is Box {
  return !!b && !b.rot && !!e.bind && ((e.bind.ax === 0.5 && e.bind.ay === 0.5) ? notched(b, s) : midOf(e) === s && notched(b, s, true));
}
// (an end joined to a side's middle goes to the dip the outline actually draws there; one joined to the middle of the shape keeps the board's first rule)
const notched = (b: Box, s: Side, drawn = false) => hasNotch(b, s) || ((s === "l" || s === "r") && seamOf(b, drawn) > 0);
/** The side an end is joined to the middle of ("api.r"), if it is: such an end docks in that side's notch, as one joined to the middle of the shape does. */
let byHand = false;
function midOf(e: End): Side | null {
  const b = byHand ? undefined : e.bind;
  return !b ? null : b.ay === 0.5 ? (b.ax === 1 ? "r" : b.ax === 0 ? "l" : null) : b.ax === 0.5 ? (b.ay === 0 ? "t" : b.ay === 1 ? "b" : null) : null;
}
/** Where a panel's sides dip: the seam its header's rule makes (as the drawing has it), or 0 where it has none. A wire meets a panel's side there. */
function seamOf(b: Box, drawn = false): number {
  if (b.kind !== "panel" || (b.fine && !drawn)) return 0;
  const head = Math.min(b.head ?? 30, b.h), r = 12;
  return b.h >= head + 12 && b.h - head > NOTCH_W + r && head > NOTCH_W + r ? head : 0;
}
/** The notch on `s`. A plain wire is seated in it, down at its apex; an arrow's tip stops at the outline. */
function notchPoint(b: Box, s: Side, seated: boolean): Pt {
  const g = seated ? -NOTCH_D : GAP, c = center(b), seam = seamOf(b, true), y = seam && !hasNotch(b, s) ? b.y + seam : c.y;
  return s === "l" ? { x: b.x - g, y } : s === "r" ? { x: b.x + b.w + g, y } : s === "t" ? { x: c.x, y: b.y - g } : { x: c.x, y: b.y + b.h + g };
}
/** An end pinned to a spot on a flat-sided shape ends exactly there: on its rim, or seated a little inside it. */
function pinned(b: Box | undefined, e: End): boolean {
  const m = midOf(e);
  return !!b && !!e.bind && !(e.bind.ax === 0.5 && e.bind.ay === 0.5) && !(m && !b.rot && notched(b, m, true)) && b.kind !== "ellipse" && b.kind !== "diamond" && b.kind !== "clock";
}
const side = (s: Side): Pt => (s === "l" ? { x: -1, y: 0 } : s === "r" ? { x: 1, y: 0 } : s === "t" ? { x: 0, y: -1 } : { x: 0, y: 1 });
/** Does the level or upright run from `a` to `b` pass through `r`? */
function crosses(a: Pt, b: Pt, r0: (Rect & { rot?: number }) | undefined): boolean {
  if (!r0) return false;
  const r = aabb(r0);
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h;
}

// An arrow's path depends only on the arrow and the two boxes it is bound
// to. Shapes are replaced, never mutated, so identity is a safe cache key.
const pathCache = new WeakMap<Arrow, { a: Box | undefined; b: Box | undefined; pts: Pt[] }>();

/** The visible path of an arrow, in world points. */
/** An exact route's own corners between the ends the wire has now, for as long as those ends still line up with it. */
function exact(a: Arrow, pts: Pt[]): Pt[] {
  const via = a.via, p = pts[0], q = pts[pts.length - 1];
  if (!via?.length || !p || !q) return pts;
  const first = via[0]!, last = via[via.length - 1]!, lined = (m: Pt, n: Pt) => Math.abs(m.x - n.x) < 0.75 || Math.abs(m.y - n.y) < 0.75;
  return lined(p, first) && lined(q, last) ? [p, ...via, q] : pts;
}
/** Half the width of a wire's port: the wire is seen from the port's outer edge on. */
const PLUG = 8;
/** Where an end's port sits: on the rim of what the end joins. An end joined at a spot on the rim has it right there; one
 *  joined to the middle of a shape has it where the wire crosses the rim. */
const socket = (e: End, b: Rect | null | undefined, met: Pt): Pt => {
  const onRim = (v: number) => v <= 0.02 || v >= 0.98;
  return e.bind && b && (onRim(e.bind.ax) || onRim(e.bind.ay)) && !(b as { rot?: number }).rot ? { x: b.x + e.bind.ax * b.w, y: b.y + e.bind.ay * b.h } : met;
};
/** The middle of each port a wire carries (its start's, its end's), where it has one. */
export function portsOf(doc: Doc, a: Arrow): [Pt | undefined, Pt | undefined] {
  if (!a.ports) return [undefined, undefined];
  const ba = boundBox(doc, a.a), bb = boundBox(doc, a.b), raw = exact(a, computePath(doc, a, ba, bb));
  return [a.ports !== "b" ? socket(a.a, ba, raw[0]!) : undefined, a.ports !== "a" ? socket(a.b, bb, raw[raw.length - 1]!) : undefined];
}
/** A wire with a port at an end starts at that port's outer edge: the port itself sits on the rim. */
function plugged(a: Arrow, ba: Rect | null | undefined, bb: Rect | null | undefined, pts: Pt[]): Pt[] {
  if (!a.ports || pts.length < 2) return pts;
  const out = pts.map((p) => ({ ...p }));
  const fix = (i: number, j: number, e: End, b: Rect | null | undefined) => {
    const base = socket(e, b, pts[i]!), to = out[j]!;
    const d = Math.hypot(to.x - base.x, to.y - base.y);
    if (d > PLUG) out[i] = { x: base.x + ((to.x - base.x) / d) * PLUG, y: base.y + ((to.y - base.y) / d) * PLUG };
  };
  if (a.ports !== "b") fix(0, 1, a.a, ba);
  if (a.ports !== "a") fix(out.length - 1, out.length - 2, a.b, bb);
  return out;
}
export function arrowPath(doc: Doc, a: Arrow): Pt[] {
  const ba = boundBox(doc, a.a), bb = boundBox(doc, a.b);
  const hit = pathCache.get(a);
  if (hit && hit.a === ba && hit.b === bb) return hit.pts;
  const pts = plugged(a, ba, bb, bowed(a, ba, bb, exact(a, computePath(doc, a, ba, bb))));
  pathCache.set(a, { a: ba, b: bb, pts });
  return pts;
}
/** The side of a box a point on its rim lies on, as the way out of it. */
function outward(b: Box | undefined, p: Pt, toward: Pt): Pt {
  if (!b) { const d = Math.hypot(toward.x - p.x, toward.y - p.y) || 1; return { x: (toward.x - p.x) / d, y: (toward.y - p.y) / d }; }
  const r = aabb(b), d = [Math.abs(p.x - r.x), Math.abs(p.x - r.x - r.w), Math.abs(p.y - r.y), Math.abs(p.y - r.y - r.h)], m = Math.min(...d);
  return m === d[0] ? { x: -1, y: 0 } : m === d[1] ? { x: 1, y: 0 } : m === d[2] ? { x: 0, y: -1 } : { x: 0, y: 1 };
}
const cubic = (p0: Pt, c0: Pt, c1: Pt, p1: Pt, n: number): Pt[] => Array.from({ length: n }, (_, i) => {
  const t = (i + 1) / n, u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t * t * t * p1.x, y: u * u * u * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t * t * t * p1.y };
});
/** A wire as it has been pulled: a straight one bends at the point it was pulled to, a square one moves its middle run, a curve passes through it.
 *  A curve leaves each end square to the side it leaves by, so it never meets a box at a slant. */
function bowed(a: Arrow, ba: Box | undefined, bb: Box | undefined, pts: Pt[]): Pt[] {
  if (a.via?.length || pts.length < 2) return pts;
  const p0 = pts[0]!, p1 = pts[pts.length - 1]!, m = { x: (p0.x + p1.x) / 2 + (a.bow?.x ?? 0), y: (p0.y + p1.y) / 2 + (a.bow?.y ?? 0) };
  if (a.route === "elbow") {
    if (!a.bow || pts.length !== 4) return pts;
    // the run between the two turns moves with the pull
    const level = Math.abs(pts[1]!.y - p0.y) < 0.5;
    return level ? [p0, { x: pts[1]!.x + a.bow.x, y: pts[1]!.y }, { x: pts[2]!.x + a.bow.x, y: pts[2]!.y }, p1] : [p0, { x: pts[1]!.x, y: pts[1]!.y + a.bow.y }, { x: pts[2]!.x, y: pts[2]!.y + a.bow.y }, p1];
  }
  if (a.route === "straight") {
    if (!a.bow) return pts;
    // a straight line pulled in its middle curves: one smooth arc through where it was pulled (a line is one thing,
    // straight until it is pulled, curved after), leaving each box toward the arc
    const c = { x: 2 * m.x - (p0.x + p1.x) / 2, y: 2 * m.y - (p0.y + p1.y) / 2 };
    const q0 = ba ? exitPoint(ba, center(ba), c, GAP) : p0, q1 = bb ? exitPoint(bb, center(bb), c, GAP) : p1;
    return Array.from({ length: 33 }, (_, i) => { const t = i / 32, u = 1 - t; return { x: u * u * q0.x + 2 * u * t * c.x + t * t * q1.x, y: u * u * q0.y + 2 * u * t * c.y + t * t * q1.y }; });
  }
  // a curve: square out of each end, as far as a third of the way, and through the pull
  const d = Math.hypot(p1.x - p0.x, p1.y - p0.y), k = Math.max(28, d * 0.4), n0 = outward(ba, p0, p1), n1 = outward(bb, p1, p0);
  if (!a.bow) return [p0, ...cubic(p0, { x: p0.x + n0.x * k, y: p0.y + n0.y * k }, { x: p1.x + n1.x * k, y: p1.y + n1.y * k }, p1, 28)];
  const tx = (p1.x - p0.x) / (d || 1), ty = (p1.y - p0.y) / (d || 1), h = k * 0.6;
  return [p0, ...cubic(p0, { x: p0.x + n0.x * k * 0.7, y: p0.y + n0.y * k * 0.7 }, { x: m.x - tx * h, y: m.y - ty * h }, m, 16), ...cubic(m, { x: m.x + tx * h, y: m.y + ty * h }, { x: p1.x + n1.x * k * 0.7, y: p1.y + n1.y * k * 0.7 }, p1, 16)];
}

/** A junction drawn as a point (not one matched to a reference): wires meet at its very middle. */
const meets = (b: Box | undefined): b is Box => !!b && b.kind === "junction" && !b.fine;
/** Which way a junction's trunk runs: the trunk is its one wire on the other side from the many (the one that arrives where many leave,
 *  or the one that leaves where many arrive), and it runs across when what that wire joins lies more beside the junction than above or below it. */
function trunkAcross(doc: Doc, j: Box): boolean {
  const c = center(j), into: Box[] = [], out: Box[] = [];
  for (const id of doc.order) {
    const w = doc.shapes[id];
    if (!w || !isArrow(w)) continue;
    const o = w.b.bind?.id === j.id ? doc.shapes[w.a.bind?.id ?? ""] : w.a.bind?.id === j.id ? doc.shapes[w.b.bind?.id ?? ""] : undefined;
    if (o && isBox(o)) (w.b.bind?.id === j.id ? into : out).push(o);
  }
  const trunk = (out.length >= into.length ? into : out)[0] ?? into[0] ?? out[0];
  if (!trunk) return true;
  const p = center(trunk);
  return Math.abs(p.x - c.x) >= Math.abs(p.y - c.y);
}
/** The side of `b` that faces along a trunk running across (or up and down) toward `p`. */
const facing = (b: Box, p: Pt, across: boolean): Side => { const c = center(b); return across ? (p.x < c.x ? "l" : "r") : p.y < c.y ? "t" : "b"; };
function computePath(doc: Doc, a: Arrow, ba: Box | undefined, bb: Box | undefined): Pt[] {
  // a wire with a hand-placed route ends exactly where it was put
  byHand = !!a.via?.length;
  if (meets(ba) || meets(bb)) {
    // a wire that leaves or reaches a junction: from (or to) its middle, and a bent one turns right there, so wires that share it
    // read as one trunk that branches (a brace), not as wires that happen to start near each other
    const ca = meets(ba) ? center(ba) : undefined, cb = meets(bb) ? center(bb) : undefined;
    const pa0 = ca ?? endPoint(doc, a.a), pb0 = cb ?? endPoint(doc, a.b);
    const other = (b: Box | undefined, p: Pt, toward: Pt, e: End) => (b ? (docks(b, e, sideToward(b, p, toward, undefined)) ? notchPoint(b, sideToward(b, p, toward, undefined), a.heads === "none") : exitPoint(b, p, toward, GAP)) : p);
    if (a.route !== "elbow") return [ca ?? other(ba, pa0, pb0, a.a), cb ?? other(bb, pb0, pa0, a.b)];
    if (ca && cb) return [ca, { x: cb.x, y: ca.y }, cb];
    // (a junction wired to a free point, as while a wire is being drawn from one or after its far box went: square to it)
    if (ca && !bb) return Math.abs(pb0.y - ca.y) < 0.5 || Math.abs(pb0.x - ca.x) < 0.5 ? [ca, pb0] : [ca, { x: pb0.x, y: ca.y }, pb0];
    if (cb && !ba) return Math.abs(pa0.y - cb.y) < 0.5 || Math.abs(pa0.x - cb.x) < 0.5 ? [pa0, cb] : [pa0, { x: cb.x, y: pa0.y }, cb];
    if (ca) {
      // branch: run along the junction's line to level with the far end, then across to it
      const sb = facing(bb!, ca, trunkAcross(doc, ba!)), level = sb === "l" || sb === "r";
      const p1 = docks(bb, a.b, sb) ? notchPoint(bb!, sb, a.heads === "none") : sidePoint(bb!, sb, pb0, GAP);
      if (level ? Math.abs(p1.y - ca.y) < 0.5 : Math.abs(p1.x - ca.x) < 0.5) return [ca, p1];
      return level ? [ca, { x: ca.x, y: p1.y }, p1] : [ca, { x: p1.x, y: ca.y }, p1];
    }
    const sa = facing(ba!, cb!, trunkAcross(doc, bb!)), level = sa === "l" || sa === "r";
    const p0 = docks(ba, a.a, sa) ? notchPoint(ba!, sa, true) : sidePoint(ba!, sa, pa0, GAP);
    if (level ? Math.abs(p0.y - cb!.y) < 0.5 : Math.abs(p0.x - cb!.x) < 0.5) return [p0, cb!];
    return level ? [p0, { x: cb!.x, y: p0.y }, cb!] : [p0, { x: p0.x, y: cb!.y }, cb!];
  }
  const pa = endPoint(doc, a.a), pb = endPoint(doc, a.b);
  if (a.route === "curve") {
    // a curve leaves by the side that faces the other end, from the middle of that side (or its notch)
    const ta = ba ? sideToward(ba, pa, bb ? center(bb) : pb, bb) : null, tb = bb ? sideToward(bb, pb, ba ? center(ba) : pa, ba) : null;
    const end = (b: Box | undefined, t: Side | null, p: Pt, e: End) => (b && t ? (pinned(b, e) ? p : docks(b, e, t) ? notchPoint(b, t, a.heads === "none") : sidePoint(b, t, center(b), GAP)) : p);
    return [end(ba, ta, pa, a.a), end(bb, tb, pb, a.b)];
  }
  if (a.route === "straight") {
    // Two boxes joined centre to centre that nearly line up get a level (or
    // upright) arrow, not one that leans by a few pixels. The lean is taken
    // out gradually: nothing for the first few pixels, all of it back by
    // SOFT_END, so the arrow never jumps as a box is dragged past.
    const centred = (e: End) => !!e.bind && e.bind.ax === 0.5 && e.bind.ay === 0.5;
    // Welded shapes take a wire in a notch: the end leaves by the notch
    // of the side that faces the other end, and the line runs from there.
    const ta = ba ? sideToward(ba, pa, bb ? center(bb) : pb, bb) : null, tb = bb ? sideToward(bb, pb, ba ? center(ba) : pa, ba) : null;
    const da = ta && docks(ba, a.a, ta), db = tb && docks(bb, a.b, tb), seated = a.heads === "none";
    const xa = pinned(ba, a.a), xb = pinned(bb, a.b);
    if (da || db || xa || xb) {
      // an end that knows its place (pinned, or docked) goes there; any other end leaves toward it
      const na = xa ? pa : da ? notchPoint(ba!, ta!, seated) : null, nb = xb ? pb : db ? notchPoint(bb!, tb!, seated) : null;
      // a plain end facing a notch it can line up with leaves level with it (or plumb), so the wire runs square rather than at a slight lean
      const level = (b: Box | undefined, n: Pt): Pt | null => {
        if (!b || b.rot) return null;
        const r = aabb(b), across = Math.abs(n.x - (r.x + r.w / 2)) >= Math.abs(n.y - (r.y + r.h / 2));
        if (across && n.y > r.y + 4 && n.y < r.y + r.h - 4) return exitPoint(b, { x: r.x + r.w / 2, y: n.y }, { x: n.x, y: n.y }, GAP);
        if (!across && n.x > r.x + 4 && n.x < r.x + r.w - 4) return exitPoint(b, { x: n.x, y: r.y + r.h / 2 }, { x: n.x, y: n.y }, GAP);
        return null;
      };
      // an end joined at the middle of a side (as "api.r" joins) may slide along that side to meet the other end square
      const mid = (e: End) => !!e.bind && ((e.bind.ay === 0.5 && (e.bind.ax === 0 || e.bind.ax === 1)) || (e.bind.ax === 0.5 && (e.bind.ay === 0 || e.bind.ay === 1)));
      if (ba && bb && mid(a.a) && mid(a.b) && !(ba as Box).rot && !(bb as Box).rot) {
        const ra = aabb(ba), rb = aabb(bb), across = (a.a.bind!.ax === 0 || a.a.bind!.ax === 1) && (a.b.bind!.ax === 0 || a.b.bind!.ax === 1);
        // (through a notch when one of its ends has one that the line can reach: a welded shape's notch is where its wires go)
        const notchAt = (b: Box, e: End, side: Side, axis: "x" | "y") => (docks(b, e, side) ? notchPoint(b, side, seated)[axis] : null);
        const pick = (lo: number, hi: number, va: number | null, vb: number | null, mid: number) => [va, vb].find((v): v is number => v !== null && v >= lo && v <= hi) ?? Math.min(hi, Math.max(lo, mid));
        if (across) { const lo = Math.max(ra.y, rb.y) + 6, hi = Math.min(ra.y + ra.h, rb.y + rb.h) - 6; if (lo <= hi) { const y = pick(lo, hi, notchAt(ba, a.a, a.a.bind!.ax === 0 ? "l" : "r", "y"), notchAt(bb, a.b, a.b.bind!.ax === 0 ? "l" : "r", "y"), (pa.y + pb.y) / 2); return [{ x: pa.x, y }, { x: pb.x, y }]; } }
        const up = (a.a.bind!.ay === 0 || a.a.bind!.ay === 1) && (a.b.bind!.ay === 0 || a.b.bind!.ay === 1);
        if (up) { const lo = Math.max(ra.x, rb.x) + 6, hi = Math.min(ra.x + ra.w, rb.x + rb.w) - 6; if (lo <= hi) { const x = pick(lo, hi, notchAt(ba, a.a, a.a.bind!.ay === 0 ? "t" : "b", "x"), notchAt(bb, a.b, a.b.bind!.ay === 0 ? "t" : "b", "x"), (pa.x + pb.x) / 2); return [{ x, y: pa.y }, { x, y: pb.y }]; } }
      }
      const from = na && !(xa && mid(a.a) && nb) ? na : (ba ? ((centred(a.a) || mid(a.a)) && (nb ?? (xb ? pb : null)) ? level(ba, (nb ?? pb)!) : null) ?? na ?? exitPoint(ba, pa, nb!, GAP) : pa);
      const to = nb && !(xb && mid(a.b) && na) ? nb : (bb ? ((centred(a.b) || mid(a.b)) && (na ?? (xa ? pa : null)) ? level(bb, (na ?? pa)!) : null) ?? nb ?? exitPoint(bb, pb, na!, GAP) : pb);
      return [from, to];
    }
    if (ba && bb && centred(a.a) && centred(a.b)) {
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      // the correction fades out toward the diagonal, where "level" and
      // "upright" would otherwise disagree, so the two cases meet there
      const big = Math.max(Math.abs(dx), Math.abs(dy)), small = Math.min(Math.abs(dx), Math.abs(dy));
      const w = big > 0 ? Math.min(1, Math.max(0, (1 - small / big) * 2)) : 0;
      const ease = (d: number) => d + (soften(d) - d) * w;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const my = (pa.y + pb.y) / 2, d = ease(dy);
        const p = { x: pa.x, y: my - d / 2 }, q = { x: pb.x, y: my + d / 2 };
        return [exitPoint(ba, p, q, GAP), exitPoint(bb, q, p, GAP)];
      }
      const mx = (pa.x + pb.x) / 2, d = ease(dx);
      const p = { x: mx - d / 2, y: pa.y }, q = { x: mx + d / 2, y: pb.y };
      return [exitPoint(ba, p, q, GAP), exitPoint(bb, q, p, GAP)];
    }
    const from = ba ? exitPoint(ba, pa, pb, GAP) : pa;
    const to = bb ? exitPoint(bb, pb, pa, GAP) : pb;
    return [from, to];
  }
  // elbow: leave each box square to a side, meet with right angles
  const sa: Side = ba ? sideToward(ba, pa, bb ? center(bb) : pb, bb) : Math.abs(pb.x - pa.x) >= Math.abs(pb.y - pa.y) ? (pb.x > pa.x ? "r" : "l") : pb.y > pa.y ? "b" : "t";
  const sb: Side = bb ? sideToward(bb, pb, ba ? center(ba) : pa, ba) : horizontal(sa) ? (pa.x > pb.x ? "r" : "l") : pa.y > pb.y ? "b" : "t";
  // Two ends that leave by parallel sides aim for the line midway between
  // them, each as far as its own side allows: boxes that overlap in height
  // get one straight run, and the tips slide along the borders as boxes move.
  const mids = (e: End) => !!e.bind && e.bind.ax === 0.5 && e.bind.ay === 0.5;
  const parallel = horizontal(sa) === horizontal(sb);
  const oa = ba ? center(ba) : pa, ob = bb ? center(bb) : pb;
  // A welded shape takes the wire in its notch, and a plain shape at the
  // other end slides to line up with that notch where it can.
  const dockA = docks(ba, a.a, sa), dockB = docks(bb, a.b, sb);
  const along = dockA && !dockB ? (horizontal(sa) ? oa.y : oa.x) : dockB && !dockA ? (horizontal(sb) ? ob.y : ob.x) : horizontal(sa) ? (oa.y + ob.y) / 2 : (oa.x + ob.x) / 2;
  const seated = a.heads === "none";
  const p0 = ba ? (pinned(ba, a.a) ? pa : dockA ? notchPoint(ba, sa, seated) : parallel && mids(a.a) ? sideAt(ba, sa, along, GAP) : sidePoint(ba, sa, pa, GAP)) : pa;
  const p1 = bb ? (pinned(bb, a.b) ? pb : dockB ? notchPoint(bb, sb, seated) : parallel && mids(a.b) ? sideAt(bb, sb, along, GAP) : sidePoint(bb, sb, pb, GAP)) : pb;
  const LEAD = 26, JOG = 12;
  const da = side(sa), db = side(sb);
  const pts: Pt[] = [p0];
  if (horizontal(sa) && horizontal(sb)) {
    const facing = sa !== sb && (sa === "r" ? p0.x <= p1.x : p0.x >= p1.x);
    if (facing) {
      // a step too small to read as a step is drawn as the slight lean it is
      if (Math.abs(p0.y - p1.y) >= JOG) {
        const mx = (p0.x + p1.x) / 2;
        pts.push({ x: mx, y: p0.y }, { x: mx, y: p1.y });
      }
    } else if (sa === sb) {
      // both leave the same way: run out past the further one and come back
      const x = sa === "r" ? Math.max(p0.x, p1.x) + LEAD : Math.min(p0.x, p1.x) - LEAD;
      if (crosses(p0, { x, y: p0.y }, bb) || crosses({ x, y: p1.y }, p1, ba)) {
        // the level run would cut through a box: go over the top of both
        const y = Math.min(ba ? aabb(ba).y : p0.y, bb ? aabb(bb).y : p1.y) - LEAD;
        pts.push({ x: p0.x + da.x * LEAD, y: p0.y }, { x: p0.x + da.x * LEAD, y }, { x: p1.x + db.x * LEAD, y }, { x: p1.x + db.x * LEAD, y: p1.y });
      } else pts.push({ x, y: p0.y }, { x, y: p1.y });
    } else {
      // back to back: step out of each, and cross between or around them
      const q0 = p0.x + da.x * LEAD, q1 = p1.x + db.x * LEAD;
      const my = Math.abs(p0.y - p1.y) > 40 ? (p0.y + p1.y) / 2 : Math.min(ba ? aabb(ba).y : p0.y, bb ? aabb(bb).y : p1.y) - LEAD;
      pts.push({ x: q0, y: p0.y }, { x: q0, y: my }, { x: q1, y: my }, { x: q1, y: p1.y });
    }
  } else if (!horizontal(sa) && !horizontal(sb)) {
    const facing = sa !== sb && (sa === "b" ? p0.y <= p1.y : p0.y >= p1.y);
    if (facing) {
      if (Math.abs(p0.x - p1.x) >= JOG) {
        const my = (p0.y + p1.y) / 2;
        pts.push({ x: p0.x, y: my }, { x: p1.x, y: my });
      }
    } else if (sa === sb) {
      const y = sa === "b" ? Math.max(p0.y, p1.y) + LEAD : Math.min(p0.y, p1.y) - LEAD;
      if (crosses(p0, { x: p0.x, y }, bb) || crosses({ x: p1.x, y }, p1, ba)) {
        const x = Math.min(ba ? aabb(ba).x : p0.x, bb ? aabb(bb).x : p1.x) - LEAD;
        pts.push({ x: p0.x, y: p0.y + da.y * LEAD }, { x, y: p0.y + da.y * LEAD }, { x, y: p1.y + db.y * LEAD }, { x: p1.x, y: p1.y + db.y * LEAD });
      } else pts.push({ x: p0.x, y }, { x: p1.x, y });
    } else {
      const q0 = p0.y + da.y * LEAD, q1 = p1.y + db.y * LEAD;
      const mx = Math.abs(p0.x - p1.x) > 40 ? (p0.x + p1.x) / 2 : Math.min(ba ? aabb(ba).x : p0.x, bb ? aabb(bb).x : p1.x) - LEAD;
      pts.push({ x: p0.x, y: q0 }, { x: mx, y: q0 }, { x: mx, y: q1 }, { x: p1.x, y: q1 });
    }
  } else if (horizontal(sa)) pts.push({ x: p1.x, y: p0.y });
  else pts.push({ x: p0.x, y: p1.y });
  pts.push(p1);
  return pts;
}

export function bounds(doc: Doc, s: Shape): Rect {
  if (!isArrow(s)) return aabb(s);
  const pts = arrowPath(doc, s);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function boundsOf(doc: Doc, ids: Iterable<Id>): Rect | null {
  const rs: Rect[] = [];
  for (const id of ids) {
    const s = doc.shapes[id];
    if (s) rs.push(bounds(doc, s));
  }
  return union(rs);
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
export function distToPath(p: Pt, pts: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSegment(p, pts[i]!, pts[i + 1]!));
  return d;
}
/** The point halfway along a path, for an arrow's label. */
/** Where a wire's middle can be taken hold of: halfway along it as drawn. */
export const bowHandle = (doc: Doc, a: Arrow): Pt => midOfPath(arrowPath(doc, a));
export function midOfPath(pts: Pt[]): Pt {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i]!, pts[i + 1]!);
  let want = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = dist(pts[i]!, pts[i + 1]!);
    if (want <= l && l > 0) {
      const t = want / l;
      return { x: pts[i]!.x + (pts[i + 1]!.x - pts[i]!.x) * t, y: pts[i]!.y + (pts[i + 1]!.y - pts[i]!.y) * t };
    }
    want -= l;
  }
  return pts[0] ?? { x: 0, y: 0 };
}

/** What is under `p`? Arrows and text win when the pointer is on them.
 *  A filled box, or the edge of any box, takes its place in the stack.
 *  The empty inside of an unfilled box still picks the box up, but only
 *  if nothing else is there, and the smallest such box wins, so a big
 *  outline never blocks what sits inside it. */
export function hitTest(doc: Doc, p: Pt, tol: number, skip?: (s: Shape) => boolean): Shape | undefined {
  let hollow: Box | undefined;
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const s = doc.shapes[doc.order[i]!];
    if (!s || (skip && skip(s))) continue;
    if (isArrow(s)) {
      // a little more generous than for boxes, by the same amount at every zoom
      if (distToPath(p, arrowPath(doc, s)) <= tol * 1.75) return s;
    } else if (isBox(s)) {
      if (!insideBox(s, p, tol)) continue;
      const onEdge = !insideBox(s, p, -Math.max(tol, 6));
      // a shape on paper of its own is solid to the touch, whatever its fill
      if (s.fill !== "none" || KINDS[s.kind].paper || onEdge) return hollow && hollow.w * hollow.h < s.w * s.h ? hollow : s;
      if (!hollow || s.w * s.h < hollow.w * hollow.h) hollow = s;
    } else if (inRect(toLocal(s, p), s, tol)) return s;
  }
  return hollow;
}

/** The box an arrow end would bind to at `p`. */
export function boxAt(doc: Doc, p: Pt, skip?: Set<Id>): Box | undefined {
  let best: Box | undefined;
  for (let i = doc.order.length - 1; i >= 0; i--) {
    const s = doc.shapes[doc.order[i]!];
    if (!isBox(s) || skip?.has(s.id) || !insideBox(s, p, 2)) continue;
    if (!best || s.w * s.h < best.w * best.h) best = s;
  }
  return best;
}

/** The anchor for a drop at `p` inside a box. Anywhere in the body
 *  means "this box" and binds to its centre, so arrows stay tidy without
 *  aiming. Only a drop within `band` of the outline pins that exact spot. */
export function anchorFor(b: Box, p0: Pt, band: number): { ax: number; ay: number } {
  const p = toLocal(b, p0);
  const edge = Math.min(band, b.w * 0.2, b.h * 0.2);
  if (insideBox(b, p, -edge)) return { ax: 0.5, ay: 0.5 };
  let ax = Math.min(1, Math.max(0, (p.x - b.x) / (b.w || 1))), ay = Math.min(1, Math.max(0, (p.y - b.y) / (b.h || 1)));
  if (b.kind !== "ellipse" && b.kind !== "diamond" && b.kind !== "clock") {
    // on a flat-sided shape the spot goes onto the rim itself, so the wire meets it flush
    const d = [ax * b.w, (1 - ax) * b.w, ay * b.h, (1 - ay) * b.h], near = d.indexOf(Math.min(...d));
    if (near === 0) ax = 0; else if (near === 1) ax = 1; else if (near === 2) ay = 0; else ay = 1;
  }
  return { ax, ay };
}

/** The centre of a label of size w × h set beside the middle of a path,
 *  `gap` clear of the line: above a level run, to the right of an upright one. */
export function labelCentre(pts: Pt[], w: number, h: number, gap: number): Pt {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += dist(pts[i]!, pts[i + 1]!);
  let want = total / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!;
    const l = dist(a, b);
    if (want <= l && l > 0) {
      const t = want / l;
      const m = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      // the normal that points up, or right when the run is upright
      let nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l;
      if (ny > 0.001 || (Math.abs(ny) <= 0.001 && nx < 0)) { nx = -nx; ny = -ny; }
      const reach = gap + (Math.abs(nx) * w + Math.abs(ny) * h) / 2;
      return { x: m.x + nx * reach, y: m.y + ny * reach };
    }
    want -= l;
  }
  return pts[0] ?? { x: 0, y: 0 };
}
