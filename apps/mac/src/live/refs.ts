// What a thread can be pointed at, on the board it shares with the person:
// anything live (another thread, a page, a terminal), a frame and what
// is in it, a group, a drawing (shapes joined by arrows, as diagrams are
// drawn without being grouped), or a note. Each has a key that outlasts
// edits, a short name, and, when asked, its state as it is now: what the
// agent is shown is never a copy made earlier.
import { pictureReady } from "@weld/canvas/images";
import { bounds, endPoint, turn } from "@weld/canvas/geometry";
import type { Editor } from "@weld/canvas/editor";
import { toPNG } from "@weld/canvas/export";
import { themeFor } from "@weld/canvas/render";
import { isArrow, isLive } from "@weld/canvas/types";
import type { Arrow, Box, Doc, Id, Rect, Shape } from "@weld/canvas/types";
import { folderName, weld } from "./bridge";
import type { BoardRef } from "./bridge";
import { factsOf, peek } from "./threads";

export interface Ref {
  /** `live:<id>`, `frame:<id>`, `group:<id>`, `drawing:<id>` (any one of its shapes), `note:<id>`, `work:<id>,<id>…` (shapes an agent drew together, each with what is joined to it) */
  key: string;
  kind: "thread" | "terminal" | "browser" | "frame" | "group" | "drawing" | "note" | "image";
  label: string;
  sub: string;
  /** What it is made of on the board now (for outlining it, and for going to it). */
  ids: Id[];
}

