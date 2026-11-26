// Drawing. Shapes are painted on one 2D canvas in world space; the
// selection, handles and guides are painted over them in screen space
// so they stay the same size at every zoom.
import { pictureFor } from "./images";
import { aabb, arrowPath, bounds, bowHandle, boundBox, center, endPoint, labelCentre, midOfPath, overlaps, portsOf, turn } from "./geometry";
import { isBasic } from "./kinds";
import { grips, kindPath, labelText, labelTrack, paintKind, setInUse, tonesInUse } from "./shapes";
import { HUES, isArrow, isBox, isText } from "./types";
import type { Arrow, Box, Camera, Doc, Id, Pt, Rect, Shade, Shape, Text, Tone } from "./types";

/** Weld drew a refusal as a square that runs the wire and flattens at its end; ours fills the wire as every request does. */
const SQUARE_REFUSAL = false;
export let FONT = '"Figtree Variable", "Inter Variable", ui-sans-serif, system-ui, sans-serif';
// How heavy the drawing reads. One setting moves the label size, its
// weight and the line together, so they always belong to each other.
export type Ink = "fine" | "regular" | "strong";
const INKS: Record<Ink, { label: number; weight: number; line: number; arrowLabel: number }> = {
  fine: { label: 14, weight: 450, line: 1.25, arrowLabel: 12 },
  regular: { label: 15, weight: 500, line: 1.5, arrowLabel: 13 },
  strong: { label: 16, weight: 550, line: 2, arrowLabel: 14 },
};
export let WEIGHT = INKS.regular.weight;
export let LABEL_SIZE = INKS.regular.label;
export let ARROW_LABEL_SIZE = INKS.regular.arrowLabel;
let LINE_W = INKS.regular.line;
/** Whether an arrow's label sits on the line (breaking it) or beside it. */
let LABEL_ON = true;
export const labelOnLine = () => LABEL_ON;
export function setLook(ink: Ink, labelOn: boolean) {
  ({ label: LABEL_SIZE, weight: WEIGHT, line: LINE_W, arrowLabel: ARROW_LABEL_SIZE } = INKS[ink]);
  LABEL_ON = labelOn;
  layoutCache.clear();
  lookEpoch++;
}
export const LINE = 20 / 14;
export const PAD = 16;
export const ARROW_LABEL_W = 200;
/** How round a bent wire turns its corners (weld's measure). */
export const ELBOW_R = 12;

export interface Theme {
  dark: boolean;
  bg: string;
  dot: string;
  /** Label colour for ink and grey shapes: a touch stronger than the strokes in the dark. */
  text: string;
  tones: Record<Tone, string>;
  /** The one interaction colour: selection, guides, handles, binding. */
  accent: string;
}
const LIGHT: Theme = {
  dark: false,
  bg: "#fbfbfa",
  dot: "rgba(0,0,0,0.07)",
  text: "#1b1b1c",
  accent: "#2f6bff",
  tones: { ink: "#1b1b1c", accent: "#2f6bff", muted: "#8b8b8e", red: "#d4483f", green: "#1e9a55", amber: "#c08400", violet: "#8b5cf6", teal: "#0e9aa7" },
};
const DARK: Theme = {
  dark: true,
  bg: "#111113",
  dot: "rgba(255,255,255,0.06)",
  text: "#e4e4e7",
  accent: "#5b8cff",
  tones: { ink: "#c6c6cc", accent: "#5b8cff", muted: "#7c7c82", red: "#ef6a61", green: "#3fbf78", amber: "#e0a526", violet: "#b18cff", teal: "#3cc4cf" },
};
export const themeFor = (dark: boolean): Theme => (dark ? DARK : LIGHT);
// the neutral scale a reference drawing is matched in; in the dark each step takes its mirror
const SHADES_LIGHT: Record<Shade, string> = { n50: "#fafafa", n100: "#f5f5f5", n200: "#e5e5e5", n300: "#d4d4d4", n400: "#a1a1a1", n500: "#737373", n600: "#525252", n700: "#404040", n900: "#171717", accent: "#1447e6", paper: "#ffffff", none: "transparent" };
const SHADES_DARK: Record<Shade, string> = { n50: "#141414", n100: "#1c1c1c", n200: "#262626", n300: "#404040", n400: "#525252", n500: "#737373", n600: "#a1a1a1", n700: "#d4d4d4", n900: "#f5f5f5", accent: "#5b8cff", paper: "#0f0f10", none: "transparent" };
/** The colour a shade stands for. A colour worked out between two shades (while animating) is already one, and comes straight back. */
export const shade = (t: Theme, s: Shade): string => ((s as string).startsWith("rgb") || (s as string).startsWith("#") ? s : (t.dark ? SHADES_DARK : SHADES_LIGHT)[s]);
/** The moment being drawn, in ms, while something plays (null: nothing is playing, and anything that moves is shown at rest). */
/** `t`: how long it has played; `since`: how long since the moment now arriving began to arrive. Both null at rest. */
export const clock: { t: number | null; since: number | null } = { t: null, since: null };
/** The colour of a shape's words. */
export function labelColor(t: Theme, tone: Tone, solid = false): string {
  if (solid) return t.bg;
  return tone === "ink" || tone === "muted" ? t.text : t.tones[tone];
}

// ── text ────────────────────────────────────────────────────────────
let measurer: CanvasRenderingContext2D | null = null;
/** Where there is no page to measure words on (a server drawing pictures), what measures them instead. */
export function setMeasurer(m: { font: string; letterSpacing?: string; measureText(text: string): { width: number } }) {
  measurer = m as CanvasRenderingContext2D;
  layoutCache.clear();
  lookEpoch++;
}
/** The measurer in use, if one has been set or made. */
export const measuring = () => measurer;
const layoutCache = new Map<string, { lines: string[]; w: number; h: number }>();
export function clearTextCache() {
  layoutCache.clear();
  lookEpoch++;
}
/** The label face: what a shape's own name is set in, and any words given a tracking of their own. */
export let MONO = '"Figtree Variable", "Inter Variable", ui-sans-serif, system-ui, sans-serif';
export const LABEL_TRACK = 0.15;
/** The font for words of this size; with a tracking (em), the label face. */
export let PROSE = '"Figtree Variable", "Inter Variable", ui-sans-serif, system-ui, sans-serif';
export const fontOf = (size: number, track?: number, fw?: number, prose?: boolean, own?: string) => (own && FACES[own as Face] && (want(own as Face), true) ? `${fw ?? (track === undefined ? WEIGHT : 500)} ${size}px ${track === undefined ? FACES[own as Face].font : FACES[own as Face].mono}` : prose ? `${fw ?? 400} ${size}px ${PROSE}` : track === undefined ? `${fw ?? WEIGHT} ${size}px ${FONT}` : `${fw ?? 500} ${size}px ${MONO}`);
type Spaced = CanvasRenderingContext2D & { letterSpacing?: string; textRendering?: string };

/** Free text as it will be set: in its own weight and face where it has them. */
/** How wide free text runs before it wraps: about 26 of its letters' height, so a pasted paragraph reads as one, at any size. (A drawing brought in to match a reference keeps its own lines.) */
export const wrapAt = (size: number) => size * 26;
export const textLayout = (s: Pick<Text, "text" | "size" | "track" | "weight" | "face" | "fine">, text = s.text, size = s.size) => layoutText(text, s.fine ? Infinity : wrapAt(size), size, s.track, s.weight ?? s.fine?.fw, s.fine?.prose, s.face);
/** Break `text` into lines no wider than `maxWidth` (world px). */
export function layoutText(text: string, maxWidth: number, size: number, track?: number, fw?: number, prose?: boolean, own?: string) {
  const key = `${size}|${track ?? ""}|${fw ?? ""}|${prose ? "p" : ""}${own ?? ""}|${FONT.length}${FONT.slice(1, 6)}${MONO.slice(1, 6)}|${Math.round(maxWidth)}|${text}`;
  const hit = layoutCache.get(key);
  if (hit) return hit;
  if (!measurer && typeof document !== "undefined") measurer = document.createElement("canvas").getContext("2d");
  const m = measurer;
  const lines: string[] = [];
  let w = 0;
  if (m) {
    m.font = fontOf(size, track, fw, prose, own);
    (m as Spaced).letterSpacing = `${(track ?? 0) * size}px`;
    for (const para of text.split("\n")) {
      const words = para.split(/(\s+)/);
      let line = "";
      // a word wider than the box is broken by character, wherever it falls
      const fit = (word: string) => {
        let rest = word;
        while (rest.length > 1 && m.measureText(rest).width > maxWidth) {
          let n = rest.length - 1;
          while (n > 1 && m.measureText(rest.slice(0, n)).width > maxWidth) n--;
          lines.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        return rest;
      };
      for (const word of words) {
        const trial = line + word;
        if (line && m.measureText(trial.trimEnd()).width > maxWidth) {
          lines.push(line.trimEnd());
          line = fit(word.trimStart());
        } else line = line ? trial : fit(word);
      }
      lines.push(line.trimEnd());
    }
    for (const l of lines) w = Math.max(w, m.measureText(l).width);
  } else lines.push(...text.split("\n"));
  const out = { lines, w, h: lines.length * size * LINE };
  if (layoutCache.size > 24000) {
    // drop the oldest half; what is on screen was measured most recently
    let n = 12000;
    for (const k of layoutCache.keys()) {
      layoutCache.delete(k);
      if (--n <= 0) break;
    }
  }
  layoutCache.set(key, out);
  return out;
}
/** How wide a label may run inside a box before it wraps. */
export function labelWidth(b: Box): number {
  // an exact shape's words sit as its reference set them: on one line, however close to the edge
  if (b.fine?.text) return Infinity;
  const inner = b.kind === "ellipse" ? b.w * 0.7 : b.kind === "diamond" ? b.w * 0.5 : b.kind === "pill" ? b.w - b.h : b.w - PAD * 2;
  return Math.max(24, inner);
}
/** Where an arrow's label sits: beside the line at its middle (or, as an
 *  alternative, on it). */
export function arrowLabelRect(doc: Doc, a: Arrow): Rect {
  return arrowLabel(doc, a).r;
}
/** Where a wire's words go: on the wire, at the middle of its run, when the stretch of wire there is long enough to carry them with room to spare;
 *  otherwise beside it (above a level stretch, to the right of an upright one), so they never sit over the things the wire joins. */
export function arrowLabel(doc: Doc, a: Arrow): { r: Rect; beside: boolean } {
  const l = layoutText(a.text, a.fine?.crisp ? 600 : ARROW_LABEL_W, a.size ?? ARROW_LABEL_SIZE, a.track, a.track === undefined ? undefined : a.fine?.fw);
  const pts = arrowPath(doc, a);
  if (!LABEL_ON) { const c = labelCentre(pts, l.w, l.h, 5); return { r: { x: c.x - l.w / 2, y: c.y - l.h / 2, w: l.w, h: l.h }, beside: false }; }
  const c = midOfPath(pts);
  // the stretch the middle falls on, and how much of it the words would take (with a pill's ends, and a little wire showing either side)
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
  let want = total / 2, seg: [Pt, Pt] = [pts[0]!, pts[pts.length - 1]!];
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y); if (want <= d) { seg = [pts[i]!, pts[i + 1]!]; break; } want -= d; }
  const dx = seg[1].x - seg[0].x, dy = seg[1].y - seg[0].y, len = Math.hypot(dx, dy) || 1, ux = Math.abs(dx) / len, uy = Math.abs(dy) / len;
  const pad = a.pill || a.fine?.r !== undefined ? 22 : 8, need = ux * (l.w + pad) + uy * (l.h + pad) + 24;
  if (len >= need) return { r: { x: c.x - l.w / 2, y: c.y - l.h / 2, w: l.w, h: l.h }, beside: false };
  const level = ux >= uy, r: Rect = level ? { x: c.x - l.w / 2, y: c.y - l.h - 8, w: l.w, h: l.h } : { x: c.x + 10, y: c.y - l.h / 2, w: l.w, h: l.h };
  // and clear of what the wire joins: lifted over (or moved past) any box the words would sit on
  const ends = [a.a.bind?.id, a.b.bind?.id].map((id) => (id ? doc.shapes[id] : undefined)).filter(isBox);
  for (let i = 0; i < 3; i++) for (const b of ends) if (overlaps(r, { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 })) { if (level) r.y = b.y - r.h - 8; else r.x = b.x + b.w + 10; }
  return { r, beside: true };
}

