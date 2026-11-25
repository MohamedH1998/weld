// Pictures on the board, decoded once and kept: a small preview while a picture is small on screen, the picture itself
// when it is shown large. Decoding happens off the frame (createImageBitmap); a picture not ready yet is drawn as its
// frame, and the board is asked to draw again when it is.
import type { Box } from "./types";

type Src = ImageBitmap | HTMLImageElement;
interface Entry {
  src: Src | null;
  loading: boolean;
  bytes: number;
  used: number;
  failed?: boolean;
  /** Resolves when decoded (or failed). */
  ready: Promise<Src | null>;
  /** Held by an export being drawn: never let go meanwhile. */
  pins: number;
}
const cache = new Map<string, Entry>();
const PREVIEW = 1024;
/** Decoded pictures kept at most (by their pixels' size): the least recently drawn go first. */
const BUDGET = 512 << 20;
let held = 0;
const waiters = new Set<() => void>();
/** Told when a picture has been decoded (the board draws again). */
export function onPictureReady(fn: () => void) {
  waiters.add(fn);
  return () => waiters.delete(fn);
}

type Reader = (hash: string, ext: string, preview: boolean) => Promise<Uint8Array | null>;
let reader: Reader | null = null;
export function setPictureReader(r: Reader) {
  reader = r;
}

function trim() {
  if (held <= BUDGET) return;
  const all = [...cache.entries()].filter(([, e]) => e.src && !e.pins).sort((a, b) => a[1].used - b[1].used);
  for (const [k, e] of all) {
    if (held <= BUDGET * 0.8) break;
    if (e.src && "close" in e.src) e.src.close();
    held -= e.bytes;
    cache.delete(k);
  }
}

async function decode(hash: string, ext: string, preview: boolean): Promise<Src | null> {
  const buf = await reader?.(hash, ext, preview);
  if (!buf) return null;
  if (ext === "svg") {
    // (an SVG is drawn as a picture element: it stays sharp at any zoom)
    const url = URL.createObjectURL(new Blob([buf as BlobPart], { type: "image/svg+xml" }));
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    try {
      await img.decode();
      return img;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return createImageBitmap(new Blob([buf as BlobPart]));
}

function load(key: string, hash: string, ext: string, preview: boolean): Entry {
  let done!: (s: Src | null) => void;
  const e: Entry = { src: null, loading: true, bytes: 0, used: performance.now(), ready: new Promise((r) => (done = r)), pins: 0 };
  cache.set(key, e);
  void decode(hash, ext, preview).then(
    (src) => {
      e.loading = false;
      done(src);
      if (!src) return void (e.failed = true);
      e.src = src;
      const w = "width" in src ? src.width : 0, h = "height" in src ? src.height : 0;
      e.bytes = w * h * 4;
      held += e.bytes;
      trim();
      for (const f of waiters) f();
    },
    () => {
      e.loading = false;
      e.failed = true;
      done(null);
    },
  );
  return e;
}

/** While an export is drawn, pictures are drawn from themselves, never their previews. */
let full = 0;
/** Draw one picture of an export from itself: decoded (waited for), held while drawn, let go after (so an export of many
 *  large pictures holds one at a time beyond what the board's budget keeps). */
export async function drawFull(b: Box, draw: () => void): Promise<void> {
  if (!b.img) return draw();
  const key = `${b.img.hash}:f`;
  const e = cache.get(key) ?? load(key, b.img.hash, b.img.ext, false);
  e.pins += 1;
  try {
    await Promise.race([e.ready, new Promise((r) => setTimeout(r, 30000))]);
    full += 1;
    try {
      draw();
    } finally {
      full -= 1;
    }
  } finally {
    e.pins -= 1;
    trim();
  }
}

/** What to draw a picture with at this size on screen (device pixels across): the best that is ready, loading the right
 *  one if it is not; null while nothing is. */
export function pictureFor(b: Box, screenW: number): Src | null {
  const img = b.img;
  if (!img) return null;
  const small = !full && img.ext !== "svg" && img.preview && screenW <= PREVIEW * 1.1;
  const want = `${img.hash}:${small ? "p" : "f"}`, other = `${img.hash}:${small ? "f" : "p"}`;
  const e = cache.get(want);
  if (!e) load(want, img.hash, img.ext, !!small);
  else e.used = performance.now();
  if (e?.src) return e.src;
  // (meanwhile, whichever is ready)
  const o = cache.get(other);
  return o?.src ?? null;
}

/** Wait until a picture is decoded at full size (to put it in an export or a crop). */
export async function pictureReady(b: Box): Promise<Src | null> {
  const img = b.img;
  if (!img) return null;
  const key = `${img.hash}:f`;
  const e = cache.get(key) ?? load(key, img.hash, img.ext, false);
  return (await Promise.race([e.ready, new Promise<null>((r) => setTimeout(() => r(null), 30000))])) ?? null;
}