export const textOf = (s: Shape | undefined) => (s && "text" in s && typeof s.text === "string" ? s.text.trim() : "");
const rectOf = (s: Shape) => ("w" in s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null);
const inside = (r: Rect, f: Rect) => r.x >= f.x && r.y >= f.y && r.x + r.w <= f.x + f.w && r.y + r.h <= f.y + f.h;
const isFrame = (s: Shape | undefined): s is Box => !!s && (s.kind === "frame" || s.kind === "boundary");
/** Named briefly, so a message that names it still reads. */
export function brief(s: string, n = 34) {
  const one = s.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  if (one.length <= n) return one;
  const cut = one.slice(0, n), at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > n / 2 ? at : n)}…`;
}
/** A drawing named by what is in it, in reading order: "Web app · API · Postgres". */
/** A drawing with no words in it, named by what it is made of. */
function shapeName(doc: Doc, ids: Id[]): string {
  const shapes = ids.map((id) => doc.shapes[id]).filter((s): s is Shape => !!s && !isArrow(s));
  if (shapes.length === 1) {
    const k = (shapes[0] as Box).kind;
    return k === "ellipse" ? "Circle" : k === "rect" ? "Box" : k === "glyph" ? "Mark" : `${k[0]!.toUpperCase()}${k.slice(1)}`;
  }
  return `Drawing of ${shapes.length} shapes`;
}
function listName(doc: Doc, ids: Id[]): string {
  const named = ids
    .map((id) => doc.shapes[id])
    .filter((s): s is Shape => !!s && !isArrow(s) && !!textOf(s) && !!rectOf(s))
    .sort((a, b) => { const ra = rectOf(a)!, rb = rectOf(b)!; return Math.abs(ra.y - rb.y) > 40 ? ra.y - rb.y : ra.x - rb.x; })
    .map((s) => textOf(s).split("\n")[0]!);
  return named.slice(0, 3).join(" · ") + (named.length > 3 ? " …" : "");
}
/** A group named by what tells it apart: the names of the areas in it first, then any other words that appear once
 *  (a label repeated across the group, like three "WORKER"s, says little about which group it is). */
function groupName(doc: Doc, ids: Id[]): string {
  const shapes = ids.map((id) => doc.shapes[id]).filter((x): x is Shape => !!x && !isArrow(x) && !!textOf(x) && !!rectOf(x));
  const count = new Map<string, number>();
  for (const x of shapes) count.set(textOf(x).split("\n")[0]!, (count.get(textOf(x).split("\n")[0]!) ?? 0) + 1);
  const order = (a: Shape, b: Shape) => { const ra = rectOf(a)!, rb = rectOf(b)!; return Math.abs(ra.y - rb.y) > 40 ? ra.y - rb.y : ra.x - rb.x; };
  const name = (x: Shape) => textOf(x).split("\n")[0]!;
  const areas = shapes.filter((x) => isFrame(x)).sort(order).map(name);
  const rest = shapes.filter((x) => !isFrame(x) && count.get(name(x)) === 1).sort(order).map(name);
  const parts = [...new Set([...areas, ...rest])];
  if (!parts.length) return nameOf(doc, ids);
  return parts.slice(0, 3).join(" · ") + (parts.length > 3 ? " …" : "");
}
/** A set of shapes named by its biggest words. */
function nameOf(doc: Doc, ids: Id[]): string {
  let best = "", area = -1;
  for (const id of ids) {
    const s = doc.shapes[id], t = textOf(s), r = s && rectOf(s);
    if (!t || !r) continue;
    const a = r.w * r.h;
    if (a > area) (best = t.split("\n")[0]!), (area = a);
  }
  return best;
}

/** What the board is made of, worked out once for each version of it: the drawings (shapes joined by arrows, as
 *  diagrams are drawn without being grouped), the groups, and what each frame holds. */
interface Index {
  drawings: Id[][];
  drawingOf: Map<Id, Id[]>;
  groups: Map<Id, Id[]>;
  frames: Map<Id, Id[]>;
}
const indexes = new WeakMap<Doc, Index>();
function indexOf(doc: Doc): Index {
  const had = indexes.get(doc);
  if (had) return had;
  const plain = (id: Id | undefined) => {
    const s = id ? doc.shapes[id] : undefined;
    return !!s && !isArrow(s) && !isLive(s) && !isFrame(s);
  };
  // joined sets, kept shallow (each joins the larger, and every look-up shortens the way)
  const up = new Map<Id, Id>(), size = new Map<Id, number>();
  const find = (x: Id): Id => {
    let r = x;
    while (up.get(r) !== r) r = up.get(r)!;
    while (up.get(x) !== r) {
      const n = up.get(x)!;
      up.set(x, r);
      x = n;
    }
    return r;
  };
  const join = (a: Id, b: Id) => {
    let x = find(a), y = find(b);
    if (x === y) return;
    if ((size.get(x) ?? 1) < (size.get(y) ?? 1)) [x, y] = [y, x];
    up.set(y, x);
    size.set(x, (size.get(x) ?? 1) + (size.get(y) ?? 1));
  };
  const arrows: Arrow[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (s && isArrow(s)) arrows.push(s);
    else if (plain(id)) up.set(id, id);
  }
  for (const a of arrows) {
    const x = a.a.bind?.id, y = a.b.bind?.id;
    if (x && y && plain(x) && plain(y)) {
      up.set(a.id, a.id);
      join(x, y);
      join(a.id, x);
    }
  }
  // shapes drawn inside another small shape (eyes and a mouth in a face, a label in a badge) are one drawing with it, as
  // shapes joined by arrows are; a large shape (a panel behind a diagram) holds what is on it without joining it, and
  // grouped shapes keep to their groups. (Found through a grid, so a large board costs little more.)
  const HOLD = 800, CELL = 400;
  const loose = (id: Id) => !(doc.shapes[id] as { group?: Id }).group;
  const grid = new Map<string, { id: Id; r: Rect }[]>();
  for (const id of up.keys()) {
    const sh = doc.shapes[id]!;
    if (isArrow(sh) || !loose(id)) continue;
    const r = rectOf(sh);
    if (!r || r.w > HOLD || r.h > HOLD) continue;
    for (let gx = Math.floor(r.x / CELL); gx <= Math.floor((r.x + r.w) / CELL); gx++)
      for (let gy = Math.floor(r.y / CELL); gy <= Math.floor((r.y + r.h) / CELL); gy++) (grid.get(`${gx},${gy}`) ?? grid.set(`${gx},${gy}`, []).get(`${gx},${gy}`)!).push({ id, r });
  }
  for (const id of up.keys()) {
    const sh = doc.shapes[id]!;
    if (isArrow(sh) || !loose(id)) continue;
    const r = rectOf(sh);
    if (!r) continue;
    // (the smallest shape that holds it)
    let best: { id: Id; area: number } | null = null;
    for (const o of grid.get(`${Math.floor(r.x / CELL)},${Math.floor(r.y / CELL)}`) ?? []) {
      if (o.id === id) continue;
      const q = o.r, area = q.w * q.h;
      if (area <= r.w * r.h || r.x < q.x || r.y < q.y || r.x + r.w > q.x + q.w || r.y + r.h > q.y + q.h) continue;
      if (!best || area < best.area) best = { id: o.id, area };
    }
    if (best) join(best.id, id);
  }
  const sets = new Map<Id, Id[]>();
  for (const id of up.keys()) {
    const r = find(id);
    (sets.get(r) ?? sets.set(r, []).get(r)!).push(id);
  }
  const drawings = [...sets.values()].filter((g) => g.filter((id) => !isArrow(doc.shapes[id]!)).length >= 2);
  const drawingOf = new Map<Id, Id[]>();
  for (const g of drawings) for (const id of g) drawingOf.set(id, g);
  const groups = new Map<Id, Id[]>();
  for (const id of doc.order) {
    const g = (doc.shapes[id] as { group?: Id } | undefined)?.group;
    if (g && !isLive(doc.shapes[id])) (groups.get(g) ?? groups.set(g, []).get(g)!).push(id);
  }
  const frames = new Map<Id, Id[]>();
  for (const id of doc.order) {
    const f = doc.shapes[id];
    if (isFrame(f)) frames.set(id, framed(doc, f));
  }
  const ix = { drawings, drawingOf, groups, frames };
  indexes.set(doc, ix);
  return ix;
}

/** Everything on the board a thread could be pointed at, nearest to it first. */
export function refsOn(editor: Editor, self: Id): Ref[] {
  const doc = editor.store.doc, me = doc.shapes[self] as Box | undefined;
  const out: (Ref & { d: number })[] = [];
  const dist = (ids: Id[]) => {
    if (!me) return 0;
    let best = Infinity;
    for (const id of ids) {
      const r = doc.shapes[id] && rectOf(doc.shapes[id]!);
      if (r) best = Math.min(best, Math.hypot(r.x + r.w / 2 - (me.x + me.w / 2), r.y + r.h / 2 - (me.y + me.h / 2)));
    }
    return best;
  };
  const taken = new Set<Id>();
  for (const id of doc.order) {
    const s = doc.shapes[id] as Box | undefined;
    if (!s || id === self || !isLive(s)) continue;
    if (s.kind === "thread") out.push({ key: `live:${id}`, kind: "thread", label: brief(s.text || peek(id)?.meta.title || "New thread"), sub: "thread", ids: [id], d: dist([id]) });
    else if (s.kind === "terminal") out.push({ key: `live:${id}`, kind: "terminal", label: brief(s.text || `${folderName(s.live?.cwd)}${factsOf(id)?.label ? ` · ${factsOf(id)!.label}` : ""}`), sub: "terminal", ids: [id], d: dist([id]) });
    else if (s.live?.url) {
      const url = s.live.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
      out.push({ key: `live:${id}`, kind: "browser", label: brief(s.text || factsOf(id)?.label || url), sub: url, ids: [id], d: dist([id]) });
    }
  }
  const ix = indexOf(doc);
  for (const id of doc.order) {
    const f = doc.shapes[id];
    if (!isFrame(f)) continue;
    const ids = ix.frames.get(id) ?? [];
    out.push({ key: `frame:${id}`, kind: "frame", label: brief(textOf(f) || nameOf(doc, ids) || "Frame"), sub: `area · ${ids.length} things`, ids: [id, ...ids], d: dist([id]) });
    for (const x of ids) taken.add(x);
  }
  for (const [g, ids] of ix.groups) {
    if (ids.every((x) => taken.has(x))) continue;
    out.push({ key: `group:${g}`, kind: "group", label: brief(groupName(doc, ids) || "Group", 40), sub: `group · ${ids.length} shapes`, ids, d: dist(ids) });
    for (const x of ids) taken.add(x);
  }
  for (const ids of ix.drawings) {
    if (ids.every((x) => taken.has(x))) continue;
    const boxes = ids.filter((x) => !isArrow(doc.shapes[x]!));
    // (named by several of its shapes: the drawing is still found when some of them are taken away)
    out.push({ key: `drawing:${boxes.slice(0, 12).join(",")}`, kind: "drawing", label: brief(listName(doc, ids) || shapeName(doc, ids), 40), sub: `drawing · ${boxes.length} shapes`, ids, d: dist(ids) });
    for (const x of ids) taken.add(x);
  }
  for (const id of doc.order) {
    const s = doc.shapes[id] as Box | undefined;
    if (!s || taken.has(id) || s.kind !== "image" || !s.img) continue;
    out.push({ key: `image:${id}`, kind: "image", label: brief(s.img.name), sub: `picture · ${s.img.w}×${s.img.h}`, ids: [id], d: dist([id]) });
    taken.add(id);
  }
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s || taken.has(id) || isArrow(s) || isLive(s) || isFrame(s) || !textOf(s)) continue;
    out.push({ key: `note:${id}`, kind: "note", label: brief(textOf(s).split("\n")[0]!), sub: "note", ids: [id], d: dist([id]) });
  }
  const names = namesOf(doc, out);
  for (const r of out) r.label = names.get(sig(r)) ?? r.label;
  return out.sort((a, b) => a.d - b.d).map(({ d: _d, ...r }) => r);
}
function framed(doc: Doc, f: Box): Id[] {
  const fr = rectOf(f)!;
  return doc.order.filter((id) => {
    if (id === f.id) return false;
    const s = doc.shapes[id]!;
    if (isArrow(s)) {
      const a = s.a.bind?.id, b = s.b.bind?.id;
      const inFrame = (x?: Id) => !!x && !!doc.shapes[x] && !!rectOf(doc.shapes[x]!) && inside(rectOf(doc.shapes[x]!)!, fr);
      return inFrame(a) && inFrame(b);
    }
    const r = rectOf(s);
    return !!r && inside(r, fr);
  });
}

/** Names, the same wherever they are shown (the @ list, a message, a chip, what an agent is told): two of the same name
 *  (a drawing and its copy) are told apart by age, the older keeping the name, so moving either never swaps them. */
const nameTables = new WeakMap<Doc, Map<string, string>>();
/** What a ref is, whatever key it was reached by: its kind and what it is made of. */
const sig = (r: Ref) => `${r.kind}:${[...r.ids].sort().join(",")}`;
function namesOf(doc: Doc, refs: Ref[]): Map<string, string> {
  const had = nameTables.get(doc);
  if (had) return had;
  const at = new Map(doc.order.map((x, i) => [x, i]));
  const age = (r: Ref) => Math.min(...r.ids.map((x) => at.get(x) ?? Infinity));
  const byName = new Map<string, Ref[]>();
  for (const r of refs) if (r.kind !== "thread" && r.kind !== "terminal" && r.kind !== "browser") (byName.get(r.label) ?? byName.set(r.label, []).get(r.label)!).push(r);
  const table = new Map<string, string>();
  for (const list of byName.values())
    list.sort((a, b) => age(a) - age(b)).forEach((r, n) => table.set(sig(r), n === 0 || list.length < 2 ? r.label : `copy${list.length > 2 ? ` ${n}` : ""} of ${r.label}`));
  nameTables.set(doc, table);
  return table;
}
/** The name a drawing (or frame, group, note) has on this board, as namesOf gives it. */
function nameFor(editor: Editor, r: Ref): string {
  const doc = editor.store.doc;
  const table = nameTables.get(doc) ?? (refsOn(editor, ""), nameTables.get(doc));
  return table?.get(sig(r)) ?? r.label;
}
/** The drawings these shapes are in, as keys, each once: a shape already in a drawing found is not looked up again. */
/** What arrows join to each thread, worked out once for each version of the board: for a thread, each thing an arrow runs
 *  between it and the thread (either way), as a key, with the arrows that join it. Drawing an arrow to a thread shows it
 *  what the arrow comes from; taking the arrow away stops. */
const arrowIndex = new WeakMap<Doc, Map<Id, Map<string, Id[]>>>();
export function arrowedTo(editor: Editor, thread: Id): Map<string, Id[]> {
  const doc = editor.store.doc;
  let all = arrowIndex.get(doc);
  if (!all) {
    all = new Map();
    for (const id of doc.order) {
      const s = doc.shapes[id];
      if (!s || !isArrow(s) || (s as { away?: boolean }).away) continue;
      // (a line Weld drew from a thread to what came of it is where that came from, not the person pointing; so is one
      // from before such lines were marked: muted, elbowed, unlabelled)
      if (s.made || (s.tone === "muted" && s.route === "elbow" && !s.text)) continue;
      const ends = [s.a.bind?.id, s.b.bind?.id];
      for (const [mine, theirs] of [[ends[0], ends[1]], [ends[1], ends[0]]] as const) {
        if (!mine || !theirs || mine === theirs || doc.shapes[mine]?.kind !== "thread") continue;
        const o = doc.shapes[theirs];
        if (!o || isArrow(o) || (o as { away?: boolean }).away) continue;
        const key = isLive(o) ? `live:${theirs}` : (o as { kind: string }).kind === "image" ? `image:${theirs}` : isFrame(o) ? `frame:${theirs}` : `drawing:${theirs}`;
        let m = all.get(mine);
        if (!m) all.set(mine, (m = new Map()));
        (m.get(key) ?? m.set(key, []).get(key)!).push(id);
      }
    }
    arrowIndex.set(doc, all);
  }
  return all.get(thread) ?? new Map();
}
/** What a thread is shown: what it was pointed at with @, and what an arrow joins to it (each thing once); worked out once
 *  for each version of the board. */
const seesMemo = new WeakMap<object, Map<Id, string[]>>();
export const seesOf = (editor: Editor, id: Id): string[] => {
  const doc = editor.store.doc;
  let m = seesMemo.get(doc);
  if (!m) seesMemo.set(doc, (m = new Map()));
  const had = m.get(id);
  if (had) return had;
  const out = seesNow(editor, id);
  m.set(id, out);
  return out;
};
/** Notes the person left on the pages a thread opened: pointed at one with an arrow, or put on it or just beside it. They
 *  are about that page, so the thread that opened it is shown them, as though they had been named with @. */
export function notesOnPages(editor: Editor, thread: Id): string[] {
  const doc = editor.store.doc;
  const pages = doc.order.map((x) => doc.shapes[x] as Box | undefined).filter((b): b is Box => !!b && b.kind === "browser" && b.live?.by === thread);
  if (!pages.length) return [];
  const isNote = (s: Shape | undefined): s is Shape => !!s && !isArrow(s) && !isLive(s) && !isFrame(s) && (s as { kind: string }).kind !== "image" && !!textOf(s) && !(s as { away?: boolean }).away;
  // (what the thread drew itself is its own, not the person's word on the page)
  const drew = new Set(((doc.shapes[thread] as Box | undefined) ?? doc.away?.[thread])?.live?.drew ?? []);
  const out = new Set<string>(), ids = new Set(pages.map((p) => p.id));
  for (const x of doc.order) {
    const s = doc.shapes[x];
    if (!s || !isArrow(s) || (s as { away?: boolean }).away) continue;
    const [a, b] = [s.a.bind?.id, s.b.bind?.id];
    for (const [page, note] of [[a, b], [b, a]] as const) if (page && note && ids.has(page) && isNote(doc.shapes[note]) && !drew.has(note)) out.add(`note:${note}`);
  }
  // (on a page, or within a short reach of its edge)
  const NEAR = 60;
  for (const x of doc.order) {
    const s = doc.shapes[x] as Box | undefined;
    if (!isNote(s) || drew.has(x) || !("w" in s)) continue;
    if (pages.some((p) => s.x < p.x + p.w + NEAR && p.x - NEAR < s.x + s.w && s.y < p.y + p.h + NEAR && p.y - NEAR < s.y + s.h)) out.add(`note:${x}`);
  }
  return [...out];
}
const seesNow = (editor: Editor, id: Id): string[] => {
  const named = ((editor.store.doc.shapes[id] as Box | undefined) ?? editor.store.doc.away?.[id])?.live?.sees ?? [];
  const keys = [...new Set([...named, ...arrowedTo(editor, id).keys(), ...notesOnPages(editor, id)])].filter((k) => resolve(editor, k));
  // (the same thing named two ways, once: by what it is made of)
  const seen = new Set<string>();
  return keys.filter((k) => {
    const sig = [...resolve(editor, k)!.ids].sort().join(",");
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
};
export function drawingKeys(editor: Editor, ids: Id[]): string[] {
  const doc = editor.store.doc, out: string[] = [], covered = new Set<Id>();
  for (const id of ids) {
    const s = doc.shapes[id];
    if (!s || covered.has(id) || isArrow(s)) continue;
    const r = resolve(editor, `drawing:${id}`);
    if (!r) continue;
    for (const x of r.ids) covered.add(x);
    out.push(`drawing:${id}`);
  }
  return out;
}
/** A ref as it is on the board now (a drawing that has grown or shrunk is still the same drawing), or null if it has gone. */
export function resolve(editor: Editor, key: string): Ref | null {
  const r = resolveRaw(editor, key);
  if (r && r.kind !== "thread" && r.kind !== "terminal" && r.kind !== "browser") r.label = nameFor(editor, r);
  return r;
}
function resolveRaw(editor: Editor, key: string): Ref | null {
  const doc = editor.store.doc, ix = indexOf(doc);
  const [kind, id] = key.split(/:(.*)/s) as [string, string];
  if (kind === "live") {
    const s = doc.shapes[id] as Box | undefined;
    if (!s || !isLive(s)) return null;
    if (s.kind === "thread") return { key, kind: "thread", label: brief(s.text || peek(id)?.meta.title || "New thread"), sub: "thread", ids: [id] };
    if (s.kind === "terminal") return { key, kind: "terminal", label: brief(s.text || `${folderName(s.live?.cwd)}${factsOf(id)?.label ? ` · ${factsOf(id)!.label}` : ""}`), sub: "terminal", ids: [id] };
    const url = (s.live?.url ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    return { key, kind: "browser", label: brief(s.text || factsOf(id)?.label || url || "Page"), sub: url, ids: [id] };
  }
  if (kind === "image") {
    const s = doc.shapes[id] as Box | undefined;
    if (!s || s.kind !== "image" || !s.img) return null;
    return { key, kind: "image", label: brief(s.img.name), sub: "picture", ids: [id] };
  }
  if (kind === "frame") {
    const f = doc.shapes[id];
    if (!isFrame(f)) return null;
    const ids = ix.frames.get(id) ?? [];
    return { key, kind: "frame", label: brief(textOf(f) || nameOf(doc, ids) || "Frame"), sub: "area", ids: [id, ...ids] };
  }
  if (kind === "group") {
    const ids = ix.groups.get(id) ?? [];
    return ids.length ? { key, kind: "group", label: brief(groupName(doc, ids) || "Group", 40), sub: "group", ids } : null;
  }
  if (kind === "drawing") {
    const anchor = id.split(",").find((x) => doc.shapes[x]);
    if (!anchor) return null;
    const ids = ix.drawingOf.get(anchor) ?? [anchor];
    return { key, kind: "drawing", label: brief(listName(doc, ids) || shapeName(doc, ids), 40), sub: "drawing", ids };
  }
  // what an agent drew in one place: these shapes, each with what is joined to it, as one drawing
  if (kind === "work") {
    const ids = new Set<Id>();
    for (const x of id.split(",")) if (doc.shapes[x]) for (const y of ix.drawingOf.get(x) ?? [x]) ids.add(y);
    if (!ids.size) return null;
    const all = [...ids];
    return { key, kind: "drawing", label: brief(listName(doc, all) || shapeName(doc, all), 40), sub: "drawing", ids: all };
  }
  if (kind === "note") {
    const s = doc.shapes[id];
    return s ? { key, kind: "note", label: brief(textOf(s).split("\n")[0]!), sub: "note", ids: [id] } : null;
  }
  return null;
}

/** A drawing (or frame, group, note) as an agent is shown it: each shape with its words, each arrow with what it joins. */
export function structureOf(doc: Doc, ids: Id[]) {
  const names = new Map<Id, string>();
  const shapes: { id: string; kind: string; text: string; x: number; y: number; w: number; h: number; hidden?: true }[] = [];
  const links: { id: string; from: string; to: string; text: string; hidden?: true }[] = [];
  for (const id of ids.slice(0, 400)) {
    const s = doc.shapes[id];
    if (!s || isArrow(s)) continue;
    const r = rectOf(s)!;
    names.set(id, textOf(s) || `${s.kind} ${shapes.length + 1}`);
    shapes.push({ id, kind: s.kind, text: textOf(s), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h), ...(s.away ? { hidden: true as const } : {}) });
  }
  for (const id of ids) {
    const s = doc.shapes[id];
    if (!s || !isArrow(s)) continue;
    const a = s.a.bind?.id, b = s.b.bind?.id;
    if (a && b && names.has(a) && names.has(b)) links.push({ id, from: a, to: b, text: s.text?.trim() ?? "", ...(s.away ? { hidden: true as const } : {}) });
  }
  // A drawing that moves has states (its moments): what each shows that the one on the board does not, and hides that it shows.
  const states: string[] = [];
  const inIds = new Set(ids);
  for (const [g, sc] of Object.entries(doc.scenes ?? {})) {
    if (!ids.some((id) => doc.shapes[id]?.group === g)) continue;
    const now = new Map(doc.order.map((id) => doc.shapes[id]!).filter((sh) => sh.group === g && inIds.has(sh.id)).map((sh) => [sh.id, sh]));
    const say = (sh: { id: Id } & Partial<{ a: { bind?: { id: Id } }; b: { bind?: { id: Id } } }>) => {
      const x = doc.shapes[sh.id];
      if (x && isArrow(x)) return `line ${JSON.stringify(names.get(x.a.bind?.id ?? "") ?? "?")} → ${JSON.stringify(names.get(x.b.bind?.id ?? "") ?? "?")} #${sh.id}`;
      return `${JSON.stringify(names.get(sh.id) ?? "?")} #${sh.id}`;
    };
    sc.moments.forEach((m, i) => {
      if (i === sc.at) return void states.push(`state ${i + 1} of ${sc.moments.length}: the one on the board now (what is marked hidden is hidden in it)`);
      const there = new Map(m.shapes.map((sh) => [sh.id, sh]));
      const shows = [...now.values()].filter((sh) => sh.away && there.get(sh.id) && !there.get(sh.id)!.away).map(say);
      const hides = [...now.values()].filter((sh) => !sh.away && (!there.get(sh.id) || there.get(sh.id)!.away)).map(say);
      const moved = [...now.values()].filter((sh) => { const t = there.get(sh.id) as Box | undefined, n = sh as Box; return !isArrow(sh) && t && !t.away && "x" in t && (Math.abs(t.x - n.x) > 4 || Math.abs(t.y - n.y) > 4); }).map(say);
      const words = [...now.values()].filter((sh) => there.get(sh.id) && textOf(there.get(sh.id)!) !== textOf(sh)).map((sh) => `${say(sh)} says ${JSON.stringify(textOf(there.get(sh.id)!))}`);
      // its look: size, colour, fill
      const look = [...now.values()].flatMap((sh) => {
        const t = there.get(sh.id) as Box | undefined, n = sh as Box;
        if (!t || t.away || isArrow(sh)) return [];
        const d: string[] = [];
        if (Math.abs((t.w ?? 0) - (n.w ?? 0)) > 4 || Math.abs((t.h ?? 0) - (n.h ?? 0)) > 4) d.push(`${Math.round(t.w)}×${Math.round(t.h)}`);
        if (t.tone !== n.tone) d.push(`${t.tone}`);
        if (t.fill !== n.fill) d.push(`fill ${t.fill}`);
        return d.length ? [`${say(sh)} is ${d.join(", ")}`] : [];
      });
      // and what only that state has
      const only = m.shapes.filter((sh) => !now.has(sh.id) && !sh.away).map((sh) => (isArrow(sh) ? `a line #${sh.id}` : `${JSON.stringify(textOf(sh) || sh.kind)} #${sh.id} (only in this state)`));
      const all = [shows.length && `shows ${shows.join(", ")}`, only.length && `shows ${only.join(", ")}`, hides.length && `hides ${hides.join(", ")}`, moved.length && `moves ${moved.join(", ")}`, words.length && words.join(", "), look.length && look.join(", ")].filter(Boolean).join("; ");
      // (kept to a size an agent can read: a huge scene is summed up)
      states.push(`state ${i + 1} of ${sc.moments.length}: ${(all || "as the one on the board").slice(0, 1200)}`);
    });
  }
  return { shapes, links, ...(states.length ? { states } : {}) };
}