// ── shapes ──────────────────────────────────────────────────────────
export function boxPath(ctx: CanvasRenderingContext2D, b: Rect & { kind: Box["kind"] } & { fine?: { r?: number } }, r = 8) {
  ctx.beginPath();
  if (b.kind === "ellipse") ctx.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.abs(b.w / 2), Math.abs(b.h / 2), 0, 0, Math.PI * 2);
  else if (b.kind === "diamond") {
    ctx.moveTo(b.x + b.w / 2, b.y);
    ctx.lineTo(b.x + b.w, b.y + b.h / 2);
    ctx.lineTo(b.x + b.w / 2, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h / 2);
    ctx.closePath();
  } else ctx.roundRect(b.x, b.y, b.w, b.h, Math.min(b.fine?.r ?? r, Math.abs(b.w) / (b.fine?.r === undefined ? 4 : 2), Math.abs(b.h) / (b.fine?.r === undefined ? 4 : 2))); // a small square stays square
}
/** A path with rounded corners. Each corner's radius is capped by the
 *  runs either side of it, so short doglegs never bulge. */
function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[], r: number) {
  ctx.beginPath();
  const first = pts[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1]!, c = pts[i]!, n = pts[i + 1]!;
    const a = Math.hypot(c.x - p.x, c.y - p.y), b = Math.hypot(n.x - c.x, n.y - c.y), rr = Math.min(r, a / 2, b / 2);
    // the corner is cut with the same curve weld uses: a quadratic through the corner point
    if (rr > 0 && a > 0 && b > 0) {
      ctx.lineTo(c.x - ((c.x - p.x) / a) * rr, c.y - ((c.y - p.y) / a) * rr);
      ctx.quadraticCurveTo(c.x, c.y, c.x + ((n.x - c.x) / b) * rr, c.y + ((n.y - c.y) / b) * rr);
    } else ctx.lineTo(c.x, c.y);
  }
  const last = pts[pts.length - 1]!;
  ctx.lineTo(last.x, last.y);
}
function head(ctx: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(tip.x - size * Math.cos(a - 0.34), tip.y - size * Math.sin(a - 0.34));
  ctx.lineTo(tip.x - size * Math.cos(a + 0.34), tip.y - size * Math.sin(a + 0.34));
  ctx.closePath();
  ctx.fill();
}
/** An open arrowhead: the plain head's outline, on paper. */
function openHead(ctx: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number, paper: string, w: number) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x), back = { x: tip.x - size * 0.2 * Math.cos(a), y: tip.y - size * 0.2 * Math.sin(a) };
  ctx.beginPath();
  ctx.moveTo(back.x, back.y);
  ctx.lineTo(back.x - size * Math.cos(a - 0.36), back.y - size * Math.sin(a - 0.36));
  ctx.lineTo(back.x - size * Math.cos(a + 0.36), back.y - size * Math.sin(a + 0.36));
  ctx.closePath();
  ctx.save();
  ctx.fillStyle = paper;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.lineJoin = "miter";
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}
/** The reference's own arrowhead: a soft-cornered wedge `size` long, 8/6.5 as wide, starting where the line stops. */
/** A plain small triangle, as long as it is wide at the back. */
function crispHead(ctx: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x);
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.5);
  ctx.lineTo(-size, size * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function fineHead(ctx: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number) {
  const a = Math.atan2(tip.y - from.y, tip.x - from.x), k = size / 6.5;
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(a);
  ctx.translate(-size, -4 * k);
  ctx.scale(k, k);
  ctx.beginPath();
  ctx.moveTo(0, 1.5);
  ctx.quadraticCurveTo(0, 0, 1.5, 0);
  ctx.quadraticCurveTo(3.5, 1, 5.8, 3.2);
  ctx.quadraticCurveTo(6.5, 4, 5.8, 4.8);
  ctx.quadraticCurveTo(3.5, 7, 1.5, 8);
  ctx.quadraticCurveTo(0, 8, 0, 6.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
export function withAlpha(hex: string, a: number) {
  if (!hex.startsWith("#")) { const v = hex.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]; return hex === "transparent" ? hex : `rgba(${v[0]},${v[1]},${v[2]},${(v[3] ?? 1) * a})`; }
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function drawLines(ctx: CanvasRenderingContext2D, lines: string[], cx: number, cy: number, size: number, color: string, align: CanvasTextAlign = "center", track?: number, fw?: number, rise?: number, prose?: boolean, own?: string) {
  ctx.font = fontOf(size, track, fw, prose, own);
  // letterforms drawn to their true outlines, as an SVG or a print would: not thickened for small screens
  (ctx as Spaced).textRendering = "geometricPrecision";
  (ctx as Spaced).letterSpacing = `${(track ?? 0) * size}px`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  // Place the baseline exactly where the browser puts it for the same
  // font and line height, so text does not shift when typing ends.
  // Inter: ascent 0.969, descent 0.241 → baseline sits 0.364 em below the line's middle.
  ctx.textBaseline = "alphabetic";
  const lh = size * LINE;
  const top = cy - (lines.length * lh) / 2 + lh / 2 + (rise ?? size * (track === undefined ? 0.364 : 0.35));
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i]!, cx, top + i * lh);
  (ctx as Spaced).letterSpacing = "0px";
}

/** Dashes and dots in proportion to the line, so they read the same at every weight. */
export function dash(ctx: CanvasRenderingContext2D, line: "dashed" | "dotted" | undefined, w: number) {
  if (line === "dashed") ctx.setLineDash([w * 4, (w * 16) / 3]); // weld's rhythm: 6 on, 8 off at the regular weight
  else if (line === "dotted") {
    ctx.setLineDash([0.01, w * 3]);
    ctx.lineCap = "round";
  } else ctx.lineCap = "butt";
}

/** One shape as it looks at 100%, with nothing selected: for pictures of the board. */
/** The group being worked on: its parts that are away in the moment on show are drawn faint there, so they can be brought back. */
/** Where a running wire sits on the way its request travels: wires that meet it at a junction and run the same way are one
 *  movement, so it starts filling only once the request has come along the wires before it. Lengths in board px. */
// the running wires of a picture of the board, each way, by the junction they leave from and the one they reach: worked
// out once per picture (not once per wire per frame), in the board's own order, so the same wire is found as before
type JunctionIndex = { from: Map<Id, Arrow[]>; to: Map<Id, Arrow[]> };
const junctionIndex = new WeakMap<Doc, { fwd: JunctionIndex; back: JunctionIndex }>();
function indexJunctions(doc: Doc) {
  let ix = junctionIndex.get(doc);
  if (ix) return ix;
  const junction = (e: Arrow["a"]) => { const id = e.bind?.id, sh = id ? doc.shapes[id] : undefined; return sh && !isArrow(sh) && sh.kind === "junction" ? id! : null; };
  const make = (): JunctionIndex => ({ from: new Map(), to: new Map() });
  const put = (m: Map<Id, Arrow[]>, j: Id | null, w: Arrow) => { if (j) (m.get(j) ?? m.set(j, []).get(j)!).push(w); };
  ix = { fwd: make(), back: make() };
  for (const w of Object.values(doc.shapes)) {
    if (!isArrow(w) || !w.run || w.run === "squash") continue;
    const back = w.run === "back", side = back ? ix.back : ix.fwd;
    put(side.from, junction(back ? w.b : w.a), w);
    put(side.to, junction(back ? w.a : w.b), w);
  }
  junctionIndex.set(doc, ix);
  return ix;
}
function throughJunctions(doc: Doc, s: Arrow, len: number): { before: number; total: number } {
  const back = s.run === "back";
  const from = (w: Arrow) => (back ? w.b : w.a), to = (w: Arrow) => (back ? w.a : w.b);
  const junction = (e: Arrow["a"]) => { const id = e.bind?.id, sh = id ? doc.shapes[id] : undefined; return sh && !isArrow(sh) && sh.kind === "junction" ? id! : null; };
  // (a wire with no junction at either end is its own movement: nothing to look for)
  if (!junction(from(s)) && !junction(to(s))) return { before: 0, total: len };
  const long = (w: Arrow) => { const p = arrowPath(doc, w); let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]!.x - p[i - 1]!.x, p[i]!.y - p[i - 1]!.y); return l; };
  const ix = indexJunctions(doc)[back ? "back" : "fwd"], seen = new Set([s.id]);
  let before = 0, after = 0, cur: Arrow = s;
  for (let j = junction(from(cur)); j; j = junction(from(cur))) { const up = ix.to.get(j)?.find((w) => !seen.has(w.id)); if (!up) break; seen.add(up.id); before += long(up); cur = up; }
  cur = s;
  for (let j = junction(to(cur)); j; j = junction(to(cur))) { const dn = ix.from.get(j)?.find((w) => !seen.has(w.id)); if (!dn) break; seen.add(dn.id); after += long(dn); cur = dn; }
  return { before, total: before + len + after };
}
export const stage: { g: string | null; mute: Set<string>; live: Set<string> | null } = { g: null, mute: new Set(), live: null };
/** Whether this shape moves with the clock: while a group plays, only that group's own parts do. */
export const moves = (id: string) => clock.t !== null && (!stage.live || stage.live.has(id));
/** How big a wire's port is drawn. */
export const PORT = 16;
/** The stretch of a polyline from `d0` to `d1` along it (board px). */
function stretch(pts: Pt[], d0: number, d1: number): Pt[] {
  const out: Pt[] = [];
  let at = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]!, q = pts[i]!, seg = Math.hypot(q.x - p.x, q.y - p.y), go = (d: number) => ({ x: p.x + ((q.x - p.x) * (d - at)) / (seg || 1), y: p.y + ((q.y - p.y) * (d - at)) / (seg || 1) });
    if (at + seg >= d0 && at <= d1) {
      if (!out.length) out.push(go(Math.max(d0, at)));
      out.push(at + seg <= d1 ? { x: q.x, y: q.y } : go(d1));
    }
    at += seg;
  }
  return out;
}
/** Where a cut wire breaks: two runs either side of a short gap at its middle (or, where its words sit on the middle, halfway to them), and the red stub of each next to the break. */
function cutGap(doc: Doc, s: Arrow, pts: Pt[], cut: number): { parts: Pt[][]; stubs: Pt[][] } | null {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  const G = 16 * cut, S = 9;
  if (len < G + 2 * S + 8) return null;
  let mid = len / 2;
  if (s.text) {
    const { r, beside } = arrowLabel(doc, s);
    if (!beside) {
      // (the break is not hidden under the words: it sits halfway between the wire's start and where it goes under them)
      const pad = 10, inside = (p: Pt) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
      let enter = -1;
      for (let d = 0; d <= len; d += 2) { const p = stretch(pts, d, d)[0]; if (p && inside(p)) { enter = d; break; } }
      if (enter > G + 2 * S + 8) mid = enter / 2;
    }
  }
  const d0 = mid - G / 2, d1 = mid + G / 2;
  return { parts: [stretch(pts, 0, d0), stretch(pts, d1, len)], stubs: [stretch(pts, Math.max(0, d0 - S), d0), stretch(pts, d1, Math.min(len, d1 + S))] };
}
/** The ports of these wires: drawn after everything else, since a port sits on top of the rim it is plugged into. */
export function paintPorts(ctx: CanvasRenderingContext2D, doc: Doc, shapes: Iterable<Shape | undefined>, t: Theme, z = 1) {
  for (const s of shapes) {
    if (!s || !isArrow(s) || !s.ports || s.away) continue;
    const f = s.fine, ends = portsOf(doc, s);
    ctx.save();
    if (f?.o !== undefined) ctx.globalAlpha *= f.o;
    for (const p of ends) {
      if (!p) continue;
      // exactly the mark a socket has always been: a small square of paper with a lit centre
      const pad: Box = { id: s.id + "~port", kind: "pad", x: p.x - PORT / 2, y: p.y - PORT / 2, w: PORT, h: PORT, text: "", tone: f ? "accent" : s.tone, fill: s.unlit ? "none" : "solid", ...(f ? { fine: { line: f.port ?? "n400", w: 2.5, fill: "paper", lamp: s.unlit ? "n300" : (f.lamp ?? "accent") } } : {}) };
      paintKind(ctx, pad, t, Math.max(pad.fine?.w ?? LINE_W, 0.75 / z), false);
    }
    ctx.restore();
  }
}
export function paintShape(ctx: CanvasRenderingContext2D, doc: Doc, s: Shape, t: Theme, z = 1) {
  if (s.away) return;
  drawShape(ctx, doc, s, t, z, null);
}
function drawShape(ctx: CanvasRenderingContext2D, doc: Doc, s: Shape, t: Theme, z: number, editing: Id | null) {
  if (s.kind === "image") return drawPicture(ctx, s as Box, t, z);
  if (s.kind === "thread" || s.kind === "terminal" || s.kind === "browser") {
    // a live thing is drawn by the page over the board; under it lies the sheet it stands on
    // (the shadow is the page's own: a blurred shadow painted here is worked out afresh at every step of a zoom)
    ctx.save();
    ctx.fillStyle = s.kind === "terminal" ? "#161618" : t.dark ? "#18181b" : "#ffffff";
    ctx.beginPath();
    ctx.roundRect(s.x, s.y, s.w, s.h, 12);
    ctx.fill();
    ctx.restore();
    return;
  }
  // a shape set in a face of its own is drawn (and its words measured) in that face
  if (s.face && s.face !== FACE) return withFace(s.face, () => drawShape0(ctx, doc, s, t, z, editing));
  drawShape0(ctx, doc, s, t, z, editing);
}
function drawShape0(ctx: CanvasRenderingContext2D, doc: Doc, s: Shape, t: Theme, z: number, editing: Id | null) {
  // a legend names the colours the board's wires are drawn in
  if (s.kind === "legend") setInUse(tonesInUse(doc));
  // hairlines at reading size; they thin a little, not vanish, when zoomed away
  const f = s.fine;
  // hairlines at reading size; they thin a little, not vanish, when zoomed away (an exact line too)
  let stroke = f?.w !== undefined ? Math.max(f.w, 0.75 / z) : Math.max(LINE_W, 0.75 / z);
  let color = f?.line ? shade(t, f.line) : t.tones[s.tone];
  // the line from a thread to what it made is that thread's: drawn in its colour, and strong enough to follow from far off
  if (isArrow(s) && !f?.line) {
    const from = s.a.bind ? (doc.shapes[s.a.bind.id] as Box | undefined) : undefined;
    if (from?.kind === "thread" && from.live?.hue !== undefined) {
      color = HUES[from.live.hue % HUES.length]!;
      stroke = Math.max(2.5, 2 / z);
    }
  }
  if (f?.o !== undefined) {
    ctx.save();
    ctx.globalAlpha *= f.o;
  }
  try {
    drawBody(ctx, doc, s, t, z, editing, stroke, color);
  } finally {
    if (f?.o !== undefined) ctx.restore();
  }
}
function drawBody(ctx: CanvasRenderingContext2D, doc: Doc, s: Shape, t: Theme, z: number, editing: Id | null, stroke: number, color: string) {
  const f = s.fine;
  const showText = s.id !== editing && z * LABEL_SIZE > 3.5;
  // a turned shape is drawn upright in a turned frame
  const turned = !isArrow(s) && !!s.rot;
  if (turned && !isArrow(s)) {
    const c = center(s);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(s.rot!);
    ctx.translate(-c.x, -c.y);
  }
  if (isBox(s) && !isBasic(s.kind)) {
    paintKind(ctx, s, t, stroke, showText);
    if (turned) ctx.restore();
  } else if (isBox(s) && s.kind === "rect" && s.fill === "solid" && !s.text && Math.min(s.w, s.h) < 16) {
    // a small solid mark (a bar, a cell) is exactly its own size: square, with no outline to fatten it
    ctx.fillStyle = f?.fill ? shade(t, f.fill) : color;
    if (f?.fo !== undefined) ctx.globalAlpha *= f.fo;
    ctx.fillRect(s.x, s.y, s.w, s.h);
    if (turned) ctx.restore();
  } else if (isBox(s)) {
    boxPath(ctx, s);
    // an outline is see-through, so a box drawn around others never hides them
    if (f?.fill) {
      if (f.fill !== "none") {
        ctx.fillStyle = f.fo === undefined ? shade(t, f.fill) : withAlpha(shade(t, f.fill), f.fo);
        ctx.fill();
      }
    } else if (s.fill !== "none") {
      ctx.fillStyle = s.fill === "solid" ? color : t.bg;
      ctx.fill();
      if (s.fill === "tint") {
        ctx.fillStyle = withAlpha(color, 0.1);
        ctx.fill();
      }
    }
    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    dash(ctx, s.line, f ? 1.5 : stroke);
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.text && showText) {
      const size = s.size ?? LABEL_SIZE, l = layoutText(labelText(s), labelWidth(s), size, labelTrack(s));
      drawLines(ctx, l.lines, s.x + s.w / 2, s.y + s.h / 2, size, f?.text ? shade(t, f.text) : labelColor(t, s.tone, s.fill === "solid"), "center", labelTrack(s), s.weight ?? f?.fw, f?.rise);
    }
    if (turned) ctx.restore();
  } else if (isText(s)) {
    if (s.text && showText) {
      const l = textLayout(s);
      drawLines(ctx, l.lines, s.align === "center" ? s.x + s.w / 2 : s.align === "right" ? s.x + s.w : s.x, s.y + s.h / 2, s.size, f?.text ? shade(t, f.text) : labelColor(t, s.tone), s.align ?? "left", s.track, s.weight ?? f?.fw, undefined, f?.prose, s.face);
    }
    if (turned) ctx.restore();
  } else {
    const pts = arrowPath(doc, s);
    const a = pts[0], b = pts[pts.length - 1];
    if (!a || !b) return;
    ctx.lineWidth = stroke;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineJoin = "round";
    // an exact wire is cut square at its ends unless the reference rounds them: a round cap would overshoot the outline it meets
    ctx.lineCap = f && !f.round ? "butt" : "round";
    const hs = f?.head ?? Math.max(8, 3.5 / z);
    // stop the line short of the tip so the head stays sharp
    const trimmed = pts.map((p) => ({ ...p }));
    const trim = (i: number, j: number) => {
      const p = trimmed[i]!, q = trimmed[j]!;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      // a reference head begins exactly where its line ends
      const back = f?.head ? hs : hs * 0.7;
      if (d > hs) {
        p.x += ((q.x - p.x) / d) * back;
        p.y += ((q.y - p.y) / d) * back;
      }
    };
    // a wire that plays in its moment has no head at rest: its head comes with what travels it, at the end it travels to, and goes when it drains
    const still = s.run && !s.dangling ? "none" : s.heads;
    if (still !== "none") trim(trimmed.length - 1, trimmed.length - 2);
    if (still === "both") trim(0, 1);
    // a cut wire is drawn broken: a short gap at its middle (clear of its words), both ends left standing, the stretch either side of the break red
    const cut = Math.min(1, Math.max(0, s.cut ?? 0)), gap = cut > 0.01 ? cutGap(doc, s, trimmed, cut) : null;
    for (const part of gap ? gap.parts : [trimmed]) {
      tracePath(ctx, part, s.square ? 0 : (s.bend ?? ELBOW_R));
      dash(ctx, s.line, f?.crisp ? 0.75 : f ? 1.5 : stroke);
      if (s.drawn !== undefined && s.drawn < 1) {
        // laid only so far along its path
        let len = 0;
        for (let i = 1; i < part.length; i++) len += Math.hypot(part[i]!.x - part[i - 1]!.x, part[i]!.y - part[i - 1]!.y);
        ctx.setLineDash([Math.max(0.0001, len * s.drawn), len + 10]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (gap) {
      ctx.save();
      ctx.globalAlpha *= cut;
      ctx.strokeStyle = t.tones.red;
      ctx.lineWidth = Math.max(stroke, 2);
      ctx.lineCap = "butt";
      for (const stub of gap.stubs) { tracePath(ctx, stub, 0); ctx.stroke(); }
      // (each broken end is cut square across: a short red bar standing at it)
      gap.stubs.forEach((stub, i) => {
        const e = i === 0 ? stub[stub.length - 1] : stub[0], o = i === 0 ? stub[stub.length - 2] : stub[1];
        if (!e || !o) return;
        const d = Math.hypot(e.x - o.x, e.y - o.y) || 1, nx = -(e.y - o.y) / d, ny = (e.x - o.x) / d, k = 4.5 * cut;
        ctx.beginPath(); ctx.moveTo(e.x - nx * k, e.y - ny * k); ctx.lineTo(e.x + nx * k, e.y + ny * k); ctx.stroke();
      });
      ctx.restore();
      ctx.strokeStyle = color;
      ctx.lineWidth = stroke;
    }
    const solid = f?.crisp ? crispHead : f?.head ? fineHead : head;
    // (a dangling wire's head is open: its outline in the wire's line, on paper, pointing at what is gone)
    const tipped = s.dangling ? (c: CanvasRenderingContext2D, tip: Pt, from: Pt, size: number) => openHead(c, tip, from, size * 1.1, t.bg, Math.max(1, stroke * 0.9)) : solid;
    if (still !== "none" && (s.drawn ?? 1) >= 1) tipped(ctx, b, pts[pts.length - 2]!, hs);
    if (still === "both") tipped(ctx, a, pts[1]!, hs);
    if (f?.dot) { ctx.beginPath(); ctx.ellipse(b.x, b.y, 2.25, 2.25, 0, 0, Math.PI * 2); ctx.fill(); }
    if (s.pulse) {
      // a mark travelling the wire while it plays (at rest there is none: a still drawing shows no motion)
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      const p = !moves(s.id) ? 2 : (((clock.t! % s.pulse.every) + s.pulse.every) % s.pulse.every) / s.pulse.dur;
      if (p <= 1 && len > 0) {
        let d = p * len, at = pts[0]!;
        for (let i = 1; i < pts.length; i++) { const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); if (d <= seg) { const k = seg ? d / seg : 0; at = { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * k, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * k }; break; } d -= seg; at = pts[i]!; }
        ctx.fillStyle = shade(t, "accent");
        ctx.fillRect(at.x - 5, at.y - 5, 10, 10);
      }
    }
    if (s.run && clock.since !== null && moves(s.id)) {
      // a request on the wire as its moment arrives, as weld draws them: colour fills the route, holds, and drains
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
      // (a run through a junction is one movement: timed over the whole way, this wire filling only for its own stretch of it)
      const way = throughJunctions(doc, s, len), since = clock.since, dur = Math.min(1400, Math.max(450, way.total * 2.4)), end = pts[pts.length - 1]!, prev = pts[pts.length - 2]!;
      // (a wire with a colour of its own, a red no, travels in that colour)
      const accent = s.tone && s.tone !== "ink" && s.tone !== "muted" && s.tone !== "accent" ? t.tones[s.tone] : shade(t, "accent"), io = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
      if (len > 0 && (s.run !== "squash" || !SQUARE_REFUSAL)) {
        const total = dur + 450, o = since < 0.78 * total ? 1 : Math.max(0, 1 - (since - 0.78 * total) / (0.22 * total));
        if (o > 0) {
          ctx.save();
          ctx.globalAlpha *= o;
          // (a refusal fills its wire the way any request does, in red: it reaches the wall and goes no further)
          ctx.strokeStyle = s.run === "squash" ? t.tones.red : accent;
          ctx.lineWidth = Math.max(stroke, 3);
          ctx.lineCap = "round";
          // an answer runs the same wire the other way
          tracePath(ctx, s.run === "back" ? [...pts].reverse() : pts, s.square ? 0 : (s.bend ?? ELBOW_R));
          const reached = way.total * io(Math.min(1, since / dur)), filled = Math.min(len, reached - way.before);
          if (filled > 0.5) { ctx.setLineDash([filled, len + 10]); ctx.stroke(); }
          // its head takes the colour as the request reaches it
          if (s.run !== "squash" && s.heads !== "none" && reached >= way.before + len * 0.98) {
            ctx.setLineDash([]); ctx.fillStyle = accent;
            if (s.run === "back" || s.heads === "both") tipped(ctx, a, pts[1]!, hs);
            if (s.run !== "back" || s.heads === "both") tipped(ctx, b, pts[pts.length - 2]!, hs);
          }
          ctx.restore();
        }
        if (s.run === "fizzle") {
          // it ran out of path: five sparks scatter from where it stopped
          const JETS = [[-8, -9], [-4, -13], [0, -15], [4, -12], [8, -8]] as const;
          ctx.fillStyle = accent;
          JETS.forEach(([dx, dy], i) => {
            const k = (since - dur - i * 40) / 500;
            if (k < 0 || k > 1) return;
            const e = 1 - Math.pow(1 - k, 3), size = 5 * (1 - 0.6 * e);
            ctx.save();
            ctx.globalAlpha *= 1 - e;
            ctx.fillRect(end.x + dx * 2 * e - size / 2, end.y + dy * 2 * e - size / 2, size, size);
            ctx.restore();
          });
        }
      } else if (len > 0) {
        // refused at a wall: a square runs the wire, flattens against its end and is gone
        const total = dur / 0.72, k = since / total;
        if (k <= 1) {
          const go = Math.min(1, k / 0.72), flat = Math.max(0, (k - 0.72) / 0.28);
          let d = (1 - Math.pow(1 - go, 3)) * len, at = pts[0]!;
          for (let i = 1; i < pts.length; i++) { const seg = Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y); if (d <= seg) { const q = seg ? d / seg : 0; at = { x: pts[i - 1]!.x + (pts[i]!.x - pts[i - 1]!.x) * q, y: pts[i - 1]!.y + (pts[i]!.y - pts[i - 1]!.y) * q }; break; } d -= seg; at = pts[i]!; }
          ctx.save();
          ctx.globalAlpha *= 1 - flat;
          ctx.translate(at.x, at.y);
          ctx.rotate(Math.atan2(end.y - prev.y, end.x - prev.x));
          ctx.fillStyle = accent;
          // along the wire it thins, across it it spreads
          const along = 10 * (1 - 0.7 * flat), across = 10 * (1 + 0.6 * flat);
          ctx.fillRect(-along / 2, -across / 2, along, across);
          ctx.restore();
        }
      }
    }
    if (s.text && showText) {
      const { r, beside } = arrowLabel(doc, s);
      const size = s.size ?? ARROW_LABEL_SIZE, fw = s.track === undefined ? undefined : f?.fw;
      const l = layoutText(s.text, f?.crisp ? 600 : ARROW_LABEL_W, size, s.track, fw);
      if (beside) {
        // (beside the wire it needs no plate: it interrupts nothing)
      } else if (s.pill && f?.r === undefined) {
        // our pill: the words ride the wire on a plate of paper, outlined as the wire is, with the same eased corners a card has (not a half circle), so wire and pill read as one line
        const bh = r.h + 10, bw = r.w + 22, x0 = r.x + r.w / 2 - bw / 2, y0 = r.y + r.h / 2 - bh / 2;
        kindPath(ctx, { x: x0, y: y0, w: bw, h: bh, kind: "card", notch: "", fine: { r: Math.min(10, bh * 0.36) } }, 8);
        ctx.fillStyle = t.bg;
        ctx.fill();
        ctx.setLineDash([]);
        // (outlined as heavily as the wire it rides, so the two read as one line)
        ctx.lineWidth = stroke;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else if (f?.r !== undefined) {
        // a badge: the word rides the wire in a capsule of its own
        // (a fine one hugs its words: about as tall as a line of them)
        const bh = f.crisp ? r.h + 2 : r.h + 8, bw = f.crisp ? r.w + 16 : r.w + 18;
        ctx.beginPath();
        ctx.roundRect(r.x + r.w / 2 - bw / 2, r.y + r.h / 2 - bh / 2, bw, bh, Math.min(f.r, bh / 2));
        ctx.fillStyle = t.bg;
        ctx.fill();
        ctx.fillStyle = withAlpha(color, f.fo ?? 0.12);
        ctx.fill();
        ctx.lineWidth = Math.max(1, stroke * 0.8);
        ctx.strokeStyle = color;
        ctx.stroke();
      } else if (LABEL_ON) {
        // the label interrupts the line it sits on
        ctx.fillStyle = t.bg;
        ctx.fillRect(r.x - 4, r.y - 1, r.w + 8, r.h + 2);
      }
      drawLines(ctx, l.lines, r.x + r.w / 2, r.y + r.h / 2, size, f?.text ? shade(t, f.text) : labelColor(t, s.tone), "center", s.track, fw);
    }
  }
}

// ── the frame ───────────────────────────────────────────────────────
export interface Overlay {
  /** The pointer is over the handle that turns the selection. */
  hoverRotate: boolean;
  /** The pointer is in the space between a group's parts: a press there takes the whole group, whose frame this is. */
  hoverFrame: Rect | null;
  marquee: Rect | null;
  /** Alignment guides, in world coordinates. */
  guides: { a: Pt; b: Pt }[];
  /** A box an arrow end is about to bind to, and the exact spot. */
  bindBox: Id | null;
  bindPoint: Pt | null;
  /** Show the "add a connected box" stubs on this box. */
  stubsFor: Id | null;
  hoverStub: number;
  /** Show only this stub (-1: all of them). */
  onlyStub: number;
  hover: Id | null;
  /** The group that has been stepped into. */
  scope: Id | null;
  /** A stamp in hand, shown where the next press would put it (`c`: its own centre). */
  ghost: { doc: Doc; c: Pt; at: Pt | null } | null;
  /** Hide handles while something is being dragged. */
  busy: boolean;
  /** Shapes outlined because they belong with what is in hand (what a thread has been connected to), in that thread's colour. */
  /** What belongs with the thing in hand, outlined faintly in its colour; `hot`, the one being pointed at, strongly. */
  kin?: { ids: Set<Id>; color: string; hot?: Set<Id> } | null;
  /** What a press would point at, while talking to a thread (see live/pick.ts). */
  aim?: { ids: Set<Id>; color: string } | null;
  /** What an agent has just drawn or changed, glowing in its colour for a moment. */
  flash?: { ids: Set<Id>; until: number; color: string } | null;
}
export const emptyOverlay = (): Overlay => ({
  hoverRotate: false, hoverFrame: null, marquee: null, guides: [], bindBox: null, bindPoint: null, stubsFor: null, hoverStub: -1, onlyStub: -1, hover: null, scope: null, ghost: null, busy: false,
});

/** How close (screen px) the pointer must be to a handle to take it. */
export const HANDLE = 8;
export const STUB_OUT = 20;
/** The four quick-create stubs of a box, in world points: right, bottom, left, top. */
export function stubPoints(b: Rect, z: number): Pt[] {
  const o = STUB_OUT / z;
  return [
    { x: b.x + b.w + o, y: b.y + b.h / 2 },
    { x: b.x + b.w / 2, y: b.y + b.h + o },
    { x: b.x - o, y: b.y + b.h / 2 },
    { x: b.x + b.w / 2, y: b.y - o },
  ];
}
/** The frame the selection's handles sit on: a lone box or text keeps
 *  its own turned rect; anything else gets the upright rect around it. */
export function selectionFrame(doc: Doc, sel: Set<Id>): (Rect & { rot: number }) | null {
  const shapes = [...sel].map((id) => doc.shapes[id]).filter((s): s is Shape => !!s);
  const solid = shapes.filter((s) => !isArrow(s));
  if (!solid.length) return null;
  if (shapes.length === 1) {
    const s = solid[0] as Box;
    return { x: s.x, y: s.y, w: s.w, h: s.h, rot: s.rot ?? 0 };
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of shapes) {
    const r = bounds(doc, s);
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0 };
}
/** How far the turning handle stands off the frame's top-right corner, in screen px. */
export const ROTATE_OUT = 14;
/** The stubs that should show: a side an arrow already meets has none,
 *  so a stub never sits on top of an arrowhead. */
export function visibleStubs(doc: Doc, box: Box, z: number): (Pt | null)[] {
  const ends: Pt[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!isArrow(s) || (s.a.bind?.id !== box.id && s.b.bind?.id !== box.id)) continue;
    const pts = arrowPath(doc, s);
    if (s.a.bind?.id === box.id && pts[0]) ends.push(pts[0]);
    if (s.b.bind?.id === box.id && pts.length) ends.push(pts[pts.length - 1]!);
  }
  // nor where the handle that turns the box has come round to
  const turnAt = turn({ x: box.x + box.w + ROTATE_OUT / z, y: box.y - ROTATE_OUT / z }, center(box), box.rot ?? 0);
  const taken = (p: Pt) => Math.hypot(turnAt.x - p.x, turnAt.y - p.y) < 22 / z || ends.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 30 / z);
  return stubPoints(aabb(box), z).map((p) => (taken(p) ? null : p));
}

