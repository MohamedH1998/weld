// Stamps: arrangements of the board's own shapes that are put down whole.
// This is the one way such an arrangement is written, for the patterns
// and for the larger diagrams alike: a list of shapes and the wires
// between them, on weld's figure grid, drawn at twice that size.
//
//   card("api", 20, 30, 80, 24, "API")          a shape: id, x, y, w, h, words
//   wire("api", "db")                            a wire between two shapes' middles
//   wire(["api", 1, 0.5], [200, 42])             …from a spot on a rim, to a bare point
//   arrow("api", "db", live)                     a right-angled wire with a head, in the accent
//   label("t", 120, 42, "ready", 12, "muted", "end")   words, right-aligned to x, centred on the line y
import { layoutText } from "./render";
import type { Arrow, Box, BoxKind, End, Fine, Line, Shape, Text, Tone } from "./types";

export interface StampDef {
  slug: string;
  name: string;
  /** One line on what it shows. */
  about: string;
  build: () => Shape[];
  /** Where it moves: its moments in order (each the whole drawing as it is then, under the same names), and the one `build` gives. */
  moments?: () => { moments: { over: number; hold: number; shapes: Shape[] }[]; at: number };
}

/** A stamp whose build is checked each time: every name used once, every wire joined to a
 *  shape that is there, every measure finite. A slip says what and where instead of drawing wrong. */
/** A socket drawn as a shape of its own, with a wire joined to it, becomes that wire's port: the wire then joins the thing
 *  whose rim the socket sat on, at that spot, and carries the socket as its end. (A socket no wire reaches stays a shape.) */
export function ported(shapes: Shape[]): Shape[] {
  const boxes = shapes.filter((s): s is Box => s.kind !== "arrow" && s.kind !== "text");
  const pads = new Map(boxes.filter((b) => b.kind === "pad").map((p) => [p.id, p]));
  if (!pads.size) return shapes;
  const hosts = boxes.filter((b) => b.kind !== "pad" && b.kind !== "junction" && b.kind !== "boundary" && b.kind !== "frame" && b.kind !== "glyph");
  const hostOf = (p: Box) => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return hosts.filter((h) => cx >= h.x - 1 && cx <= h.x + h.w + 1 && cy >= h.y - 1 && cy <= h.y + h.h + 1 && Math.min(Math.abs(cx - h.x), Math.abs(cx - h.x - h.w), Math.abs(cy - h.y), Math.abs(cy - h.y - h.h)) <= 1).sort((a, b) => a.w * a.h - b.w * b.h)[0]; };
  const used = new Set<string>();
  const out = shapes.map((s): Shape => {
    if (s.kind !== "arrow") return s;
    let ports: Arrow["ports"], look: Fine = {};
    const re = (e: End, which: "a" | "b"): End => {
      const p = e.bind ? pads.get(e.bind.id) : undefined, h = p && hostOf(p);
      if (!p || !h) return e;
      used.add(p.id);
      ports = ports && ports !== which ? "both" : which;
      look = { ...(p.fine?.line ? { port: p.fine.line } : {}), lamp: p.fine?.lamp ?? (p.fill === "none" ? "n300" : "accent") };
      const cl = (v: number) => Math.min(1, Math.max(0, v));
      return { x: 0, y: 0, bind: { id: h.id, ax: cl((p.x + p.w / 2 - h.x) / h.w), ay: cl((p.y + p.h / 2 - h.y) / h.h) } };
    };
    const a = re(s.a, "a"), b = re(s.b, "b");
    return ports ? { ...s, a, b, ports, fine: { ...s.fine, ...look } } : s;
  });
  return out.filter((s) => !used.has(s.id));
}

/** A wire's loose end that lies on the rim of a shape is joined to it there: the wire is fixed to the shape, not merely
 *  drawn where the shape happens to be, so it goes where the shape goes. */
