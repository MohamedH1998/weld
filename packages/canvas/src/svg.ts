// A stand-in for the 2D canvas that writes SVG. The board is drawn by
// one routine (render.ts); pointing it at this instead of a canvas gives
// an SVG that matches the screen line for line, with nothing to keep in step.
type M = [number, number, number, number, number, number];
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => String(Math.round(v * 100) / 100);

/** What draws words as outlines and measures them by their real advances (see outline.ts). */
export type Outliner = { width(text: string, font: string, spacing?: number): number; path(text: string, font: string, x: number, y: number, spacing?: number): string; middle?(font: string): number };

export class SvgContext {
  /** With an outliner, words are measured by the font and drawn as outlines; without, they are <text> for the reader's fonts. */
  /** `budget` bounds how many marks and bytes a picture may hold, shared by every context drawing into it (a server drawing a stranger's document stops there). */
  constructor(private glyphs?: Outliner, private idp = "c", budget?: { marks: number; bytes: number }) {
    const out = this.out;
    if (budget) {
      const push = out.push.bind(out);
      out.push = (...xs: string[]) => {
        budget.marks -= xs.length;
        for (const x of xs) budget.bytes -= x.length;
        if (budget.marks < 0 || budget.bytes < 0) throw new Error("too much to draw in one picture");
        return push(...xs);
      };
    }
  }
  fillStyle = "#000";
  strokeStyle = "#000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  font = "";
  textAlign = "start";
  textBaseline = "alphabetic";
  globalAlpha = 1;
  letterSpacing = "0px";
  private dash: number[] = [];
  private m: M = [1, 0, 0, 1, 0, 0];
  // (a canvas's save() keeps all of its drawing state, not only where it draws)
  private stack: { m: M; dash: number[]; clips: number; st: Record<string, unknown> }[] = [];
  private static KEPT = ["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin", "font", "textAlign", "textBaseline", "globalAlpha", "letterSpacing"] as const;
  /** Groups opened by clip() that the matching restore() closes. */
  private clips = 0;
  private clipN = 0;
  private d = "";
  private at = { x: 0, y: 0 };
  private out: string[] = [];