/** What lies behind the drawing: the usual dots, ruled squares, or nothing. */
let ground: "dots" | "lines" | "none" = "dots";
export const setGround = (g: typeof ground) => { ground = g; };
const dotTiles = new Map<string, CanvasPattern>();
/** An accent of a board's own, in place of the blue. */
export function setAccent(light: string, dark: string) {
  lookEpoch++;
  LIGHT.tones.accent = light; DARK.tones.accent = dark;
  LIGHT.accent = light; DARK.accent = dark;
  SHADES_LIGHT.accent = light; SHADES_DARK.accent = dark;
}
/** The families the board can be set in. */
export type Face = "inter" | "figtree" | "instrument" | "geist" | "weld";
const REST = "ui-sans-serif, system-ui, sans-serif", sans = (name: string) => `"${name}", "Inter Variable", ${REST}`, code = (name: string) => `"${name}", "DM Mono", ui-monospace, monospace`;
const FACES: Record<Face, { font: string; mono: string; prose: string }> = {
  inter: { font: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif', mono: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif', prose: '"Inter Tight", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif' },
  // (plain throughout: its labels are set in it too, not in a typewriter face)
  figtree: { font: sans("Figtree Variable"), mono: sans("Figtree Variable"), prose: sans("Figtree Variable") },
  instrument: { font: sans("Instrument Sans Variable"), mono: code("Fragment Mono"), prose: sans("Instrument Sans Variable") },
  // (not offered: a study board's only, the faces of the system it is a study of)
  geist: { font: sans("Geist Variable"), mono: code("Geist Mono Variable"), prose: sans("Geist Variable") },
  // (not offered: the board's faces before Figtree, labels in DM Mono; kept so a drawing set in them still draws so)
  weld: { font: '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif', mono: '"DM Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace', prose: '"Inter Tight", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif' },
};
/** The pairs the board offers: a reading face and the label face that goes with it. */
export const FACE_LIST: { id: Face; name: string; mono: string }[] = [
  { id: "figtree", name: "Figtree", mono: "Figtree" }, { id: "inter", name: "Inter", mono: "Inter" }, { id: "instrument", name: "Instrument Sans", mono: "Fragment Mono" },
];
export const faceFonts = (id: Face) => FACES[id];
// A face is only fetched once something asks for it, and a canvas draws in a stand-in until it has come: so a face is asked for
// as soon as anything is set in it, and the board is drawn again (its words measured afresh) once it is here
const asked = new Set<Face>();
let arrived: () => void = () => {};
export const onFacesArrive = (fn: () => void) => { arrived = fn; };
export function want(f: Face) {
  if (asked.has(f) || typeof document === "undefined" || !document.fonts) return;
  asked.add(f);
  const F = FACES[f];
  void Promise.all([400, 500, 700].flatMap((w) => [document.fonts.load(`${w} 14px ${F.font}`), document.fonts.load(`${w} 14px ${F.mono}`)])).then(() => { layoutCache.clear(); arrived(); });
}
/** Runs `fn` with the board set in `f` for its length: a shape in a face of its own is drawn and measured this way. */
export function withFace<T>(f: string | undefined, fn: () => T): T {
  if (!f || f === FACE || !FACES[f as Face]) return fn();
  want(f as Face);
  const was = { font: FONT, mono: MONO, prose: PROSE };
  ({ font: FONT, mono: MONO, prose: PROSE } = FACES[f as Face]);
  try { return fn(); } finally { ({ font: FONT, mono: MONO, prose: PROSE } = was); }
}
let FACE: Face = "figtree";
/** The faces the board is set in: its reading face and its label face change together. */
export const face = () => FACE;
export function setFace(to: Face) {
  FACE = to;
  want(to);
  ({ font: FONT, mono: MONO, prose: PROSE } = FACES[to]);
  layoutCache.clear();
}
export function setBlack(paper: string) { lookEpoch++; DARK.bg = paper; SHADES_DARK.paper = paper; }
function grid(ctx: CanvasRenderingContext2D, w: number, h: number, cam: Camera, t: Theme) {
  const z = cam.z;
  if (ground === "none") return;
  if (ground === "lines") {
    // ruled squares, as on drafting paper: hairlines that stay hairlines at any zoom
    let s = 96;
    while (s * z < 48) s *= 2;
    while (s * z >= 192) s /= 2;
    ctx.beginPath();
    for (let x = Math.floor(cam.x / s) * s; (x - cam.x) * z <= w; x += s) { const sx = Math.round((x - cam.x) * z) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, h); }
    for (let y = Math.floor(cam.y / s) * s; (y - cam.y) * z <= h; y += s) { const sy = Math.round((y - cam.y) * z) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(w, sy); }
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(t.text, t.dark ? 0.07 : 0.06);
    ctx.stroke();
    return;
  }
  // two levels of dots: the finer one fades in as you zoom toward it, so
  // the grid never jumps and never turns to noise
  let step = 24;
  while (step * z < 14) step *= 2;
  while (step * z >= 28) step /= 2;
  // one dot is drawn once and laid like a tile: a board full of dots costs one fill, not thousands of circles
  const dpr = ctx.getTransform().a;
  const level = (s: number, alpha: number) => {
    if (alpha <= 0.02) return;
    const size = s * z * dpr, n = Math.ceil(size);
    const key = `${n}|${t.dot}|${dpr}`;
    let tile = dotTiles.get(key);
    if (!tile) {
      if (dotTiles.size > 600) dotTiles.clear();
      const c = document.createElement("canvas");
      c.width = c.height = n;
      const g = c.getContext("2d")!;
      g.fillStyle = t.dot;
      g.beginPath();
      g.arc(n / 2, n / 2, 0.65 * dpr, 0, Math.PI * 2);
      g.fill();
      tile = ctx.createPattern(c, "repeat")!;
      dotTiles.set(key, tile);
    }
    const x0 = (Math.floor(cam.x / s) * s - cam.x) * z * dpr, y0 = (Math.floor(cam.y / s) * s - cam.y) * z * dpr, k = size / n;
    tile.setTransform(new DOMMatrix([k, 0, 0, k, x0 - size / 2, y0 - size / 2]));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = tile;
    ctx.fillRect(0, 0, w * dpr, h * dpr);
    ctx.restore();
  };
  ctx.fillStyle = t.dot;
  // `step` is 14–28px apart on screen; the next coarser level is always solid
  level(step * 2, 1);
  level(step, (step * z - 14) / 14);
  ctx.globalAlpha = 1;
}

