// How the shapes beyond the three basics are drawn. Their forms come
// from the weld vocabulary (welded cards, machines, panels, fences,
// marks); their line colour and weight are the board's own, so they sit
// beside a plain rectangle as one family.
import { hasNotch, isBasic, KINDS, NOTCH_D, NOTCH_W, weld, WELD_R, weldRadius } from "./kinds";
import { boxPath, clock, moves, dash, drawLines, fontOf, FONT, LABEL_TRACK, labelColor, layoutText, labelWidth, LABEL_SIZE, looked, measuring, MONO, shade, WEIGHT, withAlpha } from "./render";
import type { Theme } from "./render";
import type { Shade, Box, Doc, Rect, Tone } from "./types";

// ── choices with alternatives ───────────────────────────────────
export type Voice = "caps" | "mono" | "typed";
const look = { voice: "mono" as Voice, paper: true };
export function setShapeLook(voice: Voice, paper: boolean, notch: boolean) {
  look.voice = voice;
  look.paper = paper;
  weld.notch = notch;
  // (the board's kept pictures were drawn in the look before)
  looked();
}

// ── where a shape's words go ────────────────────────────────────────
export interface Spot extends Rect {
  align: "center" | "left";
  size: number;
  /** Set in the shape's own voice (a header, a name, a caption), on one line. */
  voiced: boolean;
  /** Its tracking, in em, where the shape names one. */
  track?: number;
  /** Its words are shown in the case they were given (an exact look brings its own). */
  asIs?: boolean;
}
const HEADER = { machine: 32, panel: 30 };
const NAME_SIZE = 11, CAPTION_SIZE = 12;
/** A header band: how tall it is, where its contents start, the lamp before a panel's name. Kept in weld's proportions at any height. */
export function header(b: Box): { h: number; pad: number; lamp: number; title: number } {
  const h = Math.min(b.head ?? (b.kind === "machine" ? HEADER.machine : HEADER.panel), b.h);
  const lamp = b.kind === "panel" ? Math.min(12, Math.max(6, h * 0.27)) : 0;
  const pad = b.pad ?? (b.kind === "panel" ? h * 0.385 : 12);
  return { h, pad, lamp, title: pad + (lamp ? lamp * 2 : 0) };
}

/** What a voiced label looks like: the words as shown, their font and tracking. */
export function voiced(text: string, size: number, own?: number): { text: string; font: string; track: number; family: string } {
  const line = text.split("\n")[0] ?? "";
  const mono = look.voice === "mono", family = mono ? MONO : FONT;
  const caps = look.voice !== "typed";
  return { text: caps ? line.toUpperCase() : line, font: `${mono ? 500 : WEIGHT} ${size}px ${family}`, track: mono ? size * (own ?? LABEL_TRACK) : caps ? size * 0.09 : 0, family };
}
/** The tracking (em) of words set in the middle of a shape: weld's shapes speak in the label face, the plain ones as typed. */
export const labelTrack = (b: Box): number | undefined => (b.track !== undefined ? b.track : !isBasic(b.kind) && look.voice === "mono" ? LABEL_TRACK : undefined);
/** Those words as they are shown. */
export const labelText = (b: Box): string => (labelTrack(b) === undefined || b.fine?.text || b.fine?.typed || b.cased ? b.text : b.text.toUpperCase());
let ruler: CanvasRenderingContext2D | null = null;
function voicedWidth(text: string, size: number, own?: number): number {
  if (typeof document === "undefined") ruler ??= measuring();
  else ruler ??= document.createElement("canvas").getContext("2d");
  if (!ruler) return text.length * size * 0.62;
  const v = voiced(text, size, own);
  ruler.font = v.font;
  return ruler.measureText(v.text).width + v.track * v.text.length;
}

/** The rect, in the box's own upright terms, where its label is drawn and typed. */
export const labelSpot = (b: Box): Spot => (b.track === undefined && !b.fine?.text && !b.fine?.typed && !b.cased ? spotOf(b) : { ...spotOf(b), ...(b.track === undefined ? {} : { track: b.track }), ...(b.fine?.text || b.fine?.typed || b.cased ? { asIs: true } : {}) });
function spotOf(b: Box): Spot {
  const at = KINDS[b.kind].label;
  if (b.kind === "machine" || b.kind === "panel") {
    const hd = header(b);
    return { x: b.x + hd.title, y: b.y, w: b.w - hd.title - hd.pad, h: hd.h, align: "left", size: b.size ?? (b.kind === "machine" ? 12 : 11), voiced: true };
  }
  if (b.kind === "boundary" && b.title === "corner") {
    // a frame's name sits inside its top corner, as far in from both edges
    const size = b.size ?? NAME_SIZE;
    return { x: b.x + size * 1.2, y: b.y + size * 0.6, w: Math.max(24, b.w - size * 2.4), h: size * 1.8, align: "left", size, voiced: true };
  }
  if (b.kind === "boundary") {
    // the name plate: twice as tall as its words, one word-height in from the corner
    const size = b.size ?? NAME_SIZE, plate = size * 2;
    // as wide as weld makes it: a fixed advance for each letter, and room at the ends
    // a plate measured on weld (`pad` given) keeps weld's width exactly
    const est = (b.text.length || 2) * size * 0.675 + size * 2;
    const w = Math.min(b.pad === undefined ? Math.max(est, voicedWidth(b.text || "  ", size) + size) : est, Math.max(b.w - 8, 24));
    return { x: b.x + (b.pad ?? Math.min(size, Math.max(0, (b.w - w) / 2))), y: b.y - plate / 2, w, h: plate, align: "center", size, voiced: true };
  }
  if (b.kind === "frame") return { x: b.x + 2, y: b.y - 18, w: b.w, h: 16, align: "left", size: CAPTION_SIZE, voiced: true };
  // a small mark's name sits over its middle; a wide one's starts at its left edge
  if (b.kind === "person" || b.kind === "page" || b.kind === "lock" || b.kind === "timer" || b.kind === "switch") return { x: b.x + b.w / 2 - 80, y: b.y - 17, w: 160, h: 14, align: "center", size: CAPTION_SIZE, voiced: true };
  if (at === "caption") return { x: b.x, y: b.y - 17, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true };
  if (b.kind === "button") return { x: b.x, y: b.y, w: b.w, h: b.h, align: "center", size: b.size ?? Math.max(8, 12 * (b.h / 32)), voiced: true };
  return { x: b.x, y: b.y, w: b.w, h: b.h, align: "center", size: b.size ?? LABEL_SIZE, voiced: false };
}

function drawVoiced(ctx: CanvasRenderingContext2D, text: string, s: Spot, color: string, fw?: number, rise?: number) {
  const v = voiced(text, s.size, s.track);
  if (s.asIs) v.text = text.split("\n")[0] ?? "";
  ctx.font = fw ? v.font.replace(/^\d+/, String(fw)) : v.font;
  ctx.fillStyle = color;
  ctx.textAlign = s.align;
  ctx.textBaseline = "alphabetic";
  // tracking, where the canvas can do it; the words are right without it
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string; textRendering?: string };
  c.textRendering = "geometricPrecision";
  c.letterSpacing = `${v.track}px`;
  ctx.fillText(v.text, s.align === "center" ? s.x + s.w / 2 : s.x, s.y + s.h / 2 + (rise ?? s.size * (look.voice === "mono" ? 0.35 : 0.364)));
  c.letterSpacing = "0px";
}

// ── outlines ────────────────────────────────────────────────────────
/** A rounded rect with a shallow notch at the middle of each side: the
 *  weld silhouette, where wires dock. */
function welded(ctx: CanvasRenderingContext2D, b: Rect & { kind: Box["kind"]; notch?: string; dips?: [string, number][] }, radius: number, k = 1, seam = 0, arc = false) {
  const l = b.x, t = b.y, r = b.x + b.w, bt = b.y + b.h;
  const rx = Math.max(0, Math.min(radius, b.w / 2, b.h / 2));
  // `k` is the zoom the outline is being drawn at: the notches scale with it
  const nw = NOTCH_W * k, nd = NOTCH_D * k;
  const on = (side: string) => hasNotch({ kind: b.kind, w: b.w / k, h: b.h / k, notch: b.notch }, side);
  // where a side dips, as fractions along it: at its middle, wherever else it is told to, and (left and right)
  // where a header's rule meets it, the seam of two welded parts
  const at = (side: string) => [...(on(side) ? [0.5] : []), ...(b.dips ?? []).filter((d) => d[0] === side).map((d) => d[1]), ...(seam && (side === "r" || side === "l") ? [seam / b.h] : [])].sort((a, c) => a - c);
  // a corner is weld's soft curve, or a true quarter circle where the reference draws one
  const corner = (cx: number, cy: number, ex: number, ey: number) => (arc ? ctx.arcTo(cx, cy, ex, ey, rx) : ctx.quadraticCurveTo(cx, cy, ex, ey));
  ctx.beginPath();
  ctx.moveTo(l + rx, t);
  for (const f of at("t")) {
    const x = l + b.w * f;
    ctx.lineTo(x - nw, t);
    ctx.bezierCurveTo(x - nw * 0.5, t, x - nw * 0.4, t + nd, x, t + nd);
    ctx.bezierCurveTo(x + nw * 0.4, t + nd, x + nw * 0.5, t, x + nw, t);
  }
  ctx.lineTo(r - rx, t);
  corner(r, t, r, t + rx);
  for (const f of at("r")) {
    const y = t + b.h * f;
    ctx.lineTo(r, y - nw);
    ctx.bezierCurveTo(r, y - nw * 0.5, r - nd, y - nw * 0.4, r - nd, y);
    ctx.bezierCurveTo(r - nd, y + nw * 0.4, r, y + nw * 0.5, r, y + nw);
  }
  ctx.lineTo(r, bt - rx);
  corner(r, bt, r - rx, bt);
  for (const f of at("b").reverse()) {
    const x = l + b.w * f;
    ctx.lineTo(x + nw, bt);
    ctx.bezierCurveTo(x + nw * 0.5, bt, x + nw * 0.4, bt - nd, x, bt - nd);
    ctx.bezierCurveTo(x - nw * 0.4, bt - nd, x - nw * 0.5, bt, x - nw, bt);
  }
  ctx.lineTo(l + rx, bt);
  corner(l, bt, l, bt - rx);
  for (const f of at("l").reverse()) {
    const y = t + b.h * f;
    ctx.lineTo(l, y + nw);
    ctx.bezierCurveTo(l, y + nw * 0.5, l + nd, y + nw * 0.4, l + nd, y);
    ctx.bezierCurveTo(l + nd, y - nw * 0.4, l, y - nw * 0.5, l, y - nw);
  }
  ctx.lineTo(l, t + rx);
  corner(l, t, l + rx, t);
  ctx.closePath();
}
const rounded = (ctx: CanvasRenderingContext2D, r: Rect, rad: number) => {
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, r.h, Math.max(0, Math.min(rad, r.w / 2, r.h / 2)));
};
/** The outline a shape is selected, hovered and drawn by. */
export function kindPath(ctx: CanvasRenderingContext2D, b: Rect & { kind: Box["kind"]; notch?: string; head?: number; dips?: [string, number][]; fine?: { r?: number; arc?: true }; text?: string; levels?: number[] }, corner = 8) {
  const k = b.kind, z = corner / 8;
  // a panel's sides dip where its header rule lands, when there is room for a body under it
  const head = k === "panel" ? header({ kind: k, head: b.head, h: b.h / z } as Box).h : 0, seam = head && b.h / z >= head + 12 && b.h / z - head > NOTCH_W + weldRadius(k, b.h / z) && head > NOTCH_W + weldRadius(k, b.h / z) ? head * z : 0;
  if (k === "segments") {
    // its outline dips where one part meets the next, top and bottom, as welded parts do
    const { ws } = segmentParts({ text: b.text ?? "", levels: b.levels }), sum = ws.reduce((a, x) => a + x, 0) || 1;
    // (a part with no width yet makes no seam: it is not there until it grows)
    let run = 0; const ends = ws.map((w) => (run += w) / sum), last = ws.reduce((l, w, i) => (w > 0 ? i : l), -1), cuts = [...new Set(ends.filter((_, i) => ws[i]! > 0 && i < last))].filter((c) => Math.min(c, 1 - c) * b.w >= (10 + NOTCH_W) * z);
    // (a seam too near an end makes no dip: it would bite the rounded corner; the part still has its line)
    welded(ctx, { ...b, notch: "", dips: cuts.flatMap((c) => [["t", c], ["b", c]] as [string, number][]) }, 10 * z, z);
  } else if (k === "card" || k === "machine" || k === "pill" || k === "panel" || k === "tank") welded(ctx, b, (b.fine?.r ?? weldRadius(k, b.h / z)) * z, z, seam, !!b.fine?.arc);
  else if (k === "queue" || k === "switch") rounded(ctx, b, b.h / 2);
  else if (k === "store") {
    // a drum: an oval top, straight walls, a rounded foot
    const ry = drumLip(b), cx = b.x + b.w / 2, kx = (b.w / 2) * 0.5523, ky = ry * 0.5523, top = b.y + ry, bot = b.y + b.h - ry;
    ctx.beginPath();
    ctx.moveTo(b.x, top);
    ctx.bezierCurveTo(b.x, top - ky, cx - kx, b.y, cx, b.y);
    ctx.bezierCurveTo(cx + kx, b.y, b.x + b.w, top - ky, b.x + b.w, top);
    ctx.lineTo(b.x + b.w, bot);
    ctx.bezierCurveTo(b.x + b.w, bot + ky, cx + kx, b.y + b.h, cx, b.y + b.h);
    ctx.bezierCurveTo(cx - kx, b.y + b.h, b.x, bot + ky, b.x, bot);
    ctx.closePath();
  } else if (k === "page") {
    // a sheet with its corner turned down
    const fold = Math.min(b.w, b.h) * 0.28, r = Math.min(corner * 0.5, b.w / 4, b.h / 4);
    ctx.beginPath();
    ctx.moveTo(b.x + r, b.y);
    ctx.lineTo(b.x + b.w - fold, b.y);
    ctx.lineTo(b.x + b.w, b.y + fold);
    ctx.arcTo(b.x + b.w, b.y + b.h, b.x, b.y + b.h, r);
    ctx.arcTo(b.x, b.y + b.h, b.x, b.y, r);
    ctx.arcTo(b.x, b.y, b.x + b.w, b.y, r);
    ctx.closePath();
  } else if (k === "table" || k === "window") rounded(ctx, b, corner * 0.75);
  else if (k === "clock" || k === "timer" || k === "arc" || k === "spiral" || k === "countdown" || k === "ripple" || k === "wedge" || k === "dial" || k === "orbit" || k === "wheel" || k === "ringbuf" || k === "roulette") {
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
  }
  else if (k === "boundary") rounded(ctx, b, corner * 1.5);
  else if (k === "frame") rounded(ctx, b, corner * 0.75);
  else if (k === "button" || k === "meter") rounded(ctx, b, corner * 0.4);
  else if (k === "hatch" || k === "parts") rounded(ctx, b, b.fine?.r ?? corner * 0.25);
  else if (k === "pad" || k === "junction") {
    const s = Math.min(b.w, b.h);
    rounded(ctx, { x: b.x + b.w / 2 - s / 2, y: b.y + b.h / 2 - s / 2, w: s, h: s }, s * 0.19 * (corner / 8));
  } else if (k === "rect" || k === "ellipse" || k === "diamond") boxPath(ctx, b, corner);
  else rounded(ctx, b, corner);
}

/** A rect with a radius of its own at each corner (top left, top right, bottom right, bottom left), drawn with curves the SVG stand-in also has. */
function corners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, [a, b, c, d]: number[]) {
  ctx.beginPath(); ctx.moveTo(x + a!, y); ctx.lineTo(x + w - b!, y); ctx.quadraticCurveTo(x + w, y, x + w, y + b!); ctx.lineTo(x + w, y + h - c!); ctx.quadraticCurveTo(x + w, y + h, x + w - c!, y + h);
  ctx.lineTo(x + d!, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - d!); ctx.lineTo(x, y + a!); ctx.quadraticCurveTo(x, y, x + a!, y); ctx.closePath();
}
const c01 = (v: number) => Math.min(1, Math.max(0, v));
/** Part of a circle, drawn with curves (the SVG stand-in has no arc of its own). */
function sweep(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, join = false) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 2))), d = (a1 - a0) / n, k = (4 / 3) * Math.tan(d / 4);
  // (joined: it carries on from where the path has got to)
  if (join) ctx.lineTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); else ctx.moveTo(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
  for (let i = 0; i < n; i++) {
    const a = a0 + i * d, z = a + d;
    ctx.bezierCurveTo(cx + r * (Math.cos(a) - k * Math.sin(a)), cy + r * (Math.sin(a) + k * Math.cos(a)), cx + r * (Math.cos(z) + k * Math.sin(z)), cy + r * (Math.sin(z) - k * Math.cos(z)), cx + r * Math.cos(z), cy + r * Math.sin(z));
  }
}
const HATCH_DEG = 30;
/** Hatching over a rect: lines at the hatching angle (30°; the other way when `back`, for a cross), `gap` apart, cut
 *  exactly to the rect and kept in step with `anchor` so they stand still while the rect grows. (45° was the plotter's.) */
function hatching(ctx: CanvasRenderingContext2D, r: Rect, anchor: number, gap = 6, back = false) {
  const deg = HATCH_DEG, a = ((back ? 180 - deg : deg) * Math.PI) / 180, dx = Math.cos(a), dy = -Math.sin(a), nx = -dy, ny = dx;
  const ps = [r.x * nx + r.y * ny, (r.x + r.w) * nx + r.y * ny, r.x * nx + (r.y + r.h) * ny, (r.x + r.w) * nx + (r.y + r.h) * ny];
  const off = ((anchor % gap) + gap) % gap, lo = Math.floor((Math.min(...ps) - off) / gap), hi = Math.ceil((Math.max(...ps) - off) / gap);
  if (!back) ctx.beginPath();
  for (let i = lo; i <= hi; i++) {
    const c = off + i * gap, px = nx * c, py = ny * c;
    // the line px + t·(dx, dy), cut to the rect
    let t0 = -Infinity, t1 = Infinity;
    for (const [p, d, min, max] of [[px, dx, r.x, r.x + r.w], [py, dy, r.y, r.y + r.h]] as const) {
      if (Math.abs(d) < 1e-9) { if (p < min || p > max) { t0 = 1; t1 = 0; } continue; }
      const u = (min - p) / d, v = (max - p) / d;
      t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
    }
    if (t1 - t0 > 0.5) { ctx.moveTo(px + dx * t0, py + dy * t0); ctx.lineTo(px + dx * t1, py + dy * t1); }
  }
}
/** The colours a legend names: those the board's wires are drawn in (beyond black and grey), in the palette's order. */
const PALETTE: Tone[] = ["accent", "green", "amber", "red", "violet", "teal"];
const TONE_LABEL: Record<Tone, string> = { ink: "Black", muted: "Grey", accent: "Blue", green: "Green", amber: "Amber", red: "Red", violet: "Violet", teal: "Teal" };
let inUse: Tone[] = [];
export const setInUse = (t: Tone[]) => { inUse = t; };
/** A legend's rows as they read: its own name for each colour, or the colour's name where it has none yet. */
export function legendLines(doc: Doc, b: Box): string[] {
  const names = b.text ? b.text.split("\n") : [], used = tonesInUse(doc);
  return (used.length ? used : (["accent"] as Tone[])).map((tone, i) => names[i]?.trim() || TONE_LABEL[tone]);
}
export function tonesInUse(doc: Doc): Tone[] {
  const seen = new Set<Tone>();
  for (const id of doc.order) { const s = doc.shapes[id]; if (s?.kind === "arrow") seen.add(s.tone); }
  return PALETTE.filter((t) => seen.has(t));
}
/** The sizes a whole is cut into when it is given none. */
const PARTS = [1, 2, 3, 2];
/** A timeline's points: one for each line of its words (or three, before it has any), at the times its levels give, and
 *  any beyond those a step after the last. Its words are the points' names. */
export function timelinePoints(b: { text: string; levels?: number[] }): { at: number[]; names: string[] } {
  const names = b.text ? b.text.split("\n") : [], given = b.levels ?? [], n = names.length || given.length || 3;
  const at: number[] = [];
  for (let i = 0; i < n; i++) at.push(i < given.length ? given[i]! : i === 0 ? 0 : at[i - 1]! + (i === 1 ? 1 : at[i - 1]! - at[i - 2]! || 1));
  return { at, names };
}
/** Segments' parts: one for each line of its words (or four, before it has any), as wide as their levels say, one share each beyond those;
 *  given twice as many levels as names, the second half says how far each part is picked (0 to 1). */
export function segmentParts(b: { text: string; levels?: number[] }): { ws: number[]; names: string[]; picks: number[] } {
  const names = b.text ? b.text.split("\n") : [], given = b.levels ?? [], n = names.length || (given.length || PARTS.length);
  const ws = Array.from({ length: n }, (_, i) => given[i] ?? (names.length || given.length ? 1 : PARTS[i]!));
  const picks = names.length && given.length >= 2 * n ? given.slice(n, 2 * n).map((v) => Math.min(1, Math.max(0, v))) : [];
  return { ws, names, picks };
}
/** How far along a timeline a time lies, and back: the scale it is drawn to. */
export const TL_PAD = 28;
/** A length in its unit, said the way a person would: 1500 ms is 1.5 s. */
const lengthOf = (n: number, u: string) => (u.trim() === "ms" && n >= 1000 ? `${+(n / 1000).toFixed(2)} s` : `${+n.toFixed(2)} ${u}`.trim());
export const timelineEnd = (at: number[], span?: number) => span ?? Math.max(1, ...at) * 1.12;
/** Where a timeline's points or segments' seams can be taken hold of and slid (none on a turned one). */
export function grips(b: Box): { x: number; y: number }[] {
  if (b.rot) return [];
  if (b.kind === "timeline") {
    const { at } = timelinePoints(b), end = timelineEnd(at, b.span);
    return at.map((u) => ({ x: b.x + TL_PAD + (u / end) * (b.w - TL_PAD * 2), y: b.y + 34 })).slice(1);
  }
  if (b.kind === "segments") {
    const { ws } = segmentParts(b), sum = ws.reduce((a, x) => a + x, 0) || 1;
    let run = 0;
    return ws.slice(0, -1).map((w) => ({ x: b.x + ((run += w) / sum) * b.w, y: b.y + b.h / 2 }));
  }
  return [];
}
/** A point or seam slid to `x`: the levels it leaves, snapped to half steps (whole parts), kept in order. `from` is the levels as they were when taken. */
export function slid(b: Box, from: Box, i: number, x: number): number[] {
  if (b.kind === "timeline") {
    const { at } = timelinePoints(from), end = timelineEnd(at, from.span), j = i + 1;
    let u = Math.round((((x - b.x - TL_PAD) / (b.w - TL_PAD * 2)) * end) * 2) / 2;
    u = Math.max(at[j - 1]! + 0.5, j + 1 < at.length ? Math.min(at[j + 1]! - 0.5, u) : u);
    return at.map((v, k) => (k === j ? u : v));
  }
  const { ws, picks } = segmentParts(from), sum = ws.reduce((a, v) => a + v, 0) || 1, before = ws.slice(0, i).reduce((a, v) => a + v, 0), pair = ws[i]! + ws[i + 1]!;
  const a = Math.min(pair - 0.5, Math.max(0.5, Math.round((((x - b.x) / b.w) * sum - before) * 2) / 2));
  return [...ws.map((v, k) => (k === i ? a : k === i + 1 ? pair - a : v)), ...picks];
}
/** A unit chart's columns: the heights it is given, or a climb, a cut and a climb again before it has any. */
export const unitColumns = (b: { levels?: number[] }): number[] => (b.levels && b.levels.length ? b.levels : UNITS);
const UNITS = [1, 2, 4, 8, 4, 5, 6], UNITS_FOOT = 24;
/** The stretch an arc takes when it is given none of its own: three quarters of the way round from the top, a line. */
const ARC = [0, 270, 0];
/** A spiral given none of its own: from the top, each lap 22 nearer the centre, a line. */
const SPIRAL = [0, 22, 0];
/** Countdown rings given none of their own: four rings' time left, of a turn of 300. */
const COUNTDOWN = [110, 220, 40, 170];
/** A fingerprint's pattern from its words: sixteen cells, row by row, each set (1) or not (0). The same words always make the same pattern, and changing any of them changes about half the cells. */
export function fingerprintBits(words: string): number[] {
  // FNV-1a over the words, then a finishing mix so that near words land far apart
  let h = 0x811c9dc5;
  for (const ch of words.trim()) { h ^= ch.codePointAt(0)!; h = Math.imul(h, 0x01000193); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return Array.from({ length: 16 }, (_, i) => (h >>> i) & 1);
}
/** A ripple given none of its own: four rings, the outermost 100 out. */
const RIPPLE = [10, 40, 60, 100];
/** A wedge given none of its own: a sixth of the circle, its inner edge 20 out and three rings to its rim, 100 out. */
const WEDGE = [-30, 30, 20, 45, 70, 100];
/** A roulette given none of its own: slices a third of the radius deep, five of them shrinking from the first. */
const ROULETTE = [0.32, 5, 3, 2, 1.5, 1];
/** How much wider a roulette's box is than its ring: room for its pointer. */
const ROULETTE_ROOM = 1.14;
/** An odometer given none of its own: three digits of base three, its rows. */
const ODOMETER = [3, 3, 0];
/** Where an odometer's cells stand from its top left, `size` on a side: as rows (a row of `base` cells for each digit, the highest on top, `pitch` apart across and `gap` apart down, row by row),
 *  or as its product grid (base^digits cells, one per count, grouped as the digits are: the lowest digit a run of cells `pitch` apart, the next those runs side by side `gap` apart, the next
 *  those stacked, and so on turning by turns, the gaps widening a step each turn); and how wide and tall they stand. */
export function odometerPlaces(base: number, digits: number, grid: boolean, size: number, pitch: number, gap: number): { at: [number, number][]; w: number; h: number } {
  const B = Math.max(2, Math.min(10, Math.round(base))), D = Math.max(1, Math.min(grid ? 6 : 12, Math.round(digits)));
  if (!grid) return { at: Array.from({ length: B * D }, (_, i): [number, number] => [(i % B) * pitch, Math.floor(i / B) * gap]), w: (B - 1) * pitch + size, h: (D - 1) * gap + size };
  const n = Math.min(729, B ** D), stepX: number[] = [], stepY: number[] = [];
  let w = size, h = size;
  for (let j = 0; j < D; j++) {
    const across = j < 2 || j % 2 === 1, g = j === 0 ? pitch - size : across ? gap * Math.ceil(j / 2) : gap * 0.7 * (j / 2);
    stepX.push(across ? w + g : 0); stepY.push(across ? 0 : h + g);
    if (across) w = B * w + (B - 1) * g; else h = B * h + (B - 1) * g;
  }
  const at = Array.from({ length: n }, (_, i): [number, number] => { let x = 0, y = 0, m = i; for (let j = 0; j < D; j++) { const d = m % B; m = Math.floor(m / B); x += d * stepX[j]!; y += d * stepY[j]!; } return [x, y]; });
  return { at, w, h };
}
/** A floor given none of its own: four columns counting 0 to 4, their floors rising to the right, and two readings for each column, the lower of each on its floor. */
/** A dial given none of its own: twelve to a turn, one sector from 0 to 6, five points landing, the last of them late. */
const DIAL = [12, 1, 0, 6, 1, 0, 4, 2, 3, 2, 8, 6, 2, 6];
/** How far a dial's box reaches past its rim: room for its sectors, their names and a point dropping in. */
export const DIAL_PAD = 52;
const FLOOR = [4, 4, 0, 1, 2, 3, 0, 2, 0, 0, 1, 3, 1, 1, 2, 2, 2, 4, 3, 3, 3, 4];
/** Wells given none of their own: four pits, shallower to the right, and eight counters in three arrangements: all in the deepest, spreading, then even. */
const WELLS = [4, 0.9, 0.6, 0.4, 0.2, 0, 0, 0, 0, 8, 0, 0, 0, 4, 2, 1, 1, 2, 2, 2, 2];
/** An orbit given none of its own: on at the top, off half way round, 30° a second, a rider boarding each second, seen at 5.5 s. */
const ORBIT = [0, 180, 30, 0, 1, 2, 3, 4, 5, 6];
/** The numbers a row of postings holds when it is given none of its own. */
const POSTINGS = [2, 4, 5, 9, 11];
/** Spans given none of their own: a scale 0 to 10, a band 4 to 7 and four ranges, two meeting it. */
const SPANS = [0, 10, 4, 7, 1, 3, 2, 5, 6, 9, 8, 10];
/** A minmax given none of its own: a scale 0 to 10, a query at 5 shown, and five blocks as [min, max]. */
const MINMAX = [0, 10, 0, 1, 1, 3, 2, 6, 4, 9, 6, 8, 7, 10];
/** An interval given none of its own: a bracket 6 wide with two pins, one inside it and one ahead. */
const INTERVAL = [6, 5, 9];
/** How a row of cells is set out: how many it has (its span; given none, as many as its levels, or eight), each one's side, and how far one's left edge is from the next. */
export function cellPlaces(b: { w: number; h: number; span?: number; levels?: number[] }): { n: number; size: number; pitch: number } {
  const n = Math.max(1, Math.round(b.span ?? (b.levels && b.levels.length ? b.levels.length : 8))), size = Math.max(1, Math.min(b.h, b.w / n));
  return { n, size, pitch: n > 1 ? (b.w - size) / (n - 1) : 0 };
}
/** A wrap given none of its own: the bits of "Hi", eight to a row, as big as its box allows. */
function wrapDefault(b: { w: number; h: number }): number[] {
  const pitch = Math.max(2, Math.min(b.w / 8, b.h / 2)), bits = "0100100001101001";
  return [pitch * 0.84, pitch, pitch, ...[...bits].flatMap((c, i) => [c === "1" ? 1 : 0, i % 8, Math.floor(i / 8), 0])];
}
/** The cells a row of cells has set when it is given none of its own. */
const CELLS = [0, 1, 0, 1, 1, 0, 0, 1];
/** A plane given no counts or points of its own: two across and one up, an edit each way and their merge. */
const PLANE = [2, 1, 0, 0, 1, 0, 1, 1, 2, 0, 2, 1];
/** An overlap given none of its own: two across and one up, the second box at the edit Virginia made, the first at Frankfurt's, then the merge. */
const OVERLAP = [2, 1, 3, 0, 0, 1, 0, 0, 1, 1, 1, 2, 1];
/** Walls given none of their own: six across and five up, walls at four and three, a ray, and three slopes: one meeting the wall across, one the wall up, one their corner. */
const WALLS = [6, 5, 4, 3, 1, 0.4, 1.5, 0.75];
/** The starts a comb has when it is given none of its own: the first early, the rest coming in after it. */
const COMB = [0, 0.18, 0.34, 0.52, 0.7, 0.86];
/** The heights columns stand at when they are given none of their own. */
const COLUMNS = [0.3, 0.72, 0.46, 1, 0.58, 0.22];
/** Bins given none of their own: twelve raw points, folded into four, two, then single points from the oldest (left) to the newest, every dot standing. */
const BINS = ((raw: number[], starts: number[]) => [raw.length, ...raw, ...raw.slice(1).map((_, j) => (starts.includes(j + 1) ? 1 : 0)), ...raw.map(() => 1)])([0.46, 0.7, 0.34, 0.58, 0.8, 0.5, 0.36, 0.62, 0.74, 0.42, 0.66, 0.54], [4, 6, 8, 9, 10, 11]);
/** The bars and lines levels stand at when they are given none of their own: five bars, then two lines, both standing. */
const LEVELS = [0.34, 0.62, 0.48, 0.86, 0.4, 0.56, 0.78, 1, 1], LEVELS_BARS = 5;
/** A scatter given none of its own: a reach about the middle left, and points in two loose clumps. */
const SCATTER = [0.3, 0.45, 0.24, 0.22, 0.32, 0.36, 0.58, 0.18, 0.66, 0.42, 0.3, 0.72, 0.7, 0.84, 0.56, 0.76, 0.36, 0.9, 0.82];
/** Tokens given none of their own: a scale 0 to 10 and five tokens, three of them on one spot (a pile). */
const TOKENS = [0, 10, 2, 7, 7, 7.2, 4.5];
/** A trail given none of its own: eight points in a gentle wave across, every other one kept. */
/** Jaws given none of their own: nine positions, the jaws at 1 and 7, the probe lit at 4 between them. */
const JAWS = [1, 7, 4, 1];
/** Tries given none of their own: a limit of three, and five runs, the fourth failing all three. */
const TRIES = [3, 0, 1, 0, 3, 2];
/** A trie given none of its own: four prompts on one system prompt and tools, three asking of one document and one of another. */
/** An icicle given none of its own: a sentence's first word cut into three, the likeliest cut into two, the rest not looked at. */
const ICICLE = [6, 1, -1, 1, 0, 0.5, 0, 1, 0, 0.4, 0, 0, 0, 0.1, 0, 0, 0, 0.2, 1, 0, 0, 0.15, 1, 0, 0];
const ICICLE_TEXT = ["", "The", "nice", "dog", "car", "woman", "house", "not looked at"].join("\n");
const TRIE_TEXT = ["system | tools | Contract.pdf | Summarise it", "system | tools | Contract.pdf | Find the dates", "system | tools | Contract.pdf | List the parties", "system | tools | Lease.pdf | Summarise it"].join("\n");
/** A cone given none of its own: fourteen months, a ceiling high up, nine real points that ran out of the first band, and the band re-aimed through the latest of them. */
const CONE = [14, 0.85, 1, 6, 0.5, 0.06, 0.015, 0, 0.18, 0.045, 0.006, 0.18, 0.22, 0.27, 0.31, 0.37, 0.43, 0.5, 0.55, 0.61];
/** A rider given none of its own: a straight wire across the middle. */
const RIDER = [2, 0, 0.5, 1, 0.5];
/** A staple left to itself: its seam across, its brackets biting 12 px into both edges, at a quarter and three quarters of the way along. */
const STAPLE = [0, 12, 0.25, 0.75];
const TRAIL = [8, 0.08, 0.6, 0.2, 0.34, 0.33, 0.26, 0.46, 0.42, 0.58, 0.66, 0.71, 0.72, 0.83, 0.52, 0.93, 0.36, 1, 0, 1, 0, 1, 0, 1, 1];
/** A tether given none of its own: three threads, the middle one cut. */
const TETHER = [3, 0.2, 1, 0, 0.5, 1, 1, 0.8, 1, 0];
/** A wall given none of its own: its inside below, two openings, and one hit between them. */
const WALL = [0, 2, 0.25, 2, 0.75, 2, 0.5, 1];
/** Reaches given none of their own: three reaches across the field, the middle one the widest, and points among them. */
const REACHES = [3, 0.22, 0.4, 0.12, 0.5, 0.56, 0.18, 0.8, 0.34, 0.1, 0.16, 0.34, 0.3, 0.5, 0.46, 0.6, 0.6, 0.8, 0.82, 0.3, 0.92, 0.84, 0.12, 0.84];
/** A fence given none of its own: a reach about the left, a five-cornered fence on the right, and points either side of it. */
const FENCE = [0.24, 0.5, 0.2, 5, 0.56, 0.14, 0.88, 0.08, 0.96, 0.62, 0.78, 0.9, 0.54, 0.72, 0.16, 0.3, 0.34, 0.62, 0.12, 0.76, 0.42, 0.22, 0.7, 0.3, 0.84, 0.56, 0.66, 0.66];
/** The tokens a belt carries when it is given none of its own: records, a barrier among them, a word. */
const BELT = ["record", "record", "barrier", "record", "record", "ack", "record", "record", "barrier", "record", "record", "record"];
/** A belt's tokens, in order, each with the place it rides at: a record or a word takes a place of its own (0, 1, 2…), a barrier stands between the one before it and the next (at k − ½). */
export function beltTokens(b: { text: string }): { kind: "record" | "barrier" | "word"; word: string; at: number }[] {
  const given = b.text.split("\n").slice(1).map((s) => s.trim()).filter(Boolean), seq = given.length ? given : BELT;
  let k = 0;
  return seq.map((w) => (w === "barrier" || w === "|" ? { kind: "barrier" as const, word: "", at: k - 0.5 } : { kind: w === "record" ? ("record" as const) : ("word" as const), word: w, at: k++ }));
}
/** A wheel given none of its own: twelve slots a third of the radius deep, four set, one lit, and this moment's two balls, one on an empty slot (setting it) and one on a set slot. */
const WHEEL = [0.32, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...[0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0], ...[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], ...[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]];
/** A ratchet given none of its own: numbers 1 to 6, and this moment's one token, bouncing off the shut notch 2. */
const RATCHET = [1, 6, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
/** How much wider a wheel's box is than its ring: room for a ball outside each slot. */
const WHEEL_ROOM = 1.12;
/** A ring buffer given none of its own: slots a third of the radius deep, the head at slot 1 and the tail at slot 5 (eight slots), four entries between them. */
const RINGBUF = [0.3, 1, 5];
/** How much wider a ring buffer's box is than its ring: room for its two pointers and their names. */
export const RINGBUF_ROOM = 1.24;
/** How a ring buffer is set out: its centre, its ring's outer and inner radius, how many slots, a pointer's length, and where its head and tail are (in slots, the tail never more than once round past the head). */
export function ringPlaces(b: { x: number; y: number; w: number; h: number; span?: number; levels?: number[] }): { cx: number; cy: number; r: number; inner: number; n: number; reach: number; head: number; tail: number } {
  const lv = b.levels && b.levels.length >= 3 ? b.levels : RINGBUF, n = Math.max(1, Math.round(b.span ?? 8)), r = Math.max(4, Math.min(b.w, b.h) / 2 / RINGBUF_ROOM);
  const head = lv[1] ?? 0, tail = head + Math.min(n, Math.max(0, (lv[2] ?? 0) - head));
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r, inner: r * (1 - Math.min(0.95, Math.max(0.05, lv[0] ?? 0.3))), n, reach: Math.max(12, Math.min(24, r * 0.16)), head, tail };
}
/** Where a wire meets a ring buffer's head or tail: just beyond the outer end of that pointer. */
export function ringSpot(b: { x: number; y: number; w: number; h: number; span?: number; levels?: number[] }, which: "head" | "tail"): { x: number; y: number } {
  const p = ringPlaces(b), a = ((which === "head" ? p.head : p.tail) * Math.PI * 2) / p.n - Math.PI / 2, d = p.r + p.reach + 3;
  return { x: p.cx + d * Math.cos(a), y: p.cy + d * Math.sin(a) };
}
/** A call stack given none of its own: main holding q, under area() holding p and r, under newPoint() holding p. */
const CALLSTACK = [3, 1, 2, 1];
const CALLSTACK_TEXT = ["", "main", "q", "area()", "p", "r", "newPoint()", "p"].join("\n");
/** A frame's or a slot's key, as a wire names it: its words up to a bracket, a space, an equals or a colon ("newPoint()" is newPoint, "p = Point{3, 4}" is p). */
export const stackKey = (s: string): string => /^[^\s=:(]*/.exec(s.trim())?.[0] ?? "";
/** How a call stack is set out: each frame (from the bottom, main first) a slab at rest, its name's part and its slots' places, and how lit each slot is. */
export function stackPlaces(b: { x: number; y: number; w: number; h: number; text?: string; levels?: number[] }): { pitch: number; frames: { name: string; key: string; y: number; h: number; nameW: number; slots: { name: string; key: string; x: number; w: number; lit: number }[] }[] } {
  const given = !!b.levels && b.levels.length >= 2 && b.levels[0]! >= 1, lv = given ? b.levels! : CALLSTACK, n = Math.max(1, Math.min(12, Math.round(lv[0]!)));
  const counts = Array.from({ length: n }, (_, i) => Math.max(0, Math.min(8, Math.round(lv[1 + i] ?? 0)))), said = (given ? b.text ?? "" : CALLSTACK_TEXT).split("\n");
  const pitch = b.h / n, gap = Math.min(14, Math.max(6, pitch * 0.18)), sh = Math.max(8, pitch - gap);
  let at = 1, s = 0;
  const frames = counts.map((c, i) => {
    const name = (said[at++] ?? "").trim(), nameW = c ? Math.min(b.w * 0.42, Math.max(b.w * 0.3, 64)) : b.w, sw = c ? (b.w - nameW) / c : 0;
    const slots = Array.from({ length: c }, (_, j) => { const nm = (said[at++] ?? "").trim(); return { name: nm, key: stackKey(nm), x: b.x + nameW + j * sw, w: sw, lit: c01(lv[1 + n + s++] ?? 0) }; });
    return { name, key: stackKey(name), y: b.y + (n - 1 - i) * pitch + gap / 2, h: sh, nameW, slots };
  });
  return { pitch, frames };
}
/** Where a wire meets one slot of a call stack ("main.q"), at (ax, ay) across and down that slot at rest, and which frame it is in; undefined when there is no such slot. */
export function stackSpot(b: { x: number; y: number; w: number; h: number; text?: string; levels?: number[] }, which: string, ax: number, ay: number): { x: number; y: number; frame: number } | undefined {
  const dot = which.indexOf("."), fk = dot < 0 ? which : which.slice(0, dot), sk = dot < 0 ? "" : which.slice(dot + 1), P = stackPlaces(b);
  for (let i = P.frames.length - 1; i >= 0; i--) {
    const f = P.frames[i]!;
    if (f.key !== fk) continue;
    const s = f.slots.find((q) => q.key === sk);
    // (a frame named alone is met on its name's part)
    const r = s ? { x: s.x, w: s.w } : sk ? undefined : { x: b.x, w: f.nameW };
    if (r) return { x: r.x + ax * r.w, y: f.y + ay * f.h, frame: i };
  }
  return undefined;
}
/** Shingles given none of their own: eight cells, four points, and three spans packed into two rows (the middle one overlaps both). */
const SHINGLES = [4, 0.125, 0.25, 0.5, 0.875, 0, 0.5, 0, 0.25, 0.75, 1, 0.5, 1, 0];
/** How a mark of shingles is read from its levels: its points (0 to 1 along), then its spans [from, to, row], and where its rows stand (a row's top, one cell's side). */
export function shinglePlaces(b: { x: number; y: number; w: number; span?: number; levels?: number[] }): { n: number; size: number; points: number[]; spans: [number, number, number][]; rowY: (r: number) => number } {
  const lv = b.levels && b.levels.length ? b.levels : SHINGLES, np = Math.max(0, Math.round(lv[0] ?? 0)), points = lv.slice(1, 1 + np), rest = lv.slice(1 + np), spans: [number, number, number][] = [];
  for (let i = 0; i + 2 < rest.length; i += 3) spans.push([rest[i]!, rest[i + 1]!, rest[i + 2]!]);
  const n = Math.max(1, Math.round(b.span ?? 8)), size = b.w / n, top = b.y + (np ? size * 1.6 : 0);
  return { n, size, points, spans, rowY: (r: number) => top + r * size * 1.2 };
}
/** The path a trace takes when it is given none of its own: quiet, then a climb. */
const TRACE = [0.18, 0.24, 0.2, 0.3, 0.26, 0.38, 0.34, 0.5, 0.62, 0.58, 0.78, 0.92];
/** The stair a gap stands that trace against when it is given none of its own: it trails the climb. */
const STAIR = [0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.45, 0.6, 0.75, 0.9];

/** How deep a store's oval top is. */
export const drumLip = (b: { w: number; h: number }) => Math.min(b.h * 0.16, b.w * 0.14, 14);
/** A table's rows: its words, a line each (three empty ones when it has none). */
export const tableRows = (text: string): string[] => (text ? text.split("\n") : ["", "", ""]);

// ── painting ────────────────────────────────────────────────────────
const GLYPH_COLS = 8, GLYPH_ROWS = 3, SLOTS = 5;
/** The order a compute mark's cells light in: round the outside clockwise, then inward. */
let spiralOrder: number[] | null = null;
function spiral(): number[] {
  if (spiralOrder) return spiralOrder;
  const out: number[] = [];
  let top = 0, bottom = GLYPH_ROWS - 1, left = 0, right = GLYPH_COLS - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(top * GLYPH_COLS + c);
    for (let r = top + 1; r <= bottom; r++) out.push(r * GLYPH_COLS + right);
    if (top < bottom) for (let c = right - 1; c >= left; c--) out.push(bottom * GLYPH_COLS + c);
    if (left < right) for (let r = bottom - 1; r > top; r--) out.push(r * GLYPH_COLS + left);
    top++; bottom--; left++; right--;
  }
  return (spiralOrder = out);
}

/** Paint one of the shapes beyond the basics, in the box's upright frame. */
export function paintKind(ctx: CanvasRenderingContext2D, b: Box, t: Theme, stroke: number, showText: boolean) {
  const f = b.fine, sh = (x: Shade) => shade(t, x);
  const color = f?.line ? sh(f.line) : t.tones[b.tone], k = b.kind;
  // what a mark is filled with: its own colour, or the accent when it is plain ink
  const lit = f?.lamp ? sh(f.lamp) : b.tone === "ink" ? t.accent : color;
  const quiet = f?.lamp ? sh(f.lamp) : b.tone === "ink" ? t.tones.muted : color;
  const faint = withAlpha(t.text, 0.09);
  const line = (w = stroke) => {
    ctx.lineWidth = w;
    ctx.strokeStyle = color;
    dash(ctx, b.line, f?.crisp ? 0.75 : f ? 1.5 : w); // an exact shape keeps the reference's rhythm (6 on, 8 off) at any weight
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const paper = () => {
    if (f?.fill) {
      // an exact fill, with the reference's soft shadow under it when it has one
      if (f.fill === "none") return;
      if (f.shadow) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.06)";
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2 * ctx.getTransform().d;
      }
      ctx.fillStyle = f.fo === undefined ? sh(f.fill) : withAlpha(sh(f.fill), f.fo);
      ctx.fill();
      if (f.shadow) ctx.restore();
      return;
    }
    if (look.paper || b.fill !== "none") {
      ctx.fillStyle = b.fill === "solid" ? color : t.bg;
      ctx.fill();
    }
    if (b.fill === "tint") {
      ctx.fillStyle = withAlpha(color, 0.1);
      ctx.fill();
    }
  };
  const words = f?.text ? sh(f.text) : labelColor(t, b.tone, b.fill === "solid");
  const spot = labelSpot(b);
  const caption = () => {
    if (!b.text || !showText) return;
    // in a figure the words are plain: as typed, in the reading face
    if (f?.prose) drawLines(ctx, [b.text.split("\n")[0]!], spot.align === "center" ? spot.x + spot.w / 2 : spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), spot.align, undefined, 400);
    else drawVoiced(ctx, b.text, spot, withAlpha(t.text, 0.62));
  };

  if (k === "card" || k === "pill") {
    kindPath(ctx, b);
    paper();
    line();
    if (b.text && showText) {
      const l = layoutText(labelText(b), labelWidth(b), spot.size, labelTrack(b));
      drawLines(ctx, l.lines, b.x + b.w / 2, b.y + b.h / 2, spot.size, words, "center", labelTrack(b), b.weight ?? f?.fw, f?.rise);
    }
  } else if (k === "machine" || k === "panel") {
    kindPath(ctx, b);
    paper();
    line();
    const hd = header(b), head = hd.h;
    if (b.h >= head + 12) {
      // the band that carries its name
      ctx.beginPath();
      // the rule runs flush to the outline: it ends exactly at the inside of the border (at the bottom of the notch, where the side
      // dips at the header line), with square ends, so it meets the border without crossing it
      const ow = f ? (f.w ?? 2) : stroke, r = weldRadius(k, b.h), dips = k === "panel" && b.h - head > NOTCH_W + r && head > NOTCH_W + r;
      const clear = (dips ? NOTCH_D : 0) + ow / 2;
      ctx.lineCap = "butt";
      ctx.moveTo(b.x + clear, b.y + head);
      ctx.lineTo(b.x + b.w - clear, b.y + head);
      // an exact panel's rule is the reference's: a quiet hairline
      ctx.lineWidth = f ? Math.min(2, f.w ?? 2) : stroke; // (never heavier than the outline it sits in)
      ctx.strokeStyle = f ? sh("n200") : withAlpha(b.fill === "solid" ? t.bg : color, k === "machine" ? 0.5 : 0.22);
      ctx.stroke();
    }
    if (k === "panel") {
      // its indicator: a small square before the name
      ctx.fillStyle = b.fill === "solid" ? t.bg : quiet;
      ctx.fillRect(b.x + hd.pad, b.y + hd.h / 2 - hd.lamp / 2, hd.lamp, hd.lamp);
    }
    if (b.text && showText) drawVoiced(ctx, b.text, spot, words, b.weight ?? f?.fw, f?.rise);
  } else if (k === "boundary") {
    kindPath(ctx, b);
    // its ground is drawn in its colour, or in ink when it has none of its own (not in its outline's quieter grey)
    const ground = b.tone === "ink" || b.tone === "muted" ? t.text : color;
    if (b.fill === "tint") {
      ctx.fillStyle = withAlpha(ground, 0.04);
      ctx.fill();
    } else if (b.fill === "solid") {
      ctx.fillStyle = withAlpha(ground, 0.09);
      ctx.fill();
    }
    if (b.pattern) {
      // its ground ruled in diagonals, kept inside it and in step with the board, so two hatched places side by side read as one ruling
      ctx.save();
      kindPath(ctx, b);
      ctx.clip();
      hatching(ctx, b, 0, 7);
      if (b.pattern === "cross") hatching(ctx, b, 0, 7, true);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(ground, b.fill === "none" ? 0.16 : 0.22);
      ctx.setLineDash([]);
      ctx.stroke();
      ctx.restore();
      kindPath(ctx, b);
    }
    // a fence is dashed unless told otherwise; a frame is solid, and quiet (it holds things; it is not one of them)
    ctx.lineWidth = stroke;
    ctx.strokeStyle = b.title === "corner" && !f && (b.tone === "ink" || b.tone === "muted") ? withAlpha(t.text, 0.28) : color;
    dash(ctx, b.line ?? (b.title === "corner" ? undefined : "dashed"), f ? 1.5 : stroke);
    ctx.stroke();
    if (b.text && showText && b.title === "corner") {
      // its name inside the corner, on its own ground: no plate is needed where nothing crosses it
      ctx.setLineDash([]);
      drawVoiced(ctx, b.text, spot, f?.text ? words : labelColor(t, b.tone), 600, f?.rise);
    } else if (b.text && showText) {
      // its name rides the top edge on a plate of its own
      rounded(ctx, spot, spot.h / 2);
      ctx.fillStyle = f ? sh("paper") : t.bg;
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      drawVoiced(ctx, b.text, spot, f?.text ? words : labelColor(t, b.tone), b.weight ?? f?.fw, f?.rise);
    }
    ctx.setLineDash([]);
  } else if (k === "frame") {
    kindPath(ctx, b);
    // a frame is chrome around a figure: a lighter line than anything in it
    ctx.lineWidth = stroke * 0.67;
    ctx.strokeStyle = withAlpha(color, 0.3);
    dash(ctx, b.line, 1);
    ctx.stroke();
    ctx.setLineDash([]);
    caption();
  } else if (k === "glyph") {
    // compute: a field of cells, stronger when filled in
    const unit = Math.max(0.5, Math.min(b.w / (GLYPH_COLS * 4 - 1), b.h / (GLYPH_ROWS * 4 - 1)));
    const cell = unit * 3, gw = GLYPH_COLS * cell + (GLYPH_COLS - 1) * unit, gh = GLYPH_ROWS * cell + (GLYPH_ROWS - 1) * unit;
    const x0 = b.x + (b.w - gw) / 2, y0 = b.y + (b.h - gh) / 2;
    ctx.fillStyle = f?.fill ? withAlpha(sh(f.fill), f.fo ?? 1) : withAlpha(lit, b.fill === "solid" ? 1 : b.fill === "tint" ? 0.6 : 0.32);
    const base = f?.fill ? sh(f.fill) : lit;
    for (let r = 0; r < GLYPH_ROWS; r++) for (let c = 0; c < GLYPH_COLS; c++) {
      // each cell at its own strength, where the field says so
      let lv = b.levels?.[r * GLYPH_COLS + c];
      if (b.busy && moves(b.id)) {
        // at work: each cell lights in its turn round the spiral, then settles (weld's cycle: 1.5 s)
        const step = spiral().indexOf(r * GLYPH_COLS + c) / (GLYPH_COLS * GLYPH_ROWS), u = (clock.t! / 1500) % 1;
        lv = u < step ? 0.25 + 0.75 * (step ? u / step : 1) : u < step + 0.12 ? 1 - 0.75 * ((u - step) / 0.12) : 0.25;
      }
      if (lv !== undefined) ctx.fillStyle = withAlpha(base, lv);
      ctx.fillRect(x0 + c * (cell + unit), y0 + r * (cell + unit), cell, cell);
    }
    caption();
  } else if (k === "meter") {
    const v = Math.min(1, Math.max(0, b.value ?? 0.6)), limit = Math.min(1, Math.max(0.05, b.limit ?? 0.75)), plain = limit >= 1, over = !plain && v >= limit, lx = b.x + limit * b.w;
    ctx.fillStyle = withAlpha(quiet, 0.55);
    ctx.fillRect(b.x, b.y, Math.min(v, limit) * b.w, b.h);
    if (over) {
      ctx.fillStyle = lit;
      ctx.fillRect(lx, b.y, (v - limit) * b.w, b.h);
    }
    kindPath(ctx, b);
    line();
    // the limit it is read against (a plain gauge has none)
    if (!plain) {
      ctx.beginPath();
      ctx.moveTo(lx, b.y - 5);
      ctx.lineTo(lx, b.y + b.h + 5);
      ctx.lineWidth = stroke;
      ctx.strokeStyle = over ? lit : color;
      ctx.stroke();
    }
    if (showText) {
      const s: Spot = { x: b.x, y: b.y - 17, w: b.w, h: 14, align: "left", size: CAPTION_SIZE, voiced: true };
      // a sliver that is there but rounds to nothing is said to be under one, not zero
      const pct = v > 0 && v < 0.005 ? "<1%" : `${Math.round(v * 100)}%`;
      // on a short meter there is not room for its name and its number: the name stays, the level is the bar itself
      // (a name that already says how much, "2 of 3", needs no second number; and a bare level, inside something that says it, needs none at all)
      if (b.text && !/\d/.test(b.text) && voicedWidth(b.text || "", CAPTION_SIZE) + voicedWidth(pct, CAPTION_SIZE) + 10 <= b.w) drawVoiced(ctx, pct, { ...s, x: b.x + b.w - voicedWidth(pct, CAPTION_SIZE) }, over ? lit : withAlpha(t.text, 0.62));
    }
    caption();
  } else if (k === "bars") {
    const gap = 4, bw = Math.max(0, (b.w - gap * (SLOTS - 1)) / SLOTS), filled = Math.round(Math.min(1, Math.max(0, b.value ?? 0.6)) * SLOTS);
    for (let i = 0; i < SLOTS; i++) {
      rounded(ctx, { x: b.x + i * (bw + gap), y: b.y, w: bw, h: b.h }, 1.5);
      ctx.fillStyle = i < filled ? quiet : faint;
      ctx.fill();
    }
    caption();
  } else if (k === "store") {
    // data at rest: a drum, its name on the wall
    kindPath(ctx, b);
    paper();
    line();
    const ry = drumLip(b), cx = b.x + b.w / 2, kx = (b.w / 2) * 0.5523, ky = ry * 0.5523, top = b.y + ry;
    ctx.beginPath();
    ctx.moveTo(b.x, top);
    ctx.bezierCurveTo(b.x, top + ky, cx - kx, top + ry, cx, top + ry);
    ctx.bezierCurveTo(cx + kx, top + ry, b.x + b.w, top + ky, b.x + b.w, top);
    line();
    if (b.text && showText) {
      const l = layoutText(labelText(b), labelWidth(b), spot.size, labelTrack(b));
      drawLines(ctx, l.lines, cx, b.y + b.h / 2 + ry * 0.6, spot.size, words, "center", labelTrack(b), f?.fw, f?.rise);
    }
  } else if (k === "table") {
    // rows to look something up in: one of them is the one found
    const rows = tableRows(b.text), n = rows.length, rh = b.h / n, v = Math.min(n, Math.max(0, b.value ?? 0)), at = Math.round(v) - 1;
    kindPath(ctx, b);
    paper();
    if (v > 0) {
      // the found row's marker slides from row to row
      rounded(ctx, { x: b.x + 4, y: b.y + Math.max(0, v - 1) * rh + 4, w: b.w - 8, h: rh - 8 }, 3);
      ctx.fillStyle = withAlpha(lit, 0.16 * Math.min(1, v));
      ctx.fill();
    }
    for (let i = 1; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y + i * rh);
      ctx.lineTo(b.x + b.w, b.y + i * rh);
      ctx.lineWidth = Math.max(1, stroke * 0.5);
      ctx.strokeStyle = withAlpha(color, f ? 0.7 : 0.3);
      ctx.stroke();
    }
    kindPath(ctx, b);
    line();
    if (!b.text) for (let i = 0; i < n; i++) {
      // nothing typed yet: quiet bars stand where the words will go
      const y = b.y + i * rh + rh / 2 - 2, lw = (b.w - 24) * [0.34, 0.46, 0.28][i % 3]!, rw = (b.w - 24) * [0.22, 0.16, 0.26][i % 3]!;
      ctx.fillStyle = i === at ? withAlpha(lit, 0.6) : faint;
      ctx.fillRect(b.x + 12, y, lw, 4);
      ctx.fillRect(b.x + b.w - 12 - rw, y, rw, 4);
    }
    if (showText) rows.forEach((row, i) => {
      // what is looked up on the left; what it gives, after a tab or a wide gap, on the right
      const [a, z] = row.split(/\t| {2,}/), s: Spot = { x: b.x + 12, y: b.y + i * rh, w: b.w - 24, h: rh, align: "left", size: b.size ?? 11, voiced: true };
      if (a) drawVoiced(ctx, a, s, i === at ? lit : withAlpha(t.text, 0.72));
      if (z) drawVoiced(ctx, z, { ...s, x: b.x + b.w - 12 - voicedWidth(z, s.size) }, i === at ? lit : withAlpha(t.text, 0.5));
    });
  } else if (k === "page") {
    // something written down: its lines fill as it is written
    const fold = Math.min(b.w, b.h) * 0.28, v = c01(b.value ?? 0.6);
    kindPath(ctx, b);
    if (f?.fill) paper();
    else if (look.paper) {
      ctx.fillStyle = t.bg;
      ctx.fill();
    }
    line();
    ctx.beginPath();
    ctx.moveTo(b.x + b.w - fold, b.y);
    ctx.lineTo(b.x + b.w - fold, b.y + fold);
    ctx.lineTo(b.x + b.w, b.y + fold);
    ctx.lineJoin = "round";
    line();
    ctx.lineJoin = "miter";
    const m = Math.max(5, b.w * 0.17), pitch = Math.max(5, b.h * 0.105), th = Math.max(1.5, pitch * 0.38), y0 = b.y + fold + pitch, n = Math.max(1, Math.floor((b.y + b.h - m - y0) / pitch) + 1);
    for (let i = 0; i < n; i++) {
      const w = (b.w - m * 2) * (i === n - 1 && n > 1 ? 0.6 : 1), done = c01(v * n - i);
      ctx.fillStyle = faint;
      ctx.fillRect(b.x + m, y0 + i * pitch - th / 2, w, th);
      if (done > 0) {
        ctx.fillStyle = b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, 0.5) : color;
        ctx.fillRect(b.x + m, y0 + i * pitch - th / 2, w * done, th);
      }
    }
    caption();
  } else if (k === "person") {
    // someone: a head and shoulders
    const cx = b.x + b.w / 2, hr = Math.min(b.w, b.h) * 0.2, bt = b.y + hr * 2 + Math.max(3, b.h * 0.1), foot = b.y + b.h;
    const W = Math.min(b.w, (foot - bt) * 2.4), l = cx - W / 2, r = cx + W / 2, R = Math.min(W * 0.42, foot - bt);
    ctx.beginPath();
    ctx.moveTo(l, foot);
    ctx.lineTo(l, bt + R);
    ctx.quadraticCurveTo(l, bt, l + R, bt);
    ctx.lineTo(r - R, bt);
    ctx.quadraticCurveTo(r, bt, r, bt + R);
    ctx.lineTo(r, foot);
    ctx.closePath();
    ctx.lineJoin = "round";
    paper();
    line();
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.ellipse(cx, b.y + hr, hr, hr, 0, 0, Math.PI * 2);
    paper();
    line();
    caption();
  } else if (k === "trace") {
    // how something went over time: drawn as far as time has got, a dot where it is now
    const pts = b.levels && b.levels.length > 1 ? b.levels : TRACE, v = c01(b.value ?? 1), n = pts.length - 1;
    const px = (i: number) => b.x + (i / n) * b.w, py = (l: number) => b.y + b.h - c01(l) * b.h;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(color, 0.3);
    ctx.stroke();
    const end = v * n, whole = Math.min(n, Math.floor(end)), part = end - whole;
    let ex = px(whole), ey = py(pts[whole]!);
    ctx.beginPath();
    ctx.moveTo(px(0), py(pts[0]!));
    for (let i = 1; i <= whole; i++) ctx.lineTo(px(i), py(pts[i]!));
    if (part > 0 && whole < n) {
      ex = px(whole + part);
      ey = py(pts[whole]! + (pts[whole + 1]! - pts[whole]!) * part);
      ctx.lineTo(ex, ey);
    }
    ctx.lineWidth = stroke * 1.3;
    ctx.strokeStyle = quiet;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.ellipse(ex, ey, stroke * 1.75, stroke * 1.75, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit;
    ctx.fill();
    caption();
  } else if (k === "tape") {
    // things in an order, and how far along them someone has got
    const v = c01(b.value ?? 0.4), n = Math.max(2, Math.round(b.w / 16)), base = b.y + b.h, at = b.x + v * b.w;
    for (let i = 0; i <= n; i++) {
      const x = b.x + (i / n) * b.w;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, base - b.h * (i % 5 === 0 ? 0.6 : 0.34));
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = x <= at + 0.01 ? withAlpha(quiet, 0.95) : withAlpha(color, 0.28);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(at, b.y + 4);
    ctx.lineTo(at, base);
    ctx.lineWidth = stroke * 1.5;
    ctx.strokeStyle = lit;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(at - 6.5, b.y - 2);
    ctx.lineTo(at + 6.5, b.y - 2);
    ctx.lineTo(at, b.y + 7);
    ctx.closePath();
    ctx.fillStyle = lit;
    ctx.fill();
    caption();
  } else if (k === "lock") {
    // held shut, or let go: the shackle lifts out of the body
    const v = c01(b.value ?? 1), shut = v >= 0.5, cx = b.x + b.w / 2, by = b.y + b.h * 0.5, sw = b.w * 0.27;
    const acy = b.y + sw + stroke / 2 + b.h * 0.16 * v, free = acy + 1 + (by + 3 - acy - 1) * v;
    ctx.beginPath();
    ctx.moveTo(cx - sw, by + 3);
    ctx.lineTo(cx - sw, acy);
    ctx.bezierCurveTo(cx - sw, acy - sw * 1.33, cx + sw, acy - sw * 1.33, cx + sw, acy);
    ctx.lineTo(cx + sw, free);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = shut ? lit : color;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
    rounded(ctx, { x: b.x, y: by, w: b.w, h: b.y + b.h - by }, 4);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.fillStyle = withAlpha(lit, v);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, by + (b.y + b.h - by) / 2, b.w * 0.09, b.w * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = shut ? t.bg : color;
    ctx.fill();
    caption();
  } else if (k === "switch") {
    // on or off: the knob crosses over
    const v = c01(b.value ?? 1), on = v >= 0.5, kr = Math.max(2, b.h / 2 - Math.max(3, b.h * 0.18));
    kindPath(ctx, b);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.fillStyle = withAlpha(lit, v);
    ctx.fill();
    ctx.lineWidth = stroke;
    ctx.strokeStyle = on ? lit : color;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(b.x + b.h / 2 + v * (b.w - b.h), b.y + b.h / 2, kr, kr, 0, 0, Math.PI * 2);
    ctx.fillStyle = on ? t.bg : quiet;
    ctx.fill();
    caption();
  } else if (k === "queue") {
    const level = Math.min(SLOTS, Math.max(0, Math.round(b.value ?? 3))), full = level >= SLOTS;
    kindPath(ctx, b);
    if (f?.fill) paper();
    else if (look.paper) {
      ctx.fillStyle = t.bg;
      ctx.fill();
    }
    ctx.lineWidth = stroke * (full ? 1.5 : 1);
    ctx.strokeStyle = full ? lit : color;
    dash(ctx, b.line, stroke);
    ctx.stroke();
    ctx.setLineDash([]);
    const gap = b.w / 22, sw = Math.max(0, (b.w - gap * (SLOTS + 3)) / SLOTS), sh = Math.max(0, Math.min(b.h - 12, b.h * 0.54));
    const x0 = b.x + (b.w - (SLOTS * sw + (SLOTS - 1) * gap)) / 2;
    for (let i = 0; i < SLOTS; i++) {
      rounded(ctx, { x: x0 + i * (sw + gap), y: b.y + b.h / 2 - sh / 2, w: sw, h: sh }, 4);
      ctx.fillStyle = i < level ? lit : faint;
      ctx.fill();
    }
    caption();
  } else if (k === "junction" && !f) {
    // a junction is where wires meet: a small solid point on the line, nothing more
    const r = Math.max(2.5, Math.min(b.w, b.h) * 0.3);
    ctx.beginPath();
    ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, r, r, 0, 0, Math.PI * 2);
    ctx.fillStyle = b.tone === "ink" ? withAlpha(t.text, 0.55) : color;
    ctx.fill();
  } else if (k === "pad" || k === "junction") {
    kindPath(ctx, b);
    if (f?.fill) paper();
    else if (look.paper) {
      ctx.fillStyle = t.bg;
      ctx.fill();
    }
    line();
    if (k === "pad") {
      // taken when filled in
      const s = Math.min(b.w, b.h) * 0.375;
      ctx.fillStyle = f?.lamp ? lit : b.fill === "none" ? faint : b.fill === "tint" ? withAlpha(lit, 0.5) : lit;
      ctx.fillRect(b.x + b.w / 2 - s / 2, b.y + b.h / 2 - s / 2, s, s);
    }
    caption();
  } else if (k === "clock") {
    // a dial: twelve ticks, the top one lit, and a hand on its way round
    kindPath(ctx, b);
    if (f?.fill) paper();
    else if (look.paper) {
      ctx.fillStyle = t.bg;
      ctx.fill();
    }
    line();
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.min(b.w, b.h) / 2;
    ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2, inner = r * (i % 3 === 0 ? 0.74 : 0.82);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
      ctx.lineWidth = i === 0 ? stroke * 1.4 : stroke * 0.8;
      ctx.strokeStyle = i === 0 ? lit : withAlpha(color, 0.45);
      ctx.stroke();
    }
    const hand = -Math.PI / 2 - Math.PI / 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(hand) * r * 0.62, cy + Math.sin(hand) * r * 0.62);
    ctx.lineWidth = stroke * 1.3;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.08, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    caption();
  } else if (k === "button") {
    kindPath(ctx, b);
    if (f?.fill) paper();
    else if (look.paper) {
      ctx.fillStyle = t.bg;
      ctx.fill();
    }
    line();
    if (b.text && showText) drawVoiced(ctx, b.text, spot, f?.text ? words : labelColor(t, b.tone), b.weight ?? f?.fw, f?.rise);
  } else if (k === "timer") {
    // time left: a ring that runs down
    const v = c01(b.value ?? 0.75), cx = b.x + b.w / 2, cy = b.y + b.h / 2, wd = Math.max(stroke * 1.5, Math.min(b.w, b.h) * 0.13), r = Math.max(1, Math.min(b.w, b.h) / 2 - wd / 2);
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
    ctx.lineWidth = wd;
    ctx.strokeStyle = b.tone === "ink" || b.tone === "muted" ? faint : withAlpha(color, 0.28);
    ctx.stroke();
    if (v > 0.001) {
      ctx.beginPath();
      if (v > 0.999) ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
      else sweep(ctx, cx, cy, r, -Math.PI / 2, -Math.PI / 2 + v * Math.PI * 2);
      ctx.strokeStyle = lit;
      ctx.stroke();
    }
    caption();
  } else if (k === "window") {
    // a window, small: its bar, and rows that are words or the quiet bars that stand for them
    const rows = b.text ? b.text.split("\n") : ["", "", "", "", ""], n = rows.length, bar = Math.min(18, b.h * 0.16), pad = 8;
    const top = b.y + bar + 5, rh = (b.y + b.h - 5 - top) / n, at = Math.round(Math.min(n, Math.max(0, b.value ?? 0))) - 1;
    kindPath(ctx, b);
    paper();
    line();
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(b.x + pad + 2 + i * 7, b.y + bar / 2 + 1, 2, 2, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(color, 0.55);
      ctx.fill();
    }
    rows.forEach((row, i) => {
      const y = top + i * rh, on = i === at, r: Rect = { x: b.x + pad, y: y + 2, w: b.w - pad * 2, h: Math.max(4, rh - 4) }, mid = r.y + r.h / 2;
      rounded(ctx, r, Math.min(6, r.h / 2));
      ctx.fillStyle = on ? withAlpha(lit, 0.1) : faint;
      ctx.fill();
      if (on) {
        ctx.lineWidth = Math.max(1, stroke * 0.8);
        ctx.strokeStyle = lit;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(r.x + 9, mid, 3, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = on ? lit : withAlpha(t.text, 0.3);
      ctx.fill();
      if (row.trim() && showText) drawVoiced(ctx, row, { x: r.x + 18, y: r.y, w: r.w - 24, h: r.h, align: "left", size: b.size ?? Math.max(10, Math.min(13, r.h * 0.5)), voiced: true }, on ? lit : withAlpha(t.text, 0.72));
      else if (!row.trim()) {
        ctx.fillStyle = on ? withAlpha(lit, 0.75) : withAlpha(t.text, 0.3);
        ctx.fillRect(r.x + 18, mid - 1.25, (r.w - 30) * [0.55, 0.3, 0.72, 0.42, 0.25, 0.6][i % 6]!, 2.5);
      }
    });
  } else if (k === "wave") {
    // a recording: what has been said stands tall, what is to come is a dotted line
    const v = c01(b.value ?? 0.7), n = Math.max(4, Math.floor(b.w / 5)), mid = b.y + b.h / 2, at = b.x + v * b.w;
    for (let i = 0; i < n; i++) {
      const x = b.x + ((i + 0.5) / n) * b.w, s = Math.sin(i * 12.9898) * 43758.5453, amp = (0.12 + 0.88 * (s - Math.floor(s))) * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.37)));
      if (x <= at) {
        ctx.fillStyle = withAlpha(t.text, 0.78);
        ctx.fillRect(x - 0.9, mid - (amp * b.h) / 2, 1.8, Math.max(2, amp * b.h));
      } else if (i % 2 === 0) {
        ctx.fillStyle = withAlpha(t.text, 0.28);
        ctx.fillRect(x - 0.9, mid - 0.9, 1.8, 1.8);
      }
    }
    ctx.beginPath();
    ctx.moveTo(at, b.y);
    ctx.lineTo(at, b.y + b.h);
    ctx.lineWidth = stroke;
    ctx.strokeStyle = lit;
    ctx.stroke();
    caption();
  } else if (k === "rule") {
    // a measure: a line between two ticks, with what it measures said in its middle
    const flat = b.w >= b.h, cx = b.x + b.w / 2, cy = b.y + b.h / 2, tk = 5;
    ctx.beginPath();
    if (f?.draft) {
      // a construction drawing's measure: witness lines, and a slash where the measure meets each
      const s = 3.5;
      if (b.pad) {
        // the edges it measures, carried to it: quiet dotted lines from the feature (`pad` px away: above when negative) to just past the measure
        ctx.moveTo(0, 0);
        const far = b.pad, near = far < 0 ? tk + 2 : -(tk + 2);
        if (flat) for (const x of [b.x, b.x + b.w]) { ctx.moveTo(x, cy + far); ctx.lineTo(x, cy + near); } else for (const y of [b.y, b.y + b.h]) { ctx.moveTo(cx + far, y); ctx.lineTo(cx + near, y); }
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(t.text, 0.26);
        ctx.setLineDash([2, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
      }
      if (flat) { ctx.moveTo(b.x, cy); ctx.lineTo(b.x + b.w, cy); for (const x of [b.x, b.x + b.w]) { ctx.moveTo(x, cy - tk - 2); ctx.lineTo(x, cy + tk + 2); ctx.moveTo(x - s, cy + s); ctx.lineTo(x + s, cy - s); } }
      else { ctx.moveTo(cx, b.y); ctx.lineTo(cx, b.y + b.h); for (const y of [b.y, b.y + b.h]) { ctx.moveTo(cx - tk - 2, y); ctx.lineTo(cx + tk + 2, y); ctx.moveTo(cx - s, y + s); ctx.lineTo(cx + s, y - s); } }
    } else if (flat) {
      if (b.pad) {
        // the edges it measures, carried down (or up) to it from the thing: quiet dotted witness lines
        const far = b.pad, near = far < 0 ? tk + 2 : -(tk + 2);
        for (const x of [b.x, b.x + b.w]) { ctx.moveTo(x, cy + far); ctx.lineTo(x, cy + near); }
        ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.28); ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath();
      }
      ctx.moveTo(b.x, cy); ctx.lineTo(b.x + b.w, cy);
      ctx.moveTo(b.x, cy - tk); ctx.lineTo(b.x, cy + tk);
      ctx.moveTo(b.x + b.w, cy - tk); ctx.lineTo(b.x + b.w, cy + tk);
    } else {
      ctx.moveTo(cx, b.y); ctx.lineTo(cx, b.y + b.h);
      ctx.moveTo(cx - tk, b.y); ctx.lineTo(cx + tk, b.y);
      ctx.moveTo(cx - tk, b.y + b.h); ctx.lineTo(cx + tk, b.y + b.h);
    }
    ctx.lineWidth = f?.draft ? 0.85 : Math.max(1, stroke * 0.75);
    ctx.strokeStyle = f?.draft && (b.tone === "ink" || b.tone === "muted") ? withAlpha(t.text, 0.62) : color;
    ctx.stroke();
    if (b.text && showText) {
      const size = b.size ?? 10;
      let tw = voicedWidth(b.text, size) + 10;
      const ps = f?.draft ? 10.5 : 11;
      if (f?.prose) { ctx.font = fontOf(ps, undefined, 400); tw = ctx.measureText(b.text).width + 12; }
      // words longer than the measure stand under it, so the line is never lost behind them
      const fits = !flat || tw <= b.w - 14, ty = fits ? cy : cy + 15;
      if (fits) { ctx.fillStyle = t.bg; ctx.fillRect(cx - tw / 2, cy - size * 0.8, tw, size * 1.6); }
      if (f?.prose) drawLines(ctx, [b.text], cx, ty, ps, withAlpha(t.text, f?.draft ? 0.6 : 0.72), "center", undefined, 400);
      else drawVoiced(ctx, b.text, { x: cx - tw / 2, y: ty - size, w: tw, h: size * 2, align: "center", size, voiced: true }, b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, 0.72) : color);
    }
  } else if (k === "legend") {
    // a key to the wires: a dot and a name for each colour the board's wires are drawn in, the name in its colour.
    // Its lines are the names, in the order the colours come in the palette; a colour with no line yet is called by its own name
    const names = b.text ? b.text.split("\n") : [], size = b.size ?? 13, row = size * 1.55, tones = inUse.length ? inUse : (["accent"] as Tone[]);
    ctx.font = fontOf(size, undefined, 400);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    tones.forEach((tone, i) => {
      const y = b.y + row / 2 + i * row, c = t.tones[tone];
      ctx.beginPath();
      ctx.ellipse(b.x + 4, y, 3, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
      if (showText) ctx.fillText(names[i]?.trim() || TONE_LABEL[tone], b.x + 14, y + size * 0.04);
    });
  } else if (k === "ticks") {
    // activity over time: a quiet track with a tick for every instant at work (`levels` are the busy spans, as from-to pairs, 0 to 1), drawn as far as its level
    const v = c01(b.value ?? 1), spans = b.levels?.length ? b.levels : [0.04, 0.28, 0.62, 0.9], ink = b.tone === "ink" || b.tone === "muted" ? t.text : color;
    // hairline ticks, in our own measure: a soft track with rounded ends, a slightly wider pitch, and the busy ticks a
    // touch heavier than the idle ones, so a run reads at a glance
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(2.5, b.h / 2));
    ctx.fillStyle = withAlpha(t.text, 0.05);
    ctx.fill();
    for (let x = 1.5; x <= b.w * v - 1.75; x += 4.5) {
      const u = x / b.w;
      let on = false;
      for (let i = 0; i + 1 < spans.length; i += 2) if (u >= spans[i]! && u <= spans[i + 1]!) on = true;
      ctx.fillStyle = on ? withAlpha(ink, 0.88) : withAlpha(t.text, 0.17);
      ctx.fillRect(b.x + x, b.y + (on ? 0 : 1), on ? 1.75 : 1.25, on ? b.h : b.h - 2);
    }
  } else if (k === "hatch") {
    // a region singled out: hatched as far as its level, from the bottom up (from the left when it lies flat)
    const v = c01(b.value ?? 1), up = b.h >= b.w * 0.8, r = up ? { x: b.x, y: b.y + b.h * (1 - v), w: b.w, h: b.h * v } : { x: b.x, y: b.y, w: b.w * v, h: b.h };
    kindPath(ctx, b);
    paper();
    if (v > 0.001) {
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, f?.crisp ? 0.1 : 0.36) : withAlpha(color, 0.7);
      ctx.stroke();
      if (v < 0.999) {
        // where it has got to
        ctx.beginPath();
        if (up) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); } else { ctx.moveTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); }
        ctx.stroke();
      }
    }
    const marks = Math.round(b.levels?.[0] ?? 0);
    if (marks > 1) {
      // graduations: what it holds can be counted off its edge
      ctx.beginPath();
      for (let i = 1; i < marks; i++) { if (up) { const y = b.y + (b.h * i) / marks; ctx.moveTo(b.x, y); ctx.lineTo(b.x + (i * 2 === marks ? 10 : 6), y); } else { const x = b.x + (b.w * i) / marks; ctx.moveTo(x, b.y + b.h); ctx.lineTo(x, b.y + b.h - (i * 2 === marks ? 10 : 6)); } }
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(t.text, 0.55);
      ctx.stroke();
    }
    kindPath(ctx, b);
    line(f?.w ?? Math.max(1, stroke * 0.75));
    caption();
  } else if (k === "guide") {
    // a line the drawing was set out by: not part of the thing, so it is quiet and broken
    const flat = b.w >= b.h;
    ctx.beginPath();
    if (flat) { ctx.moveTo(b.x, b.y + b.h / 2); ctx.lineTo(b.x + b.w, b.y + b.h / 2); } else { ctx.moveTo(b.x + b.w / 2, b.y); ctx.lineTo(b.x + b.w / 2, b.y + b.h); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, 0.26) : color;
    ctx.setLineDash(b.line === "dashed" ? [10, 3, 2, 3] : [2, 4]); // dashed: a centre line, long and short by turns
    ctx.stroke();
    ctx.setLineDash([]);
    caption();
  } else if (k === "timeline") {
    // time laid out to scale: a quiet dotted line of time, drawn solid as time goes by, a point for each event once it has happened,
    // and each gap measured under it, its edges carried down from the points. Its level is how far time has got, in points (1 is the
    // first; 2.5 is half-way from the second to the third), so between two moments the line runs on and the measure grows with it.
    const { at, names: stops } = timelinePoints(b), end = timelineEnd(at, b.span);
    const pad = TL_PAD, rx = (u: number) => b.x + pad + (u / end) * (b.w - pad * 2), ry = b.y + 34;
    const v = Math.max(1, Math.min(at.length, b.value ?? at.length)), whole = Math.floor(v + 1e-6), part = v - whole;
    const nowU = whole >= at.length ? at[at.length - 1]! : at[whole - 1]! + part * (at[whole]! - at[whole - 1]!), now = rx(nowU);
    ctx.beginPath(); ctx.moveTo(b.x, ry); ctx.lineTo(b.x + b.w, ry);
    ctx.lineWidth = 1.25; ctx.strokeStyle = withAlpha(t.text, 0.3); ctx.setLineDash([2, 5]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(rx(at[0]!), ry); ctx.lineTo(now, ry); ctx.lineWidth = 1.5; ctx.strokeStyle = withAlpha(t.text, 0.8); ctx.stroke();
    const unit = /^([\d.]+)\s*(.*)$/.exec(b.unit ?? ""), my = ry + 34;
    // names that would touch the one before stand a row higher; lengths that do not fit their gap drop a row lower by turns
    ctx.font = fontOf(12, 0.06, 500);
    const row: number[] = [], ends = [-Infinity, -Infinity];
    at.forEach((u, i) => { const w = ctx.measureText(stops[i] ?? "").width + (stops[i]?.length ?? 0) * 0.72, x0 = rx(u) - w / 2; const r = x0 < ends[0]! + 8 ? (x0 < ends[1]! + 8 ? 0 : 1) : 0; row.push(r); ends[r] = rx(u) + w / 2; });
    let tight = 0;
    at.forEach((u, i) => {
      const x = rx(u), reached = i < whole, last = i === whole - 1 && part < 0.02;
      // the gap, measured while it is being waited out: witness lines down from both ends, a line between two ticks, its length in the middle
      const growing = i === whole && part > 0.02;
      if (i > 0 && (reached || growing) && showText) {
        const a = rx(at[i - 1]!), z = reached ? x : now, gap = u - at[i - 1]!, said = unit ? lengthOf(gap * Number(unit[1]), unit[2]!) : `${gap}u`;
        const hot = last || growing;
        ctx.beginPath(); for (const e of [a, z]) { ctx.moveTo(e, ry + 9); ctx.lineTo(e, my + 7); }
        ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.3); ctx.setLineDash([2, 3]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = fontOf(10, 0.06, 500); const tw = ctx.measureText(said).width + said.length * 0.6 + 12, mid = (a + z) / 2, room = z - a > tw + 8;
        ctx.beginPath(); ctx.moveTo(a, my - 5); ctx.lineTo(a, my + 5); ctx.moveTo(z, my - 5); ctx.lineTo(z, my + 5);
        if (room && reached) { ctx.moveTo(a, my); ctx.lineTo(mid - tw / 2, my); ctx.moveTo(mid + tw / 2, my); ctx.lineTo(z, my); } else { ctx.moveTo(a, my); ctx.lineTo(z, my); }
        ctx.lineWidth = 1; ctx.strokeStyle = hot ? t.accent : withAlpha(t.text, 0.45); ctx.stroke();
        if (reached) drawLines(ctx, [said], mid, room ? my : my + 13 + (tight++ % 2) * 12, 10, hot ? t.accent : withAlpha(t.text, 0.62), "center", 0.06, 500);
      }
      if (!reached) return;
      // a point once it has happened: open, and blue while it is the latest; a failed one ("✕ Try 1") red, filled, from then on
      const failed = stops[i]?.startsWith("✕") ?? false, ink = failed ? t.tones.red : last ? t.accent : t.text;
      ctx.beginPath(); ctx.ellipse(x, ry, 6, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = failed ? t.tones.red : last && i === at.length - 1 ? t.accent : t.bg; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = ink; ctx.stroke();
      if (stops[i] && showText) drawLines(ctx, [stops[i]!], x, ry - 22 - row[i]! * 15, 12, failed ? t.tones.red : last ? t.accent : withAlpha(t.text, 0.8), "center", 0.06, 500);
    });
    if (unit && showText && !b.span) drawLines(ctx, [`one step = ${b.unit}`], b.x + b.w - 4, my + 30, 10, withAlpha(t.text, 0.5), "right", 0.06, 500);
  } else if (k === "tank") {
    // a welded vessel that fills from the bottom: blue as far as its level, with a mark for each unit it holds, and how full it is under its name
    kindPath(ctx, b); paper();
    const v = c01(b.value ?? 0), cap = Math.max(0, Math.round(Number(/^\d+/.exec(b.unit ?? "")?.[0] ?? 0)));
    const top = b.y + (b.text ? 34 : 6), body = b.y + b.h - top - 6, fy = b.y + b.h - 6 - body * v;
    // (drawn as its own shape, inside the outline: the SVG stand-in has no clipping)
    const deep = b.y + b.h - 1 - fy, inset = 1;
    if (v > 0) {
      corners(ctx, b.x + inset, fy, b.w - inset * 2, deep, [Math.max(0, Math.min(2, deep / 2)), Math.max(0, Math.min(2, deep / 2)), Math.min(WELD_R - 1, deep), Math.min(WELD_R - 1, deep)]);
      ctx.fillStyle = withAlpha(t.accent, 0.14); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x + inset + (deep < WELD_R ? WELD_R - deep : 0), fy); ctx.lineTo(b.x + b.w - inset - (deep < WELD_R ? WELD_R - deep : 0), fy); ctx.lineWidth = 1.5; ctx.strokeStyle = t.accent; ctx.stroke();
    }
    if (cap > 1) {
      ctx.beginPath();
      for (let i = 1; i < cap; i++) { const y = b.y + b.h - 6 - (body * i) / cap; ctx.moveTo(b.x + b.w - 14, y); ctx.lineTo(b.x + b.w - 8, y); }
      ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.25); ctx.stroke();
    }
    kindPath(ctx, b); line();
    if (showText) {
      if (b.text) drawLines(ctx, [b.text.split("\n")[0]!], b.x + b.w / 2, b.y + 18, 13, words, "center", 0.08, 500);
      if (cap) drawLines(ctx, [`${Math.round(v * cap)} of ${cap}`], b.x + b.w / 2, (fy - top > 24 ? fy - 12 : Math.min(b.y + b.h - 14, fy + 14)), 11, v > 0 ? t.accent : withAlpha(t.text, 0.5), "center", 0.06, 500);
    }
  } else if (k === "segments") {
    // a whole in its welded parts: each as wide as its share, cut where the outline dips; the part in question is blue, and so is each part picked (lit as far as it is picked)
    const { ws, names, picks } = segmentParts(b), sum = ws.reduce((a, x) => a + x, 0) || 1, sel = Math.round(b.value ?? 0), most = Math.max(0, ...picks);
    kindPath(ctx, b); paper();
    // the blue slides from one part to the next as the level moves between them; it keeps inside the outline, dips and rounded ends included
    const lv = b.value ?? 0, lo = Math.floor(lv), fr = lv - lo, edge = (n: number) => b.x + (ws.slice(0, Math.max(0, n)).reduce((q, x) => q + x, 0) / sum) * b.w;
    const lit = (x0: number, x1: number, much = 1) => { ctx.save(); kindPath(ctx, b); ctx.clip(); ctx.fillStyle = withAlpha(t.accent, 0.12 * much); ctx.fillRect(x0, b.y, x1 - x0, b.h); ctx.restore(); };
    if (lv > 0 && fr > 0.001 && lo >= 1 && lo < ws.length) lit(edge(lo - 1) + fr * (edge(lo) - edge(lo - 1)), edge(lo) + fr * (edge(lo + 1) - edge(lo)));
    let x = b.x;
    ws.forEach((w, i) => {
      const pw = (w / sum) * b.w, pk = picks[i] ?? 0, on = (i + 1 === sel && fr < 0.001) || pk >= 0.5;
      if (pw < 1) return;
      if (i + 1 === sel && fr < 0.001) lit(x, x + pw); else if (pk > 0.001) lit(x, x + pw, pk);
      if (i > 0) { ctx.beginPath(); ctx.moveTo(x, b.y + NOTCH_D + 2); ctx.lineTo(x, b.y + b.h - NOTCH_D - 2); ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(color, 0.3); ctx.stroke(); }
      if (names[i] && showText) {
        const [a, z] = names[i]!.split(/ {2,}/);
        // its words fit inside it: as large as the band allows, smaller where the part is narrow
        let fs = Math.min(15, b.h * 0.3); ctx.font = fontOf(fs, 0.02, 400); const tw = ctx.measureText(a!).width + a!.length * fs * 0.02; if (tw > pw - 16) fs = Math.max(8, fs * ((pw - 16) / tw));
        // words come in only once their part has room for them
        ctx.save(); ctx.globalAlpha *= Math.max(0, Math.min(1, (pw - 8) / 24));
        drawLines(ctx, [a!], x + pw / 2, b.y + b.h / 2, fs, on ? t.accent : withAlpha(t.text, sel ? 0.55 : 0.9 - 0.35 * most), "center", 0.02, on ? 500 : 400);
        if (z) drawLines(ctx, [z], x + pw / 2, b.y + b.h + 17, 12, on ? t.accent : withAlpha(t.text, 0.62), "center", 0.06, 500);
        ctx.restore();
      }
      x += pw;
    });
    kindPath(ctx, b);
    line();
  } else if (k === "parts") {
    // a whole cut into its parts, each as wide as its share; the one in question is hatched
    const ws = b.levels && b.levels.length ? b.levels : PARTS, sum = ws.reduce((a, x) => a + x, 0) || 1, names = b.text.split("\n").slice(1), sel = Math.round(b.value ?? 0);
    kindPath(ctx, b);
    paper();
    let x = b.x;
    const cuts: number[] = [];
    ws.forEach((w, i) => {
      const pw = (w / sum) * b.w;
      if (i + 1 === sel) {
        hatching(ctx, { x, y: b.y, w: pw, h: b.h }, b.x + b.y + b.h, 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, 0.4) : withAlpha(color, 0.75);
        ctx.stroke();
      }
      if (i > 0) cuts.push(x);
      if (names[i] && showText) {
        // what a part holds is written in it, as it is; its name goes under it (after two spaces, as a table's rows are written)
        const [a, z] = names[i]!.split(/ {2,}/), name = z ?? a!, on = i + 1 === sel;
        if (z !== undefined) {
          const fs = Math.min(13, b.h * 0.34);
          if (on) { ctx.font = fontOf(fs, 0, 400); const tw = ctx.measureText(a!).width + 10; ctx.fillStyle = t.bg; ctx.fillRect(x + pw / 2 - tw / 2, b.y + b.h / 2 - fs * 0.75, tw, fs * 1.5); } // its words stand on a clear plate, not on the hatching
          drawLines(ctx, [a!], x + pw / 2, b.y + b.h / 2, fs, withAlpha(t.text, on || !sel ? 0.92 : 0.5), "center", 0, 400);
        }
        drawLines(ctx, [name], x + pw / 2, b.y + b.h + 14, 11, withAlpha(t.text, on ? 0.9 : 0.6), "center", undefined, on ? 500 : 400);
      }
      x += pw;
    });
    ctx.beginPath();
    for (const c of cuts) { ctx.moveTo(c, b.y); ctx.lineTo(c, b.y + b.h); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(color, 0.75);
    ctx.stroke();
    kindPath(ctx, b);
    line(f?.w ?? Math.max(1, stroke * 0.75));
    if (b.text && showText) {
      const name = b.text.split("\n")[0]!;
      if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400);
      else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62));
    }
  } else if (k === "axis") {
    // a number line: whole numbers either side of nought, points marked on it, and one that is the point in question
    const v = c01(b.value ?? 0.5), units = Math.max(2, Math.round(b.w / 44 / 2) * 2), y = b.y + b.h * 0.4, x0 = b.x + 10, x1 = b.x + b.w - 14;
    const px = (u: number) => x0 + u * (x1 - x0);
    ctx.beginPath();
    ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y);
    ctx.moveTo(b.x + b.w - 6, y - 3.5); ctx.lineTo(b.x + b.w, y); ctx.lineTo(b.x + b.w - 6, y + 3.5);
    for (let i = 0; i <= units; i++) { ctx.moveTo(px(i / units), y - 4.5); ctx.lineTo(px(i / units), y + 4.5); }
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = withAlpha(t.text, 0.7);
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.lineJoin = "miter";
    if (showText) for (let i = 0; i <= units; i++) {
      const num = String(i - units / 2).replace("-", "−");
      if (f?.prose) drawLines(ctx, [num], px(i / units), y + 16, 11, withAlpha(t.text, 0.66), "center", undefined, 400);
      else drawVoiced(ctx, num, { x: px(i / units) - 20, y: y + 8, w: 40, h: 14, align: "center", size: 10, voiced: true }, withAlpha(t.text, 0.62));
    }
    for (const p of b.levels ?? []) {
      ctx.beginPath();
      ctx.ellipse(px(c01(p)), y, 3, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(t.text, 0.7);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(px(v), y, 3.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit;
    ctx.fill();
    caption();
  } else if (k === "plot" || k === "gap" || k === "stair" || k === "threshold") {
    // a curve on its axes, drawn as far as it has got, with a line dropped from where it is
    // (a gap is that curve against a stair: its levels are the curve's heights and then the stair's, and the space between the two is what it shows)
    const two = k === "gap", both = two && b.levels && b.levels.length > 3 ? b.levels : [...TRACE, ...STAIR], half = both.length >> 1, steps = both.slice(half, half * 2);
    // (a stair is that plot for a value that changes in an instant: each level holds from its instant to the next, and a riser stands whole the moment the line reaches it)
    const square = k === "stair";
    // (a threshold is that plot with a level line across it: where the curve, as far as it is drawn, crosses the line, a tick drops to the baseline and a dot lights there)
    const bar = k === "threshold", limit = bar ? c01(+(b.unit ?? "") || 0.5) : 0;
    const pts = two ? both.slice(0, half) : b.levels && b.levels.length > 1 ? b.levels : square ? STAIR : TRACE, v = c01(b.value ?? 1), n = pts.length - 1, ox = b.x + 8, oy = b.y + b.h - 8, W = b.w - 20, H = b.h - 20;
    const px = (i: number) => ox + (i / n) * W, py = (l: number) => oy - c01(l) * H;
    const end = v * n, whole = Math.min(n, Math.floor(end)), part = end - whole;
    const upto: [number, number][] = [];
    for (let i = 0; i <= whole; i++) { if (square && i > 0 && pts[i] !== pts[i - 1]) upto.push([px(i), py(pts[i - 1]!)]); upto.push([px(i), py(pts[i]!)]); }
    if (part > 0 && whole < n) upto.push([px(whole + part), py(square ? pts[whole]! : pts[whole]! + (pts[whole + 1]! - pts[whole]!) * part)]);
    const smooth = () => {
      ctx.moveTo(upto[0]![0], upto[0]![1]);
      if (square) { for (let i = 1; i < upto.length; i++) ctx.lineTo(upto[i]![0], upto[i]![1]); return; }
      // (a sudden fall, near half the height in one step, is a cliff: its top and foot are corners, not rounded away into a hump)
      const cliff = (i: number) => (pts[i + 1] !== undefined && pts[i]! - pts[i + 1]! >= 0.4) || (i > 0 && pts[i - 1]! - pts[i]! >= 0.4);
      for (let i = 1; i < upto.length - 1; i++) {
        if (cliff(i)) ctx.lineTo(upto[i]![0], upto[i]![1]);
        else ctx.quadraticCurveTo(upto[i]![0], upto[i]![1], (upto[i]![0] + upto[i + 1]![0]) / 2, (upto[i]![1] + upto[i + 1]![1]) / 2);
      }
      ctx.lineTo(upto[upto.length - 1]![0], upto[upto.length - 1]![1]);
    };
    const [ex, ey] = upto[upto.length - 1]!;
    // the stair as far as the curve has got: each step holds from its instant to the next
    const stair = () => {
      ctx.moveTo(ox, py(steps[0]!));
      for (let i = 0; i <= whole && px(i) < ex - 1e-6; i++) { ctx.lineTo(px(i), py(steps[i]!)); ctx.lineTo(Math.min(px(i + 1), ex), py(steps[i]!)); }
    };
    if (two && upto.length > 1) {
      // what lies under one line and over the other, as far as they are drawn
      const between = (over: () => void, under: () => void, paint: () => void) => {
        ctx.save();
        ctx.beginPath(); over(); ctx.lineTo(ex, oy); ctx.lineTo(ox, oy); ctx.closePath(); ctx.clip();
        ctx.beginPath(); under(); ctx.lineTo(ex, b.y - 4); ctx.lineTo(ox, b.y - 4); ctx.closePath(); ctx.clip();
        paint();
        ctx.restore();
      };
      // spare: under the stair, over the curve
      between(stair, smooth, () => { ctx.fillStyle = withAlpha(t.text, 0.09); ctx.fillRect(ox, b.y, ex - ox, oy - b.y); });
      // shortfall: under the curve, over the stair
      between(smooth, stair, () => {
        ctx.fillStyle = withAlpha(t.tones.red, 0.08); ctx.fillRect(ox, b.y, ex - ox, oy - b.y);
        hatching(ctx, { x: ox, y: b.y, w: ex - ox, h: oy - b.y }, b.x + b.y + b.h, 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(t.tones.red, 0.85);
        ctx.stroke();
      });
    } else if (upto.length > 1 && !f?.prose) {
      ctx.beginPath();
      smooth();
      ctx.lineTo(ex, oy);
      ctx.lineTo(ox, oy);
      ctx.closePath();
      ctx.fillStyle = withAlpha(lit, 0.07);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(ox, b.y); ctx.lineTo(ox, oy); ctx.lineTo(b.x + b.w, oy);
    ctx.moveTo(ox - 3.5, b.y + 6); ctx.lineTo(ox, b.y); ctx.lineTo(ox + 3.5, b.y + 6);
    ctx.moveTo(b.x + b.w - 6, oy - 3.5); ctx.lineTo(b.x + b.w, oy); ctx.lineTo(b.x + b.w - 6, oy + 3.5);
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = withAlpha(t.text, 0.7);
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey); ctx.lineTo(ex, oy);
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = withAlpha(t.text, 0.4);
    ctx.stroke();
    ctx.setLineDash([]);
    if (two && upto.length > 1) {
      // the stair's own line: square, and quieter than the curve
      ctx.beginPath();
      stair();
      ctx.lineJoin = "miter";
      ctx.lineWidth = stroke;
      ctx.strokeStyle = withAlpha(t.text, 0.55);
      ctx.stroke();
      ctx.lineJoin = "round";
    }
    if (bar) {
      // the line, across the whole plot: broken, and firmer than a guide (it is part of the mark), its words just over it at the left
      const ly = py(limit);
      ctx.beginPath(); ctx.moveTo(ox, ly); ctx.lineTo(b.x + b.w, ly);
      ctx.lineWidth = Math.max(1, stroke * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      const said = b.text.split("\n")[1];
      if (said && showText) {
        const wy = ly - 9 < b.y + 4 ? ly + 13 : ly - 9;
        if (f?.prose) drawLines(ctx, [said], ox + 8, wy, 12, withAlpha(t.text, 0.62), "left", undefined, 400, undefined, true);
        else drawLines(ctx, [said], ox + 8, wy, 10, withAlpha(t.text, 0.62), "left", 0.06, 500);
      }
      // where the whole curve, as smooth() draws it, crosses the line; a crossing shows once the curve has got there
      const all: [number, number][] = pts.map((l, i) => [px(i), py(l)]), path: [number, number][] = [all[0]!];
      const cliff = (i: number) => (pts[i + 1] !== undefined && pts[i]! - pts[i + 1]! >= 0.4) || (i > 0 && pts[i - 1]! - pts[i]! >= 0.4);
      let from = all[0]!;
      for (let i = 1; i < all.length - 1; i++) {
        const c = all[i]!;
        if (cliff(i)) { path.push(c); from = c; continue; }
        const e: [number, number] = [(c[0] + all[i + 1]![0]) / 2, (c[1] + all[i + 1]![1]) / 2];
        for (let s = 1; s <= 16; s++) { const u = s / 16, a = (1 - u) * (1 - u), m = 2 * (1 - u) * u, z = u * u; path.push([a * from[0] + m * c[0] + z * e[0], a * from[1] + m * c[1] + z * e[1]]); }
        from = e;
      }
      if (all.length > 1) path.push(all[all.length - 1]!);
      const over = (y: number) => y < ly;
      for (let i = 1; i < path.length; i++) {
        const [x0, y0] = path[i - 1]!, [x1, y1] = path[i]!;
        if (over(y0) === over(y1)) continue;
        const cx = x0 + ((x1 - x0) * (ly - y0)) / (y1 - y0);
        if (cx > ex + 0.5) break;
        ctx.beginPath(); ctx.moveTo(cx, ly); ctx.lineTo(cx, oy);
        ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(cx, oy, 3.5, 3.5, 0, 0, Math.PI * 2);
        if (over(y1)) { ctx.fillStyle = lit; ctx.fill(); }
        else { ctx.fillStyle = t.bg; ctx.fill(); ctx.lineWidth = 1.25; ctx.strokeStyle = withAlpha(t.text, 0.7); ctx.stroke(); }
      }
    }
    if (upto.length > 1) {
      ctx.beginPath();
      smooth();
      if (square) ctx.lineJoin = "miter";
      ctx.lineWidth = stroke * 1.2;
      ctx.strokeStyle = b.tone === "ink" || b.tone === "muted" ? withAlpha(t.text, 0.85) : color;
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.ellipse(ex, ey, 3.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = lit;
    ctx.fill();
    caption();
  } else if (k === "units") {
    // a level counted out: a column of units for each step, as many columns as its level (a part of one grows the next unit by unit, the newest unit fading in);
    // the column last drawn is the one in question, so it is filled; units standing past the limit are red
    const cols = unitColumns(b), n = cols.length, v = Math.min(n, Math.max(0, b.value ?? n)), limit = Math.max(0, +(b.unit ?? 0) || 0), top = Math.max(1, limit, ...cols.map(Math.ceil));
    const pitch = b.w / n, base = b.y + b.h - UNITS_FOOT, rise = Math.max(1, Math.min((b.h - UNITS_FOOT) / top, pitch)), r = Math.min(rise, pitch) * 0.35, now = Math.ceil(v - 1e-6) - 1;
    const own = b.tone !== "ink" && b.tone !== "muted", ink = own ? color : withAlpha(t.text, 0.92);
    if (limit) {
      // the limit: a line across, quiet and broken (it is not one of the units)
      ctx.beginPath();
      ctx.moveTo(b.x, base - limit * rise); ctx.lineTo(b.x + b.w, base - limit * rise);
      ctx.lineWidth = Math.max(1, stroke * 0.5);
      ctx.strokeStyle = withAlpha(t.text, 0.4);
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    // (a units mark is for counting a few: past a couple of thousand, or units too small to see, each column is drawn as a bar,
    // so a huge count never draws millions of rings on every repaint)
    const crowd = rise < 2 || cols.reduce((s, c) => s + Math.max(0, Math.ceil(c)), 0) > 2000;
    for (let i = 0; i < n; i++) {
      const got = c01(v - i), tall = Math.max(0, cols[i]!) * got, cx = b.x + pitch * (i + 0.5);
      if (got <= 0) break;
      if (crowd) {
        // (too many to count one by one: the column as one bar, the part past the limit red)
        const w = Math.max(1, pitch * 0.6), under = limit ? Math.min(tall, limit) : tall;
        ctx.fillStyle = withAlpha(i === now ? ink : own ? color : t.text, i === now || own ? 0.92 : 0.5);
        ctx.fillRect(cx - w / 2, base - under * rise, w, under * rise);
        if (limit && tall > limit) { ctx.fillStyle = t.tones.red; ctx.fillRect(cx - w / 2, base - tall * rise, w, (tall - limit) * rise); }
      } else for (let u = 0; u < tall - 1e-6; u++) {
        const a = c01(tall - u), over = !!limit && u >= limit, full = over || i === now;
        ctx.beginPath();
        ctx.ellipse(cx, base - (u + 0.5) * rise, r, r, 0, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(over ? t.tones.red : full ? ink : t.bg, (over || !full || own ? 1 : 0.92) * a);
        ctx.fill();
        if (!full) { ctx.strokeStyle = withAlpha(own ? color : t.text, (own ? 1 : 0.62) * a); ctx.stroke(); }
      }
      if (showText) drawLines(ctx, [String(Math.round(tall))], cx, base + UNITS_FOOT / 2 + 2, 12, withAlpha(t.text, (i === now ? 0.9 : 0.6) * Math.min(1, got * 4)), "center", undefined, 400);
    }
    caption();
  } else if (k === "postings") {
    // one row of a scale other rows share: a line with a place for every number up to its span, and a point standing at each number present.
    // Its level is the number the walk has got to (a part of one: between two). The walk is an upright line; the point under it is lit, points behind it are settled (quiet), points ahead wait
    const ns = b.levels && b.levels.length ? b.levels : POSTINGS, span = Math.max(1, Math.round(b.span ?? Math.max(...ns))), v = Math.min(span + 1, Math.max(0, b.value ?? 0));
    const pitch = b.w / span, y = b.y + b.h / 2, r = Math.max(2.5, Math.min(b.h / 2, pitch * 0.36)), px = (n: number) => b.x + pitch * (n - 0.5);
    const own = b.tone !== "ink" && b.tone !== "muted", ink = own ? color : t.text, has = new Set(ns.map(Math.round));
    // the scale: a quiet line, a tick at every place nothing stands on
    ctx.beginPath();
    ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y);
    for (let n = 1; n <= span; n++) if (!has.has(n)) { ctx.moveTo(px(n), y - 3); ctx.lineTo(px(n), y + 3); }
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.32);
    ctx.stroke();
    // the walk: it comes in before the first place and is gone past the last
    const there = Math.min(c01(v), c01(span + 1 - v));
    if (there > 0) {
      ctx.beginPath();
      ctx.moveTo(px(v), b.y - 6); ctx.lineTo(px(v), b.y + b.h + 6);
      ctx.lineWidth = stroke;
      ctx.strokeStyle = withAlpha(lit, there);
      ctx.stroke();
    }
    const numbered = showText && r >= 8, size = Math.min(12, r * 0.86);
    for (const n of has) {
      if (n < 1 || n > span) continue;
      const under = v > 0 ? c01(1 - Math.abs(v - n)) : 0, behind = v > 0 ? c01(v - n) : 0, cx = px(n);
      ctx.beginPath();
      ctx.ellipse(cx, y, r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (own) { ctx.fillStyle = withAlpha(color, 0.1); ctx.fill(); }
      if (under > 0) { ctx.fillStyle = withAlpha(lit, under); ctx.fill(); }
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = under >= 1 ? lit : withAlpha(ink, (own ? 1 : 0.7) * (1 - 0.55 * behind));
      ctx.stroke();
      if (numbered) {
        if (under < 1) drawLines(ctx, [String(n)], cx, y + 0.5, size, withAlpha(ink, (own ? 1 : 0.82) * (1 - 0.5 * behind) * (1 - under)), "center", undefined, 500);
        if (under > 0) drawLines(ctx, [String(n)], cx, y + 0.5, size, withAlpha(t.bg, under), "center", undefined, 500);
      }
    }
    caption();
  } else if (k === "interval") {
    // a number line from 0 to its span (a tick at every number, numbers under them) with a hatched bracket on it [earliest, latest] and pins dropped on it. Its levels are the bracket's width,
    // then the numbers the pins stand at; its level is where the bracket's left edge is (a part of one: between two). A pin is lit while the bracket covers it, settled (solid) once the left edge
    // is past it, waiting (open) while it is still ahead. Rows of one x, width and span share the scale, one row a clock. It takes the accent, or the colour it is given
    const lv = b.levels && b.levels.length ? b.levels : INTERVAL, span = Math.max(1, Math.round(b.span ?? 16)), wide = Math.max(0, lv[0] ?? 0), pins = lv.slice(1);
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, ink = own ? color : t.text, w = f?.w ?? Math.max(1, stroke * 0.75);
    const band = Math.max(12, b.h - 18), y = b.y + band / 2, X = (n: number) => b.x + (Math.max(0, Math.min(span, n)) / span) * b.w, pitch = b.w / span;
    const lo = Math.max(0, b.value ?? 0), hi = lo + wide;
    // the scale: a quiet line, a tick at every number, and the numbers under it (every one when there is room, else every second or fifth)
    ctx.beginPath();
    ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y);
    for (let n = 0; n <= span; n++) { const tk = n % 5 === 0 ? 5 : 3; ctx.moveTo(X(n), y - tk); ctx.lineTo(X(n), y + tk); }
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.36);
    ctx.stroke();
    if (showText) {
      const every = pitch >= 22 ? 1 : pitch >= 11 ? 2 : 5;
      for (let n = 0; n <= span; n += every) drawLines(ctx, [String(n)], X(n), b.y + band + 9, 11, withAlpha(t.text, n >= lo - 1e-6 && n <= hi + 1e-6 ? 0.72 : 0.42), "center", undefined, 500);
    }
    // the bracket: as wide as it is, hatched as a region singled out is, its two ends heavy with short serifs turned inward
    const x0 = X(lo), x1 = X(hi);
    if (x1 - x0 > 0.5) {
      const r = { x: x0, y: b.y, w: x1 - x0, h: band };
      ctx.fillStyle = withAlpha(hue, 0.08);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.6);
      ctx.stroke();
      const serif = Math.min(6, r.w / 3);
      ctx.beginPath();
      ctx.moveTo(x0 + serif, r.y); ctx.lineTo(x0, r.y); ctx.lineTo(x0, r.y + r.h); ctx.lineTo(x0 + serif, r.y + r.h);
      ctx.moveTo(x1 - serif, r.y); ctx.lineTo(x1, r.y); ctx.lineTo(x1, r.y + r.h); ctx.lineTo(x1 - serif, r.y + r.h);
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = hue;
      ctx.stroke();
    }
    // the pins: a stem through the bracket's height and a head on the line
    const pr = Math.max(3, Math.min(7, band * 0.26));
    for (const n of pins) {
      if (n < 0 || n > span) continue;
      const out = n < lo ? lo - n : n > hi ? n - hi : 0, cover = c01(1 - out * 4), passed = c01((lo - n) * 4), on = cover * (1 - passed), cx = X(n);
      ctx.beginPath();
      ctx.moveTo(cx, b.y - 3); ctx.lineTo(cx, b.y + band + 1);
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(ink, 0.5 + 0.5 * passed);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, y, pr, pr, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (passed > 0) { ctx.fillStyle = withAlpha(ink, passed); ctx.fill(); }
      if (on > 0) { ctx.fillStyle = withAlpha(hue, on); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(ink, 0.78 + 0.22 * passed);
      ctx.stroke();
    }
    caption();
  } else if (k === "arc") {
    // a stretch of the circle its box holds: from one angle round to another (degrees, 0 at the top, growing clockwise), drawn as far round as its level.
    // Given a width it is a band standing inside the circle (a slice, when it is as wide as the radius), hatched as a region singled out is
    const [from = 0, to = 270, wide = 0] = b.levels && b.levels.length > 1 ? b.levels : ARC, v = c01(b.value ?? 1), cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(1, Math.min(b.w, b.h) / 2);
    const a0 = (from * Math.PI) / 180 - Math.PI / 2, a1 = a0 + (Math.max(-360, Math.min(360, to - from)) * v * Math.PI) / 180, band = Math.min(r, Math.max(0, wide)), whole = Math.abs(a1 - a0) > Math.PI * 2 - 1e-3;
    if (Math.abs(a1 - a0) > 1e-4) {
      ctx.save();
      ctx.lineJoin = "round";
      if (band > 0) {
        const inner = r - band, own = b.tone !== "ink" && b.tone !== "muted";
        // (all the way round it has no ends: two circles, the inner one the other way so it is a hole)
        const outline = () => { ctx.beginPath(); sweep(ctx, cx, cy, r, a0, a1); if (inner > 0.5) sweep(ctx, cx, cy, inner, a1, a0, !whole); else if (!whole) ctx.lineTo(cx, cy); ctx.closePath(); };
        outline();
        if (own) { ctx.fillStyle = withAlpha(color, 0.1); ctx.fill(); }
        ctx.save();
        ctx.clip();
        hatching(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = own ? withAlpha(color, 0.7) : withAlpha(t.text, 0.36);
        ctx.stroke();
        ctx.restore();
        outline();
        ctx.lineWidth = Math.max(1, stroke * 0.75);
      } else {
        ctx.beginPath();
        sweep(ctx, cx, cy, r, a0, a1);
        ctx.lineCap = "round";
        ctx.lineWidth = stroke;
      }
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.restore();
    }
    caption();
  } else if (k === "spiral") {
    // one line that keeps winding inward past a full turn: its levels are where it starts (degrees, 0 at the top, growing clockwise), how much nearer the centre each lap sits, and its width (0 for a line);
    // its level is how many turns are drawn (1.75: a lap and three quarters). The first lap is drawn in its line, as an arc is; every lap past it in its tone (amber when it has none). Given a width it is
    // a hatched band standing inside the line, each lap closed where it meets the next. It stops short of the centre
    const [from = 0, step = 22, wide = 0] = b.levels && b.levels.length > 1 ? b.levels : SPIRAL, cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(1, Math.min(b.w, b.h) / 2), band = Math.min(r, Math.max(0, wide));
    const a0 = (from * Math.PI) / 180 - Math.PI / 2, gap = Math.max(0, step), room = gap > 0 ? (r - band - 2) / gap : Infinity, v = Math.min(Math.max(0, b.value ?? 1), Math.max(0, room));
    const past = b.tone === "ink" || b.tone === "muted" ? t.tones.amber : t.tones[b.tone], first = f?.line ? color : withAlpha(t.text, 0.85);
    const at = (u: number, d: number): [number, number] => { const rr = r - gap * u - d, a = a0 + u * Math.PI * 2; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
    const run = (u0: number, u1: number, d: number, join: boolean) => { const n = Math.max(2, Math.ceil(Math.abs(u1 - u0) * 120)); for (let i = 0; i <= n; i++) { const [x, y] = at(u0 + ((u1 - u0) * i) / n, d); if (i || join) ctx.lineTo(x, y); else ctx.moveTo(x, y); } };
    ctx.save();
    ctx.lineJoin = "round";
    for (let lap = 0; lap < Math.ceil(v - 1e-4); lap++) {
      const u0 = lap, u1 = Math.min(v, lap + 1), hue = lap ? past : first, own = lap > 0 || (b.tone !== "ink" && b.tone !== "muted" && !f?.line);
      if (band > 0) {
        const outline = () => { ctx.beginPath(); run(u0, u1, 0, false); run(u1, u0, band, true); ctx.closePath(); };
        outline();
        if (own) { ctx.fillStyle = withAlpha(hue, 0.1); ctx.fill(); }
        ctx.save();
        ctx.clip();
        hatching(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = own ? withAlpha(hue, 0.7) : withAlpha(t.text, 0.36);
        ctx.stroke();
        ctx.restore();
        outline();
        ctx.lineWidth = Math.max(1, stroke * 0.75);
      } else {
        ctx.beginPath();
        run(u0, u1, 0, false);
        ctx.lineCap = "round";
        ctx.lineWidth = stroke;
      }
      ctx.strokeStyle = hue;
      ctx.stroke();
    }
    ctx.restore();
    caption();
  } else if (k === "countdown") {
    // countdown rings: one clock face, a ring for each holder (the first nearest the centre), each drawn from the top round to when its time runs out. One full turn is its span and its levels are
    // each ring's time left, in the same units. Its level is the time elapsed: one hatched slice from the top, its leading edge a hand, eats every ring at the same speed. A ring the hand reaches is
    // gone, and its name, set at the ring's start (the top, to its left), lights and takes its new word. Its words are a caption, the word before, the word after, then each ring's name
    const lv = b.levels && b.levels.length ? b.levels.slice(0, 12) : COUNTDOWN, n = lv.length, ttl = Math.max(1e-6, b.span ?? 300), v = Math.max(0, b.value ?? 0);
    const said = b.text.split("\n"), before = said[1]?.trim() ?? "", after = said[2]?.trim() ?? "", names = said.slice(3).map((s) => s.trim());
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : withAlpha(t.text, 0.86), edge = withAlpha(t.text, 0.78), w = f?.w ?? stroke;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(8, Math.min(b.w, b.h) / 2 - 12), apart = n > 1 ? Math.min(56, (R * 0.72) / (n - 1)) : 0, reach = R + 10;
    const rad = (i: number) => R - apart * (n - 1 - i), top = -Math.PI / 2, ang = (u: number) => top + c01(u / ttl) * Math.PI * 2, e = ang(v), soon = ttl * 0.015;
    ctx.save();
    // the face: each ring's whole turn, faint, and the upright line every ring starts on
    ctx.beginPath();
    for (let i = 0; i < n; i++) { ctx.moveTo(cx + rad(i), cy); ctx.ellipse(cx, cy, rad(i), rad(i), 0, 0, Math.PI * 2); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = faint;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - reach);
    ctx.strokeStyle = withAlpha(t.text, 0.22);
    ctx.stroke();
    // the time elapsed: a hatched slice from the top round to the hand
    if (e - top > 1e-4) {
      const slice = () => { ctx.beginPath(); ctx.moveTo(cx, cy); sweep(ctx, cx, cy, reach, top, e, true); ctx.closePath(); };
      slice();
      ctx.fillStyle = withAlpha(t.text, 0.03);
      ctx.fill();
      ctx.save();
      ctx.clip();
      hatching(ctx, { x: cx - reach, y: cy - reach, w: reach * 2, h: reach * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(t.text, 0.3);
      ctx.stroke();
      ctx.restore();
    }
    // the rings: what is left of each, from the hand round to its end, with a short bar across the place it runs out
    ctx.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const r = rad(i), left = Math.min(Math.max(0, lv[i]!), ttl), a1 = ang(left), there = c01((left - v) / soon);
      if (there <= 0) continue;
      ctx.globalAlpha = there;
      ctx.beginPath();
      sweep(ctx, cx, cy, r, Math.min(e, a1), a1);
      ctx.lineWidth = w;
      ctx.strokeStyle = hue;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + (r - 6) * Math.cos(a1), cy + (r - 6) * Math.sin(a1)); ctx.lineTo(cx + (r + 6) * Math.cos(a1), cy + (r + 6) * Math.sin(a1));
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // the hand, over the rings it is eating
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + reach * Math.cos(e), cy + reach * Math.sin(e));
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = edge;
    ctx.fill();
    // each ring's start: a point at the top, open while it runs and lit once it has run out, its name to its left
    for (let i = 0; i < n; i++) {
      const r = rad(i), left = Math.min(Math.max(0, lv[i]!), ttl), out = c01((v - left) / soon + 1), py = cy - r;
      ctx.beginPath();
      ctx.ellipse(cx, py, 4, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (out > 0) { ctx.fillStyle = withAlpha(t.accent, out); ctx.fill(); }
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = out > 0.5 ? t.accent : edge;
      ctx.stroke();
      if (!showText) continue;
      const name = names[i] || String.fromCharCode(97 + (i % 26)), word = out > 0.5 ? after : before, say = word ? `${name} · ${word}` : name;
      ctx.font = fontOf(11, undefined, 500);
      const tw = ctx.measureText(say).width;
      ctx.fillStyle = t.bg;
      ctx.fillRect(cx - 12 - tw - 4, py - 8, tw + 8, 16);
      drawLines(ctx, [say], cx - 12, py, 11, out > 0.5 ? t.accent : withAlpha(t.text, 0.62), "right", undefined, 500);
    }
    ctx.restore();
    caption();
  } else if (k === "fingerprint") {
    // a fingerprint: a small square of four by four cells whose pattern comes from its words (or from its levels, sixteen cells row by row, when it has them), so two fingerprints of the same words
    // look the same and different words look plainly different. A set cell is filled in ink. Its level is how lit it is, 0 to 1, while it is being compared: tinted, its edge heavier, its cells in
    // the accent. Given a tone (green when it matches, red when it does not) its edge and cells take it, lit or not. Its words, the caption, are what it is a fingerprint of
    const lv = b.levels && b.levels.length >= 16 ? b.levels : fingerprintBits(b.text), on = c01(b.value ?? 0), own = b.tone !== "ink" && b.tone !== "muted";
    const hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const s = Math.max(4, Math.min(b.w, b.h)), x0 = b.x + (b.w - s) / 2, y0 = b.y + (b.h - s) / 2, cs = s / 4, inset = Math.max(1, cs * 0.12);
    const sq = { x: x0, y: y0, w: s, h: s };
    rounded(ctx, sq, 3);
    ctx.fillStyle = t.bg;
    ctx.fill();
    if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
    // the grid between the cells, quiet
    ctx.beginPath();
    for (let i = 1; i < 4; i++) { ctx.moveTo(x0 + i * cs, y0); ctx.lineTo(x0 + i * cs, y0 + s); ctx.moveTo(x0, y0 + i * cs); ctx.lineTo(x0 + s, y0 + i * cs); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.14);
    ctx.stroke();
    // the pattern: ink, in its tone once it has one, in the accent (or its tone) as it lights
    const ink = own ? color : withAlpha(t.text, 0.78);
    for (let i = 0; i < 16; i++) {
      const v = c01(lv[i] ?? 0);
      if (v < 0.001) continue;
      const c = i % 4, r = Math.floor(i / 4), g = (cs - 2 * inset) * v, cx = x0 + c * cs + cs / 2, cy = y0 + r * cs + cs / 2;
      rounded(ctx, { x: cx - g / 2, y: cy - g / 2, w: g, h: g }, 1.5);
      ctx.fillStyle = ink;
      ctx.fill();
      if (on > 0 && !own) { ctx.fillStyle = withAlpha(hue, on); ctx.fill(); }
    }
    rounded(ctx, sq, 3);
    ctx.lineWidth = w;
    ctx.strokeStyle = own ? color : edge;
    ctx.stroke();
    if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
    caption();
  } else if (k === "callstack") {
    // a call stack: a column of frames from the bottom up (main first), each a slab welded of its name's part and its named slots, as segments are. Its level is how deep the stack is: frame i
    // (from 0) is there as far as the level is past i, so set with `over` a frame is pushed, dropping onto the one under it as it comes in, or popped, lifting off and fading. Above the top the
    // stack is free: each place a frame could stand is a faint dashed outline, so a wire still landing on a popped slot lands on nothing. The running frame (the top) is named in the accent (or its
    // own colour), and so is each lit slot, tinted
    const P = stackPlaces(b), n = P.frames.length, v = Math.min(n, Math.max(0, b.value ?? 0)), run = Math.round(v) - 1, own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent;
    ctx.save();
    P.frames.forEach((fr, i) => {
      const p = c01(v - i), r = { x: b.x, y: fr.y, w: b.w, h: fr.h };
      if (p < 0.999) {
        // free stack: where a frame would stand
        ctx.save(); rounded(ctx, r, 10); ctx.globalAlpha *= 1 - p; ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.26); ctx.setLineDash([4, 4]); ctx.stroke(); ctx.restore();
      }
      if (p <= 0.001) return;
      const box = { kind: "segments" as const, x: b.x, y: fr.y - (1 - p) * P.pitch * 0.6, w: b.w, h: fr.h, text: [fr.name, ...fr.slots.map((s) => s.name)].join("\n"), levels: [fr.nameW, ...fr.slots.map((s) => s.w)] };
      const path = () => (b.w < 26 || fr.h < 24 ? rounded(ctx, box, Math.min(6, b.w / 2, fr.h / 2)) : kindPath(ctx, box));
      ctx.save();
      ctx.globalAlpha *= c01(p * 1.6);
      path(); ctx.fillStyle = t.bg; ctx.fill(); paper();
      const tint = (x: number, w: number, c: string) => { ctx.save(); path(); ctx.clip(); ctx.fillStyle = c; ctx.fillRect(x, box.y, w, box.h); ctx.restore(); };
      // the name's part a shade apart from the slots, as a header is
      if (fr.slots.length) tint(b.x, fr.nameW, withAlpha(t.text, 0.035));
      fr.slots.forEach((s) => { if (s.lit > 0.001) tint(s.x, s.w, withAlpha(hue, 0.12 * s.lit)); });
      ctx.beginPath();
      for (const s of fr.slots) if (box.h > 2 * NOTCH_D + 6) { ctx.moveTo(s.x, box.y + NOTCH_D + 2); ctx.lineTo(s.x, box.y + box.h - NOTCH_D - 2); }
      ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(color, 0.3); ctx.stroke();
      if (showText) {
        const fit = (s: string, room: number, max: number, fw: number) => { let fs = Math.min(max, box.h * 0.32); ctx.font = fontOf(fs, 0.02, fw); const tw = ctx.measureText(s).width + s.length * fs * 0.02; if (tw > room - 16) fs = Math.max(8, fs * ((room - 16) / tw)); return fs; };
        const top = i === run;
        if (fr.name) drawLines(ctx, [fr.name], b.x + fr.nameW / 2, box.y + box.h / 2, fit(fr.name, fr.nameW, 14, 500), top ? hue : withAlpha(t.text, 0.62), "center", 0.02, 500);
        for (const s of fr.slots) if (s.name) drawLines(ctx, [s.name], s.x + s.w / 2, box.y + box.h / 2, fit(s.name, s.w, 15, 400), s.lit >= 0.5 ? hue : withAlpha(t.text, 0.9), "center", 0.02, s.lit >= 0.5 ? 500 : 400);
      }
      path(); line(f?.w ?? stroke);
      ctx.restore();
    });
    ctx.restore();
    caption();
  } else if (k === "wedge") {
    // a wedge: one slice of a ring band, from one angle round to another (degrees, 0 at the top, clockwise), cut across by rings at the radii its levels give (to scale, the last on the box's
    // edge; the first is its inner edge, 0 for a point). It grows outward, not round: its level is how many rings it has reached past the first (part way: part way across the next band). The slice
    // from its inner edge out to its front is hatched in its tone (ink when it has none) and outlined; the rings it has passed are drawn in it, the ring it rests on lit; the rings and edges still
    // ahead of it are faint, so the way it will grow shows before it does
    const lv = b.levels && b.levels.length > 3 ? b.levels : WEDGE, from = lv[0] ?? 0, to = lv[1] ?? 60;
    const rs = lv.slice(2, 15).map((r) => Math.max(0, r)).sort((p, q) => p - q), n = rs.length - 1, M = Math.max(1e-6, ...rs), v = Math.min(Math.max(0, n), Math.max(0, b.value ?? 0));
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : withAlpha(t.text, 0.86), w = f?.w ?? stroke, near = 0.05;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = Math.max(1, Math.min(b.w, b.h) / 2) / M;
    const a0 = (from * Math.PI) / 180 - Math.PI / 2, a1 = a0 + (Math.max(-360, Math.min(360, to - from)) * Math.PI) / 180, whole = Math.abs(a1 - a0) > Math.PI * 2 - 1e-3;
    const i0 = Math.max(0, Math.min(n - 1, Math.floor(v))), inner = rs[0]! * s, fr = n > 0 ? (rs[i0]! + (rs[i0 + 1]! - rs[i0]!) * (v - i0)) * s : inner;
    // (all the way round it has no edges: two circles, the inner one the other way so it is a hole)
    const slice = (r0: number, r1: number) => { ctx.beginPath(); sweep(ctx, cx, cy, r1, a0, a1); if (whole) ctx.closePath(); if (r0 > 0.5) sweep(ctx, cx, cy, r0, a1, a0, !whole); else if (!whole) ctx.lineTo(cx, cy); ctx.closePath(); };
    const ringAt = (r: number) => { ctx.beginPath(); sweep(ctx, cx, cy, r, a0, a1); };
    ctx.save();
    ctx.lineJoin = "round";
    // the ground it will grow over: its outline and its rings, faint
    slice(inner, rs[n]! * s);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(t.text, 0.26);
    ctx.stroke();
    for (let i = 1; i < n; i++) { ringAt(rs[i]! * s); ctx.stroke(); }
    // what it has reached: hatched from its inner edge out to its front
    if (fr - inner > 0.5) {
      slice(inner, fr);
      ctx.fillStyle = own ? withAlpha(color, 0.1) : withAlpha(t.text, 0.03);
      ctx.fill();
      ctx.save();
      ctx.clip();
      hatching(ctx, { x: cx - fr, y: cy - fr, w: fr * 2, h: fr * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = own ? withAlpha(color, 0.7) : withAlpha(t.text, 0.36);
      ctx.stroke();
      ctx.restore();
      slice(inner, fr);
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = hue;
      ctx.stroke();
    }
    // the rings: in its tone once passed, lit where it rests
    for (let i = 1; i <= n; i++) {
      const p = c01((v - i) / near + 1), a = 1 - c01(Math.abs(v - i) / near);
      if (p <= 0 && a <= 0) continue;
      ringAt(rs[i]! * s);
      ctx.lineCap = "round";
      if (p > 0) { ctx.globalAlpha = p; ctx.lineWidth = w; ctx.strokeStyle = hue; ctx.stroke(); }
      if (a > 0) { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = t.accent; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    caption();
  } else if (k === "ripple") {
    // a ripple: concentric rings about one centre, each as far out as its level says (to scale, the largest on the box's edge), and a front that grows out through them. Its level is the radius the
    // front has reached, in the rings' units. A ring the front has passed is drawn in the mark's tone (ink when it has none); the ring the front rests on is lit; rings not yet reached are faint.
    // The band between the last ring passed and the front is hatched: the stretch it is crossing now. Each ring is named where it crosses one upright ray, in the band outside it (inside it when that
    // band is too thin to hold the name), so even small inner rings keep names that never touch a neighbour. Its words are a caption, then each ring's name; its unit, when it has one, says the
    // front's reach under it
    const lv = (b.levels && b.levels.length ? b.levels.slice(0, 12) : RIPPLE).map((r) => Math.max(0, r)), n = lv.length, M = Math.max(1e-6, ...lv), v = Math.min(M, Math.max(0, b.value ?? 0));
    const names = b.text.split("\n").slice(1).map((s) => s.trim()), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : withAlpha(t.text, 0.86), edge = withAlpha(t.text, 0.78), w = f?.w ?? stroke;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(8, Math.min(b.w, b.h) / 2 - 12), s = R / M, fr = v * s, near = M * 0.02, reach = R + 10;
    const passed = (i: number) => c01((v - lv[i]!) / near), at = (i: number) => 1 - c01(Math.abs(v - lv[i]!) / near);
    const inner = lv.reduce((m, r) => (r < v - M * 0.002 && r > m ? r : m), 0) * s;
    ctx.save();
    // the ray every ring is named on
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - reach);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(t.text, 0.22);
    ctx.stroke();
    // the band the front is crossing: hatched from the last ring passed out to the front
    if (fr - inner > 0.5) {
      const band = () => { ctx.beginPath(); sweep(ctx, cx, cy, fr, 0, Math.PI * 2); ctx.closePath(); if (inner > 0.5) { sweep(ctx, cx, cy, inner, Math.PI * 2, 0); ctx.closePath(); } };
      band();
      ctx.fillStyle = withAlpha(t.text, 0.03);
      ctx.fill();
      ctx.save();
      ctx.clip();
      hatching(ctx, { x: cx - fr, y: cy - fr, w: fr * 2, h: fr * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(t.text, 0.3);
      ctx.stroke();
      ctx.restore();
    }
    // the front
    if (fr > 0.5) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, fr, fr, 0, 0, Math.PI * 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
    // the rings: faint ahead of the front, in its tone once passed, lit where it rests
    for (let i = 0; i < n; i++) {
      const r = lv[i]! * s, p = passed(i), a = at(i);
      if (r < 0.5) continue;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(t.text, 0.26);
      ctx.stroke();
      if (p > 0) { ctx.globalAlpha = p; ctx.lineWidth = w; ctx.strokeStyle = hue; ctx.stroke(); }
      if (a > 0) { ctx.globalAlpha = a; ctx.lineWidth = w; ctx.strokeStyle = t.accent; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    // the centre it spreads from
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3.5, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = edge;
    ctx.fill();
    if (showText) {
      ctx.font = fontOf(11, undefined, 500);
      const order = lv.map((r, i) => [r, i] as const).sort((p, q) => p[0] - q[0]), room = 18;
      for (let j = 0; j < order.length; j++) {
        const [r0, i] = order[j]!, r = r0 * s, out = j + 1 < order.length ? order[j + 1]![0] * s - r : Infinity, inn = r - (j > 0 ? order[j - 1]![0] * s : 0);
        const p = passed(i), a = at(i), name = names[i] || String.fromCharCode(97 + (i % 26)), tw = ctx.measureText(name).width;
        // above the ring when the band outside it holds the name, else below it, inside
        const py = out >= room || inn < room ? cy - r - 10 : cy - r + 10;
        ctx.fillStyle = t.bg;
        ctx.fillRect(cx - tw / 2 - 4, py - 7, tw + 8, 14);
        drawLines(ctx, [name], cx, py, 11, a > 0.5 ? t.accent : p > 0.5 ? (own ? color : withAlpha(t.text, 0.86)) : withAlpha(t.text, 0.62), "center", undefined, 500);
      }
      // the front's reach, under it
      if (b.unit && fr > 0.5) {
        const say = `${Math.round(v * 10) / 10} ${b.unit}`, tw = ctx.measureText(say).width, py = cy + fr + 10;
        ctx.fillStyle = t.bg;
        ctx.fillRect(cx - tw / 2 - 4, py - 7, tw + 8, 14);
        drawLines(ctx, [say], cx, py, 11, edge, "center", undefined, 500);
      }
    }
    ctx.restore();
    caption();
  } else if (k === "orbit") {
    // an orbit: riders on a circle that turns. Its levels are the gate they board at and the gate they step off at (degrees, 0 at the top, growing clockwise; off past on, as far round as they ride),
    // how far it turns a second (degrees), then each rider's boarding time (seconds). Its level is the time: a rider has gone round (time − boarding) × speed from the gate it boarded at, so set with
    // `over` every rider sweeps round the arc. The stretch they ride is hatched just outside the rim, each gate a bar across it with its name beyond; spokes on the rim turn with it. A rider is there
    // from its gate on to the gate off, fading as it steps past; the newest aboard is lit (the accent, or the colour it is given). Its words are a caption, the count's word (said in the middle after
    // how many are aboard), then the gates' names
    const lv = b.levels && b.levels.length >= 3 ? b.levels : ORBIT, on0 = lv[0]!, ride = Math.max(0, Math.min(360, lv[1]! - on0 < 0 ? lv[1]! - on0 + 360 : lv[1]! - on0)), speed = lv[2]!, v = b.value ?? 0;
    const rides = lv.slice(3, 3 + 64), said = b.text.split("\n"), word = said[1]?.trim() ?? "", gin = said[2]?.trim() ?? "", gout = said[3]?.trim() ?? "";
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, ink = withAlpha(t.text, 0.86), edge = withAlpha(t.text, 0.62), w = f?.w ?? Math.max(1, stroke * 0.75);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(12, Math.min(b.w, b.h) / 2 - 28), r0 = R + 8, r1 = R + 22, A = (deg: number) => (deg * Math.PI) / 180 - Math.PI / 2;
    const P = (deg: number, r: number): [number, number] => [cx + r * Math.cos(A(deg)), cy + r * Math.sin(A(deg))];
    ctx.save();
    ctx.lineJoin = "round";
    // the stretch they ride: a hatched band just outside the rim, from the gate on round to the gate off
    if (ride > 0.5) {
      const a0 = A(on0), a1 = A(on0 + ride), whole = ride > 359.5;
      const outline = () => { ctx.beginPath(); sweep(ctx, cx, cy, r1, a0, a1); sweep(ctx, cx, cy, r0, a1, a0, !whole); ctx.closePath(); };
      outline();
      if (own) { ctx.fillStyle = withAlpha(color, 0.08); ctx.fill(); }
      ctx.save();
      ctx.clip();
      hatching(ctx, { x: cx - r1, y: cy - r1, w: r1 * 2, h: r1 * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = own ? withAlpha(color, 0.6) : withAlpha(t.text, 0.36);
      ctx.stroke();
      ctx.restore();
      outline();
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
    // the rim, and a spoke every 30° on it that turns with the wheel
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R, 0, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    ctx.beginPath();
    const turn = (((v * speed) % 360) + 360) % 360;
    for (let s = 0; s < 12; s++) { const [ax, ay] = P(turn + s * 30, R - 7), [bx, by] = P(turn + s * 30, R); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = withAlpha(t.text, 0.3);
    ctx.stroke();
    // the gates: a heavy bar across rim and band, each named beyond it
    const gate = (deg: number, name: string) => {
      const [ax, ay] = P(deg, R - 10), [bx, by] = P(deg, r1 + 6);
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1.5, stroke);
      ctx.strokeStyle = ink;
      ctx.stroke();
      if (!name || !showText) return;
      const s = Math.sin(A(deg) + Math.PI / 2), [nx, ny] = P(deg, r1 + 22);
      drawLines(ctx, [name], nx, ny, 12, withAlpha(t.text, 0.78), s > 0.35 ? "left" : s < -0.35 ? "right" : "center", undefined, 500);
    };
    gate(on0, gin);
    gate(on0 + ride, gout);
    // the riders: each its way round from the gate on, there until it steps past the gate off; the newest aboard lit
    const gone = (b0: number) => (v - b0) * speed, aboard = rides.filter((b0) => gone(b0) >= -1e-6 && gone(b0) < ride - 1e-6);
    const newest = aboard.length ? Math.max(...aboard) : NaN;
    for (const b0 of rides) {
      const g = gone(b0), there = c01(g / 4 + 1) * c01(1 - (g - ride) / 6);
      if (there <= 0.001) continue;
      const [x, y] = P(on0 + Math.max(0, g), R), lit = b0 === newest;
      ctx.globalAlpha = there;
      ctx.beginPath();
      ctx.ellipse(x, y, 9.5, 9.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, 7, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit ? hue : withAlpha(t.text, 0.86);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // how many are aboard, in the middle
    if (word && showText) drawLines(ctx, [`${aboard.length} ${word}`], cx, cy, 22, ink, "center", undefined, 700);
    ctx.restore();
    caption();
  } else if (k === "lattice") {
    // a grid of crossings set out from two sequences, the first line of its words across its top and the second down its side (a letter a place, or words split at spaces);
    // a free cell carries a diagonal. Its levels are how many free cells are told (−1: the cells where the two agree), those cells [i, j], then a path along the crossings [i, j];
    // its level is how many steps of the path are drawn (a part of one grows the next). A step that costs (across, down, or a diagonal through a cell that is not free) is heavier than a free one
    const lines = b.text.split("\n"), data = lines.length >= 2, seq = (s: string) => (s.trim().includes(" ") ? s.trim().split(/\s+/) : [...s.trim()]);
    // (given no sequences of its own: BEAD across, BED down)
    const across = data ? seq(lines[0]!) : ["B", "E", "A", "D"], down = data ? seq(lines[1]!) : ["B", "E", "D"];
    const n = Math.max(1, across.length), m = Math.max(1, down.length), pw = b.w / n, ph = b.h / m, X = (i: number) => b.x + i * pw, Y = (j: number) => b.y + j * ph;
    const lv = b.levels ?? [], told = lv.length ? Math.round(lv[0]!) : -1, free = new Set<string>(), at = (i: number, j: number) => i + "," + j;
    if (told < 0) { for (let i = 0; i < across.length; i++) for (let j = 0; j < down.length; j++) if (across[i] === down[j]) free.add(at(i, j)); }
    else for (let q = 0; q < told; q++) free.add(at(Math.round(lv[1 + 2 * q] ?? -1), Math.round(lv[2 + 2 * q] ?? -1)));
    const rest = lv.slice(told < 0 ? 1 : 1 + 2 * told), way: [number, number][] = [];
    for (let q = 0; q + 1 < rest.length; q += 2) way.push([Math.min(n, Math.max(0, Math.round(rest[q]!))), Math.min(m, Math.max(0, Math.round(rest[q + 1]!)))]);
    if (!lv.length) {
      // (given no path either: corner to corner, taking a free diagonal where there is one and stepping toward the next free cell where there is not)
      let i = 0, j = 0;
      way.push([0, 0]);
      while (i < n || j < m) {
        if (i < n && j < m && free.has(at(i, j))) { i++; j++; } else if (i < n && free.has(at(i + 1, j))) i++; else if (j < m && free.has(at(i, j + 1))) j++; else if (i < n && j < m) { i++; j++; } else if (i < n) i++; else j++;
        way.push([i, j]);
      }
    }
    const v = Math.min(Math.max(0, way.length - 1), Math.max(0, b.value ?? 0)), now = v > 0 ? Math.min(way.length - 2, Math.ceil(v) - 1) : -1;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // the grid it is set out on, quiet; the free diagonals a step stronger
    ctx.beginPath();
    for (let i = 0; i <= n; i++) { ctx.moveTo(X(i), b.y); ctx.lineTo(X(i), b.y + b.h); }
    for (let j = 0; j <= m; j++) { ctx.moveTo(b.x, Y(j)); ctx.lineTo(b.x + b.w, Y(j)); }
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.24);
    ctx.stroke();
    ctx.beginPath();
    for (const c of free) { const [i = -1, j = -1] = c.split(",").map(Number); if (i >= 0 && j >= 0 && i < n && j < m) { ctx.moveTo(X(i), Y(j)); ctx.lineTo(X(i + 1), Y(j + 1)); } }
    ctx.strokeStyle = withAlpha(t.text, 0.5);
    ctx.stroke();
    // the path, as far as it has got: paid steps heavy, free ones light, a point at each crossing it has passed
    let hx = way.length ? X(way[0]![0]) : b.x, hy = way.length ? Y(way[0]![1]) : b.y;
    for (let s = 0; s < now + 1; s++) {
      const [i0, j0] = way[s]!, [i1, j1] = way[s + 1]!, g = c01(v - s), paid = !(i1 !== i0 && j1 !== j0 && free.has(at(Math.min(i0, i1), Math.min(j0, j1))));
      hx = X(i0) + (X(i1) - X(i0)) * g; hy = Y(j0) + (Y(j1) - Y(j0)) * g;
      ctx.beginPath();
      ctx.moveTo(X(i0), Y(j0)); ctx.lineTo(hx, hy);
      ctx.lineWidth = paid ? stroke * 1.75 : Math.max(1, stroke * 0.75);
      ctx.strokeStyle = lit;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(X(i0), Y(j0), Math.max(2.5, stroke * 1.25), Math.max(2.5, stroke * 1.25), 0, 0, Math.PI * 2);
      ctx.fillStyle = lit;
      ctx.fill();
    }
    // where it stands: a ring on its paper, at the head of the path (at its start before it moves)
    if (way.length) {
      const r = Math.max(4, stroke * 2.5);
      ctx.beginPath();
      ctx.ellipse(hx, hy, r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = lit;
      ctx.stroke();
    }
    ctx.restore();
    if (showText) {
      // the sequences, a place each: the ones the step under way takes are lit
      const step: [[number, number], [number, number]] | null = now >= 0 ? [way[now]!, way[now + 1]!] : null, size = Math.min(15, Math.max(10, Math.min(pw, ph) * 0.3));
      const takes = (axis: 0 | 1, q: number) => !!step && step[0][axis] !== step[1][axis] && Math.min(step[0][axis], step[1][axis]) === q;
      across.forEach((c, i) => drawLines(ctx, [c], X(i) + pw / 2, b.y - 16, size, takes(0, i) ? lit : withAlpha(t.text, 0.82), "center", undefined, 500));
      down.forEach((c, j) => drawLines(ctx, [c], b.x - 16, Y(j) + ph / 2, size, takes(1, j) ? lit : withAlpha(t.text, 0.82), "center", undefined, 500));
      // (its name, when its words are not its sequences, goes under it: over it stand the letters)
      if (!data && b.text) drawVoiced(ctx, b.text, { ...spot, y: b.y + b.h + 10 }, withAlpha(t.text, 0.62));
    }
  } else if (k === "cells") {
    // a row of equal square cells welded into one thing: its levels say how far each cell is set (hatched in from the bottom up, as a region singled out is) and then how far each is lit;
    // its level is the one cell being read, from 1 (0: none; a part of one: between two). A lit cell takes the accent, or the colour the row is given
    const { n, size, pitch } = cellPlaces(b), lv = b.levels && b.levels.length ? b.levels : CELLS, v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted";
    const hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    for (let i = 0; i < n; i++) {
      const r = { x: b.x + i * pitch, y: b.y, w: size, h: size }, set = c01(lv[i] ?? 0), on = Math.max(c01(lv[n + i] ?? 0), v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0);
      rounded(ctx, r, 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      if (set > 0.001) {
        const s = { x: r.x, y: r.y + size * (1 - set), w: size, h: size * set };
        hatching(ctx, s, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        // (where it has got to, while it is being set)
        if (set < 0.999) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w, s.y); }
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
      // dirty (the third run of its levels): a small filled flag folded into the top right corner, on a cell that is set; it grows in and fades out as its level does
      const dirty = c01(lv[2 * n + i] ?? 0) * c01(set * 4);
      if (dirty > 0.001) {
        const s = Math.max(6, size * 0.3) * (0.6 + 0.4 * dirty), inset = Math.max(1, w * 0.5);
        ctx.beginPath();
        ctx.moveTo(r.x + size - inset - s, r.y + inset);
        ctx.lineTo(r.x + size - inset - 1.5, r.y + inset);
        ctx.quadraticCurveTo(r.x + size - inset, r.y + inset, r.x + size - inset, r.y + inset + 1.5);
        ctx.lineTo(r.x + size - inset, r.y + inset + s);
        ctx.closePath();
        ctx.fillStyle = withAlpha(hue, dirty);
        ctx.fill();
      }
    }
    caption();
  } else if (k === "tokens") {
    // named tokens on a scale: a quiet line from its first number (the left end) to its last (the right), a tick at either end, and a token standing at each number its levels give, after the
    // first two, named by the lines of its words after the first. A token is a small plate with its name in it, its foot on the line at its number (a tick marks the very place). Tokens whose plates
    // would collide stack into a pile there, the later on top: each rides up on the earlier ones it meets, as far as it overlaps them, so when a cut moves them they glide and a pile settles as it parts.
    // Its level is how many have come in, in order: a part of one drops the next in from above. The newest in is lit, in the accent (or the colour it is given) until the next comes; past the last, none
    const lv = b.levels && b.levels.length >= 3 ? b.levels : TOKENS, lo = lv[0]!, hi = lv[1]! === lo ? lo + 1 : lv[1]!, at = lv.slice(2, 66), n = at.length, v = Math.max(0, b.value ?? n);
    const given = b.text.split("\n").slice(1), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const base = b.y + b.h - 4, th = Math.max(12, Math.min(22, (b.h - 8) / 3)), fs = Math.min(11, th * 0.52), gap = 2, X = (q: number) => b.x + c01((q - lo) / (hi - lo)) * b.w;
    // the scale
    ctx.beginPath();
    ctx.moveTo(b.x, base); ctx.lineTo(b.x + b.w, base);
    ctx.moveTo(b.x, base - 4); ctx.lineTo(b.x, base + 4); ctx.moveTo(b.x + b.w, base - 4); ctx.lineTo(b.x + b.w, base + 4);
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.36);
    ctx.stroke();
    ctx.font = fontOf(fs, undefined, 500);
    const names = at.map((_, i) => given[i]?.trim() || String.fromCharCode(97 + (i % 26)));
    const wide = names.map((s) => Math.max(th, Math.ceil(ctx.measureText(s).width) + 12));
    const come = (i: number) => c01(v - i), cx = at.map((q, i) => Math.max(b.x + wide[i]! / 2, Math.min(b.x + b.w - wide[i]! / 2, X(q)))), lift: number[] = [];
    for (let i = 0; i < n; i++) {
      // (riding up on each earlier token it meets, as far as their plates overlap, so a pile grows and parts smoothly)
      let up = 0;
      for (let j = 0; j < i; j++) {
        if (come(j) <= 0) continue;
        const ov = Math.min(cx[i]! + wide[i]! / 2, cx[j]! + wide[j]! / 2) - Math.max(cx[i]! - wide[i]! / 2, cx[j]! - wide[j]! / 2) + gap;
        up = Math.max(up, c01(ov / 6) * (lift[j]! + th + gap));
      }
      lift.push(up);
    }
    // where each stands on the scale
    ctx.beginPath();
    for (let i = 0; i < n; i++) if (come(i) > 0) { const x = X(at[i]!); ctx.moveTo(x, base - 3); ctx.lineTo(x, base + 3); }
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = withAlpha(t.text, 0.6);
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const c = come(i);
      if (c <= 0) continue;
      const on = c * (1 - come(i + 1)), q = c01(c / 0.7), rest = base - 3 - lift[i]! - th, from = rest - 28, y = from + (rest - from) * q * q, a = c01(c * 3);
      const r = { x: cx[i]! - wide[i]! / 2, y, w: wide[i]!, h: th };
      rounded(ctx, r, 3);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      if (own && on < 1) { ctx.fillStyle = withAlpha(color, 0.1 * a); ctx.fill(); }
      if (on > 0) { ctx.fillStyle = withAlpha(hue, on * a); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = withAlpha(on > 0.5 ? hue : edge, a);
      ctx.stroke();
      if (showText) {
        if (on < 1) drawLines(ctx, [names[i]!], cx[i]!, y + th / 2 + 0.5, fs, withAlpha(own ? color : t.text, 0.86 * a * (1 - on)), "center", undefined, 500);
        if (on > 0) drawLines(ctx, [names[i]!], cx[i]!, y + th / 2 + 0.5, fs, withAlpha(t.bg, a * on), "center", undefined, 500);
      }
    }
    caption();
  } else if (k === "break") {
    // a break: a torn edge down across a strip (or a row of cells) at one place, standing a little past it above and below, its words (if any) over its top. Its level is how far it has gone:
    // 0 to 1 the tear draws down from the top in red, the strip parted either side of it by a narrow gap of ground; 1 to 2 it settles once the gap is filled, the gap closing and the red
    // going over to a quiet ink seam. Given a colour of its own, it tears in that colour instead of red
    const v = Math.max(0, b.value ?? 0), down = c01(v), mend = c01(v - 1), own = b.tone !== "ink" && b.tone !== "muted";
    const torn = own ? color : t.tones.red, cx = b.x + b.w / 2;
    if (down > 0) {
      const amp = Math.min(4.5, b.w / 3), n = Math.max(4, Math.round(b.h / 9)), gap = 2.5 * (1 - mend), end = b.y + b.h * down;
      // the jagged line, as far down as it has got (cut short part-way through a tooth)
      const pts: [number, number][] = [];
      for (let i = 0; i <= n; i++) {
        const y = b.y + (b.h * i) / n, x = i === 0 || i === n ? cx : cx + (i % 2 ? amp : -amp);
        if (y <= end || i === 0) { pts.push([x, y]); continue; }
        const [px, py] = pts[pts.length - 1]!, q = (end - py) / (y - py);
        pts.push([px + (x - px) * q, end]);
        break;
      }
      const edge = (d: number) => { ctx.moveTo(pts[0]![0] + d, pts[0]![1]); for (const p of pts.slice(1)) ctx.lineTo(p[0] + d, p[1]); };
      // the ground showing through where it is parted
      if (gap > 0.05) {
        ctx.beginPath();
        ctx.moveTo(pts[0]![0] - gap, pts[0]![1]);
        for (const p of pts.slice(1)) ctx.lineTo(p[0] - gap, p[1]);
        for (const p of [...pts].reverse()) ctx.lineTo(p[0] + gap, p[1]);
        ctx.closePath();
        ctx.fillStyle = t.bg;
        ctx.fill();
      }
      ctx.beginPath();
      if (gap > 0.05) { edge(-gap); edge(gap); } else edge(0);
      ctx.lineWidth = Math.max(1.5, stroke) + (Math.max(1, stroke * 0.75) - Math.max(1.5, stroke)) * mend;
      ctx.lineJoin = "round";
      if (mend < 1) { ctx.strokeStyle = withAlpha(torn, 1 - mend); ctx.stroke(); }
      if (mend > 0) { ctx.strokeStyle = withAlpha(t.text, 0.55 * mend); ctx.stroke(); }
      ctx.lineJoin = "miter";
    }
    if (b.text && showText && down > 0) {
      const name = b.text.split("\n")[0]!, a = c01(down * 3);
      if (mend < 1) drawLines(ctx, [name], cx, b.y - 10, 11, withAlpha(torn, a * (1 - mend)), "center", undefined, 500);
      if (mend > 0) drawLines(ctx, [name], cx, b.y - 10, 11, withAlpha(t.text, 0.62 * a * mend), "center", undefined, 500);
    }
  } else if (k === "jaws") {
    // jaws: a scale of equal square positions (as a row of cells is drawn) with a lower and an upper jaw standing on it. Its levels are where the two jaws stand (positions, from 0), where the probe
    // stands, then how lit it is. A jaw is a heavy upright face at its position's inner edge, carried down to a small named tab under the position (its words' second and third lines name them);
    // every position at or outside a jaw is hatched, so as a jaw slides in the hatching follows it, cell by cell. The probe is a lit frame between them, in the accent (or the colour it is given),
    // and a measure between the two tabs counts the positions left between the jaws (its words' fourth line says what: "left"), fading out once they meet
    const n = Math.max(1, Math.min(256, Math.round(b.span ?? 9))), lv = b.levels && b.levels.length >= 4 ? b.levels : JAWS, own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent;
    const edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), th = 22, size = Math.max(4, Math.min(b.h - 44, b.w / n)), pitch = n > 1 ? (b.w - size) / (n - 1) : 0;
    const lo = Math.max(0, Math.min(n - 1, lv[0]!)), hi = Math.max(lo, Math.min(n - 1, lv[1]!)), probe = lv[2]!, lit = c01(lv[3]!), given = b.text.split("\n");
    const names = [given[1]?.trim() || "lo", given[2]?.trim() || "hi"], word = given[3]?.trim() || "left", g = Math.min(3, Math.max(0, (pitch - size) / 2));
    const loFace = b.x + lo * pitch + size + g, hiFace = b.x + hi * pitch - g, ty = b.y + size + 12;
    // the positions, hatched outside the jaws (in from the outer side, as far as each jaw has come)
    for (let i = 0; i < n; i++) {
      const r = { x: b.x + i * pitch, y: b.y, w: size, h: size }, inLo = c01(lo + 1 - i), inHi = c01(i - hi + 1);
      rounded(ctx, r, 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      for (const [a, right] of [[inLo, 0], [inHi, 1]] as const) {
        if (a <= 0.001) continue;
        const s = { x: right ? r.x + size * (1 - a) : r.x, y: r.y, w: size * a, h: size };
        hatching(ctx, s, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        if (a < 0.999) { const ex = right ? s.x : s.x + s.w; ctx.moveTo(ex, s.y); ctx.lineTo(ex, s.y + s.h); }
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(t.text, 0.36);
        ctx.stroke();
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
    // the probe: a lit frame over the position it stands at
    if (lit > 0.001) {
      const r = { x: b.x + Math.max(0, Math.min(n - 1, probe)) * pitch, y: b.y, w: size, h: size };
      rounded(ctx, r, 2);
      ctx.fillStyle = withAlpha(hue, 0.12 * lit);
      ctx.fill();
      ctx.lineWidth = stroke * 1.25;
      ctx.strokeStyle = withAlpha(hue, lit);
      ctx.stroke();
    }
    // the measure between the tabs, counting what is left
    const left = Math.max(0, Math.round(hi - lo - 1)), m = c01(hi - lo - 1), my = ty + th / 2, mx0 = loFace + 8, mx1 = hiFace - 8;
    if (m > 0.001 && mx1 - mx0 > 8) {
      ctx.beginPath();
      ctx.moveTo(mx0, my); ctx.lineTo(mx1, my);
      ctx.moveTo(mx0, my - 5); ctx.lineTo(mx0, my + 5); ctx.moveTo(mx1, my - 5); ctx.lineTo(mx1, my + 5);
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(t.text, 0.62 * m);
      ctx.stroke();
      if (showText && left > 0) {
        const say = `${left} ${word}`;
        ctx.font = fontOf(11, undefined, 500);
        const tw = ctx.measureText(say).width + 12, cx = (mx0 + mx1) / 2;
        if (tw <= mx1 - mx0 - 14) {
          ctx.fillStyle = t.bg;
          ctx.fillRect(cx - tw / 2, my - 9, tw, 18);
          drawLines(ctx, [say], cx, my + 0.5, 11, withAlpha(t.text, 0.72 * m), "center", undefined, 500);
        }
      }
    }
    // the jaws: a heavy face at each inner edge, carried down to its named tab
    ctx.font = fontOf(11, undefined, 500);
    ([[loFace, -1, names[0]!], [hiFace, 1, names[1]!]] as const).forEach(([x, side, name]) => {
      const tw = Math.max(size, Math.ceil(ctx.measureText(name).width) + 20), r = { x: side < 0 ? x - tw : x, y: ty, w: tw, h: th };
      ctx.beginPath();
      ctx.moveTo(x, b.y - 5); ctx.lineTo(x, ty);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(stroke * 1.5, w * 2);
      ctx.strokeStyle = edge;
      ctx.stroke();
      ctx.lineCap = "butt";
      rounded(ctx, r, th / 2 - 4);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (own) { ctx.fillStyle = withAlpha(color, 0.1); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (showText) drawLines(ctx, [name], r.x + tw / 2, ty + th / 2 + 0.5, 11, withAlpha(t.text, 0.86), "center", undefined, 500);
    });
    caption();
  } else if (k === "spans") {
    // spans: rows of floating ranges on one shared value scale, with a band laid across every row. Its levels are the scale's first and last numbers, the band [lo, hi], then each row's range
    // [from, to]; its words are a caption, the band's name, then each row's name, in a margin to the left. Its level is how far the band is in (0 to 1): a row whose range meets the band is lit
    // where they meet (the accent, or the colour it is given), a row that misses it fades; a beat's `cut` slides and resizes the band and every row is judged again as it passes
    const lv = b.levels && b.levels.length >= 4 ? b.levels : SPANS, from = lv[0]!, to = lv[1]! > from ? lv[1]! : from + 1, lo = Math.min(lv[2]!, lv[3]!), hi = Math.max(lv[2]!, lv[3]!), rows: [number, number][] = [];
    for (let q = 4; q + 1 < lv.length; q += 2) rows.push([Math.min(lv[q]!, lv[q + 1]!), Math.max(lv[q]!, lv[q + 1]!)]);
    const given = b.text.split("\n"), word = given[1]?.trim() ?? "", names = given.slice(2).map((s) => s.trim()), v = c01(b.value ?? 0), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent;
    const w = f?.w ?? Math.max(1, stroke * 0.75), sfx = b.unit ?? "";
    ctx.font = fontOf(12, undefined, 500);
    const margin = names.some(Boolean) ? Math.ceil(Math.max(...names.map((s) => ctx.measureText(s).width))) + 20 : 0, sx0 = b.x + margin, sw = Math.max(1, b.w - margin);
    const X = (n: number) => sx0 + ((Math.max(from, Math.min(to, n)) - from) / (to - from)) * sw, top = word ? 24 : 8, foot = 30, base = b.y + b.h - foot;
    const pitch = rows.length ? (base - b.y - top) / rows.length : 0, bar = Math.max(6, Math.min(14, pitch * 0.3)), soft = (to - from) / 60;
    // the band: hatched over every row from its top to the scale, its two ends heavy with short serifs turned inward, its name over its top
    const x0 = X(lo), x1 = X(hi);
    if (v > 0.001 && x1 - x0 > 0.5) {
      const r = { x: x0, y: b.y + top - 6, w: x1 - x0, h: base - (b.y + top - 6) };
      ctx.fillStyle = withAlpha(hue, 0.08 * v);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.5 * v);
      ctx.stroke();
      const serif = Math.min(6, r.w / 3);
      ctx.beginPath();
      ctx.moveTo(x0 + serif, r.y); ctx.lineTo(x0, r.y); ctx.lineTo(x0, r.y + r.h); ctx.lineTo(x0 + serif, r.y + r.h);
      ctx.moveTo(x1 - serif, r.y); ctx.lineTo(x1, r.y); ctx.lineTo(x1, r.y + r.h); ctx.lineTo(x1 - serif, r.y + r.h);
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = withAlpha(hue, v);
      ctx.stroke();
      if (word && showText) drawLines(ctx, [word], x0 + 2, b.y + 8, 11, withAlpha(hue, v), "left", undefined, 600);
    }
    // the scale: a line with a tick at every step, the numbers under it
    const span = to - from, step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((s) => span / s <= 10) ?? Math.pow(10, Math.ceil(Math.log10(span / 10)));
    ctx.beginPath();
    ctx.moveTo(sx0, base); ctx.lineTo(sx0 + sw, base);
    for (let n = Math.ceil(from / step) * step; n <= to + 1e-9; n += step) { ctx.moveTo(X(n), base); ctx.lineTo(X(n), base + 5); }
    ctx.lineWidth = w;
    ctx.strokeStyle = withAlpha(t.text, 0.62);
    ctx.stroke();
    if (showText) for (let n = Math.ceil(from / step) * step; n <= to + 1e-9; n += step) drawLines(ctx, [`${+n.toFixed(2)}${sfx}`], X(n), base + 16, 11, withAlpha(t.text, n >= lo - 1e-6 && n <= hi + 1e-6 && v > 0.5 ? 0.78 : 0.5), "center", undefined, 500);
    // the rows: each range a bar on the scale, lit where it meets the band, faded once it misses it
    rows.forEach(([a, z], i) => {
      const cy = b.y + top + (i + 0.5) * pitch, out = Math.max(0, lo - z, a - hi), meet = c01(1 - out / soft), on = meet * v, miss = (1 - meet) * v, fade = 1 - 0.68 * miss;
      const r = { x: X(a), y: cy - bar / 2, w: Math.max(bar, X(z) - X(a)), h: bar };
      rounded(ctx, r, bar / 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.fillStyle = withAlpha(t.text, 0.06 * fade);
      ctx.fill();
      if (on > 0.001) {
        const m0 = X(Math.max(a, lo)), m1 = X(Math.min(z, hi));
        ctx.save();
        rounded(ctx, r, bar / 2);
        ctx.clip();
        ctx.fillStyle = withAlpha(hue, 0.88 * on);
        ctx.fillRect(Math.min(m0, m1), r.y, Math.max(2, Math.abs(m1 - m0)), r.h);
        ctx.restore();
      }
      rounded(ctx, r, bar / 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(t.text, 0.78 * fade);
      ctx.stroke();
      if (!showText) return;
      // (its numbers on a scrap of paper, so a band passing under them never hides them)
      const said = `${+a.toFixed(2)}–${+z.toFixed(2)}${sfx}`;
      ctx.font = fontOf(11, undefined, 500);
      ctx.fillStyle = t.bg;
      ctx.fillRect(r.x + r.w + 4, cy - 8, ctx.measureText(said).width + 8, 16);
      drawLines(ctx, [said], r.x + r.w + 8, cy, 11, withAlpha(t.text, 0.6 * fade), "left", undefined, 500);
      const name = names[i];
      if (name) drawLines(ctx, [name], sx0 - 20, cy, 12, on > 0.5 ? withAlpha(t.text, 0.9) : withAlpha(t.text, 0.78 * fade), "right", undefined, 500);
    });
    caption();
  } else if (k === "minmax") {
    // minmax: a field of blocks drawn as points at (their min across, their max up) on one scale both ways, with the diagonal min = max as a centre line (nothing can stand under it, which is tinted).
    // Its levels are the scale's first and last numbers, how wide the query is, how far it is shown (0 to 1), then each point [min, max]; its words are a caption, the measure across, the measure up,
    // the query's words, then each point's name. Its level is the query's low end lo (its high end lo + wide): a crosshair stands at the corner (hi, lo) and the region min ≤ hi, max ≥ lo is hatched,
    // the points inside it lit in the accent (or the colour it is given) and the rest faded. Given no width the corner sits on the diagonal, so `set` slides the crosshair along it
    const lv = b.levels && b.levels.length >= 4 ? b.levels : MINMAX, from = lv[0]!, to = lv[1]! > from ? lv[1]! : from + 1, wide = Math.max(0, lv[2]!), s = c01(lv[3]!), pts: [number, number][] = [];
    for (let q = 4; q + 1 < lv.length; q += 2) pts.push([lv[q]!, lv[q + 1]!]);
    const given = b.text.split("\n"), across = given[1]?.trim() || "min", up = given[2]?.trim() || "max", word = given[3]?.trim() ?? "", names = given.slice(4).map((q) => q.trim());
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), sfx = b.unit ?? "";
    const span = to - from, X = (n: number) => b.x + ((Math.max(from, Math.min(to, n)) - from) / span) * b.w, Y = (n: number) => b.y + b.h - ((Math.max(from, Math.min(to, n)) - from) / span) * b.h;
    const lo = b.value ?? from, hi = lo + wide, cx = X(hi), cy = Y(lo), soft = span / 60;
    // under the diagonal no block can stand (its max under its min): a faint tint
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.closePath();
    ctx.fillStyle = withAlpha(t.text, 0.035);
    ctx.fill();
    // the query's corner: every block whose min is at most hi and whose max at least lo, hatched, its two edges heavy
    if (s > 0.001) {
      const r = { x: b.x, y: b.y, w: Math.max(0, cx - b.x), h: Math.max(0, cy - b.y) };
      if (r.w > 0.5 && r.h > 0.5) {
        ctx.fillStyle = withAlpha(hue, 0.08 * s);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(hue, 0.5 * s);
        ctx.stroke();
      }
      // the crosshair: two broken lines right through the field, the region's own edges heavy
      ctx.beginPath();
      ctx.moveTo(cx, b.y + b.h); ctx.lineTo(cx, cy); ctx.moveTo(cx, cy); ctx.lineTo(b.x + b.w, cy);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.55 * s);
      ctx.setLineDash([2, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(cx, b.y); ctx.lineTo(cx, cy); ctx.lineTo(b.x, cy);
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = withAlpha(hue, s);
      ctx.stroke();
    }
    // the axes: the left and bottom edges, a tick at every step each way
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000].find((q) => span / q <= 8) ?? Math.pow(10, Math.ceil(Math.log10(span / 8))), marks: number[] = [];
    for (let n = Math.ceil(from / step) * step; n <= to + 1e-9; n += step) marks.push(n);
    ctx.beginPath();
    for (const n of marks) { ctx.moveTo(X(n), b.y + b.h); ctx.lineTo(X(n), b.y); ctx.moveTo(b.x, Y(n)); ctx.lineTo(b.x + b.w, Y(n)); }
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = withAlpha(t.text, 0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h);
    for (const n of marks) { ctx.moveTo(X(n), b.y + b.h); ctx.lineTo(X(n), b.y + b.h + 5); ctx.moveTo(b.x, Y(n)); ctx.lineTo(b.x - 5, Y(n)); }
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // the diagonal min = max: a centre line, long and short by turns; a query with a width lays its stretch of it heavy
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x + b.w, b.y);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.5);
    ctx.setLineDash([10, 3, 2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (s > 0.001 && wide > 0 && hi > lo) {
      ctx.beginPath();
      ctx.moveTo(X(lo), Y(lo)); ctx.lineTo(X(hi), Y(hi));
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2, stroke * 1.5);
      ctx.strokeStyle = withAlpha(hue, s);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    // the points: lit inside the corner, faded outside it while the query stands, open before it
    const pr = Math.max(4, Math.min(7, b.w * 0.014)), judged = pts.map(([a, z]) => { const out = Math.max(0, a - hi, lo - z), meet = c01(1 - out / soft); return { on: meet * s, miss: (1 - meet) * s }; });
    pts.forEach(([a, z], i) => {
      const { on, miss } = judged[i]!, px = X(a), py = Y(z);
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, on); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(t.text, 0.72 * (1 - 0.6 * miss));
      ctx.stroke();
    });
    // the corner itself: larger than a point, with a ring of paper about it, so it never reads as one of them
    if (s > 0.001) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, s);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 6, 6, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(hue, s);
      ctx.fill();
    }
    if (showText) {
      const quiet = withAlpha(t.text, 0.6);
      for (const n of marks) {
        drawLines(ctx, [`${+n.toFixed(2)}${sfx}`], X(n), b.y + b.h + 16, 11, quiet, "center", undefined, 500);
        drawLines(ctx, [`${+n.toFixed(2)}${sfx}`], b.x - 10, Y(n), 11, quiet, "right", undefined, 500);
      }
      drawVoiced(ctx, across, { x: b.x + b.w - voicedWidth(across, CAPTION_SIZE), y: b.y + b.h + 28, w: voicedWidth(across, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      drawVoiced(ctx, up, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      pts.forEach(([a, z], i) => {
        const name = names[i];
        if (!name) return;
        const { on, miss } = judged[i]!, px = X(a), py = Y(z), left = px > b.x + b.w * 0.82;
        drawLines(ctx, [name], left ? px - pr - 7 : px + pr + 7, py, 12, on > 0.5 ? hue : withAlpha(t.text, 0.7 * (1 - 0.6 * miss)), left ? "right" : "left", undefined, 500);
      });
      if (word && s > 0.001) {
        // the query's words on a plate beside its corner, inside the field
        ctx.font = fontOf(12, undefined, 600);
        const tw = ctx.measureText(word).width + 14, right = cx + 16 + tw <= b.x + b.w, px = right ? cx + 14 : cx - 14 - tw, py = Math.min(b.y + b.h - 12, cy + 18);
        ctx.fillStyle = withAlpha(t.bg, s);
        rounded(ctx, { x: px, y: py - 10, w: tw, h: 20 }, 10);
        ctx.fill();
        drawLines(ctx, [word], px + 7, py, 12, withAlpha(hue, s), "left", undefined, 600);
      }
    }
    caption();
  } else if (k === "loop") {
    // a loop: two things that hold each other, drawn as one closed square ring standing clear of both (a story sets it round them, at its gap, in every moment, so it moves with them),
    // a head at the middle of each of its two long sides pointing on round it, clockwise, so it reads as going round. Its level is how far round it is drawn, 0 to 1, from the middle of its
    // top; while it is at work a light travels round it without stopping (at rest it stands an eighth of the way round). It is drawn in its wire's ink, or the colour it is given
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h, mx = b.x + b.w / 2, my = b.y + b.h / 2, r = Math.max(0, Math.min(f?.r ?? 12, b.w / 4, b.h / 4)), v = c01(b.value ?? 1);
    const per = 2 * (b.w + b.h), len = per - 1.7 * r, w = f?.w ?? stroke, hs = f?.head ?? 10;
    // a place on the way round, d along it from the middle of the top (corners taken square)
    const along = (d: number): [number, number] => {
      const e = ((d % per) + per) % per, hw = b.w / 2;
      if (e <= hw) return [mx + e, y0];
      if (e <= hw + b.h) return [x1, y0 + e - hw];
      if (e <= hw + b.h + b.w) return [x1 - (e - hw - b.h), y1];
      if (e <= hw + 2 * b.h + b.w) return [x0, y1 - (e - hw - b.h - b.w)];
      return [x0 + (e - hw - 2 * b.h - b.w), y0];
    };
    if (v > 0.001) {
      ctx.beginPath();
      ctx.moveTo(mx, y0);
      ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
      ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1);
      ctx.lineTo(x0 + r, y1); ctx.quadraticCurveTo(x0, y1, x0, y1 - r);
      ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0);
      ctx.lineTo(mx, y0);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (v < 1) ctx.setLineDash([Math.max(0.0001, len * v), len + 10]); else dash(ctx, b.line, f?.crisp ? 0.75 : w);
      ctx.stroke();
      ctx.setLineDash([]);
      // its two heads, each at the middle of a long side, there once the ring is drawn past it
      const tall = b.h >= b.w, heads: [number, number, number, number, number][] = tall ? [[x1, my, 0, 1, b.w / 2 + b.h / 2], [x0, my, 0, -1, 1.5 * b.w + 1.5 * b.h]] : [[mx, y1, -1, 0, b.w + b.h], [mx, y0, 1, 0, 0.0001]];
      ctx.fillStyle = color;
      for (const [hx, hy, dx, dy, at] of heads) {
        if (at > per * v + 0.5 && !(at < 1 && v >= 1)) continue;
        const tx = hx + (dx * hs) / 2, ty = hy + (dy * hs) / 2, bx = tx - dx * hs, by = ty - dy * hs, half = hs * (f?.crisp ? 0.5 : 0.48);
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx - dy * half, by + dx * half); ctx.lineTo(bx + dy * half, by - dx * half); ctx.closePath(); ctx.fill();
      }
      if (b.busy) {
        // the light going round: an even pace, once round every few seconds whatever its size
        const u = moves(b.id) ? ((clock.t! * 0.24) % per) / per : 0.125, s = f?.crisp ? 8 : 10;
        if (u <= v) { const [lx, ly] = along(u * per); ctx.fillStyle = lit; ctx.fillRect(lx - s / 2, ly - s / 2, s, s); }
      }
    }
    caption();
  } else if (k === "staple") {
    // a staple: two things clipped together, drawn as short square brackets across the seam between them (a story sets the mark on that seam, the gap between their facing edges along
    // the edge they share, in every moment, so it moves with them). Its levels are which way the seam runs (0: across, the things one under the other; 1: up and down, side by side), how far
    // each bracket bites into both things, px, then where each stands along the seam, 0 to 1. Its level is how far it has closed: each spine grows out from the middle of the seam into
    // both edges, then its two legs fold in along them, the same way, so it reads as a bracket. In its wire's ink, or the colour it is given
    const lv = b.levels && b.levels.length >= 3 ? b.levels : STAPLE, side = lv[0]! >= 0.5, bite = Math.max(2, lv[1]!), v = c01(b.value ?? 1), w = f?.w ?? stroke;
    const grow = c01(v / 0.6), fold = c01((v - 0.6) / 0.4), leg = Math.max(5, bite * 0.75), gap = side ? b.w : b.h, mid = (side ? b.x : b.y) + gap / 2, reach = (gap / 2 + bite) * grow;
    if (v > 0.001) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineCap = "square";
      ctx.lineJoin = "miter";
      // (in the seam's own frame: s along it, n across it)
      const P = (s: number, n: number): [number, number] => (side ? [n, s] : [s, n]);
      for (const at of lv.slice(2)) {
        const s = side ? b.y + c01(at) * b.h : b.x + c01(at) * b.w, a = mid - reach, z = mid + reach;
        ctx.beginPath();
        ctx.moveTo(...P(s - leg * fold, a));
        ctx.lineTo(...P(s, a));
        ctx.lineTo(...P(s, z));
        ctx.lineTo(...P(s - leg * fold, z));
        ctx.stroke();
      }
    }
    caption();
  } else if (k === "rider") {
    // a rider: a small token bound to a wire, its words what it carries. Its levels are how many points the wire's path has, then each point [x, y] (0 to 1 across and down the mark);
    // its level is how far along the wire it has got, 0 its start and 1 its end. It is a capsule on paper standing level on the wire, a lit square before its words (the accent, or the colour
    // it is given), and it travels between two places clear of the wire's ends, so parked at either end it sits beside the thing there rather than over it
    const lv = b.levels && b.levels.length >= 5 ? b.levels : RIDER, n = Math.max(2, Math.min(64, Math.round(lv[0]!))), own = b.tone !== "ink" && b.tone !== "muted";
    const P: [number, number][] = [];
    for (let i = 0; i < n; i++) P.push([b.x + (lv[1 + i * 2] ?? 0) * b.w, b.y + (lv[2 + i * 2] ?? 0) * b.h]);
    const seg = P.slice(1).map((q, i) => Math.hypot(q[0] - P[i]![0], q[1] - P[i]![1])), len = seg.reduce((s, x) => s + x, 0);
    const name = b.text.split("\n")[0]!.trim(), fs = 12, track = 0.03, L = 6, ch = 24;
    ctx.font = fontOf(fs, track, 500);
    const tw = name ? ctx.measureText(name).width + name.length * track * fs : 0, cw = Math.ceil(10 + L + (name ? 7 + tw : 0) + 10);
    // (where along it: from half the capsule and clear of an arrowhead at the start to the same clear of the end; on a wire too short for that, its middle)
    const lo = cw / 2 + 18, hi = len - cw / 2 - 18, at = hi > lo ? lo + (hi - lo) * c01(b.value ?? 0) : len / 2;
    let cx = P[0]![0], cy = P[0]![1];
    for (let i = 0, d = at; i < seg.length; i++) {
      if (d <= seg[i]! || i === seg.length - 1) { const q = seg[i]! ? Math.min(1, d / seg[i]!) : 0; cx = P[i]![0] + (P[i + 1]![0] - P[i]![0]) * q; cy = P[i]![1] + (P[i + 1]![1] - P[i]![1]) * q; break; }
      d -= seg[i]!;
    }
    const x0 = cx - cw / 2, y0 = cy - ch / 2;
    ctx.beginPath();
    ctx.roundRect(x0, y0, cw, ch, ch / 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.lineWidth = f?.w ?? Math.max(1, stroke * 0.75);
    ctx.strokeStyle = own ? color : withAlpha(t.text, 0.45);
    ctx.stroke();
    ctx.fillStyle = lit;
    ctx.fillRect(x0 + 10, cy - L / 2, L, L);
    if (name && showText) drawLines(ctx, [name], x0 + 10 + L + 7 + tw / 2, cy, fs, withAlpha(own ? color : t.text, 0.86), "center", track, 500);
  } else if (k === "trail") {
    // a trail: one moving point with its name riding beside it, leaving a hollow point at each kept place it has passed. Its levels are how many places its path has, each place [x, y]
    // (0 to 1 across and down the mark), then whether each is kept (1) or passed over (0). Its level is how far along the path it has got: 0 at the first place, 1 at the second, a part of one
    // gliding it along the way to the next. A kept place shows as an open point once it is reached; the moving point is filled in ink (or the colour the trail is given), on a ring of paper,
    // its name over it on the side it is heading, sliding across as it turns
    const lv = b.levels && b.levels.length >= 3 ? b.levels : TRAIL, n = Math.max(1, Math.min(64, Math.round(lv[0]!))), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.text;
    const P: [number, number][] = [];
    for (let i = 0; i < n; i++) P.push([b.x + (lv[1 + i * 2] ?? 0) * b.w, b.y + (lv[2 + i * 2] ?? 0) * b.h]);
    const kept = (i: number) => c01(lv[1 + n * 2 + i] ?? 1), v = Math.max(0, Math.min(n - 1, b.value ?? 0)), w = f?.w ?? Math.max(1, stroke * 0.75);
    const i0 = Math.min(n - 1, Math.floor(v)), i1 = Math.min(n - 1, i0 + 1), q = v - i0;
    const hx = P[i0]![0] + (P[i1]![0] - P[i0]![0]) * q, hy = P[i0]![1] + (P[i1]![1] - P[i0]![1]) * q;
    // the places it has been: open points, each coming in as the moving point leaves it
    for (let i = 0; i < n; i++) {
      const a = c01((v - i) * 3) * kept(i);
      if (a <= 0.001) continue;
      ctx.beginPath();
      ctx.ellipse(P[i]![0], P[i]![1], 3.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      ctx.lineWidth = w;
      ctx.strokeStyle = withAlpha(t.text, 0.7 * a);
      ctx.stroke();
    }
    // the moving point
    ctx.beginPath();
    ctx.ellipse(hx, hy, 9.5, 9.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(hx, hy, 7, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(hue, 0.9);
    ctx.fill();
    const name = b.text.split("\n")[0]!.trim();
    if (name && showText) {
      // (the side it is heading: the way across from where it is to a little further along, so it slides over as the path turns rather than jumping)
      const ahead = Math.min(n - 1, v + 0.5), j0 = Math.min(n - 1, Math.floor(ahead)), j1 = Math.min(n - 1, j0 + 1), aq = ahead - j0;
      const ax = P[j0]![0] + (P[j1]![0] - P[j0]![0]) * aq, back = Math.max(0, v - 0.5), k0 = Math.floor(back), k1 = Math.min(n - 1, k0 + 1), bx = P[k0]![0] + (P[k1]![0] - P[k0]![0]) * (back - k0);
      const dx = ax - bx, side = Math.max(-1, Math.min(1, dx / 6)) || 1, fs = 12;
      ctx.font = fontOf(fs, undefined, 500);
      const tw = ctx.measureText(name).width;
      drawLines(ctx, [name], hx + side * (6 + tw / 2), hy - 20, fs, withAlpha(own ? color : t.text, 0.86), "center", undefined, 500);
    }
  } else if (k === "tether") {
    // a block hung by threads from a ceiling: a hatched band across the top with each thread's name over it, the block (a panel: its words' first line its name, the second its detail line)
    // hanging under them, and a floor ruled across the bottom. Its levels are how many threads, then each thread [at, held, cut]: where it hangs (0 to 1 across), how far it has grown down
    // from the ceiling to the block, and how far it is cut: cut, it snaps red at its middle and its two halves recoil apart and fade, and its name is struck through. Once every thread
    // is cut or gone the block drops to the floor and fades. The block spans its threads. Its level is the thread being followed, from 1, lit in the accent (or the colour it is given)
    const lv = b.levels && b.levels.length >= 1 ? b.levels : TETHER, n = Math.max(0, Math.min(16, Math.round(lv[0] ?? 0))), v = b.value ?? 0;
    const lines = b.text.split("\n"), head = lines[0] ?? "", detail = lines[1] ?? "", names = lines.slice(2);
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, ink = withAlpha(own ? color : t.text, 0.86), red = t.tones.red;
    const th = Array.from({ length: n }, (_, i) => ({ x: b.x + c01(lv[1 + i * 3] ?? (i + 0.5) / n) * b.w, held: c01(lv[2 + i * 3] ?? 1), cut: c01(lv[3 + i * 3] ?? 0), on: v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0, name: names[i]?.trim() ?? "" }));
    const top = b.y + (names.some((m) => m.trim()) ? 24 : 0), band = 10, ceil = top + band, floor = b.y + b.h - 6;
    // the block: as wide as its threads and a margin, at least 160; it hangs a little under halfway down, and rests on the floor once nothing holds it
    const xs = th.map((q) => q.x), mid0 = b.x + b.w / 2;
    let x0 = xs.length ? Math.min(...xs) - 44 : mid0 - b.w * 0.3, x1 = xs.length ? Math.max(...xs) + 44 : mid0 + b.w * 0.3;
    if (x1 - x0 < 160) { const c = (x0 + x1) / 2; x0 = c - 80; x1 = c + 80; }
    x0 = Math.max(b.x, x0); x1 = Math.min(b.x + b.w, x1);
    const BH = Math.max(52, Math.min(104, (floor - ceil) * 0.4)), ph = detail ? Math.min(52, BH / 2) : BH, hang = ceil + Math.max(28, (floor - ceil - BH) * 0.45), rest = floor - BH;
    const loose = n ? Math.min(...th.map((q) => Math.max(q.cut, 1 - q.held))) : 0, q0 = c01((loose - 0.35) / 0.65), by = hang + (rest - hang) * q0 * q0;
    // the ceiling: a hatched band outlined in ink, as a wall is
    const ceilR = { x: b.x, y: top, w: b.w, h: band }, box = (r: Rect) => { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath(); };
    box(ceilR); ctx.fillStyle = t.bg; ctx.fill();
    ctx.save(); box(ceilR); ctx.clip(); hatching(ctx, ceilR, 0, 7); ctx.lineWidth = 0.75; ctx.strokeStyle = withAlpha(own ? color : t.text, own ? 0.5 : 0.3); ctx.stroke(); ctx.restore();
    box(ceilR); ctx.lineWidth = stroke; ctx.strokeStyle = ink; ctx.stroke();
    // the floor: a quiet rule with hatching under it
    const floorR = { x: b.x, y: floor, w: b.w, h: b.y + b.h - floor };
    ctx.save(); box(floorR); ctx.clip(); hatching(ctx, floorR, 0, 7); ctx.lineWidth = 0.75; ctx.strokeStyle = withAlpha(t.text, 0.22); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.moveTo(b.x, floor); ctx.lineTo(b.x + b.w, floor); ctx.lineWidth = Math.max(1, stroke * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke();
    const knot = (x: number, y: number, c: string) => { ctx.beginPath(); ctx.ellipse(x, y, 2.75, 2.75, 0, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
    ctx.lineCap = "round";
    for (const q of th) {
      if (q.held <= 0.001 && q.cut <= 0.001) continue;
      const w = Math.max(1.5, stroke) + (Math.max(2, stroke * 1.25) - Math.max(1.5, stroke)) * q.on;
      if (q.cut <= 0.001) {
        // a thread that holds: from the ceiling down to the block (or as far as it has grown)
        const y1 = ceil + (by - ceil) * q.held;
        ctx.beginPath(); ctx.moveTo(q.x, ceil); ctx.lineTo(q.x, y1); ctx.lineWidth = w; ctx.strokeStyle = withAlpha(t.text, 0.7 * (1 - q.on)); ctx.stroke();
        if (q.on > 0) { ctx.strokeStyle = withAlpha(hue, q.on); ctx.stroke(); }
        knot(q.x, ceil, q.on > 0.5 ? hue : ink);
        if (q.held > 0.98) knot(q.x, by, q.on > 0.5 ? hue : ink);
        continue;
      }
      // a cut thread: red at once, snapped at its middle; the upper half recoils to the ceiling and the lower slumps onto the block, both going slack and fading
      const e = 1 - (1 - q.cut) * (1 - q.cut), fade = 1 - c01((q.cut - 0.45) / 0.55), r = c01(q.cut * 6), mid = (ceil + by) / 2;
      const half = (ax: number, ay: number, toward: number, side: number) => {
        const ey = mid + (ay - mid) * e * 0.85 - toward * 3, ex = ax + side * 5 * e;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(ax + side * 11 * e, (ay + ey) / 2, ex, ey);
        ctx.lineWidth = w;
        if (r < 1) { ctx.strokeStyle = withAlpha(t.text, 0.7 * (1 - r) * fade); ctx.stroke(); }
        ctx.strokeStyle = withAlpha(red, r * fade); ctx.stroke();
      };
      half(q.x, ceil, 1, 1);
      half(q.x, by, -1, -1);
      knot(q.x, ceil, withAlpha(red, 0.4 + 0.6 * fade));
      // the snap: a small red cross where it parted, there for an instant
      const flash = Math.sin(c01(q.cut / 0.5) * Math.PI);
      if (flash > 0.01) {
        ctx.beginPath(); ctx.moveTo(q.x - 6, mid - 6); ctx.lineTo(q.x + 6, mid + 6); ctx.moveTo(q.x + 6, mid - 6); ctx.lineTo(q.x - 6, mid + 6);
        ctx.lineWidth = 2; ctx.strokeStyle = withAlpha(red, flash); ctx.stroke();
      }
    }
    ctx.lineCap = "butt";
    // the block, drawn as a panel is (with no shadow: the SVG stand-in draws none); it fades as it falls
    const fallen = q0, pb: Box = { ...b, kind: "panel", x: x0, y: by, w: x1 - x0, h: BH, text: head, size: 15, track: 0.16, head: ph, pad: 16, levels: [], value: 0,
      fine: own ? { w: 1.5, fill: "paper", text: "n900", fw: 500 } : { line: "n300", w: 1.5, fill: "paper", text: "n700", fw: 500, lamp: "n400" } };
    ctx.save();
    ctx.globalAlpha *= 1 - 0.6 * fallen;
    paintKind(ctx, pb, t, Math.max(1.5, stroke), showText);
    if (detail && showText) drawLines(ctx, [detail], x0 + 16, by + ph + (BH - ph) / 2, 15, own ? color : sh("n500"), "left", 0.04, 400);
    ctx.restore();
    // each thread's name over the ceiling; a cut one fades and is struck through in red
    if (showText) for (const q of th) {
      if (!q.name) continue;
      const there = Math.max(q.held, q.cut), y = b.y + 10;
      if (there <= 0.01) continue;
      drawLines(ctx, [q.name], q.x, y, 11, q.on > 0.5 && q.cut < 0.5 ? withAlpha(hue, there) : withAlpha(t.text, 0.62 * there * (1 - 0.5 * q.cut)), "center", undefined, 500);
      if (q.cut > 0.001) {
        const tw = layoutText(q.name, Infinity, 11, undefined, 500).w;
        ctx.beginPath(); ctx.moveTo(q.x - tw / 2 - 2, y); ctx.lineTo(q.x - tw / 2 - 2 + (tw + 4) * c01(q.cut * 2), y); ctx.lineWidth = 1.5; ctx.strokeStyle = withAlpha(red, 0.85); ctx.stroke();
      }
    }
  } else if (k === "wrap") {
    // one run of bits set in rows, cells as a row of cells draws them: its levels are a bit's side, the pitch across and down, then each bit [set, across, down, lit], its place counted in bits and rows
    // from the top left. Re-wrapped by a beat's `cut`, every bit travels from its old place to its new one; each row's name (its words after the first) stands past the longest row and fades
    // while any bit is between places. Its level is the bit being read, from 1 (0: none). A set bit is hatched, a lit one takes the accent, or the colour the run is given
    const lv = b.levels && b.levels.length >= 7 ? b.levels : wrapDefault(b), size = Math.max(1, lv[0]!), pitch = lv[1]!, down = lv[2]!, n = Math.floor((lv.length - 3) / 4), v = b.value ?? 0;
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const ends: number[] = [];
    let moving = 0;
    for (let i = 0; i < n; i++) {
      const q = 3 + i * 4, ax = lv[q + 1] ?? 0, ay = lv[q + 2] ?? 0, set = c01(lv[q] ?? 0), on = Math.max(c01(lv[q + 3] ?? 0), v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0);
      moving = Math.max(moving, Math.abs(ax - Math.round(ax)), Math.abs(ay - Math.round(ay)));
      const r = { x: b.x + ax * pitch, y: b.y + ay * down, w: size, h: size }, row = Math.round(ay);
      ends[row] = Math.max(ends[row] ?? -Infinity, r.x + size);
      rounded(ctx, r, 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      if (set > 0.001) {
        // (its hatching travels with it)
        const s = { x: r.x, y: r.y + size * (1 - set), w: size, h: size * set };
        hatching(ctx, s, r.x + r.y, f?.crisp ? 4 : 5);
        if (set < 0.999) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.w, s.y); }
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
    }
    // (the names stand in one column, past the longest row)
    const shown = c01(1 - moving * 4), past = Math.max(...ends.filter((e) => e !== undefined)) + 14;
    if (showText && shown > 0) b.text.split("\n").slice(1).forEach((name, row) => { if (name && ends[row] !== undefined) drawLines(ctx, [name], past, b.y + row * down + size / 2, 13, withAlpha(t.text, 0.82 * shown), "left", 0, 500); });
    caption();
  } else if (k === "plane") {
    // two counts on one grid: one across (named by the first line of its words, at the right end under the numbers), one up (the second line, over the top left corner).
    // Its levels are how far each count goes, then its points [a, b]; lines after the second name the points in turn. Each point owns the cell around it, so the box from the start
    // to a point (everything at or below it in both counts) tiles the grid. Its level is the point, from 1, whose box is hatched (0: none; a part of one: the box sliding to the next)
    const lv = b.levels && b.levels.length >= 2 ? b.levels : PLANE, na = Math.max(1, Math.round(lv[0]!)), nb = Math.max(1, Math.round(lv[1]!)), pts: [number, number][] = [];
    for (let q = 2; q + 1 < lv.length; q += 2) pts.push([lv[q]!, lv[q + 1]!]);
    const lines = b.text.split("\n"), across = lines[0] ?? "", up = lines[1] ?? "", names = lines.slice(2);
    const ux = b.w / (na + 1), uy = b.h / (nb + 1), X = (a: number) => b.x + (a + 0.5) * ux, Y = (q: number) => b.y + b.h - (q + 0.5) * uy;
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const v = pts.length ? Math.min(pts.length, Math.max(0, b.value ?? 0)) : 0, there = c01(v), i0 = Math.max(0, Math.floor(v) - 1), i1 = Math.min(pts.length - 1, Math.max(0, Math.ceil(v) - 1)), g = v < 1 ? 0 : v - Math.floor(v);
    const [a0 = 0, b0 = 0] = pts[i0] ?? [], [a1 = 0, b1 = 0] = pts[i1] ?? [], ba = a0 + (a1 - a0) * g, bb = b0 + (b1 - b0) * g, now = g > 0.5 ? i1 : i0;
    const grid = { x: b.x, y: b.y, w: b.w, h: b.h };
    ctx.save();
    rounded(ctx, grid, 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    if (there > 0) {
      // everything the point in question holds: hatched, and edged in the accent
      const r = { x: b.x, y: Y(bb) - uy / 2, w: (ba + 1) * ux, h: (bb + 1) * uy };
      ctx.fillStyle = withAlpha(hue, 0.08 * there);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.6 * there);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath();
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = withAlpha(hue, there);
      ctx.stroke();
    }
    // a line through every count each way, quiet and broken as a guide is
    ctx.beginPath();
    for (let a = 0; a <= na; a++) { ctx.moveTo(X(a), b.y); ctx.lineTo(X(a), b.y + b.h); }
    for (let q = 0; q <= nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x + b.w, Y(q)); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.26);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // the grid's edge, and a tick for every count along the bottom and the left
    rounded(ctx, grid, 2);
    for (let a = 0; a <= na; a++) { ctx.moveTo(X(a), b.y + b.h); ctx.lineTo(X(a), b.y + b.h + 5); }
    for (let q = 0; q <= nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x - 5, Y(q)); }
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // the points: the one in question lit, the ones its box holds settled (filled), the rest open
    const r = Math.max(4, Math.min(7, Math.min(ux, uy) * 0.09));
    pts.forEach(([pa, pb], p) => {
      const lit1 = there > 0 && p === now, held = there > 0 && pa <= ba + 0.01 && pb <= bb + 0.01;
      ctx.beginPath();
      ctx.ellipse(X(pa), Y(pb), r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit1 ? withAlpha(hue, there) : held ? withAlpha(t.text, 0.82) : t.bg;
      ctx.fill();
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = lit1 ? hue : withAlpha(t.text, held ? 0.82 : 0.7);
      ctx.stroke();
    });
    ctx.restore();
    if (showText) {
      // the counts along both edges (the box's own lit), and each count named at its end
      const onA = there > 0.5 ? Math.round(ba) : -1, onB = there > 0.5 ? Math.round(bb) : -1, quiet = withAlpha(t.text, 0.66);
      for (let a = 0; a <= na; a++) drawLines(ctx, [String(a)], X(a), b.y + b.h + 17, 11, a === onA ? hue : quiet, "center", undefined, 500);
      for (let q = 0; q <= nb; q++) drawLines(ctx, [String(q)], b.x - 11, Y(q), 11, q === onB ? hue : quiet, "right", undefined, 500);
      if (across) drawVoiced(ctx, across, { x: b.x + b.w - voicedWidth(across, CAPTION_SIZE), y: b.y + b.h + 28, w: voicedWidth(across, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      if (up) drawVoiced(ctx, up, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      pts.forEach(([pa, pb], p) => {
        const name = names[p];
        if (!name) return;
        const lit1 = there > 0 && p === now, held = there > 0 && pa <= ba + 0.01 && pb <= bb + 0.01;
        drawLines(ctx, [name], X(pa) + r + 7, Y(pb) - r - 9, 12, lit1 ? hue : withAlpha(t.text, held ? 0.86 : 0.62), "left", undefined, 500);
      });
    }
  } else if (k === "overlap") {
    // a plane keeping two boxes at once: its grid, counts and points as a plane's; its levels are how far each count goes, the second box's point (from 1; 0: none), then the points.
    // Its level is the first box's point. What both boxes hold stays plain; what only the first holds is tinted in the accent, what only the second holds in ink hatched the other way;
    // when each holds something the other does not (neither holds the other) both parts, and both boxes' edges, turn red. A part of either index slides that box to the next point
    const lv = b.levels && b.levels.length >= 3 ? b.levels : OVERLAP, na = Math.max(1, Math.round(lv[0]!)), nb = Math.max(1, Math.round(lv[1]!)), pts: [number, number][] = [];
    for (let q = 3; q + 1 < lv.length; q += 2) pts.push([lv[q]!, lv[q + 1]!]);
    const lines = b.text.split("\n"), across = lines[0] ?? "", up = lines[1] ?? "", names = lines.slice(2);
    const ux = b.w / (na + 1), uy = b.h / (nb + 1), X = (a: number) => b.x + (a + 0.5) * ux, Y = (q: number) => b.y + b.h - (q + 0.5) * uy;
    const own = b.tone !== "ink" && b.tone !== "muted", hueA = own ? color : t.accent, hueB = t.text, red = t.tones.red;
    const edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    // where a box stands for an index: how present it is, the point it slides through, and its extent in cells from the corner
    const boxAt = (v0: number) => {
      const v = pts.length ? Math.min(pts.length, Math.max(0, v0)) : 0, i0 = Math.max(0, Math.floor(v) - 1), i1 = Math.min(pts.length - 1, Math.max(0, Math.ceil(v) - 1)), g = v < 1 ? 0 : v - Math.floor(v);
      const [a0 = 0, b0 = 0] = pts[i0] ?? [], [a1 = 0, b1 = 0] = pts[i1] ?? [], ba = a0 + (a1 - a0) * g, bb = b0 + (b1 - b0) * g;
      return { there: c01(v), ba, bb, ea: ba + 1, eb: bb + 1, now: g > 0.5 ? i1 : i0 };
    };
    const A = boxAt(b.value ?? 0), B = boxAt(lv[2] ?? 0);
    // what only one box holds, as up to two rectangles (in cells from the corner): past the other's right edge, and above its top
    const only = (P: typeof A, Q: typeof A): [number, number, number, number][] => {
      if (P.there <= 0) return [];
      const qa = Q.there > 0 ? Q.ea : 0, qb = Q.there > 0 ? Q.eb : 0, out: [number, number, number, number][] = [];
      if (P.ea > qa + 0.01) out.push([qa, 0, P.ea, P.eb]);
      if (P.eb > qb + 0.01 && Math.min(P.ea, qa) > 0.01) out.push([0, qb, Math.min(P.ea, qa), P.eb]);
      return out;
    };
    const ahead = (P: typeof A, Q: typeof A) => (P.there > 0 ? Math.max(0, P.ea - (Q.there > 0 ? Q.ea : 0), P.eb - (Q.there > 0 ? Q.eb : 0)) : 0);
    const clash = c01(Math.min(ahead(A, B), ahead(B, A))) * Math.min(A.there, B.there);
    const px = ([a0, q0, a1, q1]: [number, number, number, number]): Rect => ({ x: b.x + a0 * ux, y: b.y + b.h - q1 * uy, w: (a1 - a0) * ux, h: (q1 - q0) * uy });
    const grid = { x: b.x, y: b.y, w: b.w, h: b.h };
    ctx.save();
    rounded(ctx, grid, 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    const tint = (parts: [number, number, number, number][], hue: string, there: number, back: boolean) => {
      for (const p of parts) {
        const r = px(p);
        if (r.w < 0.5 || r.h < 0.5) continue;
        for (const [c, k] of [[hue, there * (1 - clash)], [red, there * clash]] as const) {
          if (k <= 0.001) continue;
          ctx.fillStyle = withAlpha(c, 0.1 * k);
          ctx.fillRect(r.x, r.y, r.w, r.h);
          if (back) ctx.beginPath();
          hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5, back);
          ctx.lineWidth = 0.75;
          ctx.strokeStyle = withAlpha(c, 0.6 * k);
          ctx.stroke();
        }
      }
    };
    tint(only(A, B), hueA, A.there, false);
    tint(only(B, A), hueB, B.there, true);
    // a line through every count each way, quiet and broken as a guide is
    ctx.beginPath();
    for (let a = 0; a <= na; a++) { ctx.moveTo(X(a), b.y); ctx.lineTo(X(a), b.y + b.h); }
    for (let q = 0; q <= nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x + b.w, Y(q)); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.26);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // each box's edge in its own hue (red while they clash); the second's broken, so the two read apart where they run together
    for (const [P, hue, dash] of [[B, hueB, true], [A, hueA, false]] as const) {
      if (P.there <= 0) continue;
      const r = px([0, 0, P.ea, P.eb]);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath();
      ctx.lineWidth = Math.max(1, stroke);
      if (dash) ctx.setLineDash([5, 3]);
      for (const [c, k] of [[hue, P.there * (1 - clash)], [red, P.there * clash]] as const) if (k > 0.001) { ctx.strokeStyle = withAlpha(c, k); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // the grid's edge, and a tick for every count along the bottom and the left
    rounded(ctx, grid, 2);
    for (let a = 0; a <= na; a++) { ctx.moveTo(X(a), b.y + b.h); ctx.lineTo(X(a), b.y + b.h + 5); }
    for (let q = 0; q <= nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x - 5, Y(q)); }
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // the points: each box's own lit in its hue (red while they clash), the ones either box holds settled (filled), the rest open
    const r = Math.max(4, Math.min(7, Math.min(ux, uy) * 0.09)), hold = (P: typeof A, pa: number, pb: number) => P.there > 0 && pa <= P.ba + 0.01 && pb <= P.bb + 0.01;
    const litOf = (p: number) => (A.there > 0 && p === A.now ? (clash > 0.5 ? red : hueA) : B.there > 0 && p === B.now ? (clash > 0.5 ? red : hueB) : undefined);
    pts.forEach(([pa, pb], p) => {
      const lit1 = litOf(p), held = hold(A, pa, pb) || hold(B, pa, pb);
      ctx.beginPath();
      ctx.ellipse(X(pa), Y(pb), r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit1 ? lit1 : held ? withAlpha(t.text, 0.82) : t.bg;
      ctx.fill();
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = lit1 ?? withAlpha(t.text, held ? 0.82 : 0.7);
      ctx.stroke();
    });
    ctx.restore();
    if (showText) {
      // the counts along both edges (each box's own lit), and each count named at its end
      const quiet = withAlpha(t.text, 0.66), hueOf = (hue: string) => (clash > 0.5 ? red : hue);
      const onAt = (n: number, side: "ba" | "bb") => (A.there > 0.5 && Math.round(A[side]) === n ? hueOf(hueA) : B.there > 0.5 && Math.round(B[side]) === n ? hueOf(hueB) : quiet);
      for (let a = 0; a <= na; a++) drawLines(ctx, [String(a)], X(a), b.y + b.h + 17, 11, onAt(a, "ba"), "center", undefined, 500);
      for (let q = 0; q <= nb; q++) drawLines(ctx, [String(q)], b.x - 11, Y(q), 11, onAt(q, "bb"), "right", undefined, 500);
      if (across) drawVoiced(ctx, across, { x: b.x + b.w - voicedWidth(across, CAPTION_SIZE), y: b.y + b.h + 28, w: voicedWidth(across, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      if (up) drawVoiced(ctx, up, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      pts.forEach(([pa, pb], p) => {
        const name = names[p];
        if (!name) return;
        const lit1 = litOf(p), held = hold(A, pa, pb) || hold(B, pa, pb);
        drawLines(ctx, [name], X(pa) + r + 7, Y(pb) - r - 9, 12, lit1 ?? withAlpha(t.text, held ? 0.86 : 0.62), "left", undefined, 500);
      });
    }
  } else if (k === "walls") {
    // a plane with two limits on it, one across and one up, each a heavy edge with its name (the third and fourth lines of its words; the first two name the counts, as a plane's do,
    // the rest the slopes). Its levels are how far each count goes, where the two walls stand, whether a ray is drawn (1) or not (0), then the slopes, up per across.
    // Its level is the slope in play, from 1: a part of one is how far its box has grown from the corner along it, and at a whole one it has met the first wall in its way,
    // which lights (both, at their corner). Slopes before it have their stopping points settled; the ray, a faint line along the slope in play, carries on past the wall
    const lv = b.levels && b.levels.length >= 5 ? b.levels : WALLS, na = Math.max(1, Math.round(lv[0]!)), nb = Math.max(1, Math.round(lv[1]!));
    const A = Math.min(na, Math.max(0.01, lv[2]!)), B = Math.min(nb, Math.max(0.01, lv[3]!)), ray = (lv[4] ?? 0) > 0, slopes = lv.slice(5).map((s) => Math.max(0, s));
    const lines = b.text.split("\n"), across = lines[0] ?? "", up = lines[1] ?? "", wa = lines[2] ?? "", wb = lines[3] ?? "", names = lines.slice(4);
    const X = (a: number) => b.x + (a / na) * b.w, Y = (q: number) => b.y + b.h - (q / nb) * b.h;
    // where a slope stops: at whichever wall it meets first, and which walls those are
    const stop = (s: number): [number, number] => { const a = s > 0 ? Math.min(A, B / s) : A; return [a, Math.min(B, a * s)]; };
    const meets = (s: number) => { const [a, q] = stop(s); return [a >= A - 1e-6, q >= B - 1e-6] as const; };
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const n = slopes.length, v = n ? Math.min(n, Math.max(0, b.value ?? 0)) : 0, cur = v > 0 ? Math.min(n - 1, Math.ceil(v) - 1) : -1, g = cur < 0 ? 0 : c01(v - cur), there = c01(g * 8);
    const sNow = cur < 0 ? 0 : slopes[cur]!, [sa, sb] = stop(sNow), ba = sa * g, bb = sb * g, [hitA, hitB] = cur < 0 ? [false, false] : meets(sNow);
    const litA = hitA ? c01((g - 0.94) / 0.06) : 0, litB = hitB ? c01((g - 0.94) / 0.06) : 0;
    const grid = { x: b.x, y: b.y, w: b.w, h: b.h };
    ctx.save();
    rounded(ctx, grid, 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    if (there > 0 && ba > 0 && bb > 0) {
      // the box grown so far: hatched, and edged in the accent
      const r = { x: X(0), y: Y(bb), w: X(ba) - X(0), h: Y(0) - Y(bb) };
      ctx.fillStyle = withAlpha(hue, 0.08 * there);
      ctx.fillRect(r.x, r.y, r.w, r.h);
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.6 * there);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath();
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = withAlpha(hue, there);
      ctx.stroke();
    }
    // a line through every count each way, quiet and broken as a guide is
    ctx.beginPath();
    for (let a = 1; a < na; a++) { ctx.moveTo(X(a), b.y); ctx.lineTo(X(a), b.y + b.h); }
    for (let q = 1; q < nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x + b.w, Y(q)); }
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.26);
    ctx.setLineDash([2, 4]);
    ctx.stroke();
    // the ray: where the slope in play would go if nothing stopped it, out to the grid's edge
    if (ray && cur >= 0) {
      const end = sNow > 0 ? Math.min(na, nb / sNow) : na;
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(end), Y(end * sNow));
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(t.text, 0.4 * there);
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // the grid's edge, and a tick for every count along the bottom and the left
    rounded(ctx, grid, 2);
    for (let a = 0; a <= na; a++) { ctx.moveTo(X(a), b.y + b.h); ctx.lineTo(X(a), b.y + b.h + 5); }
    for (let q = 0; q <= nb; q++) { ctx.moveTo(b.x, Y(q)); ctx.lineTo(b.x - 5, Y(q)); }
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // the walls: heavy edges, each lit in the accent once the box has met it
    const heavy = Math.max(2, stroke * 2);
    ([[litA, X(A), Y(0), X(A), Y(B)], [litB, X(0), Y(B), X(A), Y(B)]] as const).forEach(([lit, x0, y0, x1, y1]) => {
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.lineWidth = heavy;
      ctx.strokeStyle = withAlpha(t.text, 0.86 * (1 - lit));
      if (lit < 1) ctx.stroke();
      if (lit > 0) { ctx.lineWidth = heavy + stroke * 0.5 * lit; ctx.strokeStyle = withAlpha(hue, lit); ctx.stroke(); }
    });
    // where each slope stopped: the ones before settled, the one in play lit at its box's corner
    const r = Math.max(4, Math.min(7, Math.min(b.w / na, b.h / nb) * 0.09));
    const dot = (a: number, q: number, lit1: boolean) => {
      ctx.beginPath();
      ctx.ellipse(X(a), Y(q), r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit1 ? withAlpha(hue, there) : withAlpha(t.text, 0.82);
      ctx.fill();
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = lit1 ? hue : withAlpha(t.text, 0.82);
      ctx.stroke();
    };
    for (let p = 0; p < cur; p++) dot(...stop(slopes[p]!), false);
    if (there > 0) dot(ba, bb, true);
    ctx.restore();
    if (showText) {
      const quiet = withAlpha(t.text, 0.66), onA = litA > 0.5 ? A : -1, onB = litB > 0.5 ? B : -1;
      for (let a = 0; a <= na; a++) drawLines(ctx, [String(a)], X(a), b.y + b.h + 17, 11, Math.abs(a - onA) < 1e-6 ? hue : quiet, "center", undefined, 500);
      for (let q = 0; q <= nb; q++) drawLines(ctx, [String(q)], b.x - 11, Y(q), 11, Math.abs(q - onB) < 1e-6 ? hue : quiet, "right", undefined, 500);
      if (across) drawVoiced(ctx, across, { x: b.x + b.w - voicedWidth(across, CAPTION_SIZE), y: b.y + b.h + 28, w: voicedWidth(across, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      if (up) drawVoiced(ctx, up, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62));
      // each wall's name: the one across beside its top, the one up over its far end
      const ink = (lit: number) => (lit > 0.5 ? hue : withAlpha(t.text, 0.86));
      if (wa) drawVoiced(ctx, wa, { x: X(A) + 10, y: Y(B) + 6, w: voicedWidth(wa, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, ink(litA), 600);
      if (wb) { const ww = voicedWidth(wb, CAPTION_SIZE); drawVoiced(ctx, wb, { x: X(A) - 8 - ww, y: Y(B) - 22, w: ww, h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, ink(litB), 600); }
      // each slope named at where it stopped, the one in play at its box's corner
      for (let p = 0; p <= cur; p++) {
        const name = names[p];
        if (!name) continue;
        const [a, q] = p === cur ? [ba, bb] : stop(slopes[p]!), lit1 = p === cur;
        if (lit1 && there <= 0) continue;
        drawLines(ctx, [name], X(a) + r + 7, Y(q) - r - 9, 12, lit1 ? withAlpha(hue, there) : withAlpha(t.text, 0.62), "left", undefined, 500);
      }
    }
  } else if (k === "comb") {
    // many spans that start where they like and end on one shared edge, its right side: `levels` are the teeth's starts (0 to 1 across it), one row each from the top,
    // then, when there are twice as many as its `span`, a count for each tooth ("+43 more": the others it stands for). Its level is how far time has got (0 to 1): every tooth that has
    // started is drawn from its start to there, and as the level reaches 1 the shared edge stands and every tooth takes the accent (or the colour the comb is given)
    const lv = b.levels && b.levels.length ? b.levels : COMB, n = Math.max(1, Math.round(b.span ?? lv.length)), more = lv.length >= n * 2 ? lv.slice(n, n * 2) : [];
    const v = c01(b.value ?? 0), done = c01((v - 0.98) / 0.02), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent;
    const pitch = b.h / n, tk = Math.min(5, pitch * 0.42), lw = Math.max(0.5, Math.min(f?.w ?? Math.max(1, stroke * 0.75), pitch * 0.4)), nowX = b.x + v * b.w, edgeX = b.x + b.w;
    const sx = (i: number) => b.x + c01(lv[i] ?? 0) * b.w, ty = (i: number) => b.y + (i + 0.5) * pitch, started = (i: number) => c01(lv[i] ?? 0) <= v + 1e-6 && v > 0;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (!started(i)) continue;
      const x0 = sx(i), y = ty(i), x1 = Math.max(x0, done > 0 ? edgeX : nowX);
      ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      // its start, ticked as a measure's ends are, while the rows have room for it
      if (tk >= 1.5) { ctx.moveTo(x0, y - tk); ctx.lineTo(x0, y + tk); }
    }
    ctx.lineWidth = lw;
    if (done < 1) { ctx.strokeStyle = f?.line ? sh(f.line) : withAlpha(t.text, 0.78 * (1 - done)); ctx.stroke(); }
    if (done > 0) { ctx.strokeStyle = withAlpha(hue, done); ctx.stroke(); }
    if (done > 0) {
      // the shared edge: one line every tooth ends on, a little past the first and the last
      ctx.beginPath();
      ctx.moveTo(edgeX, b.y - 6); ctx.lineTo(edgeX, b.y + b.h + 6);
      ctx.lineWidth = Math.max(1.5, stroke * 1.25);
      ctx.strokeStyle = withAlpha(hue, done);
      ctx.stroke();
    }
    // lines of its words after the first name its teeth, one each from the top: set just left of where its tooth starts (left of its count, when it has one), each appearing as its tooth
    // starts and lit with the teeth when the shared edge stands
    const names = b.text.split("\n").slice(1).map((s) => s.trim());
    if (showText) for (let i = 0; i < n; i++) {
      const c = Math.round(more[i] ?? 0);
      if (!started(i)) continue;
      let nx = sx(i) - 8;
      if (c > 0) { drawLines(ctx, [`+${c} more`], nx, ty(i), 11, withAlpha(t.text, 0.62), "right", undefined, 500); ctx.font = fontOf(11, undefined, 500); nx -= ctx.measureText(`+${c} more`).width + 8; }
      const name = names[i], a = c01((v - c01(lv[i] ?? 0)) / 0.03);
      if (!name || a <= 0) continue;
      if (done < 1) drawLines(ctx, [name], nx, ty(i), 12, withAlpha(t.text, 0.82 * a * (1 - done)), "right", undefined, 500);
      if (done > 0) drawLines(ctx, [name], nx, ty(i), 12, withAlpha(hue, a * done), "right", undefined, 500);
    }
    caption();
  } else if (k === "scatter" || k === "fence") {
    // many points in one field, each where its levels put it (0 to 1 across and down the mark), named by the lines of its words after the first, beside it (to its left hard by the right edge).
    // Its first three levels are a reach: a centre, and a radius (0 to 1 of its width); its level is how far the reach has grown, 0 to 1 of that radius. The reach is a broken circle in the accent
    // (or the colour the scatter is given) over a faint tint, its centre a filled point once it has begun; the points inside it are filled and lit, softly at its edge, the rest stand open
    // A fence's levels go on, after the reach, to how many corners its fence has and the corners, then its points; its words are a name, the fence's name, then the points'. The fence is a closed
    // region ruled in diagonals as a hatched place is, its edge a solid line in ink and its name on a plate riding its top edge; it never moves, and a point inside it is held, filled in ink
    const fenced = k === "fence", lv = b.levels && b.levels.length >= (fenced ? 4 : 3) ? b.levels : fenced ? FENCE : SCATTER, nf = fenced ? Math.max(0, Math.min(32, Math.round(lv[3]!))) : 0;
    const says = b.text.split("\n").slice(fenced ? 2 : 1), wall = fenced ? (b.text.split("\n")[1] ?? "").trim() : "", v = c01(b.value ?? 0), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent;
    const X = (a: number) => b.x + a * b.w, Y = (q: number) => b.y + q * b.h, cx = X(lv[0]!), cy = Y(lv[1]!), R = Math.max(0, lv[2]!) * b.w * v, pr = 5, w = f?.w ?? Math.max(1, stroke * 0.75), pts: [number, number][] = [];
    const corners: [number, number][] = [];
    for (let i = 0; i < nf; i++) corners.push([X(lv[4 + i * 2] ?? 0), Y(lv[5 + i * 2] ?? 0)]);
    for (let q = fenced ? 4 + nf * 2 : 3; q + 1 < lv.length; q += 2) pts.push([X(lv[q]!), Y(lv[q + 1]!)]);
    const inside = (px: number, py: number) => (R > 0.5 ? c01((R - Math.hypot(px - cx, py - cy)) / 6 + 0.5) : 0);
    // (a point is held when a ray from it crosses the fence's edge an odd number of times)
    const held = (px: number, py: number) => {
      if (corners.length < 3) return false;
      let odd = false;
      for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
        const [xi, yi] = corners[i]!, [xj, yj] = corners[j]!;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) odd = !odd;
      }
      return odd;
    };
    if (corners.length >= 3) {
      const outline = () => { ctx.beginPath(); corners.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath(); };
      const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
      outline();
      ctx.fillStyle = withAlpha(t.text, 0.04);
      ctx.fill();
      ctx.save();
      outline();
      ctx.clip();
      hatching(ctx, { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }, 0, 7);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(t.text, 0.22);
      ctx.stroke();
      ctx.restore();
      outline();
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke;
      ctx.strokeStyle = withAlpha(t.text, 0.86);
      ctx.stroke();
      ctx.lineJoin = "miter";
    }
    if (R > 0.5) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, R, R, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(hue, 0.06);
      ctx.fill();
      ctx.lineWidth = w;
      ctx.strokeStyle = withAlpha(hue, 0.8);
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const [px, py] of pts) {
      const on = inside(px, py), hold = held(px, py);
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (hold) { ctx.fillStyle = withAlpha(t.text, 0.86); ctx.fill(); }
      if (on > 0) { ctx.fillStyle = withAlpha(hue, on); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : hold ? t.text : withAlpha(t.text, 0.7);
      ctx.stroke();
    }
    if (v > 0) {
      // (larger than a point, with a ring of paper about it, so it never reads as one of them)
      ctx.beginPath();
      ctx.ellipse(cx, cy, 9, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, Math.min(1, v * 20));
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx, cy, 7, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(hue, Math.min(1, v * 20));
      ctx.fill();
    }
    if (showText) {
      pts.forEach(([px, py], i) => {
        const word = says[i]?.trim();
        if (!word) return;
        const left = px > b.x + b.w * 0.9;
        drawLines(ctx, [word], left ? px - pr - 7 : px + pr + 7, py, 12, inside(px, py) > 0.5 ? hue : held(px, py) ? withAlpha(t.text, 0.86) : withAlpha(t.text, 0.62), left ? "right" : "left", undefined, 500);
      });
      if (wall && corners.length >= 3) {
        // the fence's name on a plate riding its top edge (the edge highest up), one word-height in from that edge's left end
        let top = 0;
        corners.forEach((c, i) => { const d = corners[(i + 1) % corners.length]!, e = corners[(top + 1) % corners.length]!; if (c[1] + d[1] < corners[top]![1] + e[1]) top = i; });
        const a = corners[top]!, z = corners[(top + 1) % corners.length]!, [l, r] = a[0] <= z[0] ? [a, z] : [z, a], size = NAME_SIZE, pw = voicedWidth(wall, size) + size * 2, ph = size * 2;
        const mx = l[0] + Math.min(size, Math.max(0, (r[0] - l[0] - pw) / 2)) + pw / 2, my = r[0] - l[0] > 0.5 ? l[1] + ((r[1] - l[1]) * (mx - l[0])) / (r[0] - l[0]) : l[1];
        const plate = { x: mx - pw / 2, y: my - ph / 2, w: pw, h: ph };
        rounded(ctx, plate, ph / 2);
        ctx.fillStyle = t.bg;
        ctx.fill();
        ctx.lineWidth = stroke;
        ctx.strokeStyle = withAlpha(t.text, 0.86);
        ctx.stroke();
        drawVoiced(ctx, wall, { ...plate, align: "center", size, voiced: true }, withAlpha(t.text, 0.86));
      }
      const name = b.text.split("\n")[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "tries") {
    // one column per run, a square per try stacked upward from its foot. Its levels are the retry limit, then each run's failed tries: below the limit a run's failed tries are hatched and the try
    // that passed stands solid on them with nothing above it; at the limit every try is hatched. The run's verdict is a cap over its top try, green while a try passed, red when none did, and a
    // quiet broken line across marks the limit. Its level is how many runs are drawn: a part of one grows the next run try by try (the newest fading in), its cap last. Under each, its tries counted
    const lv = b.levels && b.levels.length >= 2 ? b.levels : TRIES, limit = Math.max(1, Math.round(lv[0]!)), runs = lv.slice(1).map((r) => Math.max(0, Math.round(r))), n = runs.length;
    const v = Math.min(n, Math.max(0, b.value ?? n)), own = b.tone !== "ink" && b.tone !== "muted", ink = own ? color : withAlpha(t.text, 0.92), edge = f?.line ? sh(f.line) : own ? color : withAlpha(t.text, 0.78);
    const foot = showText ? 24 : 4, capH = 6, pitch = b.w / n, base = b.y + b.h - foot, rise = Math.max(4, Math.min((b.h - foot - capH - 8) / limit, pitch)), gap = Math.max(2, Math.min(6, rise * 0.14));
    const side = Math.max(2, Math.min(rise - gap, pitch * 0.64)), w = f?.w ?? Math.max(1, stroke * 0.75), line = base - limit * rise;
    // the limit: a line across, quiet and broken (it is not one of the tries)
    ctx.beginPath();
    ctx.moveTo(b.x, line); ctx.lineTo(b.x + b.w, line);
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.4);
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < n; i++) {
      const got = c01(v - i);
      if (got <= 0) break;
      const failed = Math.min(limit, runs[i]!), passed = failed < limit, count = passed ? failed + 1 : limit, shown = got * (count + 1), cx = b.x + pitch * (i + 0.5), x0 = cx - side / 2;
      for (let u = 0; u < count; u++) {
        const a = c01(shown - u);
        if (a <= 0) break;
        const r = { x: x0, y: base - (u + 1) * rise + gap / 2, w: side, h: side }, solid = passed && u === count - 1;
        ctx.save();
        ctx.globalAlpha *= a;
        rounded(ctx, r, 2);
        ctx.fillStyle = solid ? ink : t.bg;
        ctx.fill();
        if (!solid) {
          hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
          ctx.lineWidth = 0.75;
          ctx.strokeStyle = own ? withAlpha(color, 0.6) : withAlpha(t.text, 0.36);
          ctx.stroke();
          rounded(ctx, r, 2);
          ctx.lineWidth = w;
          ctx.strokeStyle = edge;
          ctx.stroke();
        }
        ctx.restore();
      }
      // the verdict: a cap over the top try, clear of the limit line
      const cap = c01(shown - count);
      if (cap > 0) {
        const top = base - count * rise + gap / 2, y = (count >= limit ? line - 3 : top - 4) - capH;
        rounded(ctx, { x: x0, y: y + (1 - cap) * 4, w: side, h: capH }, 2);
        ctx.fillStyle = withAlpha(passed ? t.tones.green : t.tones.red, cap);
        ctx.fill();
      }
      if (showText) drawLines(ctx, [String(Math.round(Math.min(count, shown)))], cx, base + foot / 2 + 2, 12, withAlpha(t.text, (passed ? 0.6 : 0.9) * Math.min(1, got * 4)), "center", undefined, 400);
    }
    caption();
  } else if (k === "trie") {
    // a prompt tree: prompts, each a run of welded parts, drawn as one strip as far as they agree and splitting where they first differ. Its words are the prompts, one a line, their parts
    // between " | " (a part's name after two spaces goes under it, as segments' do); its levels are how many prompts there are, how far each has grown out of where it leaves the ones before it
    // (0 to 1), then each part's size, prompt by prompt (a part shared with an earlier prompt keeps that one's size). A part is as wide as its size, so the strips are to scale; a split is a
    // square elbow out of a point at the end of the trunk. Its level is the prompt in question, from 1: its path from the root is lit, sliding from one path to the next between them
    const P = (b.text.trim() ? b.text : TRIE_TEXT).split("\n").filter((l) => l.trim()).map((l) => l.split(" | ").map((s) => s.trim()).filter(Boolean)).filter((p) => p.length), n = P.length;
    if (n) {
      const lv = b.levels ?? [], given = lv.length >= 1 && Math.round(lv[0]!) === n;
      const grow = P.map((_, p) => (given ? c01(lv[1 + p] ?? 1) : 1));
      type Node = { name: string; size: number; parent: number; kids: number[]; ps: number[]; intro: number; run: boolean; x0: number; x1: number; y: number; conn: number; seen: number; grown: number };
      const N: Node[] = [], top: number[] = [], paths: number[][] = [];
      let at = 1 + n;
      P.forEach((parts, p) => {
        let cur = -1;
        const path: number[] = [];
        parts.forEach((name) => {
          const size = given ? Math.max(0.05, lv[at] ?? 1) : 1;
          at++;
          const sibs = cur < 0 ? top : N[cur]!.kids, hit = sibs.find((i) => N[i]!.name === name);
          if (hit !== undefined) { N[hit]!.ps.push(p); cur = hit; }
          else { N.push({ name, size, parent: cur, kids: [], ps: [p], intro: p, run: false, x0: 0, x1: 0, y: 0, conn: 0, seen: 0, grown: 0 }); sibs.push(N.length - 1); cur = N.length - 1; }
          path.push(cur);
        });
        paths.push(path);
      });
      // a part carries on its parent's strip when it is the parent's only part after it and every prompt through the parent goes on through it; otherwise it starts a strip of its own, a gap after
      N.forEach((d) => { const up = N[d.parent]; d.run = !up || !(up.kids.length === 1 && up.ps.length === d.ps.length); });
      const subs = P.some((p) => p.some((s) => /\S {2,}\S/.test(s))), pitch = b.h / n, sh = Math.max(14, Math.min(56, pitch - (subs ? 34 : 14))), G = Math.max(12, Math.min(36, b.w * 0.06));
      const gaps = (i: number): number => { let g = 0; for (let d = N[i]!; d; d = N[d.parent]!) if (d.run && d.parent >= 0) g++; return g; };
      const sizes = (i: number): number => { let s = 0; for (let d = N[i]!; d; d = N[d.parent]!) s += d.size; return s; };
      const u = Math.max(0.01, Math.min(...paths.map((path) => (b.w - gaps(path.at(-1)!) * G) / sizes(path.at(-1)!))));
      N.forEach((d) => { const up = N[d.parent]; d.x0 = up ? up.x1 + (d.run ? G : 0) : b.x; d.x1 = d.x0 + d.size * u; d.y = b.y + (d.ps.reduce((a, p) => a + p + 0.5, 0) / d.ps.length) * pitch; });
      // growing: each prompt grows the parts no prompt before it has, in order from where it leaves them, the elbow into its first part first
      paths.forEach((path, p) => {
        const own = path.filter((i) => N[i]!.intro === p), len = (i: number) => (N[i]!.run && N[i]!.parent >= 0 ? G + Math.abs(N[i]!.y - N[N[i]!.parent]!.y) : 0);
        let left = grow[p]! * own.reduce((a, i) => a + len(i) + N[i]!.size * u, 0);
        for (const i of own) { const c = len(i), d = N[i]!; d.conn = c ? c01(left / c) : 1; left = Math.max(0, left - c); d.grown = c01(left / (d.size * u)); left = Math.max(0, left - d.size * u); }
      });
      // how lit each part is: on the path of the prompt in question, or part way between two of them
      const v = Math.max(0, Math.min(n, b.value ?? 0)), lo = Math.floor(v), fr = v - lo;
      N.forEach((d, i) => { d.seen = (lo >= 1 && paths[lo - 1]!.includes(i) ? 1 - fr : 0) + (lo + 1 <= n && fr > 0 && paths[lo]!.includes(i) ? fr : 0); });
      const w = f?.w ?? stroke, ink = (a: number) => (a > 0.001 ? withAlpha(t.accent, a) : color);
      // the elbows: out of the middle of the parent's end, square, into the middle of the part's start, drawn as far as it has grown
      const elbow = (d: Node, much: number) => {
        const up = N[d.parent]!, x0 = up.x1, y0 = up.y, xm = x0 + G / 2, dy = d.y - y0, r = Math.min(6, Math.abs(dy) / 2, G / 4), s = Math.sign(dy);
        const pts: [number, number][] = dy ? [[x0, y0], [xm, y0], [xm, d.y], [d.x0, d.y]] : [[x0, y0], [d.x0, d.y]];
        const seg = pts.slice(1).map((q, j) => Math.hypot(q[0] - pts[j]![0], q[1] - pts[j]![1])), all = seg.reduce((a, x) => a + x, 0);
        let go = much * all;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let j = 0; j < seg.length && go > 0.01; j++) {
          const q = Math.min(1, go / seg[j]!), [ax, ay] = pts[j]!, [bx, by] = pts[j + 1]!, ex = ax + (bx - ax) * q, ey = ay + (by - ay) * q;
          // (its corners rounded, as the board's square wires are)
          if (dy && j === 0 && q === 1) { ctx.lineTo(bx - r, by); ctx.quadraticCurveTo(bx, by, bx, by + s * r); }
          else if (dy && j === 1 && q === 1) { ctx.lineTo(bx, by - s * r); ctx.quadraticCurveTo(bx, by, bx + r, by); }
          else ctx.lineTo(ex, ey);
          go -= seg[j]!;
        }
        return much > 0;
      };
      N.forEach((d) => {
        if (!d.run || d.parent < 0 || d.conn <= 0) return;
        if (!elbow(d, d.conn)) return;
        ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineJoin = "round"; ctx.stroke();
        if (d.seen > 0.001) { elbow(d, d.conn); ctx.strokeStyle = withAlpha(t.accent, d.seen); ctx.stroke(); }
      });
      // the strips: each a run of parts welded end to end, as segments are, as far as they have grown
      N.forEach((r) => {
        if (!r.run) return;
        const chain: Node[] = [r];
        for (let d = r; d.kids.length === 1 && !N[d.kids[0]!]!.run; d = N[d.kids[0]!]!) chain.push(N[d.kids[0]!]!);
        const shown: Node[] = [];
        for (const d of chain) { if (d.grown <= 0.001) break; shown.push(d); if (d.grown < 0.999) break; }
        const ws = shown.map((d) => d.size * u * d.grown), vw = ws.reduce((a, x) => a + x, 0);
        if (vw < 2) return;
        const box = { kind: "segments" as const, x: r.x0, y: r.y - sh / 2, w: vw, h: sh, text: shown.map((d) => d.name).join("\n"), levels: ws };
        const path = () => (vw < 26 ? rounded(ctx, box, Math.min(6, vw / 2)) : kindPath(ctx, box));
        path(); paper();
        let x = r.x0;
        shown.forEach((d, i) => {
          const pw = ws[i]!;
          if (d.seen > 0.001) { ctx.save(); path(); ctx.clip(); ctx.fillStyle = withAlpha(t.accent, 0.12 * d.seen); ctx.fillRect(x, box.y, pw, sh); ctx.restore(); }
          if (i > 0) { ctx.beginPath(); ctx.moveTo(x, box.y + NOTCH_D + 2); ctx.lineTo(x, box.y + sh - NOTCH_D - 2); ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(color, 0.3); ctx.stroke(); }
          if (showText) {
            const [a, z] = d.name.split(/ {2,}/), on = d.seen >= 0.5;
            // its words fit inside it, smaller where the part is narrow, and come in once it has room for them
            let fs = Math.min(15, sh * 0.3); ctx.font = fontOf(fs, 0.02, 400); const tw = ctx.measureText(a!).width + a!.length * fs * 0.02; if (tw > pw - 16) fs = Math.max(8, fs * ((pw - 16) / tw));
            ctx.save(); ctx.globalAlpha *= c01((pw - 8) / 24);
            drawLines(ctx, [a!], x + pw / 2, r.y, fs, on ? t.accent : withAlpha(t.text, v >= 1 ? 0.55 : 0.9), "center", 0.02, on ? 500 : 400);
            if (z) drawLines(ctx, [z], x + pw / 2, box.y + sh + 17, 12, on ? t.accent : withAlpha(t.text, 0.62), "center", 0.06, 500);
            ctx.restore();
          }
          x += pw;
        });
        path(); line(w);
        // where it splits, a point at its end that the elbows leave from
        const end = shown.at(-1)!;
        if (end.grown >= 0.999 && end.kids.filter((i) => N[i]!.conn > 0).length > 1) {
          const lit2 = Math.max(0, ...end.kids.map((i) => N[i]!.seen));
          ctx.beginPath(); ctx.ellipse(end.x1, end.y, 3.5, 3.5, 0, 0, Math.PI * 2); ctx.fillStyle = ink(lit2 >= 0.5 ? 1 : 0); ctx.fill();
        }
      });
    }
  } else if (k === "cone") {
    // a forecast fan on a time axis: its levels are the months the axis spans, the ceiling, whether an old band stands, the band [from, aim, slope, spread], the old band the same way, then a real
    // point's height for each month. The band starts at its month on its aim and widens low to high ahead of it, a faint tint between two quiet edges and a broken line down its middle; the old band
    // it was re-aimed from stands as two fainter broken edges. Real points come in month by month (its level is how many, a part of one fading the next in), joined by the line they make: a point
    // outside the band it was read against (the band past its month, the old band up to it) is red; the newest is lit. The ceiling is a broken line across with its words over it; the instant the band's top meets it drops a tick to the axis and a
    // dot lights there (the old band's instant an open dot), its words under the axis
    const lv = b.levels && b.levels.length >= 12 ? b.levels : CONE, span = Math.max(1, lv[0]!), ceil = c01(lv[1]!), ghost = lv[2]! > 0.01 ? c01(lv[2]!) : 0;
    const band = lv.slice(3, 7) as [number, number, number, number], was = lv.slice(7, 11) as [number, number, number, number], pts = lv.slice(11), n = pts.length;
    const said = b.text.split("\n"), words = said[1] ?? "", when = said[2] ?? "", foot = showText && when.trim() ? 22 : 4;
    const ox = b.x, oy = b.y + b.h - foot, W = b.w, H = b.h - foot - 8, px = (m: number) => ox + (m / span) * W, py = (l: number) => oy - l * H;
    const v = Math.min(n, Math.max(0, b.value ?? n)), own = b.tone !== "ink" && b.tone !== "muted", ink = own ? color : withAlpha(t.text, 0.85);
    const edge = (q: number[], m: number, s: number) => q[1]! + (q[2]! + s * q[3]!) * (m - q[0]!);
    const outside = (q: number[], m: number, l: number) => m > q[0]! + 1e-6 && (l > edge(q, m, 1) + 1e-6 || l < edge(q, m, -1) - 1e-6);
    // where the band's top meets the ceiling, if it does on the axis
    const meet = (q: number[]) => { const r = q[2]! + q[3]!; if (r <= 1e-6) return -1; const m = q[0]! + (ceil - q[1]!) / r; return m >= q[0]! && m <= span + 0.1 ? Math.min(span, m) : -1; };
    const fan = (q: number[]) => { const m0 = Math.max(0, q[0]!); ctx.beginPath(); ctx.moveTo(px(m0), py(edge(q, m0, 1))); ctx.lineTo(px(span), py(edge(q, span, 1))); ctx.lineTo(px(span), py(edge(q, span, -1))); ctx.lineTo(px(m0), py(edge(q, m0, -1))); ctx.closePath(); };
    const sides = (q: number[]) => { const m0 = Math.max(0, q[0]!); ctx.beginPath(); for (const s of [1, -1]) { ctx.moveTo(px(m0), py(edge(q, m0, s))); ctx.lineTo(px(span), py(edge(q, span, s))); } };
    ctx.save();
    ctx.beginPath(); ctx.moveTo(ox, b.y - 2); ctx.lineTo(ox + W + 1, b.y - 2); ctx.lineTo(ox + W + 1, oy); ctx.lineTo(ox, oy); ctx.closePath(); ctx.clip();
    if (ghost > 0) {
      // the old band: two fainter broken edges, nothing between them
      sides(was);
      ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.3 * ghost); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
    fan(band);
    ctx.fillStyle = withAlpha(lit, 0.08);
    ctx.fill();
    sides(band);
    ctx.lineWidth = Math.max(1, stroke * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px(Math.max(0, band[0])), py(band[1])); ctx.lineTo(px(span), py(edge(band, span, 0)));
    ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.4); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    // the axes
    ctx.beginPath();
    ctx.moveTo(ox, b.y); ctx.lineTo(ox, oy); ctx.lineTo(b.x + b.w + 8, oy);
    ctx.moveTo(ox - 3.5, b.y + 6); ctx.lineTo(ox, b.y); ctx.lineTo(ox + 3.5, b.y + 6);
    ctx.moveTo(b.x + b.w + 2, oy - 3.5); ctx.lineTo(b.x + b.w + 8, oy); ctx.lineTo(b.x + b.w + 2, oy + 3.5);
    ctx.lineWidth = Math.max(1, stroke * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.7); ctx.lineJoin = "round"; ctx.stroke(); ctx.lineJoin = "miter";
    // a tick a month, quiet
    ctx.beginPath();
    for (let m = 1; m < span; m++) { ctx.moveTo(px(m), oy); ctx.lineTo(px(m), oy + 3); }
    ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.3); ctx.stroke();
    // the ceiling: broken, firmer than a guide, its words just over it at the left
    const cy = py(ceil);
    ctx.beginPath(); ctx.moveTo(ox, cy); ctx.lineTo(b.x + b.w, cy);
    ctx.lineWidth = Math.max(1, stroke * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    if (words.trim() && showText) {
      const wy = cy - 9 < b.y + 4 ? cy + 13 : cy - 9;
      if (f?.prose) drawLines(ctx, [words], ox + 8, wy, 12, withAlpha(t.text, 0.62), "left", undefined, 400, undefined, true);
      else drawLines(ctx, [words], ox + 8, wy, 10, withAlpha(t.text, 0.62), "left", 0.06, 500);
    }
    // the instants it fills: the old band's an open dot, the band's a tick from the ceiling and a lit dot
    const gm = ghost > 0 ? meet(was) : -1, bm = meet(band);
    if (gm >= 0 && Math.abs(gm - bm) > 0.05) {
      ctx.save(); ctx.globalAlpha *= ghost;
      ctx.beginPath(); ctx.ellipse(px(gm), oy, 3.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg; ctx.fill(); ctx.lineWidth = 1.25; ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke();
      ctx.restore();
    }
    if (bm >= 0) {
      ctx.beginPath(); ctx.moveTo(px(bm), cy); ctx.lineTo(px(bm), oy);
      ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(px(bm), oy, 3.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = lit; ctx.fill();
      if (when.trim() && showText) {
        if (f?.prose) drawLines(ctx, [when], px(bm), oy + 14, 12, withAlpha(t.text, 0.72), "center", undefined, 400, undefined, true);
        else drawLines(ctx, [when], px(bm), oy + 14, 10, withAlpha(t.text, 0.72), "center", 0.06, 500);
      }
    }
    // the real points, as many as are in, joined by the line they make
    const got = Math.ceil(v - 1e-6);
    if (got > 1) {
      ctx.beginPath();
      ctx.moveTo(px(0), py(pts[0]!));
      for (let i = 1; i < got; i++) { const a = c01(v - i), l0 = pts[i - 1]!, l1 = pts[i]!; ctx.lineTo(px(i - 1 + a), py(l0 + (l1 - l0) * a)); }
      ctx.lineWidth = stroke * 1.2; ctx.strokeStyle = ink; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(); ctx.lineCap = "butt"; ctx.lineJoin = "miter";
    }
    for (let i = 0; i < got; i++) {
      const a = c01(v - i), l = pts[i]!, red = i > band[0] + 1e-6 ? outside(band, i, l) : ghost > 0.5 && outside(was, i, l);
      ctx.save(); ctx.globalAlpha *= a;
      ctx.beginPath(); ctx.ellipse(px(i), py(l), 3.5, 3.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = red ? t.tones.red : i === got - 1 ? lit : ink; ctx.fill();
      ctx.restore();
    }
    // its name alone over it (the ceiling's words and the instant's are drawn where they stand)
    if (said[0]!.trim() && showText) { if (f?.prose) drawLines(ctx, [said[0]!], spot.align === "center" ? spot.x + spot.w / 2 : spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), spot.align, undefined, 400); else drawVoiced(ctx, said[0]!, spot, withAlpha(t.text, 0.62)); }
  } else if (k === "reaches") {
    // a scatter that keeps several reaches at once: its levels are how many reaches, each [x, y, r] (centre 0 to 1 across and down, r 0 to 1 of its width), then its points [x, y]; its words are
    // a name, a name for each reach, then a word for each point. Its level is how many reaches are drawn, a part of one growing the next from its centre. Each is a broken circle over a faint tint
    // with its name over its top, the newest in the accent (or the colour it is given) and the ones kept before it in ink; a point inside any of them is filled and lit, the rest stand open
    const lv = b.levels && b.levels.length >= 1 ? b.levels : REACHES, nr = Math.max(0, Math.min(12, Math.round(lv[0]!))), words = b.text.split("\n"), names = words.slice(1, 1 + nr), says = words.slice(1 + nr);
    const v = Math.max(0, b.value ?? 0), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, w = f?.w ?? Math.max(1, stroke * 0.75), pr = 5;
    const X = (a: number) => b.x + a * b.w, Y = (q: number) => b.y + q * b.h, newest = Math.min(nr, Math.ceil(v - 1e-6)) - 1;
    const reach = Array.from({ length: nr }, (_, i) => ({ cx: X(lv[1 + i * 3] ?? 0.5), cy: Y(lv[2 + i * 3] ?? 0.5), R: Math.max(0, lv[3 + i * 3] ?? 0) * b.w * c01(v - i), g: c01(v - i), hue: i === newest ? hue : withAlpha(t.text, 0.62) }));
    const pts: [number, number][] = [];
    for (let q = 1 + nr * 3; q + 1 < lv.length; q += 2) pts.push([X(lv[q]!), Y(lv[q + 1]!)]);
    const inside = (px: number, py: number) => reach.reduce((m, r) => Math.max(m, r.R > 0.5 ? c01((r.R - Math.hypot(px - r.cx, py - r.cy)) / 6 + 0.5) : 0), 0);
    for (const r of reach) {
      if (r.R <= 0.5) continue;
      ctx.beginPath();
      ctx.ellipse(r.cx, r.cy, r.R, r.R, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(r.hue === hue ? hue : t.text, r.hue === hue ? 0.06 : 0.03);
      ctx.fill();
      ctx.lineWidth = w;
      ctx.strokeStyle = r.hue === hue ? withAlpha(hue, 0.8) : r.hue;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const [px, py] of pts) {
      const on = inside(px, py);
      ctx.beginPath();
      ctx.ellipse(px, py, pr, pr, 0, 0, Math.PI * 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, on); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(t.text, 0.7);
      ctx.stroke();
    }
    for (const r of reach) {
      if (r.g <= 0) continue;
      // (each centre larger than a point, with a ring of paper about it, so it never reads as one of them)
      ctx.beginPath();
      ctx.ellipse(r.cx, r.cy, 9, 9, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, Math.min(1, r.g * 20));
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r.cx, r.cy, 7, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = r.hue === hue ? withAlpha(hue, Math.min(1, r.g * 20)) : r.hue;
      ctx.fill();
    }
    if (showText) {
      pts.forEach(([px, py], i) => {
        const word = says[i]?.trim();
        if (!word) return;
        const left = px > b.x + b.w * 0.9;
        drawLines(ctx, [word], left ? px - pr - 7 : px + pr + 7, py, 12, inside(px, py) > 0.5 ? hue : withAlpha(t.text, 0.62), left ? "right" : "left", undefined, 500);
      });
      // each reach's name over the top of its circle, once it has grown
      reach.forEach((r, i) => {
        const name = names[i]?.trim();
        if (!name || r.R <= 0.5) return;
        // (on a strip of paper, so a point or a circle under it never runs through the words)
        const nw = name.length * 6.6 + 10;
        rounded(ctx, { x: r.cx - nw / 2, y: r.cy - r.R - 18, w: nw, h: 16 }, 8);
        ctx.fillStyle = withAlpha(t.bg, 0.85);
        ctx.fill();
        drawLines(ctx, [name], r.cx, r.cy - r.R - 10, 12, r.hue === hue ? withAlpha(hue, c01(r.g * 2)) : r.hue, "center", undefined, 600);
      });
      const name = words[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "field") {
    // a field of named keys placed by two measures (across and up, 0 to 1 of the mark from its bottom left), with keep regions cut across it. Its words are the measure across, the measure up,
    // a name for each cut, then a word for each key. Its levels are how many cuts, then each cut [axis (0 across, 1 up), at, corner (0: none)], then each key [x, y, there (0 to 1)].
    // A cut across keeps what is right of `at` (with a corner, also what is above it); a cut up keeps what is above `at` (with a corner, also what is right of it): each region is the field less
    // one box at its bottom left, its edge a heavy line, an L when it has a corner. A key outside every region fades out; its level is the cut in play, from 1 (0: none), sliding to the next
    // between two: that region is tinted and edged in the accent (or the colour the field is given), and the keys inside it lit. Where regions overlap their tints add up
    const FIELD = [2, 0, 0.5, 0, 1, 0.62, 0.8, 0.82, 0.78, 1, 0.64, 0.3, 1, 0.3, 0.8, 1, 0.18, 0.2, 1, 0.9, 0.16, 1];
    const lv = b.levels && b.levels.length >= 1 ? b.levels : FIELD, nc = Math.max(0, Math.min(8, Math.round(lv[0]!))), words = b.text.split("\n"), across = words[0] ?? "", up = words[1] ?? "";
    const names = words.slice(2, 2 + nc), says = words.slice(2 + nc);
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), v = b.value ?? 0;
    const X = (a: number) => b.x + a * b.w, Y = (q: number) => b.y + b.h - q * b.h;
    // each cut as the box it leaves out, [ea, eq] from the bottom left, and how much it is in play
    const cuts = Array.from({ length: nc }, (_, i) => {
      const axis = lv[1 + i * 3] ?? 0, at = c01(lv[2 + i * 3] ?? 0.5), corner = c01(lv[3 + i * 3] ?? 0), up1 = axis >= 0.5;
      return { ea: up1 ? (corner > 0 ? corner : 1) : at, eq: up1 ? at : corner > 0 ? corner : 1, lit: c01(1 - Math.abs(v - (i + 1))) };
    });
    const keys: [number, number, number][] = [];
    for (let q = 1 + nc * 3; q + 1 < lv.length; q += 3) keys.push([lv[q]!, lv[q + 1]!, c01(lv[q + 2] ?? 1)]);
    // how far inside a cut's region a point is, in pixels (below 0: outside)
    const depth = (c: (typeof cuts)[number], a: number, q: number) => Math.max((a - c.ea) * b.w, (q - c.eq) * b.h);
    const region = (c: (typeof cuts)[number]) => {
      ctx.beginPath();
      ctx.moveTo(X(c.ea), Y(0)); ctx.lineTo(X(1), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.lineTo(X(0), Y(1)); ctx.lineTo(X(0), Y(c.eq)); ctx.lineTo(X(c.ea), Y(c.eq)); ctx.closePath();
    };
    ctx.save();
    ctx.fillStyle = t.bg;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    for (const c of cuts) {
      region(c);
      ctx.fillStyle = withAlpha(t.text, 0.045 * (1 - c.lit));
      ctx.fill();
      if (c.lit > 0) { ctx.fillStyle = withAlpha(hue, 0.1 * c.lit); ctx.fill(); }
    }
    // the measures: a baseline along the bottom and up the left, ticked at their ends
    ctx.beginPath();
    ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0), Y(0)); ctx.lineTo(X(1), Y(0));
    ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(0) + 5); ctx.moveTo(X(1), Y(0)); ctx.lineTo(X(1), Y(0) + 5); ctx.moveTo(X(0), Y(1)); ctx.lineTo(X(0) - 5, Y(1));
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // each cut's edge: a heavy line, an L when it has a corner, lit as it comes into play
    const heavy = Math.max(2, stroke * 2);
    for (const c of cuts) {
      ctx.beginPath();
      if (c.eq < 1) { ctx.moveTo(X(0), Y(c.eq)); ctx.lineTo(X(Math.min(1, c.ea)), Y(c.eq)); } else ctx.moveTo(X(c.ea), Y(1));
      if (c.ea < 1) ctx.lineTo(X(c.ea), Y(0));
      ctx.lineCap = "square";
      ctx.lineWidth = heavy;
      ctx.strokeStyle = withAlpha(t.text, 0.86 * (1 - c.lit));
      if (c.lit < 1) ctx.stroke();
      if (c.lit > 0) { ctx.lineWidth = heavy + stroke * 0.5 * c.lit; ctx.strokeStyle = withAlpha(hue, c.lit); ctx.stroke(); }
      ctx.lineCap = "butt";
    }
    // the keys: a small capsule each with its word, faded out once outside every region, lit inside the region in play
    keys.forEach(([a, q, there], i) => {
      const word = says[i]?.trim() ?? "", ds = cuts.map((c) => depth(c, a, q)), most = ds.length ? Math.max(...ds) : 1;
      const o = there * (most >= 0 ? 1 : c01(1 + most / 36)), on = Math.max(0, ...cuts.map((c, j) => c.lit * c01(ds[j]! / 12 + 0.5)));
      if (o <= 0.01) return;
      const kw = Math.max(26, layoutText(word, Infinity, 12, undefined, 500).w + 22), kh = 26, r = { x: X(a) - kw / 2, y: Y(q) - kh / 2, w: kw, h: kh };
      ctx.save();
      ctx.globalAlpha *= o;
      rounded(ctx, r, kh / 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      ctx.lineWidth = w;
      ctx.strokeStyle = on > 0.5 ? hue : withAlpha(t.text, 0.7);
      ctx.stroke();
      if (showText && word) drawLines(ctx, [word], X(a), Y(q), 12, on > 0.5 ? hue : withAlpha(t.text, 0.86), "center", undefined, 500);
      ctx.restore();
    });
    ctx.restore();
    if (showText) {
      const quiet1 = withAlpha(t.text, 0.62);
      if (across) drawVoiced(ctx, across, { x: b.x + b.w - voicedWidth(across, CAPTION_SIZE), y: b.y + b.h + 12, w: voicedWidth(across, CAPTION_SIZE), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, quiet1);
      if (up) drawVoiced(ctx, up, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, quiet1);
      // each cut named where its edge starts, inside what it keeps: over a line across at its left end, beside a line up at its top
      cuts.forEach((c, i) => {
        const name = names[i]?.trim();
        if (!name) return;
        const ink = c.lit > 0.5 ? hue : withAlpha(t.text, 0.86), nw = voicedWidth(name, CAPTION_SIZE);
        const s = c.eq < 1 ? { x: X(0) + 10, y: Y(c.eq) - 22 } : { x: X(c.ea) + 10, y: Y(1) + 8 };
        drawVoiced(ctx, name, { ...s, w: nw, h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, ink, 600);
      });
    }
  } else if (k === "columns") {
    // an upright bar for each of its levels (0 to 1 of its height), all standing on one shared baseline along its bottom, a bar centred in each of as many equal slots across it
    // (so columns given a segments strip's x and width sit one under each of its parts). Each is hatched from the baseline up, as a region singled out is; its level is the bar picked,
    // from 1 (0: none; a part of one: between two), which takes the accent (or the colour the columns are given). Lines of its words after the first are set over each bar's top
    // Given a `span` and twice as many levels, the second half are ghosts: each bar's dashed outline up to the height it would have reached (0 to 1), drawn up from its own top when taller,
    // in the columns' own colour (if given one) or faint ink, so "what it would have taken" stands right over "what it took"; a beat's `cut` grows it from the bar's top
    // Hung (`hang`), the baseline runs along its top and everything is turned over it: each bar reaches down, its ghost on down past its end, its words under it, its name under the mark,
    // so a row hung under another on the same line reads as that row's reflection. Split (`split`), the second half are lines across the bars instead: each at its height (0 to 1, at most the bar's),
    // the part of the bar beyond it hatched in the accent (or the columns' colour) as the share in question; at 0 there is no line and the bar is plain, and a beat's `cut` raises it from the base
    const lv = b.levels && b.levels.length ? b.levels : COLUMNS, paired = !!b.span && lv.length === b.span * 2, splits = paired && !!b.split, ghosts = paired && !splits, n = paired ? b.span! : lv.length, v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent;
    const pitch = b.w / n, bw = Math.max(2, Math.min(pitch * 0.48, pitch - 6)), hang = !!b.hang, dn = hang ? 1 : -1, base = hang ? b.y : b.y + b.h, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), says = b.text.split("\n").slice(1);
    for (let i = 0; i < n; i++) {
      const hh = c01(lv[i] ?? 0) * b.h, r = { x: b.x + pitch * (i + 0.5) - bw / 2, y: hang ? base : base - hh, w: bw, h: hh }, on = v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0;
      const gh = ghosts ? c01(lv[n + i] ?? 0) * b.h : 0, over = gh - hh >= 0.5;
      if (over) {
        const top = base + dn * gh, end = base + dn * hh, rr = Math.min(2, (gh - hh) / 2) * -dn;
        ctx.beginPath();
        ctx.moveTo(r.x, end); ctx.lineTo(r.x, top + rr); ctx.quadraticCurveTo(r.x, top, r.x + Math.abs(rr), top);
        ctx.lineTo(r.x + bw - Math.abs(rr), top); ctx.quadraticCurveTo(r.x + bw, top, r.x + bw, top + rr); ctx.lineTo(r.x + bw, end);
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = w;
        ctx.strokeStyle = own ? withAlpha(hue, 0.85) : withAlpha(t.text, 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (hh >= 0.5) {
        const rd = Math.min(2, hh / 2), round = hang ? [0, 0, rd, rd] : [rd, rd, 0, 0];
        corners(ctx, r.x, r.y, r.w, r.h, round);
        ctx.fillStyle = t.bg;
        ctx.fill();
        if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
        // split, the part from the base to the line is hatched as any bar is, the part beyond it in the accent, coming in as the line leaves the base
        const sp = splits ? Math.min(hh, c01(lv[n + i] ?? 0) * b.h) : 0, sa = c01(sp / 8), near = sa > 0 ? { x: r.x, y: hang ? base : base - sp, w: bw, h: sp } : r;
        hatching(ctx, near, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
        if (sa > 0 && hh - sp >= 0.5) {
          const far = { x: r.x, y: hang ? base + sp : base - hh, w: bw, h: hh - sp };
          ctx.fillStyle = withAlpha(hue, 0.12 * sa);
          ctx.fillRect(far.x, far.y, far.w, far.h);
          hatching(ctx, far, b.x + b.y + b.h, f?.crisp ? 4 : 5);
          ctx.lineWidth = 0.75;
          ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - sa));
          ctx.stroke();
          ctx.strokeStyle = withAlpha(hue, 0.7 * sa);
          ctx.stroke();
          // the line across, in the bar's own ink
          ctx.beginPath();
          ctx.moveTo(r.x, base + dn * sp); ctx.lineTo(r.x + bw, base + dn * sp);
          ctx.lineWidth = w;
          ctx.strokeStyle = withAlpha(edge, sa);
          ctx.stroke();
        }
        corners(ctx, r.x, r.y, r.w, r.h, round);
        ctx.lineWidth = w;
        ctx.strokeStyle = edge;
        ctx.stroke();
        if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
      }
      if (says[i]?.trim() && showText) {
        // over a ghost, the word sits on a patch of paper so the dashed sides do not run through it
        if (over) { ctx.font = fontOf(11, undefined, 500); const tw = ctx.measureText(says[i]!.trim()).width + 8; ctx.fillStyle = t.bg; ctx.fillRect(r.x + bw / 2 - tw / 2, base + dn * hh + (hang ? 4 : -20), tw, 16); }
        drawLines(ctx, [says[i]!.trim()], r.x + bw / 2, base + dn * (hh + 12), 11, on > 0.5 ? hue : withAlpha(t.text, 0.62), "center", undefined, 500);
      }
    }
    // the shared baseline, a little past the first slot and the last
    ctx.beginPath();
    ctx.moveTo(b.x, base); ctx.lineTo(b.x + b.w, base);
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    if (b.text && showText) {
      const name = b.text.split("\n")[0]!, at = hang ? { ...spot, y: b.y + b.h + 3 } : spot;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], at.x, at.y + at.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, at, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "roulette") {
    // a ring cut into slices as wide as their sizes, a band standing inside the circle (its levels: a slice's depth, 0 to 1 of the radius, then each slice's size), turned clockwise by its level
    // (in turns: at 0 the first slice starts at the top) under a pointer fixed at the top, outside the rim. The slice under the pointer is lit, tinted and hatched in the accent (or the colour it is
    // given). Lines of its words after the first name the slices, set in the hole by them and riding round as they turn; names too close together are fanned apart, a sliver's name fades out
    const lv = b.levels && b.levels.length > 1 ? b.levels : ROULETTE, sizes = lv.slice(1).map((s) => Math.max(0, s)), sum = sizes.reduce((a, s) => a + s, 0) || 1, v = b.value ?? 0;
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), hatchGap = f?.crisp ? 4 : 5;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(4, Math.min(b.w, b.h) / 2 / ROULETTE_ROOM), inner = r * (1 - Math.min(0.95, Math.max(0.05, lv[0] ?? 0.32))), reach = Math.max(10, Math.min(22, r * 0.12));
    const ang = (u: number) => (u + v) * Math.PI * 2 - Math.PI / 2, band = (a0: number, a1: number) => { ctx.beginPath(); sweep(ctx, cx, cy, r, a0, a1); sweep(ctx, cx, cy, inner, a1, a0, true); ctx.closePath(); };
    // where each slice starts and ends, as a share of the whole, and the one the pointer stands over (the top, a turn of `v` back round from where the first slice began)
    const ends: [number, number][] = []; let run = 0;
    for (const s of sizes) { ends.push([run / sum, (run += s) / sum]); }
    const under = (((-v) % 1) + 1) % 1, picked = ends.findIndex(([u0, u1], i) => sizes[i]! > 0 && under >= u0 && under < u1);
    ends.forEach(([u0, u1], i) => {
      const span = (u1 - u0) * Math.PI * 2;
      if (span < 1e-4) return;
      // (a hair apart, as a wheel's slots are; a sliver keeps a sliver of itself)
      const g = Math.min(span * 0.2, 1.5 / r), a0 = ang(u0) + g, a1 = ang(u1) - g, on = i === picked;
      band(a0, a1);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on) {
        ctx.fillStyle = withAlpha(hue, 0.12);
        ctx.fill();
        ctx.save();
        ctx.clip();
        hatching(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, b.x + b.y + b.h, hatchGap);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(hue, 0.7);
        ctx.stroke();
        ctx.restore();
        band(a0, a1);
      }
      ctx.lineWidth = on ? stroke * 1.25 : w;
      ctx.strokeStyle = on ? hue : edge;
      ctx.stroke();
    });
    // the pointer: fixed at the top, its stem standing out over the rim and its head an arrow at it
    {
      const tip = r + 2, aw = Math.max(3, Math.min(6, reach * 0.3)), al = aw * 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy - tip - al); ctx.lineTo(cx, cy - r - reach);
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = hue;
      ctx.lineCap = "butt";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - tip); ctx.lineTo(cx + aw, cy - tip - al); ctx.lineTo(cx - aw, cy - tip - al); ctx.closePath();
      ctx.fillStyle = hue;
      ctx.fill();
    }
    if (showText) {
      // the names, in the hole by their slices: those of slivers fade, and the rest are fanned apart round the hole until each stands clear of the next
      const names = b.text.split("\n").slice(1).map((s) => s.trim()), rn = Math.max(8, inner - 10), clear = Math.min(Math.PI / 3, 30 / rn);
      const shown = ends.map(([u0, u1], i) => ({ i, a: ang((u0 + u1) / 2), o: c01(((u1 - u0) * 360 - 1.5) / 3), word: names[i] ?? "" })).filter((q) => q.word && q.o > 0);
      for (let k0 = 0; k0 < 12 && shown.length > 1; k0++) for (let j = 0; j < shown.length; j++) {
        const p = shown[j]!, q = shown[(j + 1) % shown.length]!, d = (((q.a - p.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        if (shown.length === 2 && j === 1) break;
        if (d < clear) { const push = (clear - d) / 2; p.a -= push; q.a += push; }
      }
      for (const q of shown) {
        const ux = Math.cos(q.a), uy = Math.sin(q.a), tw = q.word.length * 6.8, d = rn - Math.abs(ux) * (tw / 2) - Math.abs(uy) * 7, on = q.i === picked;
        ctx.save();
        ctx.globalAlpha *= q.o;
        drawLines(ctx, [q.word], cx + d * ux, cy + d * uy, 12, on ? hue : withAlpha(t.text, 0.72), "center", undefined, on ? 500 : 400);
        ctx.restore();
      }
    }
    caption();
  } else if (k === "icicle") {
    // nested proportional strips, a tree cut row by row: its levels are how many parts (n), then each part's [size, parent, cut, lit]: its size in the whole's units (the parts with no parent, −1,
    // share the top row and fill its width), the index of the earlier part it cuts, how far it has itself been cut (0 to 1: its own parts grown down out of it), and how lit it is. A part stands
    // exactly under the part it cuts, as wide as its size of the whole, packed from that part's left in order (squeezed when they come to more than it); a part's parts are welded into one strip as
    // segments are. In every row under the top, ground no part covers, or a part has yet to grow down over, is hatched, not looked at. Lines of its words after the first name the parts, one more the
    // ground (set on its widest stretch). Its level is the part in question (from 1): its path up to the whole is lit, tinted and named in the accent (or its own colour), as parts lit by their levels are
    const given = !!b.levels && b.levels.length >= 5, lv = given ? b.levels! : ICICLE, n = Math.max(1, Math.min(64, Math.round(lv[0]!), Math.floor((lv.length - 1) / 4)));
    const said = (given ? b.text : ICICLE_TEXT).split("\n"), names = said.slice(1, 1 + n).map((s) => s.trim()), groundWord = (said[1 + n] ?? "").trim();
    type Part = { size: number; up: number; cut: number; lamp: number; depth: number; x0: number; x1: number; g: number; kids: number[] };
    const P: Part[] = [];
    for (let i = 0; i < n; i++) {
      const up0 = Math.round(lv[2 + 4 * i] ?? -1), up = up0 >= 0 && up0 < i ? up0 : -1;
      P.push({ size: Math.max(0, lv[1 + 4 * i] ?? 0), up, cut: c01(lv[3 + 4 * i] ?? 0), lamp: c01(lv[4 + 4 * i] ?? 0), depth: up < 0 ? 0 : P[up]!.depth + 1, x0: 0, x1: 0, g: 0, kids: [] });
      if (up >= 0) P[up]!.kids.push(i);
    }
    const roots = P.map((_, i) => i).filter((i) => P[i]!.up < 0), whole = roots.reduce((a, i) => a + P[i]!.size, 0) || 1, unit = b.w / whole;
    // across: each run of parts packed from the left of what they cut (the top row from the mark's own), squeezed when they come to more than it
    const pack = (ids: number[], x0: number, room: number) => {
      const need = ids.reduce((a, i) => a + P[i]!.size * unit, 0), q = need > room && need > 0 ? room / need : 1;
      let x = x0;
      for (const i of ids) { const d = P[i]!; d.x0 = x; x += d.size * unit * q; d.x1 = x; }
    };
    pack(roots, b.x, b.w);
    for (const d of P) if (d.kids.length) pack(d.kids, d.x0, d.x1 - d.x0);
    // down: a part is there as far as the part it cuts has been cut (and is there itself)
    for (const d of P) d.g = d.up < 0 ? 1 : P[d.up]!.cut * P[d.up]!.g;
    const rows = 1 + Math.max(0, ...P.map((d) => d.depth)), pitch = b.h / rows, sh = Math.max(12, pitch - Math.max(8, Math.min(20, pitch * 0.22))), top = (r: number) => b.y + r * pitch, ins = 3;
    // lit: by its own level, or on the path from the part in question up to the whole
    const v = Math.round(b.value ?? 0), on = P.map((d) => d.lamp);
    for (let i = v - 1; i >= 0 && i < n; i = P[i]!.up) on[i] = 1;
    const anyLit = on.some((x) => x >= 0.5), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, w = f?.w ?? stroke;
    // the runs: the top row, and each part's own parts, each welded end to end
    const runs: { ids: number[]; row: number }[] = [];
    if (roots.length) runs.push({ ids: roots, row: 0 });
    P.forEach((d) => { if (d.kids.length) runs.push({ ids: d.kids, row: d.depth + 1 }); });
    const grownOf = (q: { ids: number[]; row: number }) => (q.row === 0 ? 1 : Math.max(...q.ids.map((i) => P[i]!.g)));
    // the ground: hatched wherever a row under the top has no part, and under a part still growing down
    const hatchIn = (r: Rect) => {
      if (r.w < 2 || r.h < 2) return;
      ctx.save(); rounded(ctx, r, Math.min(8, r.h / 2)); ctx.clip();
      hatching(ctx, r, b.x + b.y + b.h, 6); ctx.lineWidth = 0.75; ctx.strokeStyle = withAlpha(t.text, 0.3); ctx.stroke();
      ctx.restore();
    };
    const open: Rect[] = [];
    for (let r = 1; r < rows; r++) {
      const spans = runs.filter((q) => q.row === r).map((q) => ({ x0: P[q.ids[0]!]!.x0, x1: P[q.ids.at(-1)!]!.x1, g: grownOf(q) })).filter((s) => s.g > 0.001 && s.x1 - s.x0 > 0.5).sort((a, z) => a.x0 - z.x0);
      let x = b.x;
      for (const s of spans) {
        if (s.x0 - x > 2) open.push({ x: x + ins, y: top(r), w: s.x0 - x - 2 * ins, h: sh });
        x = Math.max(x, s.x1);
        if (s.g < 0.999) hatchIn({ x: s.x0 + ins, y: top(r) + sh * s.g, w: s.x1 - s.x0 - 2 * ins, h: sh * (1 - s.g) });
      }
      if (b.x + b.w - x > 2) open.push({ x: x + ins, y: top(r), w: b.x + b.w - x - 2 * ins, h: sh });
    }
    open.forEach(hatchIn);
    if (groundWord && showText && open.length) {
      // its words on the widest stretch of it, on a clear plate
      const big = open.reduce((a, r) => (r.w > a.w ? r : a));
      ctx.font = fontOf(12, 0.02, 400);
      const tw = ctx.measureText(groundWord).width + 16;
      if (big.w >= tw + 8) {
        rounded(ctx, { x: big.x + big.w / 2 - tw / 2, y: big.y + big.h / 2 - 11, w: tw, h: 22 }, 4); ctx.fillStyle = t.bg; ctx.fill();
        drawLines(ctx, [groundWord], big.x + big.w / 2, big.y + big.h / 2, 12, withAlpha(t.text, 0.62), "center", 0.02, 400);
      }
    }
    // the parts, each run a welded strip grown down out of what it cuts as far as it has been cut
    for (const q of runs) {
      const g = grownOf(q), x0 = P[q.ids[0]!]!.x0 + ins, x1 = P[q.ids.at(-1)!]!.x1 - ins, rw = x1 - x0, rh = sh * g;
      if (g <= 0.001 || rw < 2 || rh < 1) continue;
      const ws = q.ids.map((i, j) => Math.max(0, P[i]!.x1 - P[i]!.x0 - (j === 0 ? ins : 0) - (j === q.ids.length - 1 ? ins : 0)));
      const box = { kind: "segments" as const, x: x0, y: top(q.row), w: rw, h: rh, text: q.ids.map((i) => names[i] ?? "").join("\n"), levels: ws };
      const path = () => (rw < 26 || rh < 24 ? rounded(ctx, box, Math.min(6, rw / 2, rh / 2)) : kindPath(ctx, box));
      ctx.save();
      ctx.globalAlpha *= c01(g * 4);
      path(); ctx.fillStyle = t.bg; ctx.fill(); paper();
      let x = x0;
      q.ids.forEach((i, j) => {
        const pw = ws[j]!, lamp = on[i]!;
        if (lamp > 0.001) { ctx.save(); path(); ctx.clip(); ctx.fillStyle = withAlpha(hue, 0.12 * lamp); ctx.fillRect(x, box.y, pw, rh); ctx.restore(); }
        if (j > 0 && rh > 2 * NOTCH_D + 6) { ctx.beginPath(); ctx.moveTo(x, box.y + NOTCH_D + 2); ctx.lineTo(x, box.y + rh - NOTCH_D - 2); ctx.lineWidth = 1; ctx.strokeStyle = withAlpha(color, 0.3); ctx.stroke(); }
        const name = names[i];
        if (showText && name) {
          // its words fit inside it, smaller where it is narrow, and come in once it has room and has grown most of the way
          let fs = Math.min(15, sh * 0.3); ctx.font = fontOf(fs, 0.02, 400); const tw = ctx.measureText(name).width + name.length * fs * 0.02; if (tw > pw - 16) fs = Math.max(8, fs * ((pw - 16) / tw));
          ctx.save(); ctx.globalAlpha *= c01((pw - 8) / 24) * c01((g - 0.5) * 2);
          drawLines(ctx, [name], x + pw / 2, box.y + rh / 2, fs, lamp >= 0.5 ? hue : withAlpha(t.text, anyLit ? 0.55 : 0.9), "center", 0.02, lamp >= 0.5 ? 500 : 400);
          ctx.restore();
        }
        x += pw;
      });
      path(); line(w);
      ctx.restore();
    }
    caption();
  } else if (k === "odometer") {
    // nested loops read as a counter: its levels are its base, how many digits, its form (0: rows, 1: its product grid), then each cell's side, how far one's left edge is from the next, and the
    // gap (rows: how far one row's top is from the next; grid: between groups). Its level is the count so far. As rows, a row of `base` cells for each loop, the outermost on top, each hatched
    // up to the try its loop is on and that cell lit: the lowest row spins, and when it carries the row above ticks and the rows below it reset. As its product grid, one cell per count, grouped
    // the way the loops make them, filled in order, the newest lit. A part of a count is part way to the next: cells hatching in from the bottom, or draining as they reset. Its words: a
    // caption, then (as rows) each row's name, set to the left of it. A lit cell takes the accent, or the colour it is given
    const lv = b.levels && b.levels.length >= 3 ? b.levels : ODOMETER, B = Math.max(2, Math.min(10, Math.round(lv[0]!))), grid = (lv[2] ?? 0) >= 0.5, D = Math.max(1, Math.min(grid ? 6 : 12, Math.round(lv[1]!)));
    const size0 = lv[3] ?? 28, pitch0 = lv[4] ?? size0 * 1.25, gap0 = lv[5] ?? (grid ? size0 * 0.8 : size0 * 1.5), pl = odometerPlaces(B, D, grid, size0, pitch0, gap0);
    const z = Math.max(0.05, Math.min(b.w / pl.w, b.h / pl.h)), size = size0 * z, total = Math.min(729, B ** D), v = Math.max(0, Math.min(total, b.value ?? 0));
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    // (each row's hatched and lit cells at a whole count: the digits of the count before it, each row hatched up to its digit)
    const rowsAt = (c: number, i: number): [number, number] => {
      if (c <= 0) return [0, 0];
      const r = Math.floor(i / B), k = i % B, d = Math.floor((Math.min(total, c) - 1) / B ** (D - 1 - r)) % B;
      return [k <= d ? 1 : 0, k === d ? 1 : 0];
    };
    const c0 = Math.floor(v), fr = v - c0;
    pl.at.forEach(([px, py], i) => {
      let set: number, on: number;
      if (grid) { set = c01(v - i); on = set * (1 - c01(v - i - 1)); }
      else { const [s0, o0] = rowsAt(c0, i), [s1, o1] = rowsAt(c0 + 1, i); set = s0 + (s1 - s0) * fr; on = o0 + (o1 - o0) * fr; }
      const r = { x: b.x + px * z, y: b.y + py * z, w: size, h: size };
      rounded(ctx, r, 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      if (set > 0.001) {
        const q = { x: r.x, y: r.y + size * (1 - set), w: size, h: size * set };
        hatching(ctx, q, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        if (set < 0.999) { ctx.moveTo(q.x, q.y); ctx.lineTo(q.x + q.w, q.y); }
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
    });
    if (showText) {
      const lines = b.text.split("\n"), head = lines[0] ?? "", quiet = withAlpha(t.text, 0.66);
      if (!grid) for (let r = 0; r < D; r++) { const word = lines[r + 1]?.trim(); if (word) drawLines(ctx, [word], b.x - 12, b.y + r * gap0 * z + size / 2, 11, quiet, "right", undefined, 500); }
      if (head.trim()) { if (f?.prose) drawLines(ctx, [head], b.x, b.y - 16, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, head, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "floor") {
    // a grid of whole counts: one column of square cells for each item, counting 0 at the bottom up to m, the cells under each column's floor hatched as where a count cannot be, a heavier line
    // across the column where its floor stands. Its levels are how many columns (n), the top count (m), each column's floor, then its points [column, count] in the order they land. Its level is
    // how many points have landed: a part of one drops the next into its cell from over the grid. A point lands open; once the last of its column has landed, the column's lowest fills, in the
    // accent (or the colour it is given). A point under its column's floor is red. Floors are levels, so a beat's `cut` raising them hatches the columns up from the bottom. Its words: a caption
    // over the top left, then each column's name under it
    const lv = b.levels && b.levels.length >= 3 ? b.levels : FLOOR, n = Math.max(1, Math.min(32, Math.round(lv[0]!))), m = Math.max(1, Math.min(32, Math.round(lv[1]!)));
    const fl = Array.from({ length: n }, (_, i) => Math.max(0, Math.min(m + 1, lv[2 + i] ?? 0))), pts: [number, number][] = [];
    for (let q = 2 + n; q + 1 < lv.length && pts.length < 128; q += 2) pts.push([Math.round(lv[q]!), Math.max(0, Math.min(m, Math.round(lv[q + 1]!)))]);
    const lines = b.text.split("\n"), head = lines[0] ?? "", names = lines.slice(1);
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, red = t.tones.red, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const px = b.w / n, py = b.h / (m + 1), s = Math.max(6, Math.min(px, py) * 0.75), base = b.y + b.h, X = (i: number) => b.x + (i + 0.5) * px, Y = (e: number) => base - (e + 0.5) * py;
    const v = Math.max(0, Math.min(pts.length, b.value ?? 0)), last = Array.from({ length: n }, () => -1), low = Array.from({ length: n }, () => Infinity);
    pts.forEach(([c, e], p) => { if (c < 0 || c >= n) return; last[c] = p; low[c] = Math.min(low[c]!, e); });
    // (how far a column's lowest has filled: over the last stretch of its last point's landing)
    const done = (c: number) => (last[c]! < 0 ? 0 : c01((v - last[c]! - 0.7) / 0.3));
    ctx.save();
    for (let i = 0; i < n; i++) for (let e = 0; e <= m; e++) {
      const r = { x: X(i) - s / 2, y: Y(e) - s / 2, w: s, h: s }, set = c01(fl[i]! - e);
      rounded(ctx, r, 2);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (set > 0.001) {
        hatching(ctx, { x: r.x, y: r.y + s * (1 - set), w: s, h: s * set }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(t.text, 0.36);
        ctx.stroke();
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
    }
    // each floor: a heavier line across its column, between the last cell it holds and the first it leaves open
    ctx.beginPath();
    for (let i = 0; i < n; i++) if (fl[i]! > 0.001) { const y = base - fl[i]! * py; ctx.moveTo(X(i) - s / 2 - 6, y); ctx.lineTo(X(i) + s / 2 + 6, y); }
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, stroke * 1.25);
    ctx.strokeStyle = withAlpha(t.text, 0.86);
    ctx.stroke();
    // the points, dropping in from over the grid in turn
    const r = Math.max(3, Math.min(9, s * 0.17));
    pts.forEach(([c, e], p) => {
      const come = c01(v - p);
      if (c < 0 || c >= n || come <= 0) return;
      const q = c01(come / 0.7), rest = Y(e), from = Y(m) - py, y = from + (rest - from) * q * q, a = c01(come * 3), bad = e < fl[c]! - 0.001, ink = bad ? red : hue, fill = e === low[c] ? done(c) : 0;
      ctx.beginPath();
      ctx.ellipse(X(c), y, r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      if (fill > 0) { ctx.fillStyle = withAlpha(ink, fill * a); ctx.fill(); }
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(bad || fill > 0.5 ? ink : t.text, (bad || fill > 0.5 ? 1 : 0.7) * a);
      ctx.stroke();
    });
    ctx.restore();
    if (showText) {
      const quiet = withAlpha(t.text, 0.66);
      for (let e = 0; e <= m; e++) drawLines(ctx, [String(e)], b.x - 11, Y(e), 11, quiet, "right", undefined, 500);
      for (let i = 0; i < n; i++) { const word = names[i]?.trim(); if (word) drawLines(ctx, [word], X(i), base + 14, 11, done(i) > 0.5 ? hue : withAlpha(t.text, 0.62), "center", undefined, 500); }
      if (head.trim()) { if (f?.prose) drawLines(ctx, [head], b.x, b.y - 16, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, head, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "dial") {
    // a dial: a measure that goes round (event time, a schedule, a day) drawn as a clock face, `round` units to a turn, 0 at the top and growing clockwise, a tick on the rim at every unit. Its levels
    // are the round, how many sectors, each sector [from, to] (in units), then its points [at, sweep] in the order they arrive: where on the face each lands, and how far round the sweep stands once
    // it has. Its level is how many points have arrived: a part of one drops it onto the rim from outside, then the sweep, a hatched slice from the top with a hand at its edge, turns on to its stand.
    // A point that lands where the sweep has already been is late, and red by itself; the newest on time is lit. Each sector is an arc outside the rim, faint until the sweep covers it whole, then
    // lit with its name. Its words: a caption, each sector's name (beyond its arc), then each point's word (inside the rim, by its dot)
    const lv = b.levels && b.levels.length >= 2 ? b.levels : DIAL, round = Math.max(1, lv[0]!), ns = Math.max(0, Math.min(12, Math.round(lv[1] ?? 0)));
    const secs = Array.from({ length: ns }, (_, i) => [lv[2 + i * 2] ?? 0, lv[3 + i * 2] ?? 0] as [number, number]), pts: [number, number][] = [];
    for (let q = 2 + ns * 2; q + 1 < lv.length && pts.length < 64; q += 2) pts.push([lv[q]!, Math.max(0, Math.min(round, lv[q + 1]!))]);
    const said = b.text.split("\n"), head = said[0] ?? "", secNames = said.slice(1, 1 + ns).map((s) => s.trim()), ptNames = said.slice(1 + ns).map((s) => s.trim());
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, red = t.tones.red, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.max(12, Math.min(b.w, b.h) / 2 - DIAL_PAD), s0 = R + 10, s1 = R + 20;
    const A = (u: number) => (u / round) * Math.PI * 2 - Math.PI / 2, P = (u: number, r: number): [number, number] => [cx + r * Math.cos(A(u)), cy + r * Math.sin(A(u))];
    const v = Math.max(0, Math.min(pts.length, b.value ?? 0)), k0 = Math.min(pts.length, Math.floor(v)), part = v - k0;
    // (the sweep's stand: where the last whole arrival left it, turning on to the next one's over the last part of that arrival)
    const stand = (p: number) => (p < 0 ? 0 : pts[p]![1]), turn = c01((part - 0.45) / 0.55), sw = k0 < pts.length ? stand(k0 - 1) + (stand(k0) - stand(k0 - 1)) * turn : stand(pts.length - 1);
    const wrap = (u: number) => ((u % round) + round) % round, late = (p: number) => wrap(pts[p]![0]) < stand(p - 1) - 1e-6;
    ctx.save();
    ctx.lineJoin = "round";
    // the swept part: a hatched slice from the top round to the hand
    if (sw > 1e-4) {
      const slice = () => { ctx.beginPath(); ctx.moveTo(cx, cy); sweep(ctx, cx, cy, R, A(0), A(sw), true); ctx.closePath(); };
      slice();
      ctx.fillStyle = own ? withAlpha(color, 0.08) : withAlpha(t.text, 0.03);
      ctx.fill();
      ctx.save();
      ctx.clip();
      hatching(ctx, { x: cx - R, y: cy - R, w: R * 2, h: R * 2 }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = own ? withAlpha(color, 0.6) : withAlpha(t.text, 0.3);
      ctx.stroke();
      ctx.restore();
    }
    // the face: the rim, a tick at every unit (heavier each quarter), and the hand standing at the sweep's edge
    ctx.beginPath();
    ctx.ellipse(cx, cy, R, R, 0, 0, Math.PI * 2);
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    const every = round <= 60 ? 1 : round / 60;
    ctx.beginPath();
    for (let u = 0; u < round - 1e-6; u += every) { const [ax, ay] = P(u, R - (Math.abs(((u / round) * 4) % 1) < 1e-6 ? 12 : 7)), [bx, by] = P(u, R); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); }
    ctx.lineWidth = Math.max(1, stroke * 0.75);
    ctx.strokeStyle = withAlpha(t.text, 0.36);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(...P(sw, R));
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, stroke);
    ctx.strokeStyle = withAlpha(t.text, sw > 1e-4 ? 0.86 : 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3, 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(t.text, 0.86);
    ctx.fill();
    // the sectors: arcs outside the rim with a bar at each end, faint until the sweep covers them whole, then lit
    const covered = (sc: [number, number]) => c01((sw - Math.max(sc[0], sc[1])) / Math.max(1e-6, round * 0.01) + 1);
    secs.forEach((sc, i) => {
      const a0 = A(Math.min(sc[0], sc[1])), a1 = A(Math.max(sc[0], sc[1])), on = covered(sc), mid = (Math.min(sc[0], sc[1]) + Math.max(sc[0], sc[1])) / 2;
      ctx.beginPath();
      sweep(ctx, cx, cy, s1, a0, a1);
      for (const a of [a0, a1]) { ctx.moveTo(cx + s0 * Math.cos(a), cy + s0 * Math.sin(a)); ctx.lineTo(cx + (s1 + 4) * Math.cos(a), cy + (s1 + 4) * Math.sin(a)); }
      ctx.lineCap = "round";
      ctx.lineWidth = w;
      ctx.strokeStyle = withAlpha(t.text, 0.4);
      ctx.stroke();
      if (on > 0) { ctx.globalAlpha = on; ctx.lineWidth = Math.max(1.5, stroke * 1.25); ctx.strokeStyle = hue; ctx.stroke(); ctx.globalAlpha = 1; }
      const word = secNames[i];
      if (word && showText) { const sx = Math.sin(A(mid) + Math.PI / 2), [nx, ny] = P(mid, s1 + 18); drawLines(ctx, [word], nx, ny, 12, on > 0.5 ? hue : withAlpha(t.text, 0.62), sx > 0.35 ? "left" : sx < -0.35 ? "right" : "center", undefined, 500); }
    });
    // the points: each drops onto the rim from outside in its turn, open on time (the newest lit), filled red when the sweep had already passed its place
    const r = Math.max(4, Math.min(8, R * 0.045)), newest = (() => { for (let p = pts.length - 1; p >= 0; p--) if (v - p > 0.5 && !late(p)) return p; return -1; })();
    pts.forEach(([at], p) => {
      const come = c01(v - p);
      if (come <= 0) return;
      const q = c01(come / 0.45), [x, y] = P(at, R + (1 - q * q) * (DIAL_PAD - 8)), a = c01(come * 4), bad = late(p), ink = bad ? red : p === newest ? hue : withAlpha(t.text, 0.86);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(bad ? red : t.bg, a);
      ctx.fill();
      ctx.lineWidth = Math.max(1.25, stroke * 0.9);
      ctx.strokeStyle = withAlpha(ink, a);
      ctx.stroke();
      const word = ptNames[p];
      if (word && showText && q >= 1) { const sx = Math.sin(A(at) + Math.PI / 2), [nx, ny] = P(at, R - 26); drawLines(ctx, [word], nx, ny, 11, bad ? red : p === newest ? hue : withAlpha(t.text, 0.72), sx > 0.35 ? "right" : sx < -0.35 ? "left" : "center", undefined, 500); }
    });
    ctx.restore();
    if (showText && head.trim()) { if (f?.prose) drawLines(ctx, [head], b.x, b.y - 16, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, head, { x: b.x, y: b.y - 22, w: Math.max(b.w, 120), h: 14, align: "left", size: CAPTION_SIZE, voiced: true }, withAlpha(t.text, 0.62)); }
  } else if (k === "wells") {
    // a square profile of pits along level ground, hatched below as the earth: its levels are how many pits (n), each pit's depth (0 to 1 of the ground's height), how far each is lit, then one or more
    // arrangements of counters, how many lie in each pit. The ground stands under a band of air at the top. Counters lie on a pit's floor in rows, centred. Its level is the arrangement shown (from 0):
    // part way from one to the next, the counters that change pits leave the top of their pile one after another, rise out over the rim, cross in the air and fall into their new pit, while those that
    // stay settle into their new rows. A lit pit is tinted and drawn in the accent (or the colour it is given), its counters filled with it. Lines of its words after the first name the pits, under them
    const lv = b.levels && b.levels.length >= 4 ? b.levels : WELLS, n = Math.max(1, Math.min(32, Math.round(lv[0]!), Math.floor((lv.length - 1) / 3)));
    const depth = lv.slice(1, 1 + n).map(c01), lamp = lv.slice(1 + n, 1 + 2 * n).map(c01), rest = lv.slice(1 + 2 * n), m = Math.max(1, Math.floor(rest.length / n));
    const arr = (q: number) => Array.from({ length: n }, (_, i) => Math.max(0, Math.round(rest[q * n + i] ?? 0)));
    const v = Math.min(m - 1, Math.max(0, b.value ?? 0)), q0 = Math.floor(v), q1 = Math.min(m - 1, q0 + 1), p = v - q0, from = arr(q0), to = arr(q1);
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), says = b.text.split("\n").slice(1);
    const air = Math.min(56, b.h * 0.3), ground = b.y + air, base = b.y + b.h, slot = b.w / n, pw = slot * 0.64;
    const pit = (i: number) => { const l = b.x + slot * (i + 0.5) - pw / 2; return { l, r: l + pw, floor: ground + depth[i]! * (b.h - air - 8) }; };
    const profile = () => { ctx.moveTo(b.x, ground); for (let i = 0; i < n; i++) { const P = pit(i); ctx.lineTo(P.l, ground); ctx.lineTo(P.l, P.floor); ctx.lineTo(P.r, P.floor); ctx.lineTo(P.r, ground); } ctx.lineTo(b.x + b.w, ground); };
    ctx.save();
    ctx.lineJoin = "miter";
    // the earth: hatched under the profile, down to the foot of the box
    ctx.beginPath(); profile(); ctx.lineTo(b.x + b.w, base); ctx.lineTo(b.x, base); ctx.closePath();
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    hatching(ctx, { x: b.x, y: ground, w: b.w, h: b.h - air }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.36);
    ctx.stroke();
    ctx.restore();
    for (let i = 0; i < n; i++) { const o = lamp[i]!, P = pit(i); if (o > 0) { ctx.fillStyle = withAlpha(hue, 0.1 * o); ctx.fillRect(P.l, ground, pw, P.floor - ground); } }
    ctx.beginPath(); profile();
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const o = lamp[i]!, P = pit(i);
      if (o <= 0) continue;
      ctx.beginPath(); ctx.moveTo(P.l, ground); ctx.lineTo(P.l, P.floor); ctx.lineTo(P.r, P.floor); ctx.lineTo(P.r, ground);
      ctx.lineWidth = w + (stroke * 1.25 - w) * o;
      ctx.strokeStyle = withAlpha(hue, o);
      ctx.stroke();
    }
    // the counters: as big as the narrowest pit allows, a hair apart, in rows on the floor (the last row centred)
    const cr = Math.max(2.5, Math.min(7, pw * 0.08)), pitch = cr * 2 + 3, per = Math.max(1, Math.floor((pw - 6) / pitch));
    const seat = (i: number, j: number, c: number): [number, number] => { const P = pit(i), row = Math.floor(j / per), inRow = Math.min(per, c - row * per); return [(P.l + P.r) / 2 + ((j % per) - (inRow - 1) / 2) * pitch, P.floor - cr - 1.5 - row * pitch]; };
    const top = ground - Math.max(cr + 4, air * 0.62);
    const counter = (x: number, y: number, o: number, a = 1) => {
      if (a <= 0) return;
      ctx.beginPath();
      ctx.ellipse(x, y, cr, cr, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      if (o > 0) { ctx.fillStyle = withAlpha(hue, 0.85 * o * a); ctx.fill(); }
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(o > 0.5 ? hue : t.text, (o > 0.5 ? 1 : 0.7) * a);
      ctx.stroke();
    };
    // those that stay: the bottom of each pile, gliding into their new rows
    for (let i = 0; i < n; i++) for (let j = 0; j < Math.min(from[i]!, to[i]!); j++) {
      const [x0, y0] = seat(i, j, from[i]!), [x1, y1] = seat(i, j, to[i]!);
      counter(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p, lamp[i]!);
    }
    // those that move: the top of each pile that shrinks, in pit order, each to the next free seat of a pile that grows; one after another they rise, cross and fall
    const leave: [number, number][] = [], come: [number, number][] = [];
    for (let i = 0; i < n; i++) { for (let j = to[i]!; j < from[i]!; j++) leave.push([i, j]); for (let j = from[i]!; j < to[i]!; j++) come.push([i, j]); }
    const moves = Math.max(leave.length, come.length), ease = (s: number) => s * s * (3 - 2 * s);
    for (let k = 0; k < moves; k++) {
      const a = leave[k], z = come[k], st = moves > 1 ? (k / (moves - 1)) * 0.35 : 0, s = c01((p - st) / 0.65);
      if (a && z) {
        const [x0, y0] = seat(a[0], a[1], from[a[0]]!), [x1, y1] = seat(z[0], z[1], to[z[0]]!), s1 = c01(s / 0.3), s2 = c01((s - 0.3) / 0.4), s3 = c01((s - 0.7) / 0.3);
        const x = x0 + (x1 - x0) * ease(s2), y = s < 0.3 ? y0 + (top - y0) * (1 - (1 - s1) * (1 - s1)) : s < 0.7 ? top - Math.sin(Math.PI * s2) * Math.min(12, air * 0.2) : top + (y1 - top) * s3 * s3;
        counter(x, y, s < 0.5 ? lamp[a[0]]! : lamp[z[0]]!);
      } else if (a) {
        // (more leave than arrive: the extra rise out and are gone)
        const [x0, y0] = seat(a[0], a[1], from[a[0]]!);
        counter(x0, y0 + (top - y0) * ease(s), lamp[a[0]]!, 1 - s);
      } else if (z) {
        const [x1, y1] = seat(z[0], z[1], to[z[0]]!);
        counter(x1, top + (y1 - top) * s * s, lamp[z[0]]!, s);
      }
    }
    ctx.restore();
    if (showText) {
      for (let i = 0; i < n; i++) {
        const word = says[i]?.trim(), P = pit(i);
        if (word) drawLines(ctx, [word], (P.l + P.r) / 2, base + 14, 11, lamp[i]! > 0.5 ? hue : withAlpha(t.text, 0.62), "center", undefined, 500);
      }
      const name = b.text.split("\n")[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "bins") {
    // one series as flat steps over bins of uneven width, on one shared baseline along its bottom: its levels are how many raw points (n), the points (0 to 1 of its height), then for each gap between
    // two neighbours how far an edge stands there (0 to 1), then for each point how far its dot stands (0 to 1). The points sit one to each of n equal slots; a step holds each bin at the mean of the points
    // under it, hatched from the baseline up as columns are, and an edge is a quiet upright between two steps. As an edge fades (a beat's `cut`) the steps either side slide together to their shared mean:
    // a point's step is the mean of every point weighted by how little edge stands between them, so a bin stays flat all the way. A dot stands at its raw point over its step, a hairline down (or up) to it,
    // and sinks into the step and is gone as its level falls. Its level is the bin picked (from 1; 0: none), lit in the accent (or the colour it is given), its dots too. Lines of its words after the first are set over each bin's top
    const lv = b.levels && b.levels.length >= 4 ? b.levels : BINS, n = Math.max(1, Math.min(64, Math.round(lv[0]!), Math.floor((lv.length + 1) / 3)));
    const raw = lv.slice(1, 1 + n).map(c01), cut = lv.slice(1 + n, n * 2).map(c01), kept = lv.slice(n * 2, n * 3).map((q) => c01(q ?? 1)), v = b.value ?? 0;
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), says = b.text.split("\n").slice(1);
    const pitch = b.w / n, base = b.y + b.h, X = (i: number) => b.x + i * pitch, Y = (q: number) => base - c01(q) * b.h;
    // each point's step: the mean of all the points, each weighted by what is left open between it and this one (a whole edge shuts it out)
    const step = raw.map((_, j) => {
      let sum = 0, wt = 0;
      for (let q = 0; q < n; q++) {
        let open = 1;
        for (let e = Math.min(j, q); e < Math.max(j, q) && open > 0; e++) open *= 1 - (cut[e] ?? 0);
        sum += open * raw[q]!; wt += open;
      }
      return wt > 0 ? sum / wt : raw[j]!;
    });
    // the bins as they stand: runs of points between edges at least half there
    const bins: [number, number][] = [];
    for (let j = 0, s0 = 0; j < n; j++) if (j === n - 1 || (cut[j] ?? 0) >= 0.5) { bins.push([s0, j + 1]); s0 = j + 1; }
    const on = (i: number) => (v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0), lit = (j: number) => { const i = bins.findIndex(([s0, s1]) => j >= s0 && j < s1); return i < 0 ? 0 : on(i); };
    const outline = () => { ctx.beginPath(); ctx.moveTo(X(0), base); for (let j = 0; j < n; j++) { ctx.lineTo(X(j), Y(step[j]!)); ctx.lineTo(X(j + 1), Y(step[j]!)); } ctx.lineTo(X(n), base); ctx.closePath(); };
    ctx.save();
    ctx.lineJoin = "miter";
    outline();
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.save();
    ctx.clip();
    hatching(ctx, { x: b.x, y: b.y, w: b.w, h: b.h }, b.x + b.y + b.h, f?.crisp ? 4 : 5);
    ctx.lineWidth = 0.75;
    ctx.strokeStyle = withAlpha(t.text, 0.36);
    ctx.stroke();
    // the bin picked: tinted and hatched in the accent
    bins.forEach(([s0, s1], i) => {
      const o = on(i);
      if (o <= 0) return;
      const r = { x: X(s0), y: Y(step[s0]!), w: X(s1) - X(s0), h: base - Y(step[s0]!) };
      ctx.fillStyle = t.bg; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = withAlpha(hue, 0.12 * o); ctx.fillRect(r.x, r.y, r.w, r.h);
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(hue, 0.7 * o);
      ctx.stroke();
    });
    ctx.restore();
    // the edges: a quiet upright between two steps, as far as it stands
    for (let e = 0; e < n - 1; e++) {
      const s = cut[e] ?? 0;
      if (s <= 0.02) continue;
      ctx.beginPath();
      ctx.moveTo(X(e + 1), base); ctx.lineTo(X(e + 1), Y(Math.min(step[e]!, step[e + 1]!)));
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(t.text, 0.5 * s);
      ctx.stroke();
    }
    outline();
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    bins.forEach(([s0, s1], i) => {
      const o = on(i);
      if (o <= 0) return;
      ctx.beginPath();
      ctx.moveTo(X(s0), base); ctx.lineTo(X(s0), Y(step[s0]!)); ctx.lineTo(X(s1), Y(step[s0]!)); ctx.lineTo(X(s1), base);
      ctx.lineWidth = w + (stroke * 1.25 - w) * o;
      ctx.strokeStyle = withAlpha(hue, o);
      ctx.stroke();
    });
    // the raw points: a dot over (or under) its step, a hairline to it, sinking into the step as it goes
    const pr = Math.max(2, Math.min(3.5, pitch * 0.3));
    for (let j = 0; j < n; j++) {
      const k1 = kept[j] ?? 1, a = c01(k1 * 3);
      if (a <= 0) continue;
      const cx = X(j + 0.5), sy = Y(step[j]!), dy = sy + (Y(raw[j]!) - sy) * k1, o = lit(j), ink = o > 0.5 ? hue : t.text;
      if (Math.abs(dy - sy) > pr + 2) {
        ctx.beginPath();
        ctx.moveTo(cx, dy + Math.sign(sy - dy) * pr); ctx.lineTo(cx, sy);
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(ink, 0.4 * a);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.ellipse(cx, dy, pr, pr, 0, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      if (o > 0) { ctx.fillStyle = withAlpha(hue, 0.85 * o * a); ctx.fill(); }
      ctx.lineWidth = Math.max(1, stroke * 0.75);
      ctx.strokeStyle = withAlpha(ink, (o > 0.5 ? 1 : 0.7) * a);
      ctx.stroke();
    }
    ctx.restore();
    // the shared baseline, the width of every slot
    ctx.beginPath();
    ctx.moveTo(b.x, base); ctx.lineTo(b.x + b.w, base);
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    if (showText) {
      bins.forEach(([s0, s1], i) => {
        const word = says[i]?.trim();
        if (!word) return;
        const top = Math.min(Y(step[s0]!), ...raw.slice(s0, s1).map((q, d) => (kept[s0 + d]! > 0.3 ? Y(q) - pr : Infinity)));
        drawLines(ctx, [word], (X(s0) + X(s1)) / 2, top - 12, 11, on(i) > 0.5 ? hue : withAlpha(t.text, 0.62), "center", undefined, 500);
      });
      const name = b.text.split("\n")[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "levels") {
    // columns with named level lines laid across them: `levels` are the bars' heights (the first `span` of them, 0 to 1 of its height), then the lines' heights, then how far each line
    // stands (0 to 1: a beat's `cut` fades it in), and last, if there, how wide a margin on its left the lines' words are set in (lines of its words after the first, one a line).
    // Its level is the line in play, from 1 (0: none; a part of one: between two): that line stands firm (in the colour the mark is given, if any), and every bar standing over it is
    // drawn red. Lines not in play stay quiet
    const given = b.levels && b.levels.length, lv = given ? b.levels! : LEVELS, nb = Math.max(1, Math.min(lv.length, Math.round(given ? b.span ?? lv.length : LEVELS_BARS)));
    const nl = Math.floor((lv.length - nb) / 2), bars = lv.slice(0, nb), lines = lv.slice(nb, nb + nl), stands = lv.slice(nb + nl, nb + 2 * nl), words = b.text.split("\n").slice(1), v = b.value ?? 0;
    const gut = Math.max(0, Math.min(b.w - nb * 8, (lv.length - nb) % 2 ? lv[lv.length - 1]! : 0)), x0 = b.x + gut, bw0 = b.w - gut;
    const own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.text, red = t.tones.red, play = (i: number) => (v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0);
    const pitch = bw0 / nb, bw = Math.max(2, Math.min(pitch * 0.48, pitch - 6)), base = b.y + b.h, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    for (let i = 0; i < nb; i++) {
      const hh = c01(bars[i] ?? 0) * b.h, r = { x: x0 + pitch * (i + 0.5) - bw / 2, y: base - hh, w: bw, h: hh }, on = Math.max(0, ...lines.map((l, j) => (hh > c01(l) * b.h + 0.5 ? play(j) : 0)));
      if (hh < 0.5) continue;
      corners(ctx, r.x, r.y, r.w, r.h, [Math.min(2, hh / 2), Math.min(2, hh / 2), 0, 0]);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(red, 0.12 * on); ctx.fill(); }
      hatching(ctx, r, b.x + b.y + b.h, f?.crisp ? 4 : 5);
      ctx.lineWidth = 0.75;
      if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
      if (on > 0) { ctx.strokeStyle = withAlpha(red, 0.7 * on); ctx.stroke(); }
      corners(ctx, r.x, r.y, r.w, r.h, [Math.min(2, hh / 2), Math.min(2, hh / 2), 0, 0]);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(red, on); ctx.stroke(); }
    }
    // the shared baseline, under the bars
    ctx.beginPath();
    ctx.moveTo(x0, base); ctx.lineTo(b.x + b.w, base);
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    // the lines, over the bars: quiet and broken, as a limit is; the one in play firm, its word with it (a line in play stands whether or not it was shown)
    lines.forEach((l, i) => {
      const p = play(i), a = Math.max(p, c01(stands[i] ?? 1)), y = base - c01(l) * b.h, hot = p > 0.5;
      if (a <= 0) return;
      ctx.beginPath();
      ctx.moveTo(x0, y); ctx.lineTo(b.x + b.w, y);
      ctx.lineWidth = Math.max(1, stroke * (0.5 + 0.25 * p));
      ctx.strokeStyle = withAlpha(hot ? hue : t.text, (0.36 + 0.5 * p) * a);
      ctx.setLineDash(hot ? [6, 3] : [3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (words[i]?.trim() && showText) drawLines(ctx, [words[i]!.trim()], x0 - 12, y, 11, withAlpha(hot ? hue : t.text, (0.55 + 0.35 * p) * a), "right", undefined, 500);
    });
    if (b.text && showText) {
      const name = b.text.split("\n")[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  } else if (k === "shingles") {
    // spans on one shared time scale, packed into the fewest rows they fit without overlapping: each span the run of cells it covers, its points hatched in. Over them, the stream itself:
    // a row of cells with every point hatched. Its level is how many spans are laid (a part of one grows the next from its start, edged in the accent while it grows); a beat's `cut` re-cuts
    // the spans, and they slide and re-pack. A point a span holds is hatched where it stands in time, so spans slide over points that keep still. Given a colour, the held points take it
    const { n, size, points, spans, rowY } = shinglePlaces(b), v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent;
    const edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), X = (u: number) => b.x + u * b.w, gap = f?.crisp ? 4 : 5;
    const cellOf = (p: number) => Math.min(n - 1, Math.max(0, Math.floor(p * n + 1e-6)));
    const hatchIn = (r: Rect, ink: string) => { hatching(ctx, r, b.x + b.y + b.h, gap); ctx.lineWidth = 0.75; ctx.strokeStyle = ink; ctx.stroke(); };
    const box = (r: Rect, ink: string, lw: number) => { rounded(ctx, r, 2); ctx.lineWidth = lw; ctx.strokeStyle = ink; ctx.stroke(); };
    if (points.length) {
      // the stream: every cell, every point hatched
      for (let i = 0; i < n; i++) {
        const r = { x: X(i / n), y: b.y, w: size, h: size };
        rounded(ctx, r, 2); ctx.fillStyle = t.bg; ctx.fill();
        if (points.some((p) => cellOf(p) === i)) hatchIn(r, withAlpha(t.text, 0.36));
        box(r, edge, w);
      }
    }
    spans.forEach(([from0, to0, row], j) => {
      const laid = c01(v - j), from = c01(Math.min(from0, to0)), to = c01(Math.max(from0, to0)), len = (to - from) * laid;
      if (laid <= 0 || len * n < 0.02) return;
      // (a hair short at each end, so neighbours in a row stay apart)
      const g = Math.min(Math.max(2, size * 0.07), (X(from + len) - X(from)) / 4), y = rowY(Math.max(0, row)), x0 = X(from) + g, x1 = X(from + len) - g, growing = laid < 0.999, run = { x: x0, y, w: x1 - x0, h: size };
      rounded(ctx, run, 3); ctx.fillStyle = t.bg; ctx.fill();
      // the points it holds, hatched where they stand (clipped to what is laid of it)
      for (const p of points) {
        if (p < from - 1e-6 || p >= to - 1e-6) continue;
        const cx = X(cellOf(p) / n), c = { x: Math.max(x0, cx), y, w: Math.min(x1, cx + size) - Math.max(x0, cx), h: size };
        if (c.w > 0.5) hatchIn(c, own ? withAlpha(hue, 0.7) : withAlpha(t.text, 0.36));
      }
      // the cells it covers, riding with it: a fine line between each, and the run's own edge round them all
      ctx.beginPath();
      for (let i = 1; i < len * n - 0.02; i++) { const x = X(from) + i * size; ctx.moveTo(x, y); ctx.lineTo(x, y + size); }
      ctx.lineWidth = Math.max(0.75, w * 0.75); ctx.strokeStyle = withAlpha(t.text, 0.4); ctx.stroke();
      box(run, growing ? withAlpha(hue, 0.9) : edge, growing ? Math.max(w, stroke * 1.25) : Math.max(w, stroke));
    });
    caption();
  } else if (k === "ratchet") {
    // a token scale: a rail with a notch cut into its top for every number from its first level to its second, each number set under its notch, and a pawl, an upright bar standing on the
    // tooth just past the highest number seen (its level). Every notch at or below the pawl is hatched shut. The levels after the first two are this moment's tokens on each notch, those that
    // found it open, then those that found it shut: a token drops in from above, one finding its notch open seats in it, one finding it shut lands on the hatching and bounces off, red.
    // The pawl clicks from notch to notch (a part of one waits, then snaps on), so a token that opens a notch lands before the pawl comes up to it
    const lv = b.levels && b.levels.length >= 2 ? b.levels : RATCHET, lo = Math.round(lv[0]!), n = Math.max(1, Math.min(64, Math.round(lv[1]!) - lo + 1)), v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted";
    const hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), hatchGap = f?.crisp ? 4 : 5, at = (q: number, i: number) => Math.max(0, lv[2 + q * n + i] ?? 0);
    const whole = Math.floor(v), snap = c01((v - whole - 0.6) / 0.4), P = whole + snap * snap * (3 - 2 * snap), there = c01(P - lo + 1);
    const pitch = b.w / n, numbered = showText, base = b.y + b.h - (numbered ? 20 : 2), railH = Math.max(8, Math.min(pitch * 0.62, (b.h - 20) * 0.38)), top = base - railH;
    const nw = Math.max(4, pitch * 0.56), d = railH * 0.62, br = Math.max(3, Math.min(nw / 2 - 2.5, d - 2, 9)), nl = (i: number) => b.x + pitch * i + (pitch - nw) / 2;
    // the rail, its notches cut into its top
    ctx.beginPath();
    ctx.moveTo(b.x, top);
    for (let i = 0; i < n; i++) { const x0 = nl(i); ctx.lineTo(x0, top); ctx.lineTo(x0, top + d); ctx.lineTo(x0 + nw, top + d); ctx.lineTo(x0 + nw, top); }
    ctx.lineTo(b.x + b.w, top); ctx.lineTo(b.x + b.w, base); ctx.lineTo(b.x, base); ctx.closePath();
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.lineJoin = "round";
    ctx.lineWidth = w;
    ctx.strokeStyle = edge;
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const num = lo + i, shut = c01(P - num + 1), on = P >= lo ? c01(1 - Math.abs(P - num)) : 0, x0 = nl(i), cx = x0 + nw / 2;
      // shut: hatched in from the left as the pawl comes up to it
      if (shut > 0.001) {
        const s = { x: x0, y: top, w: nw * shut, h: d };
        hatching(ctx, s, b.x + b.y + b.h, hatchGap);
        if (shut < 0.999) { ctx.moveTo(s.x + s.w, s.y); ctx.lineTo(s.x + s.w, s.y + s.h); }
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
      }
      // the notch the pawl stands at is lit
      if (on > 0) {
        ctx.beginPath();
        ctx.moveTo(x0, top); ctx.lineTo(x0, top + d); ctx.lineTo(x0 + nw, top + d); ctx.lineTo(x0 + nw, top);
        ctx.lineWidth = w + (stroke * 1.25 - w) * on;
        ctx.strokeStyle = withAlpha(hue, on);
        ctx.stroke();
      }
      if (numbered) drawLines(ctx, [String(num)], cx, base + 11, 11, on > 0.5 ? hue : withAlpha(t.text, shut > 0.5 ? 0.42 : 0.72), "center", undefined, 500);
      // this moment's tokens: those that found it open seat in it; those that found it shut land on the hatching and bounce off, red (each lifting away again when it goes)
      const fresh = at(0, i), wasted = at(1, i), y0 = b.y + br + 1, seat = top + d - br - 1, land = top - br - 0.5, rest = land - Math.min(18, Math.max(6, (top - b.y) * 0.32));
      const balls = [...Array.from({ length: Math.ceil(fresh - 1e-6) }, (_, j) => [c01(fresh - j), 0, j]), ...Array.from({ length: Math.ceil(wasted - 1e-6) }, (_, j) => [c01(wasted - j), 1, j])];
      for (const [c, red, j] of balls) {
        if (c! <= 0) continue;
        let y: number, hit = 0;
        if (!red) { const q = c01(c! / 0.6); y = y0 + (seat - y0) * q * q; }
        else {
          const q = c01(c! / 0.5), s = c01((c! - 0.5) / 0.5);
          y = s > 0 ? land + (rest - land) * (1 - (1 - s) * (1 - s)) : y0 + (land - y0) * q * q;
          hit = c01((c! * 2 - 0.9) * 1.2);
        }
        const x = cx - (red ? j! * (br * 2 + 3) : 0);
        const a = c01(c! * 4);
        ctx.beginPath();
        ctx.ellipse(x, red ? y : y - j! * (br * 2 + 2), br, br, 0, 0, Math.PI * 2);
        if (hit < 1) { ctx.fillStyle = withAlpha(t.text, a * (1 - hit)); ctx.fill(); }
        if (hit > 0) { ctx.fillStyle = withAlpha(t.tones.red, a * hit); ctx.fill(); }
      }
    }
    // the pawl: on the tooth past the highest number seen, its foot leaning into that notch
    if (there > 0) {
      const px = b.x + pitch * (P - lo + 1), foot = px - (pitch - nw) / 2;
      ctx.beginPath();
      ctx.moveTo(px, b.y + 2); ctx.lineTo(px, top);
      ctx.moveTo(px, top); ctx.lineTo(Math.min(px, foot) - nw * 0.22, top + d * 0.5);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(stroke * 1.5, w * 2);
      ctx.strokeStyle = withAlpha(hue, there);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    caption();
  } else if (k === "wall") {
    // one straight edge of a boundary drawn as a wall: a band as thick as the mark is across, hatched as a region singled out is and outlined in ink, lying across when it is wider than tall,
    // else upright. Its levels are which side the inside is (0: below or right, 1: above or left), how many openings it has, each opening [at, wide] (its middle, 0 to 1 along, and its width
    // along it in units of its thickness), then this moment's hits [at, on]. An opening is a clean break with square jambs, its name (the lines of its words after the first, in turn) on the
    // outside face; its level is the opening a wire is using, from 1, lit in the accent (or the colour it is given). A hit is where a lost wire struck it: a short red bar flush on the outside face.
    // A thing set across it stands in it, drawn over it; a wire lands on its outside face ("fw.t@0.4") and, refused there, stops at the bar
    const lv = b.levels && b.levels.length >= 2 ? b.levels : WALL, across = b.w >= b.h, len = across ? b.w : b.h, thick = across ? b.h : b.w, inner = (lv[0] ?? 0) >= 0.5 ? 1 : 0;
    const n = Math.max(0, Math.min(16, Math.round(lv[1] ?? 0))), names = b.text.split("\n").slice(1), own = b.tone !== "ink" && b.tone !== "muted", hue = own ? color : t.accent, v = b.value ?? 0;
    // (along, out) to the board: `out` is how far past the outside face, so a negative one is inside the band
    const P = (a: number, o: number): [number, number] => {
      const face = inner ? (across ? b.y + b.h : b.x + b.w) : across ? b.y : b.x, d = inner ? -o : o;
      return across ? [b.x + a, face - d] : [face - d, b.y + a];
    };
    const box = (a0: number, a1: number, o0: number, o1: number) => {
      const [x0, y0] = P(a0, o0), [x1, y1] = P(a1, o1);
      return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    };
    const rectPath = (r: Rect) => { ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x, r.y + r.h); ctx.closePath(); };
    const gaps: { a0: number; a1: number; on: number; name: string }[] = [];
    for (let i = 0; i < n; i++) {
      const at = c01(lv[2 + i * 2] ?? 0.5) * len, half = (Math.max(0.5, lv[3 + i * 2] ?? 2) * thick) / 2;
      gaps.push({ a0: Math.max(0, at - half), a1: Math.min(len, at + half), on: c01(1 - Math.abs(v - (i + 1))), name: names[i]?.trim() ?? "" });
    }
    gaps.sort((p, q) => p.a0 - q.a0);
    // the solid stretches between the openings
    const solid: [number, number][] = [];
    let from = 0;
    for (const g of gaps) { if (g.a0 - from > 0.5) solid.push([from, g.a0]); from = Math.max(from, g.a1); }
    if (len - from > 0.5) solid.push([from, len]);
    // an opening in use: its floor tinted and its jambs drawn in the accent
    for (const g of gaps) {
      if (g.on <= 0) continue;
      rectPath(box(g.a0, g.a1, 0, -thick));
      ctx.fillStyle = withAlpha(hue, 0.14 * g.on);
      ctx.fill();
    }
    for (const [a0, a1] of solid) {
      const r = box(a0, a1, 0, -thick);
      rectPath(r);
      ctx.fillStyle = t.bg;
      ctx.fill();
      ctx.save();
      rectPath(r);
      ctx.clip();
      hatching(ctx, r, 0, 7);
      ctx.lineWidth = 0.75;
      ctx.strokeStyle = withAlpha(own ? color : t.text, own ? 0.5 : 0.3);
      ctx.stroke();
      ctx.restore();
      rectPath(r);
      ctx.lineWidth = stroke;
      ctx.strokeStyle = withAlpha(own ? color : t.text, 0.86);
      ctx.stroke();
    }
    for (const g of gaps) {
      if (g.on <= 0) continue;
      ctx.beginPath();
      for (const a of [g.a0, g.a1]) { if (a <= 0.5 || a >= len - 0.5) continue; const [x0, y0] = P(a, 0), [x1, y1] = P(a, -thick); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
      ctx.lineWidth = Math.max(stroke, 2.5);
      ctx.strokeStyle = withAlpha(hue, g.on);
      ctx.stroke();
    }
    // the hits: a short red bar lying on the outside face where each struck
    for (let q = 2 + n * 2; q + 1 < lv.length; q += 2) {
      const on = c01(lv[q + 1] ?? 0);
      if (on <= 0) continue;
      const at = c01(lv[q] ?? 0) * len, half = Math.min(12, thick * 0.6);
      rectPath(box(Math.max(0, at - half), Math.min(len, at + half), 4, 0));
      ctx.fillStyle = withAlpha(t.tones.red, on);
      ctx.fill();
    }
    if (showText) {
      for (const g of gaps) {
        if (!g.name) continue;
        const [x, y] = P((g.a0 + g.a1) / 2, across ? 13 : 9), side: CanvasTextAlign = across ? "center" : inner ? "left" : "right";
        drawLines(ctx, [g.name], x, y, 11, g.on > 0.5 ? hue : withAlpha(t.text, 0.62), side, undefined, 500);
      }
    }
    caption();
  } else if (k === "ringbuf") {
    // a ring buffer: equal slots round a ring, slot 0 just clockwise of the top, as a wheel's are, and two pointers standing outside it at slot boundaries, the head and the tail (its levels: a slot's
    // depth, 0 to 1 of the radius, then where the head is and where the tail is, in slots, either one past n carrying on round through the top). The entries are the stretch from the head
    // clockwise to the tail, hatched as a region singled out is: moving the tail on fills slot after slot, moving the head on drains them, and both wrap through the top. Its level is the
    // slot being read, from 1 (0: none), lit as a cell is. It takes the accent, or the colour it is given; its pointers' names are the lines of its words after the first ("head", "tail")
    const p = ringPlaces(b), { cx, cy, r, inner, n, reach } = p, v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted";
    const hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), hatchGap = f?.crisp ? 4 : 5;
    const step = (Math.PI * 2) / n, g = Math.min(step * 0.2, 1.5 / r), ang = (u: number) => u * step - Math.PI / 2;
    const band = (a0: number, a1: number) => { ctx.beginPath(); sweep(ctx, cx, cy, r, a0, a1); sweep(ctx, cx, cy, inner, a1, a0, true); ctx.closePath(); };
    // (the stretch held, brought round so it starts in the first turn: it may run on past the top into the second)
    const h0 = ((p.head % n) + n) % n, t0 = h0 + (p.tail - p.head);
    for (let i = 0; i < n; i++) {
      const a0 = ang(i) + g, a1 = ang(i + 1) - g, on = v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0;
      band(a0, a1);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      for (const k0 of [i, i + n]) {
        const s0 = Math.max(k0, h0), s1 = Math.min(k0 + 1, t0);
        if (s1 - s0 < 1e-3) continue;
        const b0 = Math.max(a0, ang(s0 - k0 + i)), b1 = Math.min(a1, ang(s1 - k0 + i));
        if (b1 - b0 < 1e-4) continue;
        ctx.save();
        band(b0, b1);
        ctx.fillStyle = withAlpha(hue, 0.08);
        ctx.fill();
        ctx.clip();
        hatching(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, b.x + b.y + b.h, hatchGap);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(hue, 0.6);
        ctx.stroke();
        ctx.restore();
      }
      band(a0, a1);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
    }
    // the pointers: a stem standing out from the rim at a slot boundary, its head an arrow at the rim, its name beside it (the head's on the side the entries have left, the tail's on the side they are coming)
    const names = b.text.split("\n").slice(1).map((s) => s.trim());
    ([[p.head, names[0] || "head", -1], [p.tail, names[1] || "tail", 1]] as const).forEach(([at, name, side]) => {
      const a = ang(at), ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux, tip = r + 2, aw = Math.max(3, Math.min(5, reach * 0.3)), al = aw * 1.6;
      ctx.beginPath();
      ctx.moveTo(cx + (tip + al) * ux, cy + (tip + al) * uy); ctx.lineTo(cx + (r + reach) * ux, cy + (r + reach) * uy);
      ctx.lineWidth = Math.max(1, stroke);
      ctx.strokeStyle = hue;
      ctx.lineCap = "butt";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + tip * ux, cy + tip * uy);
      ctx.lineTo(cx + (tip + al) * ux + aw * vx, cy + (tip + al) * uy + aw * vy);
      ctx.lineTo(cx + (tip + al) * ux - aw * vx, cy + (tip + al) * uy - aw * vy);
      ctx.closePath();
      ctx.fillStyle = hue;
      ctx.fill();
      if (!showText) return;
      // (clear of the ring, and to one side of its stem)
      const word = name.toUpperCase(), tw = word.length * 6.8, d = r + 4 + Math.abs(ux) * (tw / 2) + Math.abs(uy) * 6, off = Math.abs(vx) * (tw / 2) + Math.abs(vy) * 6 + 5;
      drawLines(ctx, [word], cx + d * ux + side * off * vx, cy + d * uy + side * off * vy, 10, withAlpha(t.text, 0.62), "center", 0.09, 500);
    });
    caption();
  } else if (k === "wheel") {
    // equal slots round a ring, each a stretch of a band standing inside the circle (as deep as its first level, 0 to 1 of the radius). Its levels say how far each slot is set (hatched, swept in
    // clockwise as an arc grows), how far each is lit, and this moment's hits on each: balls just outside it, filled for a hit that found it empty and red for one that found it set. A ball drops in
    // from outside, and the empty slot it lands on sweeps full after it. Its level is the slot being read, from 1 (0: none), lit as a cell is: a lit slot takes the accent, or the colour the wheel is given
    const lv = b.levels && b.levels.length > 4 ? b.levels : WHEEL, n = Math.max(1, Math.round(b.span ?? (lv.length - 1) / 4)), v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted";
    const hue = own ? t.tones[b.tone] : t.accent, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75), hatchGap = f?.crisp ? 4 : 5;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.max(4, Math.min(b.w, b.h) / 2 / WHEEL_ROOM), inner = r * (1 - Math.min(0.95, Math.max(0.05, lv[0] ?? 0.3)));
    // (a hair apart, as cells in a row are, and a ball as big as the ring allows)
    const step = (Math.PI * 2) / n, g = Math.min(step * 0.2, 1.5 / r), br = Math.max(3, Math.min(8, r * 0.038));
    const band = (a0: number, a1: number) => { ctx.beginPath(); sweep(ctx, cx, cy, r, a0, a1); sweep(ctx, cx, cy, inner, a1, a0, true); ctx.closePath(); };
    for (let i = 0; i < n; i++) {
      const a0 = i * step - Math.PI / 2 + g, a1 = (i + 1) * step - Math.PI / 2 - g, at = (k: number) => lv[1 + k * n + i] ?? 0;
      const fresh = Math.max(0, at(2)), wasted = Math.max(0, at(3)), on = Math.max(c01(at(1)), v > 0 ? c01(1 - Math.abs(v - (i + 1))) : 0);
      // (while a ball is still dropping onto it, an empty slot waits for it, then sweeps)
      const set = fresh > 0 && fresh < 1 ? c01(2 * c01(at(0)) - 1) : c01(at(0));
      band(a0, a1);
      ctx.fillStyle = t.bg;
      ctx.fill();
      if (on > 0) { ctx.fillStyle = withAlpha(hue, 0.12 * on); ctx.fill(); }
      if (set > 0.001) {
        const a = a0 + (a1 - a0) * set;
        ctx.save();
        band(a0, a);
        ctx.clip();
        hatching(ctx, { x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, b.x + b.y + b.h, hatchGap);
        ctx.lineWidth = 0.75;
        if (on < 1) { ctx.strokeStyle = withAlpha(t.text, 0.36 * (1 - on)); ctx.stroke(); }
        if (on > 0) { ctx.strokeStyle = withAlpha(hue, 0.7 * on); ctx.stroke(); }
        ctx.restore();
        // (where it has got to, while it is being set)
        if (set < 0.999) { ctx.beginPath(); ctx.moveTo(cx + inner * Math.cos(a), cy + inner * Math.sin(a)); ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a)); ctx.lineWidth = 0.75; ctx.strokeStyle = withAlpha(t.text, 0.5); ctx.stroke(); }
      }
      band(a0, a1);
      ctx.lineWidth = w;
      ctx.strokeStyle = edge;
      ctx.stroke();
      if (on > 0) { ctx.lineWidth = w + (stroke * 1.25 - w) * on; ctx.strokeStyle = withAlpha(hue, on); ctx.stroke(); }
      // the balls: those that found it empty nearest, then those that found it set, each dropping in from outside (and lifting away when it goes)
      const mid = (a0 + a1) / 2, balls = [...Array.from({ length: Math.ceil(fresh - 1e-6) }, (_, j) => [c01(fresh - j), 0]), ...Array.from({ length: Math.ceil(wasted - 1e-6) }, (_, j) => [c01(wasted - j), 1])];
      balls.forEach(([c, red], j) => {
        const p = c01(2 * c!), d = r + br + 5 + j * (br * 2 + 3) + (1 - p) * br * 6;
        if (p <= 0) return;
        ctx.beginPath();
        ctx.ellipse(cx + d * Math.cos(mid), cy + d * Math.sin(mid), br, br, 0, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(red ? t.tones.red : t.text, p);
        ctx.fill();
      });
    }
    caption();
  } else if (k === "belt") {
    // a conveyor of tokens that slides left to right: a window `span` places wide onto a sequence (lines of its words after the first: "record", "barrier", or a short word each).
    // Its level is the offset: how many places the sequence has moved on. The first token stands in the rightmost place at 0; each unit slides every token one place right, so tokens
    // come in at the left and leave at the right, fading at either end. A record is a hatched cell, a word a cell with the word in it, a barrier an upright bar in the gap between two cells,
    // in the accent (or the colour the belt is given). Under the cells runs the belt itself, a line whose slats move with the tokens: a belt whose offset is held stands still
    const n = Math.max(1, Math.round(b.span ?? 7)), pitch = b.w / n, v = b.value ?? 0, own = b.tone !== "ink" && b.tone !== "muted", hue = own ? t.tones[b.tone] : t.accent;
    const size = Math.max(4, Math.min(pitch - 8, b.h - 10)), top = b.y, rail = top + size + 6, right = b.x + b.w, edge = f?.line ? sh(f.line) : withAlpha(t.text, 0.78), w = f?.w ?? Math.max(1, stroke * 0.75);
    const cx = (at: number) => right - pitch * (at - v + 0.5), there = (x: number) => c01(Math.min(x - b.x, right - x) / (pitch / 2));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - 10); ctx.lineTo(right, b.y - 10); ctx.lineTo(right, b.y + b.h + 10); ctx.lineTo(b.x, b.y + b.h + 10); ctx.closePath();
    ctx.clip();
    // the belt: its line, and a slat at every place's edge, riding with the tokens
    ctx.beginPath();
    ctx.moveTo(b.x, rail); ctx.lineTo(right, rail);
    for (let j = Math.floor(v) - 1; j <= Math.ceil(v) + n + 1; j++) { const x = right - pitch * (j - v); if (x >= b.x - 1 && x <= right + 1) { ctx.moveTo(x, rail); ctx.lineTo(x, rail + 4); } }
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.32);
    ctx.stroke();
    const tokens = beltTokens(b);
    for (const tk of tokens) {
      const x = cx(tk.at), a = there(x);
      if (a <= 0 || tk.kind === "barrier") continue;
      const r = { x: x - size / 2, y: top, w: size, h: size };
      rounded(ctx, r, 2);
      ctx.fillStyle = withAlpha(t.bg, a);
      ctx.fill();
      if (tk.kind === "record") {
        // (its hatching rides with it)
        hatching(ctx, r, r.x + r.y, f?.crisp ? 4 : 5);
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = withAlpha(t.text, 0.36 * a);
        ctx.stroke();
      }
      rounded(ctx, r, 2);
      ctx.lineWidth = w;
      ctx.strokeStyle = withAlpha(edge, a);
      ctx.stroke();
      if (tk.kind === "word" && showText) drawLines(ctx, [tk.word], x, top + size / 2 + 0.5, Math.min(12, size * 0.34), withAlpha(t.text, 0.82 * a), "center", undefined, 500);
    }
    ctx.restore();
    // the barriers, over the cells and unclipped: one stands whole at either end (at the gate, everything before it gone) and fades only past it
    for (const tk of tokens) {
      const x = cx(tk.at), a = c01(Math.min(x - b.x + pitch / 2, right + pitch / 2 - x) / (pitch / 2));
      if (tk.kind !== "barrier" || a <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(x, top - 6); ctx.lineTo(x, rail + 4);
      ctx.lineWidth = Math.max(2, stroke * 1.5);
      ctx.lineCap = "round";
      ctx.strokeStyle = withAlpha(hue, a);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    // which way it runs: a small head at its right end
    ctx.beginPath();
    ctx.moveTo(right + 5, rail - 3); ctx.lineTo(right + 9, rail); ctx.lineTo(right + 5, rail + 3);
    ctx.lineWidth = Math.max(1, stroke * 0.5);
    ctx.strokeStyle = withAlpha(t.text, 0.45);
    ctx.stroke();
    if (b.text && showText) {
      const name = b.text.split("\n")[0]!;
      if (name.trim()) { if (f?.prose) drawLines(ctx, [name], spot.x, spot.y + spot.h / 2 - 2, 12, withAlpha(t.text, 0.72), "left", undefined, 400); else drawVoiced(ctx, name, spot, withAlpha(t.text, 0.62)); }
    }
  }
}