/** What to tell the app about a ref, for it to show the agent: live things as themselves; drawings as their structure and,
 *  when `picture`, a small picture. A frame brings what is live inside it as well, each as itself. */
export async function payloadOf(editor: Editor, key: string, picture = true): Promise<BoardRef[]> {
  const r = resolve(editor, key);
  if (!r) return [];
  const doc = editor.store.doc;
  if (r.kind === "thread" || r.kind === "terminal" || r.kind === "browser") {
    const id = r.ids[0]!;
    const s = doc.shapes[id] as Box;
    return [{ key, id, kind: r.kind, label: r.label, url: s.live?.url, webContentsId: factsOf(id)?.webContentsId, place: { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) } }];
  }
  const still = r.ids.filter((x) => !isLive(doc.shapes[x]));
  const inner = r.kind === "frame" ? r.ids.filter((x) => isLive(doc.shapes[x])) : [];
  // pictures are given as their files and what was drawn on them, never as pixels in the message (see describe in main)
  const pics = still.map((x) => doc.shapes[x] as Box | undefined).filter((b): b is Box => !!b && b.kind === "image" && !!b.img);
  const pictures = await Promise.all(pics.map((b) => pictureOf(editor, b)));
  if (r.kind === "image") return [{ key, id: r.ids[0] ?? "", kind: "image", label: r.label, pictures, place: { x: Math.round(pics[0]!.x), y: Math.round(pics[0]!.y), w: Math.round(pics[0]!.w), h: Math.round(pics[0]!.h) } }];
  const structure = structureOf(doc, still);
  let png: string | undefined;
  // (a drawing that is only pictures needs no picture of itself)
  if (picture && pics.length < still.filter((x) => !isArrow(doc.shapes[x]!)).length)
    try {
      const t = themeFor(document.documentElement.dataset.mode === "dark");
      // small: an agent reads a picture this size well, and a big sparse drawing costs no more memory than a small one
      // (without the pictures in it: those are given as their files, below, never as pixels in a message)
      const blob = await toPNG(doc, new Set(still.filter((x) => doc.shapes[x]?.kind !== "image")), t, 1600);
      if (blob && blob.size < 4_000_000) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        png = btoa(bin);
      }
    } catch {
      /* shown in words only */
    }
  const own: BoardRef = { key, id: r.ids[0] ?? "", kind: r.kind, label: r.label, structure, png, ...(pictures.length ? { pictures } : {}) };
  const live = await Promise.all(inner.map((x) => payloadOf(editor, `live:${x}`, false)));
  return [own, ...live.flat()];
}
/** Everything a thread is connected to, one after another (pictures are made one at a time, and only the first few). */
export async function payloadsOf(editor: Editor, keys: string[]): Promise<BoardRef[]> {
  const out: BoardRef[] = [];
  let pictures = 0;
  for (const k of keys) {
    const p = await payloadOf(editor, k, pictures < 4);
    if (p[0]?.png) pictures += 1;
    out.push(...p);
  }
  return out;
}