/** The shapes on screen, in drawing order: an arrow is on screen if its line or its label is. */
function onScreen(doc: Doc, r: Rect): Shape[] {
  const out: Shape[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s) continue;
    if (!overlaps(isArrow(s) ? bounds(doc, s) : s, r) && !(isArrow(s) && s.text && overlaps(arrowLabelRect(doc, s), r))) continue;
    out.push(s);
  }
  return out;
}
/** Draw these shapes of the board, in world space (the transform is already set). */
function paintWorld(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, doc: Doc, shapes: Shape[], sel: Set<Id>, editing: Id | null, t: Theme, z: number, ports: Iterable<Shape | undefined> = shapes) {
  const c = ctx as CanvasRenderingContext2D;
  for (const s of shapes) {
    if (s.away) {
      // where it was a moment ago is a faint trace; a part hidden here is kept off the board unless it is the one picked
      const was = s.id.endsWith("~was");
      if (s.group !== stage.g) continue;
      if (!was && stage.mute.has(s.id) && !sel.has(s.id)) continue;
      c.save();
      c.globalAlpha *= was ? 0.16 : 0.22;
      drawShape(c, doc, s, t, z, editing);
      c.restore();
      continue;
    }
    drawShape(c, doc, s, t, z, editing);
  }
  paintPorts(c, doc, ports, t, z);
}

