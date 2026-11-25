// Putting live things on the board: a new one in the middle of the
// view, or one beside the thing it came from, joined to it by a line.
import type { Editor } from "@weld/canvas/editor";
import { KINDS } from "@weld/canvas/kinds";
import { HUES, isLive, newId } from "@weld/canvas/types";
import type { Arrow, Box, Id, Live, Rect } from "@weld/canvas/types";
import { defaultCwd, isScratch } from "./bridge";
import { openings } from "./opening";
import { resolve, seesOf } from "./refs";
import { boundsOf } from "@weld/canvas/geometry";

/** Each thread's own colour: its mark on the board, and on everything it has made. */

/** A thread kept off the board (asked from the bar, read there), if this one is. */
export const awayBox = (editor: Editor, id: Id | null | undefined): Box | undefined => (id ? editor.store.doc.away?.[id] : undefined);
/** A thread's box, wherever it is kept: on the board, or off it. */
export const threadBox = (editor: Editor, id: Id | null | undefined): Box | undefined => {
  const s = id ? editor.store.doc.shapes[id] : undefined;
  return s?.kind === "thread" ? (s as Box) : awayBox(editor, id);
};
/** The threads kept off the board. */
export const awayThreads = (editor: Editor): Box[] => Object.values(editor.store.doc.away ?? {});

