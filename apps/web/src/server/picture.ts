// Pictures made on the server, with no page: the board's own painting routine pointed at an SVG context that draws words as
// outlines from the font file, then turned into a PNG. What an agent gets back to see what it drew.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import { Outlines } from "../canvas/outline";
import { paintPorts, paintShape, setMeasurer, themeFor } from "@weld/canvas/render";
import { scope } from "@weld/canvas/export";
import { SvgContext } from "@weld/canvas/svg";
import { docOf, union } from "../canvas/stills";
import type { Shape } from "@weld/canvas/types";

let ready: Promise<Outlines> | null = null;
/** Load the face and the rasteriser once per isolate. */
export function prepare(font: () => Promise<ArrayBuffer>, wasm: () => Promise<WebAssembly.Module | ArrayBuffer>) {
  ready ??= (async () => {
    const [f, w] = await Promise.all([font(), wasm()]);
    // (the rasteriser is set up once per isolate; a module loaded afresh in the same one finds it ready)
    await initWasm(w).catch((e) => { if (!/Already initialized/.test(String(e))) throw e; });
    const o = new Outlines(new Uint8Array(f));
    setMeasurer(o.measurer());
    return o;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

/**
 * Each moment drawn at one camera (the room all of them take, so nothing jumps), side by side in rows with its number over it.
 * `moments` is each moment's shapes; a single picture is one moment.
 */
export async function sheet(o: Outlines, moments: Shape[][], opts: { dark?: boolean; maxSide?: number } = {}): Promise<Uint8Array | null> {
  const t = themeFor(!!opts.dark), docs = moments.map(docOf), scopes = docs.map((d) => scope(d, null)).filter((s): s is NonNullable<typeof s> => !!s);
  if (!scopes.length) return null;
  const r = union(scopes.map((s) => s.r)), n = docs.length, cols = n <= 1 ? 1 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
  const head = n > 1 ? 40 : 0, gap = 24, cw = r.w, ch = r.h + head;
  const W = cols * cw + (cols - 1) * gap, H = rows * ch + (rows - 1) * gap;
  const parts: string[] = [];
  // (one allowance for the whole sheet, however many moments it holds)
  const budget = { marks: 400_000, bytes: 12_000_000 };
  docs.forEach((d, i) => {
    const ctx = new SvgContext(o, `m${i}c`, budget), cx = (i % cols) * (cw + gap), cy = Math.floor(i / cols) * (ch + gap);
    const shapes = d.order.map((id) => d.shapes[id]!);
    for (const s of shapes) paintShape(ctx as unknown as CanvasRenderingContext2D, d, s, t);
    paintPorts(ctx as unknown as CanvasRenderingContext2D, d, shapes, t);
    const inner = ctx.finish(r.x, r.y, r.w, r.h, t.bg).replace(/^<svg /, `<svg x="${cx}" y="${cy + head}" `);
    if (head) {
      const label = new SvgContext(o, `l${i}c`, budget);
      label.font = "500 15px sans-serif";
      label.fillStyle = t.tones.muted ?? "#888";
      label.fillText(`moment ${i + 1}`, cx + 4, cy + 26);
      parts.push(label.finish(0, 0, W, H, "transparent").replace(/<rect[^>]*\/>/, ""));
    }
    parts.push(inner);
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${t.bg}"/>${parts.join("")}</svg>`;
  // big enough to read, never so big an agent's context pays for pixels it does not need
  const max = opts.maxSide ?? 1600, scale = Math.min(2, max / Math.max(W, H));
  // (the rasteriser's memory is its own, outside the collector: freed here, every time)
  const raster = new Resvg(svg, { fitTo: { mode: "zoom", value: scale } });
  try {
    const img = raster.render();
    try { return img.asPng(); } finally { img.free(); }
  } finally { raster.free(); }
}