// ── a large board while the view moves ────────────────────────────
// A board too big to draw in a frame is kept, while the view only pans and zooms over it, as tiles of its picture, each
// drawn once and then just placed; the moment the view comes to rest it is drawn exactly again. A board that draws in
// time never uses them, and any change to the board (or its look) throws them away.
const TILE = 512, SLOW = 6, KEEP = 160, BUDGET = 6, OVERVIEW = 4096;
/** Bumped by anything that changes how the board looks without changing the board. */
let lookEpoch = 0;
export function looked() {
  lookEpoch++;
}
type Ctx2 = CanvasRenderingContext2D;
type Seen = { dpr: number; w: number; h: number; cam: Camera; sel: Set<Id>; editing: Id | null; t: Theme };
const tiles = {
  /** whether the last exact picture took longer than a frame can spare */
  slow: false,
  doc: null as Doc | null,
  key: "",
  cam: null as Camera | null,
  at: new Map<string, OffscreenCanvas>(),
  /** the whole board at a small size, to stand in wherever nothing nearer has been drawn yet */
  over: { lv: NaN, at: new Map<string, OffscreenCanvas>() },
  /** where each shape lies, worked out once for the board as it stands */
  where: null as { s: Shape; r: Rect }[] | null,
  all: null as Rect | null,
  /** how the board was last seen, for drawing ahead while nothing happens */
  seen: null as Seen | null,
  idle: 0,
  still: null as { c: OffscreenCanvas; x: OffscreenCanvasRenderingContext2D; cam: Camera | null } | null,
};
/** Tiles are drawn at the nearest level at or above the view's zoom (in half-steps of two), so they only ever shrink a little. */
const levelFor = (z: number) => Math.pow(2, Math.ceil(Math.log2(z) * 2 - 1e-9) / 2);
const tileName = (lv: number, x: number, y: number) => `${lv}|${x}|${y}`;
const tileW = (lv: number, dpr: number) => TILE / (dpr * lv);
/** The tiles of a level that cover a rect of the board. */
function cover(lv: number, dpr: number, r: Rect) {
  const W = tileW(lv, dpr);
  return { W, x0: Math.floor(r.x / W), x1: Math.floor((r.x + r.w) / W), y0: Math.floor(r.y / W), y1: Math.floor((r.y + r.h) / W) };
}
function where(doc: Doc) {
  if (tiles.where) return tiles.where;
  const out: { s: Shape; r: Rect }[] = [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s) continue;
    let r: Rect = isArrow(s) ? bounds(doc, s) : s;
    if (isArrow(s) && s.text) { const l = arrowLabelRect(doc, s), a = Math.min(r.x, l.x), b = Math.min(r.y, l.y); r = { x: a, y: b, w: Math.max(r.x + r.w, l.x + l.w) - a, h: Math.max(r.y + r.h, l.y + l.h) - b }; }
    out.push({ s, r });
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  }
  tiles.all = x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  return (tiles.where = out);
}
function drawTile(doc: Doc, v: Seen, lv: number, x: number, y: number) {
  const W = tileW(lv, v.dpr), c = new OffscreenCanvas(TILE, TILE), tc = c.getContext("2d")!;
  const k = v.dpr * lv, r: Rect = { x: x * W - 40 / lv, y: y * W - 40 / lv, w: W + 80 / lv, h: W + 80 / lv };
  tc.setTransform(k, 0, 0, k, -x * W * k, -y * W * k);
  paintWorld(tc, doc, where(doc).filter((e) => overlaps(e.r, r)).map((e) => e.s), v.sel, v.editing, v.t, lv);
  return c;
}
function keep(n: string, c: OffscreenCanvas) {
  tiles.at.delete(n);
  tiles.at.set(n, c);
  while (tiles.at.size > KEEP) tiles.at.delete(tiles.at.keys().next().value!);
}
/** While nothing happens, draw ahead: the tiles around the view, then the whole board small. */
function ahead() {
  if (tiles.idle || typeof window === "undefined") return;
  const later = (fn: (left: () => number) => void, wait = 0) => {
    const ric = (window as unknown as { requestIdleCallback?: (f: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const go = () => { tiles.idle = ric ? ric((d) => fn(() => d.timeRemaining()), { timeout: 400 }) : (setTimeout(() => { const t0 = performance.now(); fn(() => 8 - (performance.now() - t0)); }, 60) as unknown as number); };
    if (wait) tiles.idle = setTimeout(go, wait) as unknown as number; else go();
  };
  const step = (left: () => number) => {
    tiles.idle = 0;
    const doc = tiles.doc, v = tiles.seen;
    if (!doc || !v || !tiles.slow) return;
    const todo: [Map<string, OffscreenCanvas> | null, number, number, number][] = [];
    // the view and a ring round it, at its own level
    const lv = levelFor(v.cam.z), g = cover(lv, v.dpr, { x: v.cam.x, y: v.cam.y, w: v.w / v.cam.z, h: v.h / v.cam.z });
    for (let y = g.y0 - 1; y <= g.y1 + 1; y++) for (let x = g.x0 - 1; x <= g.x1 + 1; x++) if (!tiles.at.has(tileName(lv, x, y))) todo.push([null, lv, x, y]);
    // then all of it, small
    const all = tiles.all ?? (where(doc), tiles.all);
    if (all) {
      const ov = levelFor(Math.min(OVERVIEW / (v.dpr * all.w), OVERVIEW / (v.dpr * all.h)) / Math.SQRT2);
      if (tiles.over.lv !== ov) { tiles.over.lv = ov; tiles.over.at.clear(); }
      const o = cover(ov, v.dpr, all);
      for (let y = o.y0; y <= o.y1; y++) for (let x = o.x0; x <= o.x1; x++) if (!tiles.over.at.has(tileName(ov, x, y))) todo.push([tiles.over.at, ov, x, y]);
    }
    while (todo.length && left() > 2) {
      const [into, l, x, y] = todo.shift()!;
      const c = drawTile(doc, v, l, x, y);
      if (into) into.set(tileName(l, x, y), c); else keep(tileName(l, x, y), c);
    }
    if (todo.length) later(step);
  };
  later(step, 250);
}
/** Draws the board from tiles when that is what it is for ("rough"); "again" when the last exact picture still stands, and
 *  "exact" or "fresh" (the board has changed) when it should be drawn exactly. */
function tiled(ctx: Ctx2, view: { w: number; h: number; dpr: number }, doc: Doc, cam: Camera, sel: Set<Id>, editing: Id | null, t: Theme): "rough" | "again" | "exact" | "fresh" {
  const { w, h, dpr } = view, z = cam.z;
  const key = `${lookEpoch}|${FACE}|${dpr}|${editing ?? ""}|${t.bg}|${t.tones.ink}|${stage.g ?? ""}|${stage.g ? [...sel].join(",") + "|" + stage.mute.size : ""}`;
  const was = tiles.cam, moving = !!was && (was.x !== cam.x || was.y !== cam.y || was.z !== z);
  tiles.cam = { ...cam };
  tiles.seen = { dpr, w, h, cam: { ...cam }, sel, editing, t };
  if (tiles.doc !== doc || tiles.key !== key) {
    tiles.doc = doc; tiles.key = key; tiles.at.clear(); tiles.over.at.clear(); tiles.over.lv = NaN; tiles.where = null; tiles.all = null;
    if (tiles.still) tiles.still.cam = null;
    return "fresh";
  }
  if (typeof OffscreenCanvas === "undefined" || !tiles.slow) return "exact";
  const st = tiles.still;
  if (!moving && st?.cam && st.cam.x === cam.x && st.cam.y === cam.y && st.cam.z === z && st.c.width === Math.round(w * dpr) && st.c.height === Math.round(h * dpr)) return "again";
  if (!moving) return "exact";
  const v = tiles.seen, want = levelFor(z), view_: Rect = { x: cam.x, y: cam.y, w: w / z, h: h / z }, g = cover(want, dpr, view_), start = performance.now();
  for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) { const n = tileName(want, x, y); if (!tiles.at.has(n) && performance.now() - start < BUDGET) keep(n, drawTile(doc, v, want, x, y)); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const px = (wx: number) => Math.round((wx - cam.x) * z * dpr), py = (wy: number) => Math.round((wy - cam.y) * z * dpr);
  const put = (c: OffscreenCanvas, lv: number, x: number, y: number) => { const W = tileW(lv, dpr), x0 = px(x * W), y0 = py(y * W); ctx.drawImage(c, x0, y0, px((x + 1) * W) - x0, py((y + 1) * W) - y0); };
  const missing: Rect[] = [];
  for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) {
    const n = tileName(want, x, y), c = tiles.at.get(n);
    if (c) { keep(n, c); put(c, want, x, y); } else missing.push({ x: x * g.W, y: y * g.W, w: g.W, h: g.W });
  }
  if (!missing.length) return "rough";
  // where nothing at this level is drawn yet, the whole board small stands in (soft for a moment), and failing that the board itself
  const exact: Rect[] = [], ov = tiles.over.lv;
  for (const r of missing) {
    const o = Number.isNaN(ov) ? null : cover(ov, dpr, { x: r.x + 1e-6, y: r.y + 1e-6, w: r.w - 2e-6, h: r.h - 2e-6 });
    let whole = !!o;
    if (o) for (let y = o.y0; y <= o.y1 && whole; y++) for (let x = o.x0; x <= o.x1; x++) if (!tiles.over.at.has(tileName(ov, x, y)) && tiles.all && overlaps({ x: x * o.W, y: y * o.W, w: o.W, h: o.W }, tiles.all)) { whole = false; break; }
    if (!o || !whole) { exact.push(r); continue; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(px(r.x), py(r.y), px(r.x + r.w) - px(r.x), py(r.y + r.h) - py(r.y));
    ctx.clip();
    for (let y = o.y0; y <= o.y1; y++) for (let x = o.x0; x <= o.x1; x++) { const c = tiles.over.at.get(tileName(ov, x, y)); if (c) put(c, ov, x, y); }
    ctx.restore();
  }
  if (exact.length) {
    // what has nothing to stand in for it is drawn as it is, there only
    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    ctx.beginPath();
    for (const r of exact) ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    const x0 = Math.min(...exact.map((r) => r.x)), y0 = Math.min(...exact.map((r) => r.y));
    const area: Rect = { x: x0 - 40 / z, y: y0 - 40 / z, w: Math.max(...exact.map((r) => r.x + r.w)) - x0 + 80 / z, h: Math.max(...exact.map((r) => r.y + r.h)) - y0 + 80 / z };
    paintWorld(ctx, doc, where(doc).filter((e) => overlaps(e.r, area)).map((e) => e.s), sel, editing, t, z);
    ctx.restore();
  }
  return "rough";
}
/** The kept picture of the board as last drawn exactly, the size of the screen. */
function stillFor(w: number, h: number): OffscreenCanvasRenderingContext2D {
  if (!tiles.still || tiles.still.c.width !== w || tiles.still.c.height !== h) { const c = new OffscreenCanvas(w, h); tiles.still = { c, x: c.getContext("2d")!, cam: null }; }
  return tiles.still.x;
}

export function render(
  ctx: CanvasRenderingContext2D,
  view: { w: number; h: number; dpr: number },
  doc: Doc,
  cam: Camera,
  sel: Set<Id>,
  editing: Id | null,
  o: Overlay,
  t: Theme,
  showGrid: boolean,
  /** The board is painted on two sheets, with the live things between them: what is drawn below, what is in hand above. */
  pass: "all" | "below" | "above" = "all",
): boolean {
  const { w, h, dpr } = view;
  const z = cam.z;
  /** Whether this picture was put together from tiles, and is to be drawn exactly once the view rests. */
  let rough = false;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (pass === "above") ctx.clearRect(0, 0, w, h);
  else {
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, w, h);
  if (showGrid) grid(ctx, w, h, cam, t);

  // shapes, in world space; anything off screen is skipped (and, on one sheet, while the view moves over a large board,
  // from tiles: a board painted on two sheets has live things between them, whose pictures a tile would not keep up with)
  const how = o.ghost || pass !== "all" ? "exact" : tiled(ctx, view, doc, cam, sel, editing, t);
  rough = how === "rough";
  if (how === "again") {
    // nothing on the board or in the view has changed (only what is drawn over it): the picture is put back as it was
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tiles.still!.c, 0, 0);
  } else if (!rough) {
    const viewRect: Rect = { x: cam.x - 40 / z, y: cam.y - 40 / z, w: w / z + 80 / z, h: h / z + 80 / z };
    // (a large board's picture is kept, so what is drawn over it can change without drawing the board again)
    const keepIt = pass === "all" && how === "exact" && tiles.slow && !o.ghost && typeof OffscreenCanvas !== "undefined";
    const into = keepIt ? stillFor(Math.round(w * dpr), Math.round(h * dpr)) : ctx;
    // (cleared whole, in its own pixels: it still holds the last picture's transform)
    if (keepIt) { into.setTransform(1, 0, 0, 1, 0, 0); into.clearRect(0, 0, Math.round(w * dpr), Math.round(h * dpr)); }
    into.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    const t0 = performance.now();
    // (on two sheets, every wire's sockets, as before: the sheets are not tiled, so there is nothing to save)
    paintWorld(into, doc, onScreen(doc, viewRect), sel, editing, t, z, pass === "all" ? undefined : doc.order.map((id) => doc.shapes[id]));
    if (pass === "all") {
      tiles.slow = performance.now() - t0 > SLOW;
      if (keepIt) {
        tiles.still!.cam = { ...cam };
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(tiles.still!.c, 0, 0);
      } else if (tiles.still) tiles.still.cam = null;
      if (tiles.slow && tiles.doc === doc) ahead();
    }
  }
  if (o.ghost?.at) {
    // the stamp in hand, faint, exactly where and how large it will land
    const g = o.ghost;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    ctx.save();
    ctx.translate(g.at!.x - g.c.x, g.at!.y - g.c.y);
    ctx.globalAlpha = 0.45;
    for (const id of g.doc.order) drawShape(ctx, g.doc, g.doc.shapes[id]!, t, z, null);
    paintPorts(ctx, g.doc, g.doc.order.map((id) => g.doc.shapes[id]), t, z);
    ctx.restore();
  }

  }
  if (pass === "below") return rough;
  // overlays, in screen space
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = (x: number) => (x - cam.x) * z, sy = (y: number) => (y - cam.y) * z;
  const sr = (r: Rect): Rect => ({ x: sx(r.x), y: sy(r.y), w: r.w * z, h: r.h * z });
  ctx.lineJoin = "round";

  if (o.scope) {
    // the group that has been stepped into, drawn as a quiet frame around all of it
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of doc.order) {
      const s = doc.shapes[id]!;
      if (s.group !== o.scope || s.away) continue;
      const b = bounds(doc, s);
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (x0 < x1) {
      const r = sr({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      ctx.save();
      // the same line, in the same place, as the frame of the group when all of it is selected
      ctx.strokeStyle = withAlpha(t.accent, 0.4);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
      ctx.restore();
    }
  }

  // (`gap`: drawn that far outside the shape, clear of its own edge, so a thin line still reads as the shape's)
  const outline = (s: Shape, width: number, color: string, gap = 0) => {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    if (!isArrow(s) && s.rot) {
      const r = sr(s), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(s.rot);
      ctx.translate(-cx, -cy);
      if (isBox(s)) {
        kindPath(ctx, { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2, kind: s.kind, notch: s.notch, head: s.head, dips: s.dips, fine: s.fine, text: s.text, levels: s.levels }, 8 * z);
        ctx.stroke();
      } else ctx.strokeRect(r.x - 4, r.y - 2, r.w + 8, r.h + 4);
      ctx.restore();
    } else if (isBox(s)) {
      const r = sr(s);
      kindPath(ctx, { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2, kind: s.kind, notch: s.notch, head: s.head, dips: s.dips, fine: s.fine, text: s.text, levels: s.levels }, 8 * z);
      ctx.stroke();
    } else if (isText(s)) {
      const r = sr(s);
      ctx.strokeRect(Math.round(r.x - 4) + 0.5, Math.round(r.y - 2) + 0.5, Math.round(r.w + 8), Math.round(r.h + 4));
    } else {
      tracePath(ctx, arrowPath(doc, s).map((p) => ({ x: sx(p.x), y: sy(p.y) })), s.square ? 0 : (s.bend ?? ELBOW_R) * z);
      ctx.stroke();
    }
  };

  if (o.hover && !sel.has(o.hover) && !o.busy) {
    const s = doc.shapes[o.hover];
    if (s) outline(s, 1, withAlpha(t.accent, 0.5));
  }
  if (o.hoverFrame && !o.busy) {
    const r = sr(o.hoverFrame);
    ctx.lineWidth = 1;
    ctx.strokeStyle = withAlpha(t.accent, 0.4);
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
    ctx.setLineDash([]);
  }
  if (o.bindBox) {
    const s = doc.shapes[o.bindBox];
    if (s) outline(s, 1.5, t.accent);
  }
  // (shapes only: a line outlined would be drawn over its own label, and the shapes say enough which drawing it is)
  if (o.aim)
    for (const id of o.aim.ids) {
      const s = doc.shapes[id];
      if (s && !isArrow(s) && s.kind !== "frame" && s.kind !== "boundary") outline(s, 2.5, o.aim.color);
    }
  if (o.flash && o.flash.until > Date.now())
    for (const id of o.flash.ids) {
      const s = doc.shapes[id];
      if (s && !isArrow(s) && s.kind !== "frame" && s.kind !== "boundary") outline(s, 3, withAlpha(o.flash.color, 0.55));
    }
  if (o.kin && !o.busy)
    for (const id of o.kin.ids) {
      const s = doc.shapes[id];
      if (s && !isArrow(s) && s.kind !== "frame" && s.kind !== "boundary" && !sel.has(id)) o.kin.hot?.has(id) ? outline(s, 2, o.kin.color) : outline(s, 1.5, withAlpha(o.kin.color, 0.55), 4);
    }

  // while it plays, a selected part that is not in the picture has no outline standing where it would be
  const selected = [...sel].map((id) => doc.shapes[id]).filter((s): s is Shape => !!s && !(s.away && clock.t !== null));
  // a whole group taken together is one thing: its frame says so, and its parts keep their own colours
  const whole = selected.length > 1 && !!selected[0]!.group && selected.every((s) => s.group === selected[0]!.group);
  for (const s of selected) {
    if (s.id === editing || whole) continue;
    if (isArrow(s)) outline(s, 3, withAlpha(t.accent, 0.3));
    else outline(s, 1, t.accent);
  }

  // a lone arrow shows the two ends you can take hold of
  const only = selected.length === 1 ? selected[0] : undefined;
  if (only && isArrow(only)) drawArrowEnds(ctx, doc, only, sx, sy, t);
  // a lone timeline or set of segments shows where its points or seams can be slid
  if (only && !isArrow(only) && only.kind !== "text" && (only.kind === "timeline" || only.kind === "segments"))
    for (const m of grips(only)) {
      ctx.beginPath(); ctx.roundRect(sx(m.x) - 3.5, sy(m.y) - 3.5, 7, 7, 1.5);
      ctx.fillStyle = t.bg; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = t.accent; ctx.stroke();
    }

  // the selection's frame, its four corner handles, and the handle that turns it
  const fr = selected.length === sel.size ? selectionFrame(doc, sel) : selected.length ? selectionFrame(doc, new Set(selected.map((s) => s.id))) : null;
  if (fr && !o.busy && !editing) {
    const r = sr(fr), c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    const at = (x: number, y: number) => turn({ x, y }, c, fr.rot);
    if (selected.length > 1) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = withAlpha(t.accent, 0.4);
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
      ctx.setLineDash([]);
    }
    ctx.fillStyle = t.bg;
    ctx.strokeStyle = t.accent;
    ctx.lineWidth = 1;
    const lone = selected.length === 1 ? selected[0] : undefined;
    if (!(lone && isText(lone))) {
      for (const [hx, hy] of [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]] as const) {
        const p = at(hx, hy);
        ctx.save();
        ctx.translate(fr.rot ? p.x : Math.round(p.x) + 0.5, fr.rot ? p.y : Math.round(p.y) + 0.5);
        ctx.rotate(fr.rot);
        ctx.beginPath();
        ctx.roundRect(-3, -3, 6, 6, 1.5);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
    // turning: a small ring standing off the top-right corner (a live thing is never turned)
    const liveOnly = [...sel].every((id) => { const k = doc.shapes[id]?.kind; return k === "thread" || k === "terminal" || k === "browser"; });
    const pad = lone && isText(lone) ? 4 : 0;
    const h = at(r.x + r.w + pad + ROTATE_OUT, r.y - pad / 2 - ROTATE_OUT);
    ctx.beginPath();
    if (!liveOnly) ctx.arc(h.x, h.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = o.hoverRotate ? t.accent : t.bg;
    ctx.fill();
    ctx.strokeStyle = o.hoverRotate ? t.accent : withAlpha(t.tones.muted, 0.7);
    ctx.stroke();
  }

  // quick-create stubs beside the free edges of a lone selected box
  if (o.stubsFor && sel.size === 1 && sel.has(o.stubsFor) && !o.busy && !editing) {
    const s = doc.shapes[o.stubsFor];
    if (isBox(s)) {
      visibleStubs(doc, s, z).forEach((p, i) => {
        if (!p || (o.onlyStub >= 0 && o.onlyStub !== i)) return;
        const hot = i === o.hoverStub;
        const x = Math.round(sx(p.x)) + 0.5, y = Math.round(sy(p.y)) + 0.5;
        // the same size at rest and under the pointer: only its colour answers
        ctx.beginPath();
        ctx.arc(x, y, 8, 0, Math.PI * 2);
        ctx.fillStyle = hot ? t.accent : t.bg;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = hot ? t.accent : withAlpha(t.tones.muted, 0.55);
        ctx.stroke();
        ctx.strokeStyle = hot ? t.bg : t.tones.muted;
        ctx.beginPath();
        ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3);
        ctx.stroke();
      });
    }
  }

  if (o.bindPoint) {
    ctx.beginPath();
    ctx.arc(sx(o.bindPoint.x), sy(o.bindPoint.y), 3.5, 0, Math.PI * 2);
    ctx.fillStyle = t.accent;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = t.bg;
    ctx.stroke();
  }

  if (o.guides.length) {
    ctx.strokeStyle = withAlpha(t.accent, 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const g of o.guides) {
      ctx.moveTo(Math.round(sx(g.a.x)) + 0.5, Math.round(sy(g.a.y)) + 0.5);
      ctx.lineTo(Math.round(sx(g.b.x)) + 0.5, Math.round(sy(g.b.y)) + 0.5);
    }
    ctx.stroke();
  }

  if (o.marquee) {
    const r = sr(o.marquee);
    ctx.fillStyle = withAlpha(t.accent, 0.06);
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = withAlpha(t.accent, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
  }
  return rough;
}

function drawArrowEnds(ctx: CanvasRenderingContext2D, doc: Doc, a: Arrow, sx: (x: number) => number, sy: (y: number) => number, t: Theme) {
  const pts = arrowPath(doc, a);
  const vis = [pts[0]!, pts[pts.length - 1]!];
  [a.a, a.b].forEach((e, i) => {
    const v = vis[i]!;
    // an end pinned to an exact spot (not just "this box") shows that spot, quietly
    if (boundBox(doc, e) && e.bind && (e.bind.ax !== 0.5 || e.bind.ay !== 0.5)) {
      const anchor = endPoint(doc, e);
      ctx.beginPath();
      ctx.arc(sx(anchor.x), sy(anchor.y), 2, 0, Math.PI * 2);
      ctx.fillStyle = t.accent;
      ctx.fill();
    }
    // the handle you take hold of sits on the visible tip
    ctx.beginPath();
    ctx.arc(sx(v.x), sy(v.y), 4, 0, Math.PI * 2);
    ctx.fillStyle = t.bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.accent;
    ctx.stroke();
  });
  // and its middle, to pull it into a bend, a bow or a moved run: a small square, so it is not taken for an end
  if (!a.via?.length) {
    const m = bowHandle(doc, a), x = sx(m.x), y = sy(m.y);
    ctx.beginPath();
    ctx.roundRect(x - 3.5, y - 3.5, 7, 7, 1.5);
    ctx.fillStyle = a.bow ? t.accent : t.bg;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = t.accent;
    ctx.stroke();
  }
}

/** A picture: drawn from its preview while small on screen, from itself when large; its frame while it decodes. */
function drawPicture(ctx: CanvasRenderingContext2D, b: Box, t: Theme, z: number) {
  const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
  const src = pictureFor(b, b.w * z * dpr);
  ctx.save();
  if (b.rot) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate(b.rot);
    ctx.translate(-cx, -cy);
  }
  if (src) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, b.x, b.y, b.w, b.h);
  } else {
    ctx.fillStyle = t.dark ? "#202024" : "#f1f1f3";
    ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // a hairline round it, so a white screenshot on white paper still has an edge
  ctx.strokeStyle = t.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth = Math.max(1 / z, 0.5);
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}
