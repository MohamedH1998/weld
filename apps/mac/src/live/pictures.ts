// Putting pictures on the board: pasted, dropped from the Finder, taken of a page, or put there by an agent (`weld open
// shot.png`). Each is kept once by its content (electron/assets.mjs); the board draws it (src/canvas/images.ts).
import type { Editor } from "@weld/canvas/editor";
import { newId } from "@weld/canvas/types";
import type { Box, Id, Pt, Shape } from "@weld/canvas/types";
import { onPictureReady, setPictureReader } from "@weld/canvas/images";
import { weld } from "./bridge";
import type { PictureAsset } from "./bridge";
import { clear } from "./place";
import { applied } from "./applied";

export type Asset = PictureAsset;

/** The size a picture is put down at: a screenshot taken on a Retina screen at the size it was seen, and nothing
 *  bigger than a card's worth across. */
export function sizeFor(a: Asset): { w: number; h: number } {
  let w = a.w || 320, h = a.h || 200;
  if (a.ext !== "svg" && w > 1400) ((w /= 2), (h /= 2));
  // one scale for both sides: at most 720 across, and its short side never under 24 (a very narrow picture then runs long)
  let k = Math.min(1, 720 / Math.max(w, h));
  if (Math.min(w, h) * k < 24) k = 24 / Math.min(w, h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

const imgOf = (a: Asset): Box["img"] => ({ hash: a.hash, ext: a.ext, w: a.w, h: a.h, name: a.name, ...(a.preview ? { preview: true } : {}), ...(a.origin ? { origin: a.origin } : {}) });

/** Put a picture down: at a point the person chose (centred there), or beside a thing (an agent's: out of the person's way). */
export function putPicture(editor: Editor, a: Asset, o: { at?: Pt; near?: Id; theirs?: boolean } = {}): Id | null {
  if (a.error || !a.hash) return null;
  const s = editor.store, { w, h } = sizeFor(a);
  let want = { x: 0, y: 0, w, h };
  const near = o.near ? (s.doc.shapes[o.near] as Box | undefined) : undefined;
  if (near && "w" in near) want = { x: near.x + near.w + 48, y: near.y, w, h };
  else {
    const at = o.at ?? editor.world({ x: editor.view.w / 2, y: editor.view.h / 2 });
    want = { x: Math.round(at.x - w / 2), y: Math.round(at.y - h / 2), w, h };
  }
  const r = near || o.theirs ? clear(editor, want, undefined, !!o.theirs) : want;
  const box: Box = { id: newId(), kind: "image", x: Math.round(r.x), y: Math.round(r.y), w, h, text: "", tone: "ink", fill: "none", img: { ...imgOf(a), ...(o.theirs && o.near ? { by: o.near } : {}) } } as Box;
  if (o.theirs) s.putForeign(box);
  else
    s.run(() => {
      s.put(box);
      s.select([box.id]);
    });
  s.emit();
  editor.invalidate();
  return box.id;
}

const isPicture = (f: File) => /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name);

/** Files given to the board (pasted or dropped): each picture among them put down, one beside the next. */
/** A picture whose size the app could not read (GIF, WebP): read here, by decoding it. */
async function sized(a: Asset, f?: File): Promise<Asset> {
  if (a.error || (a.w && a.h) || !f) return a;
  try {
    const bmp = await createImageBitmap(f);
    const out = { ...a, w: bmp.width, h: bmp.height };
    bmp.close();
    return out;
  } catch {
    return { ...a, error: "That picture can't be read." };
  }
}

export async function takeFiles(editor: Editor, files: File[], at?: Pt): Promise<number> {
  const pics = files.filter(isPicture);
  let n = 0, x = at?.x;
  for (const f of pics) {
    // (one that came from a file on disk is kept knowing where: when that file changes, the board shows it)
    const where = weld.assets.pathOf(f);
    const a: Asset = await sized(where ? await weld.assets.importFile(where) : await weld.assets.put(await f.arrayBuffer(), { name: f.name, mime: f.type }), f);
    if (a.error) continue;
    const id = putPicture(editor, a, { at: at ? { x: x ?? at.x, y: at.y } : undefined });
    if (id) {
      n += 1;
      if (x !== undefined) x += sizeFor(a).w + 24;
    }
  }
  return n;
}

/** The board's half of pictures: drawn as they decode; put down beside the agent that asked; shown again as files change. */
export function wirePictures(editor: Editor) {
  setPictureReader((hash, ext, preview) => weld.assets.read(hash, ext, preview));
  const offReady = onPictureReady(() => editor.invalidate());
  const offImage = weld.onImage(({ asset, from, key }) => {
    if (key) applied.add(key);
    putPicture(editor, asset, { near: from, theirs: true });
  });
  const offChanged = weld.onImageChanged(({ origin, asset }) => {
    const s = editor.store;
    const patch = Object.values(s.doc.shapes)
      .filter((x): x is Box => !!x && x.kind === "image" && (x as Box).img?.origin === origin && (x as Box).img?.hash !== asset.hash)
      // the same width; the height follows if its shape changed (worked out for each version, undo included)
      .map((b) => ({ id: b.id, change: (s: Shape) => ({ img: { ...imgOf(asset), ...((s as Box).img?.by ? { by: (s as Box).img!.by } : {}) }, h: asset.w && asset.h ? Math.round(((s as Box).w * asset.h) / asset.w) : (s as Box).h }) as Partial<Shape> }));
    if (!patch.length) return;
    s.applyForeign([], patch, []);
    s.emit();
    editor.invalidate();
  });
  // the files the board's pictures came from, told to the app whenever they change (watched, caught up, let go)
  let told = "";
  const tell = () => {
    const list = [...new Set(Object.values(editor.store.doc.shapes).map((x) => (x?.kind === "image" ? (x as Box).img?.origin : undefined)).filter((o): o is string => !!o))].sort();
    const key = list.join("\n");
    if (key === told) return;
    told = key;
    void weld.assets.origins(list);
  };
  tell();
  const every = setInterval(tell, 2000);
  return () => {
    clearInterval(every);
    offReady();
    offImage();
    offChanged();
  };
}