/** A thread's colour: the one it was given, or (until it is given one) one worked out from its name. */
export function hueOf(editor: Editor, id: Id): string {
  const n = (threadBox(editor, id) ?? (editor.store.doc.shapes[id] as Box | undefined))?.live?.hue;
  return HUES[(n ?? [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) % HUES.length]!;
}
/** Give every thread without a colour the one least used by the others, so threads side by side never look alike. */
export function giveHues(editor: Editor) {
  const s = editor.store, threads = [...s.doc.order.map((id) => s.doc.shapes[id] as Box).filter((b) => b?.kind === "thread"), ...awayThreads(editor)];
  const want = threads.filter((b) => b.live?.hue === undefined);
  if (!want.length) return;
  const used = new Map<number, number>();
  for (const b of threads) if (b.live?.hue !== undefined) used.set(b.live.hue, (used.get(b.live.hue) ?? 0) + 1);
  s.quiet(() => {
    for (const b of want) {
      let best = 0;
      for (let i = 1; i < HUES.length; i++) if ((used.get(i) ?? 0) < (used.get(best) ?? 0)) best = i;
      used.set(best, (used.get(best) ?? 0) + 1);
      s.patch(b.id, { live: { ...b.live, hue: best } });
    }
  });
}
/** The thread a thing belongs to: itself, if it is one; the one it came from, if it came from one. */
export function ownerOf(editor: Editor, id: Id | null | undefined): Id | null {
  const s = id ? ((editor.store.doc.shapes[id] as Box | undefined) ?? awayBox(editor, id)) : undefined;
  if (!s) return null;
  if (s.kind === "thread") return s.id;
  const f = s.live?.from;
  return f && threadBox(editor, f) ? f : null;
}

export type LiveKind = "thread" | "terminal" | "browser";
/** (as LiveLayer's FAR: below this zoom, things show as cards) */
const FAR_Z = 0.42;
const GAP = 48;

const hits = (a: Rect, b: Rect, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
function liveBoxes(editor: Editor): Box[] {
  const doc = editor.store.doc;
  return doc.order.map((id) => doc.shapes[id]).filter(isLive);
}
/** The nearest place to `r` that no live thing already stands on, looking rightwards then down. */
export function clear(editor: Editor, r: Rect, skip?: Id, all = false, column = false): Rect {
  // (for an agent, clear of everything on the board: it must not put a page down on top of a drawing)
  const doc = editor.store.doc;
  const others = all
    ? doc.order.map((id) => doc.shapes[id]).filter((s): s is Box => !!s && s.kind !== "arrow" && s.id !== skip && "w" in s)
    : liveBoxes(editor).filter((b) => b.id !== skip);
  let at = { ...r };
  // (work about a part of a drawing keeps to its column beside the drawing: what is in the way is gone round below)
  if (column) {
    for (let n = 0; n < 24; n++) {
      const blocker = others.find((b) => hits(at, b, GAP / 2));
      if (!blocker) return at;
      at = { ...at, y: blocker.y + blocker.h + GAP };
    }
  }
  for (let row = 0; row < (all ? 12 : 6); row++) {
    at = { ...r, y: r.y + row * (r.h + GAP) };
    // (an agent's thing stays near what it came from: one step along, then the next row down, never off across the board)
    for (let n = 0; n < (all ? 2 : 12); n++) {
      const blocker = others.find((b) => hits(at, b, GAP / 2));
      if (!blocker) return at;
      at = { ...at, x: blocker.x + blocker.w + GAP };
    }
  }
  // nowhere near is free: below everything there, where nothing can be
  const below = others.filter((b) => b.x < r.x + r.w && b.x + b.w > r.x).reduce((y, b) => Math.max(y, b.y + b.h), r.y);
  return { ...r, y: below + GAP };
}
function fresh(kind: LiveKind, r: Rect, live: Live, text = "", id?: Id): Box {
  return { id: id ?? newId(), kind, x: Math.round(r.x), y: Math.round(r.y), w: r.w, h: r.h, text, tone: "ink", fill: "none", live };
}
function settle(editor: Editor, box: Box, extra: Arrow[] = [], look = true, take = true, theirs = false) {
  const s = editor.store;
  if (theirs) {
    // an agent's doing: put down beside the person's work without touching their view, what they hold, their tool or their undoing
    s.putForeign(box, ...extra);
    editor.invalidate();
    return box.id;
  }
  s.run(() => {
    s.put(box, ...extra);
    if (take) s.select([box.id]);
  });
  if (s.tool !== "select") s.setTool("select");
  // made by the person from far off: brought close enough to use (seen as a card, it could not be typed into)
  if (look) s.cam.z < FAR_Z ? editor.focusOn(box.id) : reveal(editor, box);
  editor.invalidate();
  return box.id;
}

// ── where each agent is ─────────────────────────────────────────────
// An agent that opens a page or starts a terminal is shown going over to it for a moment.
/** (a spot on the thing it is at, on the board, when it is using it: where it points, and when it last pressed) */
export type Spot = { x: number; y: number; press: boolean; label?: string };
const visits = new Map<Id, { at: Id; until: number; spot?: Spot & { t: number } }>();
const watchers = new Set<() => void>();
let visitsV = 0;
export const visitOf = (thread: Id) => {
  const v = visits.get(thread);
  return v && v.until > Date.now() ? v.at : null;
};
export const subscribeVisits = (l: () => void) => (watchers.add(l), () => watchers.delete(l));
export const visitsVersion = () => visitsV;
export const showVisit = (thread: Id, at: Id, spot?: Spot) => visit(thread, at, spot);
export const spotOf = (thread: Id) => {
  const v = visits.get(thread);
  return v && v.until > Date.now() ? v.spot : undefined;
};
/** Put a thread's background command on the board as a terminal (the very shell it runs in), beside the thread; or go to it if it is there. */
export function showService(editor: Editor, thread: Id, svc: { id: string; cmd: string; cwd: string }) {
  const s = editor.store;
  if (s.doc.shapes[svc.id]) return goTo(editor, svc.id);
  const from = threadBox(editor, thread);
  if (!from) return;
  const k = KINDS.terminal;
  const r = clear(editor, { x: from.x + from.w + GAP * 2, y: from.y, w: k.w, h: k.h });
  const box: Box = { ...fresh("terminal", r, { cwd: svc.cwd, from: thread, cmd: svc.cmd, svc: true }, svc.cmd.length > 40 ? `${svc.cmd.slice(0, 40)}…` : svc.cmd), id: svc.id };
  const wire: Arrow = {
    id: newId(), kind: "arrow", text: "", route: "elbow", heads: "end", tone: "muted", made: true,
    a: { x: from.x + from.w, y: from.y + 20, bind: { id: from.id, ax: 1, ay: Math.min(0.5, 60 / from.h) } },
    b: { x: box.x, y: box.y + 20, bind: { id: box.id, ax: 0, ay: Math.min(0.5, 60 / box.h) } },
  };
  settle(editor, box, awayBox(editor, thread) ? [] : [wire]);
}
function visit(thread: Id, at: Id, spot?: Spot) {
  for (const [k, v] of visits) if (v.until <= Date.now()) visits.delete(k);
  visits.set(thread, { at, until: Date.now() + 6000, ...(spot ? { spot: { ...spot, t: Date.now() } } : {}) });
  const bump = () => {
    visitsV += 1;
    for (const l of watchers) l();
  };
  bump();
  setTimeout(bump, 6100);
}
/** Bring a thing into view without changing how close the view is, unless it would not fit. */
export function reveal(editor: Editor, b: Rect) {
  const c = editor.store.cam, v = editor.view;
  const top = 52, bottom = 76, side = 24;
  const fits = b.w * c.z <= v.w - side * 2 && b.h * c.z <= v.h - top - bottom;
  if (!fits) return editor.focusOn((b as Box).id);
  const x0 = c.x + side / c.z, x1 = c.x + (v.w - side) / c.z, y0 = c.y + top / c.z, y1 = c.y + (v.h - bottom) / c.z;
  let x = c.x, y = c.y;
  if (b.x < x0) x -= x0 - b.x;
  else if (b.x + b.w > x1) x += b.x + b.w - x1;
  if (b.y < y0) y -= y0 - b.y;
  else if (b.y + b.h > y1) y += b.y + b.h - y1;
  if (x !== c.x || y !== c.y) editor.flyTo({ x, y, z: c.z });
}

/** A new live thing, in the middle of what is on screen (or the nearest clear place to it). */
/** `left`: toward the left of the view rather than in its middle, leaving room on its right for what comes of it. */
export function addLive(editor: Editor, kind: LiveKind, live: Live = {}, text = "", theirs = false, id?: Id, left = false): Id {
  const k = KINDS[kind], c = editor.store.cam, v = editor.view;
  const cx = c.x + v.w / 2 / c.z, cy = c.y + (v.h - 20) / 2 / c.z;
  // beside what is selected, if that is a live thing: work grows outwards from where you are
  const sel = [...editor.store.sel].map((id) => editor.store.doc.shapes[id]).filter(isLive);
  const from = sel.length === 1 ? sel[0]! : null;
  const x = left ? c.x + Math.min(56 / c.z, Math.max(0, (v.w / c.z - k.w) / 2)) : cx - k.w / 2;
  const want: Rect = from ? { x: from.x + from.w + GAP, y: from.y, w: k.w, h: k.h } : { x, y: cy - k.h / 2, w: k.w, h: k.h };
  // A new thread beside one working in a scratch folder gets a scratch folder of its own (agents side by side must not
  // share one by accident); beside one pointed at a real project, it works in that project too. Terminals go where they are put.
  const near = from?.live?.cwd;
  const cwd = live.cwd ?? (kind === "thread" && (!near || isScratch(near)) ? defaultCwd() : (near ?? defaultCwd()));
  return settle(editor, fresh(kind, clear(editor, want, undefined, theirs), kind === "browser" ? live : { ...live, cwd }, text, id), [], !theirs, !theirs, theirs);
}

/** A new live thing beside the one it came from, joined to it. */
export function openBeside(editor: Editor, fromId: Id | null, kind: LiveKind, live: Live = {}, text = "", take = true, theirs = false): Id {
  // (from a thread kept off the board: put down where it stands, which is where its work goes, with no line to it)
  const away = awayBox(editor, fromId);
  const from = away ?? (fromId ? editor.store.doc.shapes[fromId] : undefined);
  // a page that is already on the board is gone to, not opened twice
  if (kind === "browser" && live.url) {
    const same = (u: string) => u.replace(/\/$/, "");
    const there = liveBoxes(editor).find((b) => b.kind === "browser" && b.id !== fromId && b.live?.url && same(b.live.url) === same(live.url!));
    if (there && theirs) {
      // its agent opening it again means what is there has changed: it is shown afresh
      window.dispatchEvent(new CustomEvent("weld:reload", { detail: there.id }));
      if (fromId) visit(fromId, there.id);
      return there.id;
    }
    if (there) {
      const s = editor.store;
      if (take) s.select([there.id]);
      s.emit();
      if (isLive(from)) both(editor, from, there);
      else reveal(editor, there);
      return there.id;
    }
  }
  if (!isLive(from)) return addLive(editor, kind, live, text, theirs);
  const k = KINDS[kind];
  const r = clear(editor, { x: from.x + from.w + GAP * 2, y: from.y, w: k.w, h: Math.max(k.h, kind === "browser" ? from.h : k.h) }, undefined, theirs, !!from.live?.sees?.length);
  // what is opened from a thread (or from something a thread made) belongs to that thread
  const owner = ownerOf(editor, from.id);
  // (whose colour it wears; and, only when the agent itself put it here, that it was the agent's doing)
  const mine = kind === "thread" ? {} : owner ? { from: owner, ...(theirs ? { by: owner } : {}) } : {};
  const box = fresh(kind, r, kind === "browser" ? { ...live, ...mine } : { ...live, ...mine, cwd: live.cwd ?? from.live?.cwd ?? defaultCwd() }, text);
  const wire: Arrow = {
    id: newId(), kind: "arrow", text: "", route: "elbow", heads: "end", tone: "muted", made: true,
    a: { x: from.x + from.w, y: from.y + 20, bind: { id: from.id, ax: 1, ay: Math.min(0.5, 60 / from.h) } },
    b: { x: box.x, y: box.y + 20, bind: { id: box.id, ax: 0, ay: Math.min(0.5, 60 / box.h) } },
  };
  const id = settle(editor, box, away ? [] : [wire], false, take, theirs);
  if (theirs) visit(from.id, box.id);
  else both(editor, from, box);
  return id;
}
/** Show a thing and the one it came from together: by moving the view if that is enough, by stepping back if it is not. */
function both(editor: Editor, a: Rect, b: Rect) {
  const c = editor.store.cam, v = editor.view;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.max(a.x + a.w, b.x + b.w) - x, h = Math.max(a.y + a.h, b.y + b.h) - y;
  if (w * c.z <= v.w - 48 && h * c.z <= v.h - 128) reveal(editor, { x, y, w, h });
  else editor.fit([(a as Box).id, (b as Box).id]);
}

/** The live things on the board, in reading order: left to right, top to bottom. */
export function liveInOrder(editor: Editor): Box[] {
  return [...liveBoxes(editor).sort((a, b) => (Math.abs(a.y - b.y) > 200 ? a.y - b.y : a.x - b.x)), ...awayThreads(editor)];
}
/** Select a thing and bring it to the middle at reading size. */
/** The height a folded thread keeps: its title bar. */
export const FOLDED_H = 42;
/** Folds a thread down to its title, or opens it back to the height it had (one step, undone as one). */
export function fold(editor: Editor, id: Id, shut: boolean) {
  const s = editor.store, b = s.doc.shapes[id] as Box | undefined;
  if (!b || b.kind !== "thread" || shut === !!b.live?.tall) return;
  const { tall, ...rest } = b.live ?? {};
  s.run(() => s.patch(id, shut ? { h: FOLDED_H, live: { ...rest, tall: b.h } } : { h: Math.max(tall ?? 640, 240), live: rest }));
  editor.invalidate();
}
export function goTo(editor: Editor, id: Id) {
  const s = editor.store;
  // (a thread kept off the board is gone to by reading it, from the bar)
  if (awayBox(editor, id)) return void window.dispatchEvent(new CustomEvent("weld:read", { detail: id }));
  if (!s.doc.shapes[id]) return;
  // gone to, a folded thread opens: going to it is wanting to read it
  fold(editor, id, false);
  if (s.tool !== "select") s.setTool("select");
  s.select([id]);
  s.emit();
  editor.focusOn(id);
  editor.invalidate();
}

/** Start a thread from the bar: kept off the board, standing where the view is (toward the left, so what it makes,
 *  put down on its right, is in view), and told what was asked as soon as it is ready. */
export function startThread(editor: Editor, ask: string, cwd: string, sees: string[] = [], about?: Rect): Id {
  const c = editor.store.cam, v = editor.view, id = newId();
  // its work goes where the person is looking; or, asked about something on the board, beside that thing: to the right
  // of the drawing it is in, level with the part that was picked (so asking about three parts lays out three rows)
  const whole = sees.map((k) => resolve(editor, k)).find((r) => r && r.ids.length), b = whole ? boundsOf(editor.store.doc, whole.ids) : null;
  const at = b ? { x: b.x + b.w + GAP, y: (about ?? b).y } : { x: c.x + Math.min(56, v.w / 8) / c.z, y: c.y + 120 / c.z };
  // (what it was asked about, if anything was pointed at: shown to it, as it is then, with each message)
  const box: Box = { id, kind: "thread", x: at.x, y: at.y, w: 1, h: 1, text: "", tone: "ink", fill: "none", live: { cwd, ...(sees.length ? { sees } : {}) } };
  openings.set(id, ask);
  editor.store.putAway(box);
  giveHues(editor);
  return id;
}
/** Put a thread kept off the board onto it, beside what is in view, and go to it. */
export function landThread(editor: Editor, id: Id) {
  const b = awayBox(editor, id);
  if (!b) return;
  const k = KINDS.thread, c = editor.store.cam, v = editor.view;
  const r = clear(editor, { x: c.x + (v.w / 2) / c.z - k.w / 2, y: c.y + (v.h / 2) / c.z - k.h / 2, w: k.w, h: k.h });
  editor.store.land({ ...b, ...r });
  goTo(editor, id);
}
/** Take a thread off the board: it is read from the bar from then on, and its work goes where its card was. */
export function sendThreadAway(editor: Editor, id: Id) {
  const b = editor.store.doc.shapes[id] as Box | undefined;
  if (!b || b.kind !== "thread") return;
  // (what it was shown by arrows to its card is kept by name: the arrows go with the card)
  const { tall: _t, ...live } = b.live ?? {};
  editor.store.sendAway(id, { ...b, w: 1, h: 1, live: { ...live, sees: seesOf(editor, id) } });
  editor.invalidate();
}
