// Animation: a group with moments. Each moment is the group's shapes as they
// are then; playing moves through the moments in order, and what lies between
// two of them is worked out here: a shape in both glides and re-colours from
// one to the other, a shape in only one fades in or out.
import { shade } from "./render";
import type { Theme } from "./render";
import { isArrow, isBox, isText } from "./types";
import type { Arrow, Fine, Moment, Scene, Shade, Shape } from "./types";

export const OVER = 500, HOLD = 1200;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** A moment's way of arriving, as a curve from 0 to 1. */
export const curve = (e: Moment["ease"]) => (e === "even" ? (t: number) => t : e === "spring" ? (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2) : ease);
/** Where playing has got to after `ms`: resting on moment `b`, or on the way to it from `a`. */
export function position(scene: Scene, ms: number): { a: number; b: number; t: number; since: number } {
  const m = scene.moments, n = m.length;
  if (n < 2) return { a: 0, b: 0, t: 1, since: ms };
  const total = m.reduce((s, x) => s + x.over + x.hold, 0);
  if (!(total > 0)) return { a: 0, b: 0, t: 1, since: 0 };
  // played once, it comes to rest on the last moment instead of going back to the first
  if (scene.once && ms >= total - m[0]!.over - m[n - 1]!.hold) return { a: n - 1, b: n - 1, t: 1, since: ms };
  let at = ((ms % total) + total) % total;
  // it starts resting on the first moment; arriving back at it closes the loop
  for (let i = 0; i < n; i++) {
    const cur = m[i]!, next = m[(i + 1) % n]!;
    if (at < cur.hold) return { a: i, b: i, t: 1, since: at + cur.over };
    at -= cur.hold;
    if (at < next.over) return { a: i, b: (i + 1) % n, t: curve(next.ease)(at / Math.max(1, next.over)), since: at };
    at -= next.over;
  }
  return { a: 0, b: 0, t: 1, since: 0 };
}

const rgba = (css: string): [number, number, number, number] => {
  if (css === "transparent") return [0, 0, 0, 0];
  if (css.startsWith("#")) { const n = parseInt(css.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const v = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1];
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A colour part-way between two shades, as something `shade` hands straight back. */
function between(th: Theme, a: Shade | undefined, b: Shade | undefined, t: number): Shade | undefined {
  if (a === b || a === undefined || b === undefined) return t < 0.5 ? (a ?? b) : (b ?? a);
  const p = rgba(shade(th, a)), q = rgba(shade(th, b));
  // a colour arriving from nothing keeps its own hue and only gains presence
  const from = p[3] === 0 ? [q[0], q[1], q[2], 0] : p, to = q[3] === 0 ? [p[0], p[1], p[2], 0] : q;
  return `rgba(${Math.round(lerp(from[0]!, to[0]!, t))},${Math.round(lerp(from[1]!, to[1]!, t))},${Math.round(lerp(from[2]!, to[2]!, t))},${lerp(from[3]!, to[3]!, t).toFixed(3)})` as Shade;
}
const num = (a: number | undefined, b: number | undefined, t: number, dflt?: number) => (a === undefined && b === undefined ? undefined : lerp(a ?? b ?? dflt ?? 0, b ?? a ?? dflt ?? 0, t));
function fineBetween(th: Theme, a: Fine, b: Fine, t: number): Fine {
  const late = t < 0.5 ? a : b, out: Fine = { ...late };
  for (const k of ["line", "fill", "text", "lamp"] as const) { const v = between(th, a[k], b[k], t); if (v !== undefined) out[k] = v; }
  for (const k of ["w", "r", "head", "rise"] as const) { const v = num(a[k], b[k], t); if (v !== undefined) out[k] = v; }
  for (const k of ["fo", "o"] as const) { const v = a[k] === undefined && b[k] === undefined ? undefined : lerp(a[k] ?? 1, b[k] ?? 1, t); if (v !== undefined) out[k] = v; }
  return out;
}
const faded = <T extends Shape>(s: T, k: number): T => ({ ...s, fine: { ...s.fine, o: (s.fine?.o ?? 1) * k } });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One shape part-way from how it is in one moment to how it is in the next. May come back as two (one leaving, one arriving). */
function mix(th: Theme, a: Shape, b: Shape, t: number): Shape[] {
  if (a === b || same(a, b)) return [b];
  // an exact look can be re-coloured smoothly; anything else changes by one fading out as the other fades in
  const smooth = a.kind === b.kind && !!a.fine === !!b.fine && (a.fine ? true : a.tone === b.tone && (!isBox(a) || !isBox(b) || (a.fill === b.fill && a.line === b.line)));
  if (!smooth) {
    // both are drawn in the one place they share on the way, so whatever is joined to them travels smoothly
    // and a mark that changes colour as it fills keeps filling while it does, rather than appearing at its new level
    const fill = isBox(a) && isBox(b) && a.kind === b.kind ? { ...(a.value !== undefined && b.value !== undefined ? { value: lerp(a.value, b.value, t) } : {}), ...(a.levels && b.levels && a.levels.length === b.levels.length ? { levels: b.levels.map((v, i) => lerp(a.levels![i]!, v, t)) } : {}) } : {};
    const geo = !isArrow(a) && !isArrow(b) ? { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), ...fill } : {};
    return [{ ...faded(a, 1 - t), ...geo }, { ...faded(b, t), ...geo, id: b.id + "~" }];
  }
  const fine = a.fine && b.fine ? { fine: fineBetween(th, a.fine, b.fine, t) } : {};
  const late = t < 0.5 ? a : b;
  if (isArrow(a) && isArrow(b)) {
    // (an end that stays on one thing but moves along it, as one on a ring buffer's pointer does, glides there)
    const end = (p: Arrow["a"], q: Arrow["a"]) => (q.bind ? (p.bind && p.bind.id === q.bind.id && (p.bind.ax !== q.bind.ax || p.bind.ay !== q.bind.ay) ? { ...q, bind: { ...q.bind, ax: lerp(p.bind.ax, q.bind.ax, t), ay: lerp(p.bind.ay, q.bind.ay, t) } } : q) : { ...q, x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t) });
    const via = a.via && b.via && a.via.length === b.via.length ? { via: b.via.map((q, i) => ({ x: lerp(a.via![i]!.x, q.x, t), y: lerp(a.via![i]!.y, q.y, t) })) } : {};
    const drawn = a.drawn !== undefined || b.drawn !== undefined ? { drawn: lerp(a.drawn ?? 1, b.drawn ?? 1, t) } : {};
    // (a wire being cut opens its gap; one run again closes it)
    const cut = a.cut !== undefined || b.cut !== undefined ? { cut: lerp(a.cut ?? 0, b.cut ?? 0, t) } : {};
    // (a pull on its middle bends it there gradually: a line or an elbow with no pull is one pulled by nothing, a curve
    // with none takes its own shape, so it only glides between two pulls)
    const bow = a.route === b.route && (a.route === "curve" ? a.bow && b.bow : a.bow || b.bow) ? { bow: { x: lerp(a.bow?.x ?? 0, b.bow?.x ?? 0, t), y: lerp(a.bow?.y ?? 0, b.bow?.y ?? 0, t) } } : {};
    return [{ ...(late as Arrow), a: end(a.a, b.a), b: end(a.b, b.b), ...via, ...fine, ...drawn, ...cut, ...bow }];
  }
  if (isText(a) && isText(b)) return [{ ...(late as typeof b), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), size: lerp(a.size, b.size, t), ...fine }];
  if (isBox(a) && isBox(b)) {
    const levels = a.levels && b.levels && a.levels.length === b.levels.length ? { levels: b.levels.map((v, i) => lerp(a.levels![i]!, v, t)) } : {};
    const value = a.value !== undefined && b.value !== undefined ? { value: lerp(a.value, b.value, t) } : {};
    return [{ ...(late as typeof b), x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), ...(a.rot !== undefined || b.rot !== undefined ? { rot: lerp(a.rot ?? 0, b.rot ?? 0, t) } : {}), ...levels, ...value, ...fine }];
  }
  return [b];
}

