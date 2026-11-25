// Pictures on the board (screenshots, images, SVGs): kept once each, by their content, in Weld's data folder, with a
// small preview for drawing them far off. Agents are given their files, not their pixels (see describe in main.mjs):
// a picture costs an agent a few words until it chooses to look.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export const KINDS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" };
const EXT = { png: "png", jpg: "jpg", jpeg: "jpg", gif: "gif", webp: "webp", svg: "svg" };
const MAX = 40 << 20;
/** Decoded, a picture over this many pixels would cost more memory than it is worth: refused. */
const MAX_PIXELS = 100e6;
const PREVIEW = 1024;

/** An SVG's own size, from its width/height (in any absolute unit) or its viewBox (what a browser would draw it at).
 *  Null when it is not an SVG at all. */
function svgSize(text) {
  // (the root element's own tag, wherever it starts: after a long comment or doctype too)
  const at = text.search(/<svg[\s>]/i);
  if (at < 0) return null;
  const tag = text.slice(at, text.indexOf(">", at) + 1 || at + 8000);
  const PER = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, em: 16, ex: 8 };
  const num = (v) => {
    const m = v && /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(px|in|cm|mm|pt|pc|em|ex)?\s*$/i.exec(v);
    if (!m) return null;
    const n = Number(m[1]) * PER[(m[2] || "px").toLowerCase()];
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const attr = (n) => (new RegExp(`\\s${n}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag) || [])[1];
  let w = num(attr("width")), h = num(attr("height"));
  const vb = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if ((!w || !h) && vb?.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (w && !h) h = (w * vb[3]) / vb[2];
    else if (h && !w) w = (h * vb[2]) / vb[3];
    else ((w = vb[2]), (h = vb[3]));
  }
  return { w: Math.max(1, Math.round(w || 300)), h: Math.max(1, Math.round(h || 150)) };
}

/** @param {{ dir: () => string, nativeImage: any }} o */
export function makeAssets(o) {
  const dir = () => {
    const d = o.dir();
    mkdirSync(d, { recursive: true });
    return d;
  };
  const fileOf = (hash, ext) => path.join(dir(), `${hash}.${ext}`);
  const previewOf = (hash) => path.join(dir(), `${hash}.preview.png`);
  const ok = (hash, ext) => typeof hash === "string" && /^[a-f0-9]{40}$/.test(hash) && Object.values(EXT).includes(ext);
  // Files made from pictures (a marked copy, a close-up) can always be made again: each is noted with when it was last
  // given out, and swept after 30 days unused. Pictures themselves are never deleted (undo can bring any back).
  const derivedFile = () => path.join(dir(), "derived.json");
  const derived = (() => {
    try {
      return JSON.parse(readFileSync(derivedFile(), "utf8")) || {};
    } catch {
      return {};
    }
  })();
  const saveDerived = () => {
    try {
      writeFileSync(`${derivedFile()}.tmp`, JSON.stringify(derived));
      renameSync(`${derivedFile()}.tmp`, derivedFile());
    } catch {
      /* noted next time */
    }
  };
  const noteDerived = (hash, ext) => {
    derived[`${hash}.${ext}`] = Date.now();
    saveDerived();
  };
  return {
    fileOf,
    /** A made file given out again: its 30 days start again. */
    touch(file) {
      const f = path.basename(String(file));
      if (derived[f] !== undefined && derived[`!${f}`] !== 1) {
        derived[f] = Date.now();
        saveDerived();
      }
    },
    /** Sweep made files not given out for 30 days (never a picture someone put on the board). */
    sweep(days = 30) {
      const before = Date.now() - days * 864e5;
      let n = 0;
      for (const [f, at] of Object.entries(derived)) {
        if (at > before || !/^[a-f0-9]{40}\.png$/.test(f) || derived[`!${f}`] === 1) continue;
        for (const g of [f, f.replace(/\.png$/, ".preview.png")])
          try {
            unlinkSync(path.join(dir(), g));
          } catch {
            /* gone already */
          }
        delete derived[f];
        n += 1;
      }
      if (n) saveDerived();
      return n;
    },
    /** Keep a picture: answers what the board needs to draw it, or why it can't. */
    put(buf, { name = "", mime = "", origin, made = false } = {}) {
      buf = Buffer.from(buf);
      if (!buf.length) return { error: "That picture is empty." };
      if (buf.length > MAX) return { error: "That picture is over 40 MB." };
      let ext = KINDS[mime] ?? EXT[String(name).split(".").pop()?.toLowerCase() ?? ""];
      const head = buf.subarray(0, 512).toString("utf8");
      if (!ext && /<svg[\s>]/i.test(head)) ext = "svg";
      if (!ext) return { error: "Weld takes PNG, JPEG, GIF, WebP and SVG pictures." };
      const hash = createHash("sha1").update(buf).digest("hex");
      const file = fileOf(hash, ext);
      let w = 0, h = 0, preview = false;
      if (ext === "svg") {
        const sz = svgSize(buf.toString("utf8"));
        if (!sz) return { error: "That file isn't an SVG." };
        ({ w, h } = sz);
      } else {
        const img = o.nativeImage.createFromBuffer(buf);
        if (img.isEmpty()) {
          // (GIF and WebP are drawn by the board itself; their size is read there)
          if (ext === "png" || ext === "jpg") return { error: "That picture can't be read." };
        } else {
          ({ width: w, height: h } = img.getSize());
          if (w * h > MAX_PIXELS) return { error: "That picture is too large (over 100 million pixels)." };
          // a preview to draw it by when it is small on screen (decoding a whole screenshot for a thumbnail is the slow part)
          if (Math.max(w, h) > PREVIEW) {
            const p = previewOf(hash);
            if (!existsSync(p)) {
              const small = w >= h ? img.resize({ width: PREVIEW, quality: "good" }) : img.resize({ height: PREVIEW, quality: "good" });
              writeFileSync(`${p}.tmp`, small.toPNG());
              renameSync(`${p}.tmp`, p);
            }
            preview = true;
          }
        }
      }
      // (kept only once it is known to be a picture)
      if (!existsSync(file)) {
        writeFileSync(`${file}.${process.pid}.tmp`, buf);
        renameSync(`${file}.${process.pid}.tmp`, file);
      }
      const base = String(name || "").split("/").pop().slice(0, 120) || `${ext === "svg" ? "drawing" : "picture"}.${ext}`;
      // (one made from a picture is noted, to be swept when long unused; one that is also on the board is never swept)
      // (bytes that were ever put on the board as a picture of their own are never swept, made again or not)
      const key = `${hash}.${ext}`;
      if (!made && derived[`!${key}`] !== 1) {
        delete derived[key];
        derived[`!${key}`] = 1;
        saveDerived();
      } else if (made && derived[`!${key}`] !== 1) noteDerived(hash, ext);
      return { hash, ext, w, h, name: base, preview, ...(origin ? { origin } : {}), file };
    },
    /** A picture's bytes for the board to draw: its preview if asked for and there is one, else the picture itself. */
    read(hash, ext, preview) {
      if (!ok(hash, ext)) return null;
      const p = preview ? previewOf(hash) : null;
      try {
        return readFileSync(p && existsSync(p) ? p : fileOf(hash, ext));
      } catch {
        return null;
      }
    },
    /** A file on disk, taken onto the board (by an agent's `weld open`, or dropped from the Finder). */
    importPath(abs) {
      const ext = EXT[path.extname(abs).slice(1).toLowerCase()];
      if (!ext) return { error: "not a picture" };
      try {
        // (its real place, and its size, known before anything is read)
        const real = realpathSync(abs), st = statSync(real);
        if (!st.isFile()) return { error: "not a file" };
        if (!EXT[path.extname(real).slice(1).toLowerCase()]) return { error: "not a picture" };
        if (st.size > MAX) return { error: "That picture is over 40 MB." };
        return this.put(readFileSync(real), { name: path.basename(abs), origin: abs });
      } catch (e) {
        return { error: String(e?.message || e) };
      }
    },
    isPicture: (abs) => !!EXT[path.extname(String(abs)).slice(1).toLowerCase()],
  };
}