/** What was drawn on a picture: shapes above it with at least half their drawn area on it, and lines with an end on it
 *  (where they really end, bound ends followed). A mark over several pictures belongs to the topmost of them under it.
 *  Frames and boundaries are places, not marks. */
export function marksOn(doc: Doc, pic: Box): Shape[] {
  const order = new Map(doc.order.map((id, i) => [id, i]));
  const pics = doc.order.map((id) => doc.shapes[id] as Box | undefined).filter((x): x is Box => !!x && x.kind === "image" && !x.away);
  // (a mark's own corners, turned into the picture's upright frame, clipped to the picture: half its area must be on it)
  const over = (m: Shape, b: Box) => {
    const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const poly = cornersOf(doc, m).map((p) => (b.rot ? turn(p, c, -b.rot) : p));
    const all = area(poly);
    return all > 0 ? area(clipTo(poly, b)) >= 0.5 * all : poly.every((p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  };
  const within = (p: { x: number; y: number }, b: Box) => {
    const q = b.rot ? turn(p, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, -b.rot) : p;
    return q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h;
  };
  const on = (s: Shape, b: Box) => {
    if ((order.get(s.id) ?? -1) <= (order.get(b.id) ?? -1)) return false;
    if (isArrow(s)) return within(endPoint(doc, s.a), b) || within(endPoint(doc, s.b), b);
    return over(s, b);
  };
  const out: Shape[] = [];
  for (const id of doc.order) {
    const s = doc.shapes[id];
    if (!s || s.away || s.kind === "image" || s.kind === "frame" || s.kind === "boundary" || isLive(s)) continue;
    if (!on(s, pic)) continue;
    // (the topmost picture under it is the one it marks)
    const top = pics.filter((b) => on(s, b)).sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0))[0];
    if (top?.id === pic.id) out.push(s);
  }
  return out;
}