export function fastened(shapes: Shape[]): Shape[] {
  const boxes = shapes.filter((s): s is Box => s.kind !== "arrow" && s.kind !== "text" && s.kind !== "pad" && s.kind !== "junction" && !s.rot);
  const texts = shapes.filter((s): s is Text => s.kind === "text" && !s.rot);
  const join = (e: End): End => {
    if (e.bind) return e;
    const on = boxes.filter((h) => e.x >= h.x - 1 && e.x <= h.x + h.w + 1 && e.y >= h.y - 1 && e.y <= h.y + h.h + 1 && Math.min(Math.abs(e.x - h.x), Math.abs(e.x - h.x - h.w), Math.abs(e.y - h.y), Math.abs(e.y - h.y - h.h)) <= 1).sort((a, b) => a.w * a.h - b.w * b.h)[0];
    const cl = (v: number) => Math.min(1, Math.max(0, v));
    if (on) return { x: e.x, y: e.y, bind: { id: on.id, ax: cl((e.x - on.x) / on.w), ay: cl((e.y - on.y) / on.h) } };
    // an end out in the open, with words standing at it (a caption), is joined to the words: exactly where it is
    const by = texts.find((t) => t.w > 0 && t.h > 0 && e.x >= t.x - 16 && e.x <= t.x + t.w + 16 && e.y >= t.y - 16 && e.y <= t.y + t.h + 16);
    return by ? { x: e.x, y: e.y, bind: { id: by.id, ax: (e.x - by.x) / by.w, ay: (e.y - by.y) / by.h } } : e;
  };
  return shapes.map((s) => (s.kind === "arrow" && (!s.a.bind || !s.b.bind) ? { ...s, a: join(s.a), b: join(s.b) } : s));
}

export const stamp = (d0: StampDef): StampDef => {
  const fixed = (shapes: Shape[]) => fastened(ported(shapes));
  const d: StampDef = { ...d0, build: () => fixed(d0.build()), ...(d0.moments ? { moments: () => { const m = d0.moments!(); return { ...m, moments: m.moments.map((x) => ({ ...x, shapes: fixed(x.shapes) })) }; } } : {}) };
  return ({
  ...d,
  build: () => {
    wires = 0; // wires are numbered within their own stamp
    const shapes = d.build(), seen = new Map<string, Shape>(), bad = (m: string): never => { throw new Error(`stamp “${d.slug}”: ${m}`); };
    for (const sh of shapes) {
      if (seen.has(sh.id)) bad(`two shapes are called “${sh.id}”`);
      seen.set(sh.id, sh);
    }
    for (const sh of shapes) {
      if (sh.kind === "arrow") {
        for (const e of [sh.a, sh.b]) {
          if (!e.bind) { if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad(`wire “${sh.id}” ends nowhere`); continue; }
          const to = seen.get(e.bind.id);
          if (!to) bad(`wire “${sh.id}” joins “${e.bind.id}”, which is not in the stamp`);
          else if (to.kind === "arrow") bad(`wire “${sh.id}” joins “${e.bind.id}”, which is not a shape wires can join`);
          if (to?.kind !== "text" && !(e.bind.ax >= 0 && e.bind.ax <= 1 && e.bind.ay >= 0 && e.bind.ay <= 1)) bad(`wire “${sh.id}” joins “${e.bind.id}” at ${e.bind.ax}, ${e.bind.ay}, off the shape (0 to 1 across and down)`);
        }
      } else if (![sh.x, sh.y, sh.w, sh.h].every(Number.isFinite) || sh.w <= 0 || sh.h <= 0) bad(`“${sh.id}” has no proper place or size`);
    }
    return shapes;
  },
});
};

// Figures are laid out on weld's 300 × 200 grid and drawn at twice that.
export const U = 2;
export type Extra = Partial<Pick<Box, "tone" | "fill" | "line" | "value" | "size" | "track" | "head" | "pad" | "notch" | "fine" | "dips" | "levels">>;
export const box = (id: string, kind: BoxKind, x: number, y: number, w: number, h: number, text = "", extra: Extra = {}): Box =>
  ({ id, kind, x: x * U, y: y * U, w: w * U, h: h * U, text, tone: "ink", fill: "none", ...extra });
