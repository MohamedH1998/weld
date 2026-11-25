// Parity with a reference picture: a stamp painted on the reference's own pixel grid and compared with it,
// pixel for pixel. Used by the parity check (checks/parity.mjs).
import { paintPorts, paintShape, setFace, themeFor } from "@weld/canvas/render";
/** Weld's own faces (labels in DM Mono), for laying our drawings over its pictures; from here, so it reaches the same render module the drawings use. */
export const inWeldFaces = () => setFace("weld");
import type { StampDef } from "@weld/canvas/stamps";
import type { Doc } from "@weld/canvas/types";

/** What the importer wrote beside a reference picture. */
export interface Ref {
  /** The figure's size in its own units; a board pixel is half a unit. */
  w: number;
  h: number;
  /** CSS pixels per unit when it was photographed, the photograph's pixels per CSS pixel, and how far into its first pixel the figure starts. */
  scale: number;
  dpr?: number;
  off?: [number, number];
}
export interface Compared {
  weld: HTMLCanvasElement;
  ours: HTMLCanvasElement;
  diff: HTMLCanvasElement;
  /** Pixels either picture draws on, and how many of those disagree. */
  drawn: number;
  differ: number;
  /** How far ours was slid, in reference pixels, to register the two. */
  slid: [number, number];
}
const U = 2;
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

export async function compare(def: StampDef, ref: Ref, png: string, shift: [number, number] = [0, 0]): Promise<Compared> {
  const shapes = def.build(), doc: Doc = { shapes: Object.fromEntries(shapes.map((s) => [s.id, s])), order: shapes.map((s) => s.id) };
  // compared on the reference's own raster, so neither picture is resampled
  const theirs = await load(png), W = theirs.width, H = theirs.height, dpr = ref.dpr ?? 5, off = ref.off ?? [0, 0], S = (dpr * ref.scale) / U;
  const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => { const k = document.createElement("canvas"); k.width = W; k.height = H; return [k, k.getContext("2d", { willReadFrequently: true })!]; };
  const [ca, ga] = mk(); ga.fillStyle = "#fff"; ga.fillRect(0, 0, W, H); ga.drawImage(theirs, 0, 0);
  const A = ga.getImageData(0, 0, W, H).data, at = (3 + 3 * W) * 4, bg = [A[at]!, A[at + 1]!, A[at + 2]!];
  // ours goes on the reference's own page colour
  const t = { ...themeFor(false), bg: `rgb(${bg.join(",")})` };
  const [cb, gb] = mk();
  const paint = (lx: number, ly: number) => { gb.setTransform(1, 0, 0, 1, 0, 0); gb.fillStyle = t.bg; gb.fillRect(0, 0, W, H); gb.setTransform(S, 0, 0, S, (off[0] + shift[0]) * dpr + lx, (off[1] + shift[1]) * dpr + ly); for (const id of doc.order) paintShape(gb, doc, doc.shapes[id]!, t); paintPorts(gb, doc, doc.order.map((id) => doc.shapes[id]), t); return gb.getImageData(0, 0, W, H).data; };
  let B = paint(0, 0);
  // Where the whole figure sits on its page is not part of the drawing: the two are registered first, by sliding
  // ours (whole reference pixels) to where its rows and columns of ink best line up with the reference's.
  const prof = (P: Uint8ClampedArray) => { const cx = new Float32Array(W), cy = new Float32Array(H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = Math.abs(P[i]! - bg[0]!) + Math.abs(P[i + 1]! - bg[1]!) + Math.abs(P[i + 2]! - bg[2]!); cx[x]! += v; cy[y]! += v; } return [cx, cy] as const; };
  const lagOf = (p: Float32Array, q: Float32Array) => { let best = 0, score = Infinity; for (let l = -6; l <= 6; l++) { let e = 0; for (let i = 6; i < p.length - 6; i++) e += Math.abs(p[i]! - q[i - l]!); if (e < score) { score = e; best = l; } } return best; };
  const [ax, ay] = prof(A), [bx, by] = prof(B), slid: [number, number] = [lagOf(ax, bx), lagOf(ay, by)];
  if (slid[0] || slid[1]) B = paint(slid[0], slid[1]);
  // A pixel agrees when its colour lies within the range of the other picture's colours at and around that spot:
  // an edge that falls mid-pixel is a blend of its two sides, wherever the other picture's edge falls.
  const drawnAt = (P: Uint8ClampedArray, i: number) => Math.max(Math.abs(P[i]! - bg[0]!), Math.abs(P[i + 1]! - bg[1]!), Math.abs(P[i + 2]! - bg[2]!)) > 10;
  const outside = (P: Uint8ClampedArray, Q: Uint8ClampedArray, x: number, y: number) => {
    const i = (y * W + x) * 4; let worst = 0;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255, hi = 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++) for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) { const v = Q[(yy * W + xx) * 4 + ch]!; if (v < lo) lo = v; if (v > hi) hi = v; }
      const v = P[i + ch]!; worst = Math.max(worst, v < lo ? lo - v : v > hi ? v - hi : 0);
    }
    return worst;
  };
  const [dc, dg] = mk(), im = dg.createImageData(W, H); let drawn = 0, differ = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, a = drawnAt(A, i), b = drawnAt(B, i);
    im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = 255;
    if (!a && !b) continue;
    drawn++;
    const ea = outside(A, B, x, y), eb = outside(B, A, x, y);
    // where they part: red where the reference has what ours lacks, green the other way
    if (Math.max(ea, eb) > 24) { differ++; im.data[i] = ea >= eb ? 220 : 40; im.data[i + 1] = ea >= eb ? 40 : 170; im.data[i + 2] = 40; }
    else { const g = Math.round(((A[i]! + A[i + 1]! + A[i + 2]!) / 3) * 0.5 + 110); im.data[i] = im.data[i + 1] = im.data[i + 2] = g; }
  }
  dg.putImageData(im, 0, 0);
  return { weld: ca, ours: cb, diff: dc, drawn, differ, slid };
}