/** The two files made of a marked picture, by everything that decides how they look: made once, given again after. */
const derived = new Map<string, { marked?: { file: string; w: number; h: number }; crop?: { file: string; w: number; h: number } }>();

/** A picture as an agent is told of it: its file, its size, what was marked on it (in the picture's own pixels), and,
 *  when something was marked, the whole picture with the marks drawn in and a close-up of the marked part (as files). */
async function pictureOf(editor: Editor, b: Box): Promise<NonNullable<BoardRef["pictures"]>[number]> {
  const doc = editor.store.doc, img = b.img!;
  const dark = document.documentElement.dataset.mode === "dark";
  const kx = img.w / b.w, ky = img.h / b.h;
  const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  // a board point as a point of the picture's own (a turned picture is turned back first), in its pixels
  const local = (p: { x: number; y: number }) => {
    const q = b.rot ? turn(p, c, -b.rot) : p;
    return { x: Math.round((q.x - b.x) * kx), y: Math.round((q.y - b.y) * ky) };
  };
  const marks = marksOn(doc, b);
  const told = marks.map((m) => {
    if (isArrow(m)) return { kind: "arrow" as const, text: m.text ?? "", from: local(endPoint(doc, m.a)), to: local(endPoint(doc, m.b)) };
    // (its own corners, turned as it is, into the picture's frame: a mark turned with the picture is upright there)
    const pts = cornersOf(doc, m).map(local);
    const x0 = Math.min(...pts.map((p) => p.x)), y0 = Math.min(...pts.map((p) => p.y));
    return { kind: (m as Box).kind, text: textOf(m), x: x0, y: y0, w: Math.max(...pts.map((p) => p.x)) - x0, h: Math.max(...pts.map((p) => p.y)) - y0 };
  });
  // everything that decides how the marked files look: the picture, each mark as drawn (where it really is), the theme
  const sig = JSON.stringify([img.hash, b.x, b.y, b.w, b.h, b.rot ?? 0, dark, marks.map((m) => (isArrow(m) ? { ...m, a: endPoint(doc, m.a), b: endPoint(doc, m.b) } : m))]);
  let files = derived.get(sig);
  if (marks.length && !files) {
    files = {};
    const ids = new Set([b.id, ...marks.map((m) => m.id)]);
    const t = themeFor(dark);
    const keep = async (blob: Blob | null, name: string) => {
      if (!blob || blob.size > 8_000_000) return undefined;
      const a = await weld.assets.put(await blob.arrayBuffer(), { name, mime: "image/png", made: true });
      return a.error ? undefined : { file: a.file!, w: a.w, h: a.h };
    };
    try {
      await pictureReady(b);
      // the whole picture with the marks drawn in (the marked part in the context of all of it), at a size an agent reads well
      const pr = bounds(doc, b);
      files.marked = await keep(await toPNG(doc, ids, t, Math.min(1600, Math.max(img.w, img.h)), pr), `${img.name}-with-marks.png`);
      // a close-up of the marked part: the marks as drawn (lines' heads and all), a little round them, inside the picture
      const mr = marks.map((m) => bounds(doc, m));
      let x0 = Math.min(...mr.map((r) => r.x)), y0 = Math.min(...mr.map((r) => r.y)), x1 = Math.max(...mr.map((r) => r.x + r.w)), y1 = Math.max(...mr.map((r) => r.y + r.h));
      const pad = Math.max(24, 0.06 * Math.max(b.w, b.h));
      x0 = Math.max(pr.x, x0 - pad);
      y0 = Math.max(pr.y, y0 - pad);
      x1 = Math.min(pr.x + pr.w, x1 + pad);
      y1 = Math.min(pr.y + pr.h, y1 + pad);
      const sharp = Math.min(2, Math.max(kx, 1));
      if (x1 > x0 && y1 > y0) files.crop = await keep(await toPNG(doc, ids, t, Math.max(x1 - x0, y1 - y0) * sharp, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }), `${img.name}-close-up.png`);
    } catch {
      /* told in words only */
    }
    derived.set(sig, files);
    if (derived.size > 200) derived.delete(derived.keys().next().value!);
  }
  return { id: b.id, name: img.name, hash: img.hash, ext: img.ext, w: img.w, h: img.h, sig, ...(img.origin ? { origin: img.origin } : {}), place: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }, marks: told, ...(files?.marked ? { marked: files.marked } : {}), ...(files?.crop ? { crop: files.crop } : {}) };
}

