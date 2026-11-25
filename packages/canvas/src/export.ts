// Taking the board (or the selection) out as a picture: PNG for pasting
// and sharing, SVG for anything that will be scaled or edited.
import { bounds } from "./geometry";
import { arrowLabelRect, paintPorts, paintShape } from "./render";
import type { Theme } from "./render";
import { SvgContext } from "./svg";
import type { Outliner } from "./svg";
import { isArrow } from "./types";
import { drawFull } from "./images";
import type { Box } from "./types";
import type { Doc, Id, Rect, Shape } from "./types";

const MARGIN = 24;

/** The shapes to export, back to front, and the rect that holds them with a margin. */
export function scope(doc: Doc, ids: Set<Id> | null): { shapes: Shape[]; r: Rect } | null {
  const shapes = doc.order.map((id) => doc.shapes[id]).filter((s): s is Shape => !!s && (!ids || ids.has(s.id)));
  if (!shapes.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const take = (r: Rect) => {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
  };
  for (const s of shapes) {
    take(bounds(doc, s));
    if (isArrow(s) && s.text) take(arrowLabelRect(doc, s));
  }
  return { shapes, r: { x: Math.floor(x0 - MARGIN), y: Math.floor(y0 - MARGIN), w: Math.ceil(x1 - x0 + MARGIN * 2), h: Math.ceil(y1 - y0 + MARGIN * 2) } };
}

export async function toSVG(doc: Doc, ids: Set<Id> | null, t: Theme, glyphs?: Outliner): Promise<string | null> {
  const sc = scope(doc, ids);
  if (!sc) return null;
  const ctx = new SvgContext(glyphs);
  // (in order; each picture waited for and embedded from itself, one at a time)
  for (const s of sc.shapes) {
    if (s.kind === "image") await drawFull(s as Box, () => paintShape(ctx as unknown as CanvasRenderingContext2D, doc, s, t));
    else paintShape(ctx as unknown as CanvasRenderingContext2D, doc, s, t);
  }
  paintPorts(ctx as unknown as CanvasRenderingContext2D, doc, sc.shapes, t);
  return ctx.finish(sc.r.x, sc.r.y, sc.r.w, sc.r.h, t.bg);
}

/** `side`: the longest side the picture may have, in pixels (a picture for an agent need not be large). */
export async function toPNG(doc: Doc, ids: Set<Id> | null, t: Theme, side = 8000, clip?: { x: number; y: number; w: number; h: number }): Promise<Blob | null> {
  const sc0 = scope(doc, ids);
  if (!sc0) return null;
  // (a part of it only, when asked: the place someone marked on a picture)
  const sc = clip ? { ...sc0, r: clip } : sc0;
  // sharp on any screen, but never larger than a canvas can be
  const scale = Math.min(2, side / Math.max(sc.r.w, sc.r.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sc.r.w * scale);
  canvas.height = Math.round(sc.r.h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, -sc.r.x * scale, -sc.r.y * scale);
  // (in order; each picture waited for and drawn from itself, one at a time: never a grey frame or a preview)
  for (const s of sc.shapes) {
    if (s.kind === "image") await drawFull(s as Box, () => paintShape(ctx, doc, s, t));
    else paintShape(ctx, doc, s, t);
  }
  paintPorts(ctx, doc, sc.shapes, t);
  return new Promise((done) => canvas.toBlob(done, "image/png"));
}

export function save(name: string, data: Blob) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
