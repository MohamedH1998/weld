// Words without a page: the board's face read from its font file, so a server can measure words and draw them as
// outlines. A picture made this way needs no fonts installed wherever it is turned into pixels, and is measured with
// the same advances it is drawn with.
// @ts-expect-error fontkit ships no types
import * as fontkit from "fontkit";

type Glyph = { advanceWidth: number; path: { scale(x: number, y?: number): Glyph["path"]; translate(x: number, y: number): Glyph["path"]; toSVG(): string } };
type Run = { glyphs: Glyph[]; positions: { xAdvance: number; xOffset: number; yOffset: number }[] };
type Face = { unitsPerEm: number; ascent: number; descent: number; layout(text: string): Run; getVariation(v: Record<string, number>): Face };

/** "500 15px family…" (a canvas font string) as weight and size. */
const parse = (font: string) => {
  const m = /^(?:(\d+)\s+)?([\d.]+)px/.exec(font.trim());
  return { weight: m?.[1] ? +m[1] : 400, size: m ? +m[2]! : 14 };
};

export class Outlines {
  private base: Face;
  private byWeight = new Map<number, Face>();
  constructor(fontFile: Uint8Array) {
    this.base = fontkit.create(fontFile as unknown as Buffer) as Face;
  }
  private face(weight0: number): Face {
    // (a handful of weights, each loaded once: any weight asked for is drawn in the nearest, so memory stays put)
    const weight = Math.min(700, Math.max(300, Math.round(weight0 / 100) * 100));
    let f = this.byWeight.get(weight);
    if (!f) {
      f = this.base.getVariation({ wght: weight });
      this.byWeight.set(weight, f);
    }
    return f;
  }
  /** How wide `text` runs in `font` with `spacing` px after each letter (as a canvas measures it). */
  width(text: string, font: string, spacing = 0): number {
    const { weight, size } = parse(font), f = this.face(weight), run = f.layout(text);
    const k = size / f.unitsPerEm;
    return run.positions.reduce((w, p) => w + p.xAdvance * k, 0) + spacing * [...text].length;
  }
  /** `text` as one outline path, its baseline starting at (x, y). */
  path(text: string, font: string, x: number, y: number, spacing = 0): string {
    const { weight, size } = parse(font), f = this.face(weight), run = f.layout(text);
    const k = size / f.unitsPerEm;
    let at = x, d = "";
    run.glyphs.forEach((g, i) => {
      const p = run.positions[i]!;
      d += g.path.scale(k, -k).translate(at + p.xOffset * k, y - p.yOffset * k).toSVG();
      at += p.xAdvance * k + spacing;
    });
    return d;
  }
  /** How far below a "middle" baseline the alphabetic one sits (the middle of the em box). */
  middle(font: string): number {
    const { weight, size } = parse(font), f = this.face(weight);
    return ((f.ascent + f.descent) / 2) * (size / f.unitsPerEm);
  }
  /** A stand-in for a canvas that only measures, for laying out words where there is no page. */
  measurer() {
    const self = this;
    return {
      font: "400 14px sans-serif",
      letterSpacing: "0px",
      measureText(text: string) {
        return { width: self.width(text, this.font, parseFloat(this.letterSpacing) || 0) };
      },
    };
  }
}