/** A shape's own four corners on the board: a turned box's turned corners (not the box round them). */
function cornersOf(doc: Doc, s: Shape): { x: number; y: number }[] {
  if (!isArrow(s) && "w" in s) {
    const b = s as Box, c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const pts = [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
    return b.rot ? pts.map((p) => turn(p, c, b.rot!)) : pts;
  }
  const r = bounds(doc, s);
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}
/** A polygon's area. */
function area(p: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!, r = p[(i + 1) % p.length]!;
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
}
/** A convex polygon clipped to an upright box (Sutherland–Hodgman). */
function clipTo(poly: { x: number; y: number }[], b: { x: number; y: number; w: number; h: number }) {
  type P = { x: number; y: number };
  const edges: [(p: P) => boolean, (p: P, q: P) => P][] = [
    [(p) => p.x >= b.x, (p, q) => ({ x: b.x, y: p.y + ((q.y - p.y) * (b.x - p.x)) / (q.x - p.x) })],
    [(p) => p.x <= b.x + b.w, (p, q) => ({ x: b.x + b.w, y: p.y + ((q.y - p.y) * (b.x + b.w - p.x)) / (q.x - p.x) })],
    [(p) => p.y >= b.y, (p, q) => ({ x: p.x + ((q.x - p.x) * (b.y - p.y)) / (q.y - p.y), y: b.y })],
    [(p) => p.y <= b.y + b.h, (p, q) => ({ x: p.x + ((q.x - p.x) * (b.y + b.h - p.y)) / (q.y - p.y), y: b.y + b.h })],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i]!, q = inp[(i + 1) % inp.length]!;
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
    if (!out.length) break;
  }
  return out;
}