export const card = (id: string, x: number, y: number, w: number, h: number, text: string, extra: Extra = {}) => box(id, "card", x, y, w, h, text, extra);
/** A small square mark: filled for a source, outlined for a sink. */
export const dot = (id: string, cx: number, cy: number, filled: boolean, tone: Tone = "muted", s = 9) =>
  box(id, "rect", cx - s / 2, cy - s / 2, s, s, "", { tone, fill: filled ? "solid" : "none" });
export const pad = (id: string, cx: number, cy: number, s: number, taken = false, tone: Tone = "ink") =>
  box(id, "pad", cx - s / 2, cy - s / 2, s, s, "", { fill: taken ? "solid" : "none", tone });
/** An end: a shape's middle, a spot on its rim, or a bare point. */
export type At = string | [string, number, number] | [number, number];
export const end = (a: At): End =>
  typeof a === "string" ? { x: 0, y: 0, bind: { id: a, ax: 0.5, ay: 0.5 } }
  : a.length === 3 ? { x: 0, y: 0, bind: { id: a[0], ax: a[1], ay: a[2] } }
  : { x: a[0] * U, y: a[1] * U };
let wires = 0;
export interface Wire { route?: Arrow["route"]; heads?: Arrow["heads"]; tone?: Tone; line?: Line; text?: string; square?: true; fine?: Fine; via?: [number, number][]; bend?: number; id?: string; pulse?: { dur: number; every: number }; drawn?: number; run?: Arrow["run"]; size?: number; track?: number; wait?: number; ports?: Arrow["ports"] }
export const wire = (a: At, b: At, o: Wire = {}): Arrow =>
  ({ id: o.id ?? `w${++wires}`, kind: "arrow", a: end(a), b: end(b), text: o.text ?? "", route: o.route ?? "straight", heads: o.heads ?? "none", tone: o.tone ?? "ink", ...(o.line ? { line: o.line } : {}), ...(o.square ? { square: true as const } : {}), ...(o.fine ? { fine: o.fine } : {}), ...(o.via ? { via: o.via.map(([x, y]) => ({ x: x * U, y: y * U })) } : {}), ...(o.bend === undefined ? {} : { bend: o.bend }), ...(o.pulse ? { pulse: o.pulse } : {}), ...(o.run ? { run: o.run } : {}), ...(o.size === undefined ? {} : { size: o.size }), ...(o.wait ? { wait: o.wait } : {}), ...(o.ports ? { ports: o.ports } : {}), ...(o.track === undefined ? {} : { track: o.track }), ...(o.drawn === undefined ? {} : { drawn: o.drawn }) });
export const arrow = (a: At, b: At, o: Wire = {}) => wire(a, b, { route: "elbow", heads: "end", ...o });
export const words = (id: string, x: number, y: number, text: string, size = 12, tone: Tone = "muted"): Text => {
  const l = layoutText(text, Infinity, size);
  return { id, kind: "text", x: x * U, y: y * U, w: l.w, h: l.h, text, size, tone };
};
/** Words placed by where they sit on a line: `x` is their left edge, middle
 *  or right edge (as `align` says) and `cy` the middle of the line. */
export const label = (id: string, x: number, cy: number, text: string, size = 12, tone: Tone = "muted", align: "start" | "middle" | "end" = "start", track?: number, fine?: Fine): Text => {
  const l = layoutText(text, Infinity, size, track, fine?.fw, fine?.prose);
  const left = x * U - (align === "end" ? l.w : align === "middle" ? l.w / 2 : 0);
  return { id, kind: "text", x: left, y: cy * U - l.h / 2, w: l.w, h: l.h, text, size, tone, ...(track === undefined ? {} : { track }), ...(fine ? { fine } : {}) };
};
export const quiet: Wire = { tone: "muted" };
export const live: Wire = { tone: "accent" };