/** Coming round again, last moment to first: not a rewind of everything that happened, but the end fading out and the start fading in. */
export function restart(a: Moment, b: Moment, t: number): Shape[] {
  const k = curve(undefined)(t);
  return k < 0.5 ? a.shapes.filter((s) => !s.away).map((s) => faded(s, 1 - 2 * k)) : b.shapes.filter((s) => !s.away).map((s) => faded(s, 2 * k - 1));
}

/** The group's shapes, back to front, part-way (`t`) from moment `a` to moment `b`. */
export function frame(th: Theme, a: Moment, b: Moment, t: number): Shape[] {
  const there = (m: Moment) => m.shapes.filter((s) => !s.away);
  if (a === b || t === 1) return there(b);
  if (t <= 0) return there(a);
  const was = new Map(a.shapes.map((s) => [s.id, s])), will = new Map(b.shapes.map((s) => [s.id, s]));
  const out: Shape[] = [];
  // a part told to wait starts its own change that much later, and still ends with the rest
  const own = (s: Shape) => { const w = Math.min(0.9, (s.wait ?? 0) / Math.max(1, b.over)); return w > 0 ? Math.max(0, (t - w) / (1 - w)) : t; };
  for (const s of b.shapes) {
    const p = was.get(s.id), k = own(s);
    if (s.away) continue;
    // in both: it glides. Hidden a moment ago: it comes into view on its way from wherever, and at whatever size, it was left
    // while hidden. Not there at all before: it fades in where it stands (a wire draws itself).
    if (p && !p.away) out.push(...mix(th, p, s, k));
    else if (isArrow(s)) out.push(faded({ ...s, drawn: (s.drawn ?? 1) * k }, Math.min(1, k * 4)));
    else if (p) out.push(...mix(th, { ...p, away: undefined } as Shape, s, k).map((x) => faded(x, k)));
    else out.push(faded(s, k));
  }
  // what is leaving keeps its place in the stack: just above whatever was beneath it and is still here
  let under: string | null = null;
  for (const s of a.shapes) {
    if (s.away) continue;
    const next = will.get(s.id);
    if (next && !next.away) { under = s.id; continue; }
    const at: number = under === null ? -1 : Math.max(out.findIndex((o) => o.id === under), out.findIndex((o) => o.id === under + "~"));
    // hidden in the next moment, it goes out of view on its way to where it is left there
    const k = own(next ?? s), going = next && !isArrow(s) ? mix(th, s, { ...next, away: undefined } as Shape, k).map((x) => faded(x, 1 - k)) : [faded(s, 1 - k)];
    out.splice(at + 1, 0, ...going);
    under = s.id;
  }
  return out;
}