  save() {
    const st: Record<string, unknown> = {};
    for (const k of SvgContext.KEPT) st[k] = this[k];
    this.stack.push({ m: [...this.m] as M, dash: [...this.dash], clips: this.clips, st });
    this.clips = 0;
  }
  restore() {
    const s = this.stack.pop();
    if (s) {
      this.m = s.m;
      this.dash = s.dash;
      Object.assign(this, s.st);
      for (; this.clips > 0; this.clips--) this.out.push("</g>");
      this.clips = s.clips;
    }
  }
  translate(x: number, y: number) {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a, b, c, d, e + a * x + c * y, f + b * x + d * y];
  }
  rotate(r: number) {
    const [a, b, c, d, e, f] = this.m, cos = Math.cos(r), sin = Math.sin(r);
    this.m = [a * cos + c * sin, b * cos + d * sin, c * cos - a * sin, d * cos - b * sin, e, f];
  }
  scale(x: number, y: number) {
    const [a, b, c, d, e, f] = this.m;
    this.m = [a * x, b * x, c * y, d * y, e, f];
  }
  setLineDash(d: number[]) {
    this.dash = d;
  }
  beginPath() {
    this.d = "";
  }
  moveTo(x: number, y: number) {
    this.d += `M${n(x)} ${n(y)}`;
    this.at = { x, y };
  }
  lineTo(x: number, y: number) {
    this.d += `L${n(x)} ${n(y)}`;
    this.at = { x, y };
  }
  bezierCurveTo(x1: number, y1: number, x2: number, y2: number, x: number, y: number) {
    this.d += `C${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x)} ${n(y)}`;
    this.at = { x, y };
  }
  quadraticCurveTo(x1: number, y1: number, x: number, y: number) {
    this.d += `Q${n(x1)} ${n(y1)} ${n(x)} ${n(y)}`;
    this.at = { x, y };
  }
  closePath() {
    this.d += "Z";
  }
  /** A rounded corner at (x1, y1) on the way to (x2, y2), as the canvas draws it. */
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const p0 = this.at, ax = p0.x - x1, ay = p0.y - y1, bx = x2 - x1, by = y2 - y1;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), cross = ax * by - ay * bx;
    if (r <= 0 || la < 1e-6 || lb < 1e-6 || Math.abs(cross) < 1e-6) return this.lineTo(x1, y1);
    const ang = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
    const t = r / Math.tan(ang / 2);
    const sx = x1 + (ax / la) * t, sy = y1 + (ay / la) * t, ex = x1 + (bx / lb) * t, ey = y1 + (by / lb) * t;
    this.d += `L${n(sx)} ${n(sy)}A${n(r)} ${n(r)} 0 0 ${cross < 0 ? 1 : 0} ${n(ex)} ${n(ey)}`;
    this.at = { x: ex, y: ey };
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.d += `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
  }
  roundRect(x: number, y: number, w: number, h: number, r: number) {
    this.d += `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z`;
  }
  private tf() {
    const [a, b, c, d, e, f] = this.m;
    return a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0 ? "" : ` transform="matrix(${n(a)} ${n(b)} ${n(c)} ${n(d)} ${n(e)} ${n(f)})"`;
  }
  /** What is drawn from here to the matching restore() keeps inside the current path. */
  clip() {
    if (!this.d) return;
    const id = `${this.idp}${++this.clipN}`;
    this.out.push(`<clipPath id="${id}"><path d="${this.d}"${this.tf()}/></clipPath><g clip-path="url(#${id})">`);
    this.clips++;
  }
  /** How see-through what is drawn now is. */
  private op(attr: string) {
    return this.globalAlpha < 1 ? ` ${attr}="${n(Math.max(0, this.globalAlpha))}"` : "";
  }
  fill() {
    if (this.d) this.out.push(`<path d="${this.d}" fill="${esc(this.fillStyle)}"${this.op("fill-opacity")}${this.tf()}/>`);
  }
  stroke() {
    if (!this.d) return;
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.map(n).join(" ")}"` : "";
    this.out.push(`<path d="${this.d}" fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${dash}${this.op("stroke-opacity")}${this.tf()}/>`);
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    this.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${esc(this.strokeStyle)}" stroke-width="${n(this.lineWidth)}"${this.tf()}/>`);
  }
  drawImage(src: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
    // (whole, up to what a canvas can hold)
    const k = Math.min(1, 16384 / Math.max(src.width || 1, src.height || 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round((src.width || 1) * k));
    c.height = Math.max(1, Math.round((src.height || 1) * k));
    c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
    this.out.push(`<image x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none" href="${c.toDataURL("image/png")}"${this.tf()}/>`);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(this.fillStyle)}"${this.op("fill-opacity")}${this.tf()}/>`);
  }
  /** How wide words will be, near enough to make room for them (a picture has no fonts loaded to ask). */
  measureText(text: string): { width: number } {
    if (this.glyphs) return { width: this.glyphs.width(text, this.font, parseFloat(this.letterSpacing) || 0) };
    const m = /([\d.]+)px\s+(.*)$/.exec(this.font), size = m ? +m[1]! : 14;
    return { width: text.length * size * (/mono/i.test(m?.[2] ?? "") ? 0.6 : 0.52) };
  }
  fillText(text: string, x: number, y: number) {
    // "500 15px family…"
    const m = /^(\d+)\s+([\d.]+)px\s+(.*)$/.exec(this.font);
    if (this.fillStyle === "transparent") return;
    if (this.glyphs) {
      const sp = parseFloat(this.letterSpacing) || 0, w = this.glyphs.width(text, this.font, sp);
      const x0 = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - w : x;
      const y0 = this.textBaseline === "middle" ? y + (this.glyphs.middle?.(this.font) ?? 0) : y;
      const d = this.glyphs.path(text, this.font, x0, y0, sp);
      if (d) this.out.push(`<path d="${d}" fill="${esc(this.fillStyle)}"${this.op("fill-opacity")}${this.tf()}/>`);
      return;
    }
    const anchor = this.textAlign === "center" ? "middle" : this.textAlign === "right" ? "end" : "start";
    this.out.push(`<text x="${n(x)}" y="${n(y)}" font-family="${esc(m?.[3] ?? "sans-serif")}" font-size="${m?.[2] ?? 14}" font-weight="${m?.[1] ?? 400}" text-anchor="${anchor}" fill="${esc(this.fillStyle)}"${this.letterSpacing !== "0px" ? ` letter-spacing="${this.letterSpacing}"` : ""} xml:space="preserve"${this.tf()}>${esc(text)}</text>`);
  }
  /** The current transform, as a canvas gives it. */
  getTransform() {
    const [a, b, c, d, e, f] = this.m;
    return { a, b, c, d, e, f };
  }
  // (a picture keeps no soft shadows: these are taken and ignored)
  shadowColor = "transparent";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  /** The finished drawing, `w` × `h`, with the world point (x, y) at its top-left. */
  finish(x: number, y: number, w: number, h: number, bg: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="${n(x)} ${n(y)} ${n(w)} ${n(h)}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${esc(bg)}"/>${this.out.join("")}</svg>`;
  }
}
