// Anything that arrives from outside (a saved board, the clipboard) is
// checked here before it becomes shapes. What cannot be understood is
// dropped; what is slightly off is put right. The board never has to
// defend itself against its own document.
import { normAngle } from "./geometry";
import { BOX_KINDS } from "./kinds";
import type { Arrow, Box, Doc, End, Fill, Fine, Live, Moment, Pt, Scene, Shade, Shape, Text, Tone } from "./types";

const TONES: Tone[] = ["ink", "accent", "muted", "red", "green", "amber", "violet", "teal"];
const FILLS: Fill[] = ["none", "tint", "solid"];
// Far beyond any real board, and far inside what arithmetic on these
// numbers can do without overflowing.
const FAR = 1e7;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= FAR;
// ids are used as keys: plain names only, so none can collide with what objects already have
const goodId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(v) && v !== "constructor" && v !== "prototype";
const oneOf = <T extends string>(v: unknown, all: readonly T[], fallback: T): T => (all.includes(v as T) ? (v as T) : fallback);
const rot = (v: unknown): { rot?: number } => (num(v) && normAngle(v) !== 0 ? { rot: normAngle(v) } : {});
/** The optional fields: a line style where one applies, and a group. */
const extras = (v: Record<string, unknown>, lined: boolean): { line?: "dashed" | "dotted"; group?: string; locked?: true; away?: true; wait?: number } => ({
  ...(num(v.wait) && v.wait > 0 && v.wait <= 20000 ? { wait: v.wait } : {}),
  ...(v.away === true ? { away: true as const } : {}),
  ...(v.locked === true ? { locked: true as const } : {}),
  ...(lined && (v.line === "dashed" || v.line === "dotted") ? { line: v.line } : {}),
  ...(goodId(v.group) ? { group: v.group } : {}),
});
const measure = (v: Record<string, unknown>, k: "size" | "head" | "pad" | "track", lo: number, hi: number) => (num(v[k]) && (v[k] as number) >= lo && (v[k] as number) <= hi ? { [k]: v[k] as number } : {});
const SHADES = ["n50", "n100", "n200", "n300", "n400", "n500", "n600", "n700", "n900", "accent", "paper", "none"] as const;
/** An exact look, kept only where every part of it is well-formed. */
const COLOUR = /^(#[0-9a-fA-F]{6}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;
const fine = (v: unknown): { fine?: Fine } => {
  if (typeof v !== "object" || v === null) return {};
  const f = v as Record<string, unknown>, out: Fine = {};
  // (a named shade, or an exact colour a story gave: #rrggbb, rgb() or rgba())
  for (const k of ["line", "fill", "text", "lamp", "port"] as const) if ((SHADES as readonly unknown[]).includes(f[k]) || (typeof f[k] === "string" && COLOUR.test(f[k] as string))) out[k] = f[k] as Shade;
  for (const [k, lo, hi] of [["w", 0.25, 12], ["fo", 0, 1], ["o", 0, 1], ["fw", 100, 900], ["head", 2, 60], ["r", 0, 200], ["rise", -100, 100]] as const) if (num(f[k]) && (f[k] as number) >= lo && (f[k] as number) <= hi) out[k] = f[k] as number;
  if (f.shadow === true) out.shadow = true;
  if (f.round === true) out.round = true;
  if (f.arc === true) out.arc = true;
  if (f.prose === true) out.prose = true;
  if (f.typed === true) out.typed = true;
  if (f.dot === true) out.dot = true;
  if (f.crisp === true) out.crisp = true;
  if (f.draft === true) out.draft = true;
  return Object.keys(out).length ? { fine: out } : {};
};
const dips = (v: unknown): { dips?: [string, number][] } => {
  if (!Array.isArray(v)) return {};
  const out = v.filter((d): d is [string, number] => Array.isArray(d) && d.length === 2 && typeof d[0] === "string" && "trbl".includes(d[0]) && d[0].length === 1 && num(d[1]) && d[1] > 0 && d[1] < 1).slice(0, 16);
  return out.length ? { dips: out } : {};
};
// (a level may be below zero: the new marks keep indexes in theirs, and a root has no parent, -1)
const levels = (v: unknown): { levels?: number[] } => (Array.isArray(v) && v.length <= 10000 && v.every((x) => num(x) && x >= -10000 && x <= 10000) && v.length ? { levels: v as number[] } : {});
const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
// (everything a live thing is told is kept: what it runs, where, whose it is and what colour it wears)
const live = (v: unknown): { live?: Live } => {
  if (!rec(v)) return {};
  const out: Live = {};
  if (typeof v.run === "string" && v.run.length < 4000) out.run = v.run;
  if (typeof v.cwd === "string" && v.cwd.length < 2000) out.cwd = v.cwd;
  if (typeof v.url === "string" && v.url.length < 4000) out.url = v.url;
  if (typeof v.from === "string" && v.from.length < 200) out.from = v.from;
  if (typeof v.by === "string" && v.by.length < 200) out.by = v.by;
  if (typeof v.cmd === "string" && v.cmd.length < 4000) out.cmd = v.cmd;
  if (v.svc === true) out.svc = true;
  if (Array.isArray(v.drew)) out.drew = v.drew.filter((k): k is string => typeof k === "string" && k.length < 100).slice(-400);
  if (Array.isArray(v.sees)) out.sees = v.sees.filter((k): k is string => typeof k === "string" && k.length <= (k.startsWith("work:") ? 20000 : 200)).slice(0, 200);
  if (num(v.hue) && Number.isInteger(v.hue) && v.hue >= 0 && v.hue < 64) out.hue = v.hue;
  if (num(v.tall) && v.tall > 0 && v.tall < 1e5) out.tall = v.tall;
  // (a time in ms: past the board's own limit for a place, so checked on its own)
  if (typeof v.closed === "number" && Number.isFinite(v.closed) && v.closed > 0 && v.closed < 1e14) out.closed = Math.round(v.closed);
  return Object.keys(out).length ? { live: out } : {};
};

/** A picture's file and size (see electron/assets.mjs): kept only whole and well-formed, else the picture is dropped. */
const picture = (v: unknown): { img: NonNullable<Box["img"]> } | null => {
  if (!rec(v) || typeof v.hash !== "string" || !/^[a-f0-9]{40}$/.test(v.hash)) return null;
  if (typeof v.ext !== "string" || !["png", "jpg", "gif", "webp", "svg"].includes(v.ext)) return null;
  if (!num(v.w) || !num(v.h) || v.w <= 0 || v.h <= 0 || v.w > 1e6 || v.h > 1e6) return null;
  const name = typeof v.name === "string" ? v.name.slice(0, 120) : `picture.${v.ext}`;
  return { img: { hash: v.hash, ext: v.ext, w: v.w, h: v.h, name, ...(v.preview === true ? { preview: true } : {}), ...(typeof v.origin === "string" && v.origin.startsWith("/") && v.origin.length < 4096 ? { origin: v.origin } : {}), ...(typeof v.by === "string" && v.by.length < 200 ? { by: v.by } : {}) } };
};

/** The well-formed shapes among `raw`, in the same order. Arrows may
 *  only be joined to boxes that are also in the list. */
export function cleanShapes(raw: unknown): Shape[] {
  if (!Array.isArray(raw)) return [];
  const out: Shape[] = [], seen = new Set<string>(), boxes = new Set<string>(), words = new Set<string>();
  const arrows: { at: number; v: Record<string, unknown> }[] = [];
  for (const v of raw) {
    if (!rec(v) || !goodId(v.id) || seen.has(v.id)) continue;
    const text = typeof v.text === "string" ? v.text : "";
    const tone = oneOf(v.tone, TONES, "ink");
    if (typeof v.kind === "string" && (BOX_KINDS as string[]).includes(v.kind)) {
      if (!num(v.x) || !num(v.y) || !num(v.w) || !num(v.h) || v.w <= 0 || v.h <= 0) continue;
      // (a picture without its file is nothing: dropped, never kept as an empty frame)
      const pic = v.kind === "image" ? picture(v.img) : null;
      if (v.kind === "image" && !pic) continue;
      const b: Box = {
        ...(pic ?? {}), id: v.id, kind: v.kind as Box["kind"], x: v.x, y: v.y, w: v.w, h: v.h, text, tone, fill: oneOf(v.fill, FILLS, "none"), ...live(v.live), ...(typeof v.face === "string" && /^[a-z]{1,16}$/.test(v.face) ? { face: v.face } : {}), ...(v.pattern === "hatch" || v.pattern === "cross" ? { pattern: v.pattern } : {}), ...(v.title === "corner" ? { title: "corner" as const } : {}), ...(v.hang === true ? { hang: true as const } : {}), ...(v.split === true ? { split: true as const } : {}), ...(v.cased === true ? { cased: true as const } : {}), ...(num(v.weight) && v.weight >= 100 && v.weight <= 900 ? { weight: Math.round(v.weight) } : {}), ...(v.busy === true ? { busy: true as const } : {}), ...(num(v.limit) && v.limit > 0 && v.limit <= 1 ? { limit: v.limit } : {}), ...measure(v, "track", 0, 1), ...fine(v.fine), ...dips(v.dips), ...levels(v.levels), ...(typeof v.unit === "string" && v.unit.length <= 24 ? { unit: v.unit } : {}), ...(num(v.span) && v.span > 0 && v.span <= 10000 ? { span: v.span } : {}), ...rot(v.rot), ...extras(v, true), ...(num(v.value) && v.value >= 0 && v.value <= 10000 ? { value: v.value } : {}), ...measure(v, "size", 4, 400), ...measure(v, "head", 8, 400), ...measure(v, "pad", 0, 400), ...(typeof v.notch === "string" && /^[trbl]{0,4}$/.test(v.notch) ? { notch: v.notch } : {}) };
      out.push(b);
      boxes.add(v.id);
    } else if (v.kind === "text") {
      if (!num(v.x) || !num(v.y) || !num(v.w) || !num(v.h) || !text.trim()) continue;
      words.add(v.id);
      const t: Text = { id: v.id, kind: "text", x: v.x, y: v.y, w: Math.max(1, v.w), h: Math.max(1, v.h), text, size: num(v.size) && v.size > 0 && v.size <= 400 ? v.size : 18, tone, ...(num(v.track) && v.track >= 0 && v.track <= 1 ? { track: v.track } : {}), ...(v.weight === 400 || v.weight === 500 || v.weight === 700 ? { weight: v.weight } : {}), ...(typeof v.face === "string" && /^[a-z]{1,16}$/.test(v.face) ? { face: v.face } : {}), ...(v.align === "center" || v.align === "right" ? { align: v.align } : {}), ...fine(v.fine), ...rot(v.rot), ...extras(v, false) };
      out.push(t);
    } else if (v.kind === "arrow") {
      arrows.push({ at: out.length, v });
      out.push(null as unknown as Shape); // placeholder: joins are checked once every box is known
    } else continue;
    seen.add(v.id);
  }
  const end = (v: unknown): End | null => {
    if (!rec(v)) return null;
    const b = v.bind;
    // words can hold a wire's end too: it sits beside them, so its place may lie a little outside their own box
    if (rec(b) && typeof b.id === "string" && words.has(b.id) && num(b.ax) && num(b.ay)) {
      const f = (n: number) => Math.min(3, Math.max(-2, n));
      return { x: num(v.x) ? v.x : 0, y: num(v.y) ? v.y : 0, bind: { id: b.id, ax: f(b.ax), ay: f(b.ay) } };
    }
    if (rec(b) && typeof b.id === "string" && boxes.has(b.id) && num(b.ax) && num(b.ay)) {
      const f = (n: number) => Math.min(1, Math.max(0, n));
      return { x: num(v.x) ? v.x : 0, y: num(v.y) ? v.y : 0, bind: { id: b.id, ax: f(b.ax), ay: f(b.ay) } };
    }
    return num(v.x) && num(v.y) ? { x: v.x, y: v.y } : null;
  };
  for (const { at, v } of arrows) {
    const a = end(v.a), b = end(v.b);
    // (a wire from a shape to itself joins two of its parts, as a hop between two cells of one row does: only one that
    // begins and ends at the same point of it is nothing)
    if (!a || !b || (a.bind && b.bind && a.bind.id === b.bind.id && a.bind.ax === b.bind.ax && a.bind.ay === b.bind.ay)) continue;
    const arrow: Arrow = {
      id: v.id as string, kind: "arrow", a, b, text: typeof v.text === "string" ? v.text : "",
      route: oneOf(v.route, ["straight", "elbow", "curve"] as const, "elbow"),
      ...(v.bow && typeof v.bow === "object" && num((v.bow as Pt).x) && num((v.bow as Pt).y) && Math.abs((v.bow as Pt).x) < 1e5 && Math.abs((v.bow as Pt).y) < 1e5 ? { bow: { x: (v.bow as Pt).x, y: (v.bow as Pt).y } } : {}),
      heads: oneOf(v.heads, ["end", "both", "none"] as const, "end"),
      tone: oneOf(v.tone, TONES, "ink"),
      ...extras(v, true),
      ...(v.square === true ? { square: true as const } : {}),
      ...(v.ports === "a" || v.ports === "b" || v.ports === "both" ? { ports: v.ports } : {}),
      ...(v.pill === true ? { pill: true as const } : {}),
      ...(typeof v.face === "string" && /^[a-z]{1,16}$/.test(v.face) ? { face: v.face } : {}),
      ...(v.unlit === true ? { unlit: true as const } : {}),
      ...(v.made === true ? { made: true as const } : {}),
      ...fine(v.fine),
      ...(Array.isArray(v.via) && v.via.length <= 12 && v.via.every((p) => rec(p) && num(p.x) && num(p.y) && Math.abs(p.x) <= 1e7 && Math.abs(p.y) <= 1e7) ? { via: v.via.map((p) => ({ x: (p as Pt).x, y: (p as Pt).y })) } : {}),
      ...(num(v.bend) && v.bend >= 0 && v.bend <= 100 ? { bend: v.bend } : {}),
      ...(num(v.size) && v.size >= 4 && v.size <= 200 ? { size: v.size } : {}),
      ...(num(v.track) && v.track >= -0.2 && v.track <= 1 ? { track: v.track } : {}),
      ...(num(v.drawn) && v.drawn >= 0 && v.drawn < 1 ? { drawn: v.drawn } : {}),
      ...(v.run === "pour" || v.run === "back" || v.run === "fizzle" || v.run === "squash" ? { run: v.run } : {}),
      ...(num(v.cut) && v.cut > 0 && v.cut <= 1 ? { cut: v.cut } : {}),
      ...(v.dangling === true ? { dangling: true as const } : {}),
      ...(rec(v.pulse) && num(v.pulse.dur) && v.pulse.dur >= 50 && v.pulse.dur <= 60000 && num(v.pulse.every) && v.pulse.every >= 50 && v.pulse.every <= 600000 ? { pulse: { dur: v.pulse.dur, every: v.pulse.every } } : {}),
    };
    out[at] = arrow;
  }
  return out.filter(Boolean);
}

/** Shapes from outside the board (another app's clipboard, a page, a shared board), stripped of what would act for
 *  the person: a command to run, a folder to run it in, a local file to show or watch, and whose a thing is. What
 *  is left still looks the same; it only no longer does anything by being put down. */
export function fromOutside(shapes: Shape[]): Shape[] {
  return shapes.map((sh) => {
    if (sh.kind === "arrow" || sh.kind === "text") return sh;
    const { live, img, ...box } = sh;
    const { run: _r, cmd: _c, cwd: _w, from: _f, by: _b, drew: _d, sees: _s, url, ...kept } = live ?? {};
    const still: Live = { ...kept, ...(url && /^https?:\/\//i.test(url) ? { url } : {}) };
    return { ...box, ...(Object.keys(still).length ? { live: still } : {}), ...(img ? { img: (({ origin: _o, by: _p, ...rest }) => rest)(img) } : {}) };
  });
}
/** Scenes from outside the board, their moments' shapes stripped the same way. */
export function scenesFromOutside(scenes: Record<string, Scene>): Record<string, Scene> {
  return Object.fromEntries(Object.entries(scenes).map(([g, sc]) => [g, { ...sc, moments: sc.moments.map((m) => ({ ...m, shapes: fromOutside(m.shapes) })) }]));
}

/** A saved board, made safe to use. */
export function cleanDoc(raw: unknown): Doc {
  if (!rec(raw) || !rec(raw.shapes) || !Array.isArray(raw.order)) return { shapes: {}, order: [] };
  const shapes = raw.shapes;
  const list = cleanShapes((raw.order as unknown[]).map((id) => (typeof id === "string" ? shapes[id] : undefined)));
  const scenes: Record<string, Scene> = {};
  if (rec(raw.scenes)) for (const [g, sc] of Object.entries(raw.scenes)) {
    if (!goodId(g) || !rec(sc) || !Array.isArray(sc.moments)) continue;
    const moments = sc.moments.slice(0, 64).filter(rec).map((m): Moment => ({ id: goodId(m.id) ? m.id : `m${Math.random().toString(36).slice(2, 9)}`, shapes: cleanShapes(Array.isArray(m.shapes) ? m.shapes : []), over: num(m.over) && m.over >= 0 && m.over <= 60000 ? m.over : 500, hold: num(m.hold) && m.hold >= 0 && m.hold <= 600000 ? m.hold : 1200, ...(m.ease === "spring" || m.ease === "even" ? { ease: m.ease } : {}) }));
    if (moments.length) scenes[g] = { moments, at: num(sc.at) && Number.isInteger(sc.at) && sc.at >= 0 && sc.at < moments.length ? sc.at : 0, ...(sc.once === true ? { once: true as const } : {}) };
  }
  // threads kept off the board: threads only, and none that is also on it
  const away = rec(raw.away) ? cleanShapes(Object.values(raw.away)).filter((s): s is Box => s.kind === "thread" && !list.some((x) => x.id === s.id)) : [];
  return { shapes: Object.fromEntries(list.map((s) => [s.id, s])), order: list.map((s) => s.id), ...(Object.keys(scenes).length ? { scenes } : {}), ...(away.length ? { away: Object.fromEntries(away.map((b) => [b.id, b])) } : {}) };
}
